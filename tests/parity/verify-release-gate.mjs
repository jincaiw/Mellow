/**
 * Release Gate 契约护栏（V7-W8 工具链）。
 *
 * 目的：让「发布结论」无法绕过证据。护栏只做**可静态判定**的断言，不假装能验证真机体验：
 *
 * ① 护栏全集接入：tests/parity/verify-*.mjs 的每一个都必须出现在根 package.json 的
 *    `test` 与 `parity` 两条脚本链里 —— 防「新增护栏忘了接线」与「某人悄悄删掉一条」。
 * ② 台账结论纪律：PASS-E 必须要求三平台真机 + UX Gate 证据（与 verify-parity-ledger 分工：
 *    后者校验 schema，本护栏校验**结论可达性**并给出 NO-GO 清单）。
 * ③ CI 门禁完整：单测 / editor-engine / 桌面构建 + 渲染层指纹 / parity 链 / cargo test 齐备。
 * ④ 发布门禁：release.yml 每个平台 job 必须在**打包之前**跑 verify-release-bundle。
 *
 * NO-GO 清单只报告不抛错（开发期必然存在未闭环项）；但「标了 PASS-E 却缺证据」、
 * 「护栏断链」、「CI 缺门禁」都是硬失败。
 */
import { existsSync, readdirSync, readFileSync, openSync, readSync, closeSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);
/** **覆盖型下限**：集合大小必须 **== 基线**（2026-10-11，审计 §4.310）。
 *  ⚠️ **为什么不用 `< N`**：`< N` 只挡「缩小」，**集合增长时会静默稀释防线** ——
 *    实测形态：某判据的基线是 23，集合涨到 25 之后，**删掉 2 个都不红**
 *    ⇒ 那正是「防某人悄悄删掉一条」想挡的事。`< N` 与 `!== N` 只在「值恰好 == 基线」时等价，
 *    而本仓**没有任何东西**保证「值 == 基线」（判据 ⑥ 只核对「标记里的数 == 阈值」）。
 *  ⚠️ 本助手把 `[覆盖型]` 的定义**机械化**：集合增删**必须**在此刻同步基线（判据 ㊱ 守）。
 *  ⚠️ 若某集合**会随正常开发频繁增长**（如「文本文件数」），它**不是**覆盖型 ⇒ 请改标
 *    `[健康度型] 下限 N`（留余量），**不要**硬套本助手。 */
const coverEq = (what, actual, baseline, why) => {
  if (actual !== baseline) {
    fail(`[覆盖型] ${what}：实际 ${actual} ≠ 基线 ${baseline}`
      + ` —— 覆盖型下限必须 **== 当前基线**（skill §2）：**缩小** = 成员被悄悄删了；`
      + `**增长** = 集合变了，请复核后**同时**改标记里的数与阈值。${why ? `（本条的用途：${why}）` : ''}`);
  }
};

// ── 仓库跟踪集（`git ls-files`，含已 `git add` 的**暂存**文件）────────────────
// ⚠️ 2026-10-08（审计 §4.166/§4.167）：**判据的锚点是「仓库」，不是「工作区」**。
//   本地工作区 ⊃ 仓库（未跟踪 + 生成物）⇒ 用 `readdirSync` 会让**同一份代码在本地与干净检出
//   得到不同结论**（§4.166 实测：1113 vs 878）。凡「**仓库里有哪些文件**」都用本函数。
//   ⚠️ `git ls-files` 读的是**索引** ⇒ 新增文件只要 `git add` 就会被看见（不必等提交）。
const trackedFiles = (() => {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 })
      .toString().split('\0').filter(Boolean);
  } catch {
    return null; // 调用方负责 fail（此处 errors 已定义，但让它集中在各自的判据里报错）
  }
})();
if (trackedFiles === null) {
  fail('无法枚举仓库跟踪集：`git ls-files` 执行失败 —— 多条判据要求在有 git 的检出里运行');
}

// ── 仓库卫生：**已跟踪的文件不得命中 `.gitignore`**（2026-10-10，审计 §4.265）────────────────
// 【为什么】若一个**已跟踪**文件同时命中 `.gitignore`，`git status` **不会**再显示它的改动
//   ⇒ 「改了但没提交」**静默**发生（本仓 #1 形态的变体：**没有任何信号**）。
//   实测（本轮新透镜「仓库卫生」）：当前 **0 处冲突** ✅ ⇒ 判据落地即绿、可长期拦回归。
// 【判据】`git ls-files -i -c --exclude-standard`（**git 自带的**谓词 = 已跟踪 ∩ 被忽略）必须为空。
//   ⚠️ **用 git 自己的谓词，不自己解析 `.gitignore`** —— 嵌套 `.gitignore`（本仓有
//     `tests/benchmark/.gitignore`）· 否定规则 `!` · 目录语义（`dir/` 只匹配目录）都极易写错。
//   ⚠️ **例外：无**。该集合**应当恒为空**；若确有「必须跟踪但命中忽略规则」的文件，
//     正确做法是加**否定规则 `!`** 或把忽略规则**写窄**，**不是**放宽本判据。
{
  let ignoredTracked = null;
  try {
    ignoredTracked = execFileSync('git', ['ls-files', '-i', '-c', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch {
    fail('无法执行 `git ls-files -i -c --exclude-standard` —— 本判据要求在有 git 的检出里运行');
  }
  if (ignoredTracked !== null) {
    for (const f of ignoredTracked) {
      fail(`\`${f}\` **已被跟踪**却又命中 \`.gitignore\` —— \`git status\` **不会再显示它的改动**`
        + ' ⇒ 「改了但没提交」会**静默**发生。请加否定规则 `!` 或把忽略规则写窄（**不要**放宽本判据）');
    }
  }
  // canary：两向（用 git 自己的 `check-ignore`；样本取自**本仓稳定的既有事实**）
  const isIgnored = (p) => {
    try { execFileSync('git', ['check-ignore', '-q', p], { cwd: root }); return true; } catch { return false; }
  };
  if (!isIgnored('tests/visual/actual/')) {
    fail('仓库卫生护栏 canary 失效：**已知被忽略**的目录未被判为忽略（`.gitignore` 规则或谓词失效）');
  }
  if (isIgnored('README.md')) {
    fail('仓库卫生护栏**过宽**：**已跟踪**的 `README.md` 被判为被忽略（谓词失效 ⇒ 判据会恒报错）');
  }
  console.log(`Release gate: 仓库卫生 —— 已跟踪 ∩ 被忽略 = ${ignoredTracked === null ? '?' : ignoredTracked.length} 处（应为 0）`);
}

// ── 仓库卫生：**换行符政策**必须存在且**真的生效**（2026-10-10，审计 §4.266）──────────────────
// 【为什么】本仓此前**没有** `.gitattributes`，而 Windows runner 的 `core.autocrlf=true`
//   会把文本文件**检出为 CRLF** ⇒ **已造成一次真实事故**：§4.252 的判据用 `readFileSync` +
//   锚在「分号 + 换行」上的正则 ⇒ **Linux 绿 / Windows 红**；此后多处判据写了 `.replace()` 的
//   **CRLF 归一化**作为**创可贴**（`verify-upstream-manifest.mjs` 的哈希归一化即其一）。
//   ⇒ 立 `.gitattributes` 后**根因消除**（检出时一律 LF）；本判据锁住它**不被删掉 / 不被写错**。
//   ⚠️ **本注释刻意不写出那个两字符转义序列**（连注释里也不行）—— 本文件的 CRLF canary（⑤）
//     要求「去掉归一化后，全文不再出现该序列」，写了就会让它报「注入后仍未检出缺失归一化」
//     （本仓既有警告，本轮**实测踩到**）。要引用该形态请**运行时拼接**。
// 【判据】① `.gitattributes` 必须存在；② 用 **`git check-attr`**（**git 自己的谓词**）断言
//   **代表性文本文件**的 `eol == lf` 且 `text == auto`；③ **代表性二进制**的 `text == unset`；
//   ④ 样本文件本身必须存在（否则判据会静默失去靶子）。
//   ⚠️ **不解析 `.gitattributes` 的文本**：规则**顺序有意义**（后面的覆盖前面的）· `binary` 是**宏** ·
//     注释与空行 —— 自己解析必然出错。**实测**：首版把 `*.png binary` 写在 `*` 规则**之前**
//     ⇒ 被通用规则覆盖（`check-attr` 才发现 `text` 仍是 `auto`）。
//   ⚠️ **不声称**「Windows 检出一定是 LF」—— 那由 **CI 的 Windows job** 验证。
{
  const GA = '.gitattributes';
  /** 判定与 canary **共用**：用 git 自己解析某路径的属性（`check-attr`）。 */
  const attrsOf = (p) => {
    const out = {};
    try {
      for (const line of execFileSync('git', ['check-attr', 'text', 'eol', '--', p], { cwd: root, encoding: 'utf8' }).split('\n')) {
        const m = /^(.+?): ([\w-]+): (.*)$/.exec(line);
        if (m !== null) out[m[2]] = m[3];
      }
    } catch { /* 由下面的断言报错 */ }
    return out;
  };
  const TEXT_SAMPLES = ['README.md', 'package.json', '.github/workflows/ci.yml', 'apps/desktop/src-tauri/Cargo.toml'];
  const BIN_SAMPLES = ['apps/desktop/src-tauri/icons/32x32.png', 'apps/desktop/public/fonts/NotoSansSC-Regular.ttf'];
  if (!existsSync(resolve(root, GA))) {
    fail(`缺少 \`${GA}\` —— 本仓**没有换行符政策** ⇒ Windows runner（\`core.autocrlf=true\`）会把文本文件`
      + '检出为 CRLF ⇒ 「Linux 绿 / Windows 红」（实测事故：审计 §4.252）。请加 `* text=auto eol=lf`');
  } else {
    for (const p of [...TEXT_SAMPLES, ...BIN_SAMPLES]) {
      if (!existsSync(resolve(root, p))) {
        fail(`换行符政策判据的样本 \`${p}\` **不存在** —— 判据已失去靶子（请换一个仍然存在的样本）`);
      }
    }
    for (const p of TEXT_SAMPLES) {
      const a = attrsOf(p);
      if (a.eol !== 'lf') {
        fail(`${GA} 未对文本文件 \`${p}\` 生效：\`eol\` = \`${a.eol ?? '(未取到)'}\`（应为 \`lf\`）`);
      }
      if (a.text !== 'auto') {
        fail(`${GA} 未对文本文件 \`${p}\` 生效：\`text\` = \`${a.text ?? '(未取到)'}\`（应为 \`auto\`）`);
      }
    }
    for (const p of BIN_SAMPLES) {
      const a = attrsOf(p);
      if (a.text !== 'unset') {
        fail(`${GA} 未把二进制 \`${p}\` 标为非文本：\`text\` = \`${a.text ?? '(未取到)'}\`（应为 \`unset\`）`
          + ' —— ⚠️ **规则顺序有意义**（后面的覆盖前面的）：`*.png binary` 必须写在 `*` 规则**之后**');
      }
    }
    // ⚠️ **政策「生效」的**唯一直接证据**：读**原始字节**看有没有 CR。
    //   各护栏的 CRLF 归一化创可贴会让它们**无论检出是 LF 还是 CRLF 都通过** ⇒ 区分不了。
    //   本断言在 **CI 的 Windows job** 上是真检验（该 runner 的 `core.autocrlf=true` 会把文本文件
    //   检出为 CRLF）—— 政策若失效，这里会**响亮报红**。
    for (const p of TEXT_SAMPLES) {
      const raw = readFileSync(resolve(root, p));
      if (raw.includes(0x0d)) {
        fail(`工作区里的文本文件 \`${p}\` **含 CR 字节**（检出不是 LF）—— 换行符政策**没有生效**。`
          + '在 Windows runner 上这通常意味着 `.gitattributes` 缺失 / 写错，或该文件以 CRLF 入库过');
      }
    }
  }
  // canary：两向（构造样本 = 仓库里稳定的两类真实路径；与判定**共用** attrsOf）
  if (attrsOf('README.md').text !== 'auto') {
    fail('换行符政策 canary 失效：**已知文本文件**的属性未取到（`git check-attr` 谓词失效）');
  }
  if (attrsOf('apps/desktop/src-tauri/icons/32x32.png').text === 'auto') {
    fail('换行符政策 canary 失效：**已知二进制**未被标为非文本（判据会恒报错或恒通过）');
  }
  console.log(`Release gate: 仓库卫生 —— 换行符政策 ${existsSync(resolve(root, GA)) ? '**已生效**' : '**缺失**'}`
    + '（`git check-attr` 实测：文本 `text=auto` + `eol=lf` / 二进制 `text=unset`）');
}

const parityDir = resolve(root, 'tests/parity');
// ⚠️ 逐文件检查（接线 / CRLF / PRD 引用）用**工作区枚举**：本地 ⊇ CI ⇒ 本地**至少一样严**，
//   方向**安全**（只会「本地红、CI 绿」，不会反过来），且给 WIP 护栏即时反馈。
const guardFiles = readdirSync(parityDir)
  .filter((name) => name.startsWith('verify-') && name.endsWith('.mjs'))
  .sort();
// ⚠️ **数量下限**必须锚在**仓库**（`git ls-files`）—— 见 §4.167：用工作区计数会把未跟踪的
//   WIP 护栏算进来，使「本地」与「干净检出」对同一条下限给出不同结论。
const repoGuardFiles = (trackedFiles ?? [])
  .filter((f) => f.startsWith('tests/parity/verify-') && f.endsWith('.mjs'))
  .map((f) => f.slice('tests/parity/'.length))
  .sort();

// ── ① 护栏全集必须接入根脚本链 ──────────────────────────────────────────
const pkg = JSON.parse(read('package.json'));
const testChain = pkg.scripts?.test ?? '';
const parityChain = pkg.scripts?.parity ?? '';
// ⚠️ 2026-10-08（审计 §4.167）：下限原写 `18`（2026-10-01 基线），而实际已是 **23** ⇒
//   本条自己声明的意图「**防某人悄悄删掉一条**」**根本没有实现**（连删 5 条都不会红）。
//   现按本仓纪律「**下限 == 当前基线**」改为 **23**。
const REPO_GUARD_BASELINE = 23; // [覆盖型] 基线 23
coverEq('**仓库里**的 parity 护栏条数', repoGuardFiles.length, REPO_GUARD_BASELINE,
  '防某人悄悄删掉一条；数量退化会让它退化成**空真**');
// 两个锚点必须一致：逐文件检查不能漏掉任何**已跟踪**的护栏（否则「接线检查」会静默漏检）
const missingFromWorkspace = repoGuardFiles.filter((f) => !guardFiles.includes(f));
if (missingFromWorkspace.length > 0) {
  fail(`已跟踪的护栏在工作区枚举里缺失：${missingFromWorkspace.join(', ')}`
    + ' —— 逐文件检查（接线/CRLF/PRD 引用）会漏掉它们');
}
const missingInTest = guardFiles.filter((name) => !testChain.includes(name));
const missingInParity = guardFiles.filter((name) => !parityChain.includes(name));
if (missingInTest.length > 0) fail(`根 package.json 的 test 链缺少护栏：${missingInTest.join(', ')}`);
if (missingInParity.length > 0) fail(`根 package.json 的 parity 链缺少护栏：${missingInParity.join(', ')}`);
if (!testChain.includes('ux-gate-recorder.mjs --self-test')) {
  fail('根 test 链缺少 ux-gate-recorder --self-test（UX Gate 自检）');
}
// canary（数量下限的锚点）：把跟踪集里的一条护栏摘掉 ⇒ 仓库枚举必须少一条
//   （证明下限算的是**仓库**，不是工作区；工作区枚举不受影响）
{
  const probe = (trackedFiles ?? []).filter((f) => f !== `tests/parity/${repoGuardFiles[0]}`);
  const probeRepo = probe
    .filter((f) => f.startsWith('tests/parity/verify-') && f.endsWith('.mjs')).length;
  if (probeRepo !== repoGuardFiles.length - 1) {
    fail('① canary 失效：仓库护栏枚举不随跟踪集变化（下限的锚点已失效）');
  }
  if (repoGuardFiles.length > guardFiles.length) {
    fail(`仓库护栏数（${repoGuardFiles.length}）不得多于工作区护栏数（${guardFiles.length}）`
      + ' —— 工作区 ⊇ 仓库是本条的前提');
  }
}

// ── ② 台账结论可达性 + NO-GO 清单 ───────────────────────────────────────
const ledger = JSON.parse(read('tests/parity/typora-parity-ledger.json'));

// 证据词汇表（§12 D-W「验证范围与证据来源」裁决）：
//   macos / macos-native —— 本机实机验证（用户裁决：macOS 平台版本使用本机验证）
//   windows-ci / linux-ci —— GitHub Actions 证据（用户裁决：其他平台不做真实设备验证；
//                            ADR-0022：Win/Linux 以 CI 为正式 Runtime 证据来源）
//   windows / linux      —— 【禁用】裸平台名暗示真机验证，在 D-W 下不可满足，
//                            会让门禁变成「永远无法关闭的假门禁」，故显式拒绝。
const EVIDENCE_VOCABULARY = new Set([
  // 平台证据来源
  'macos', 'macos-native', 'windows-ci', 'linux-ci',
  // 证据种类（新增种类必须先登记，防止出现无法追溯来源的自造词）
  'unit', 'integration', 'visual-golden', 'ux-gate', 'source-fidelity',
  'ledger-validation', 'cross-app', 'document-review', 'source-freeze',
  'menu-schema', 'command-registry', 'export-corpus', 'benchmark',
  'linux-ime-matrix',
]);
const BANNED_EVIDENCE = ['windows', 'linux', 'win', 'mac'];
// 三平台证据必须齐备：macOS 走本机，Win/Linux 走 CI（各自只需其中之一即可满足该平台）
const PLATFORM_EVIDENCE_GROUPS = [['macos', 'macos-native'], ['windows-ci'], ['linux-ci']];
const noGo = [];
// ── 「闭环」口径（ADR-0024 Q1 = A3，Accepted 2026-09-30）──────────────────
// `AUTO` 不得为「**自身声明需要人工门禁**」的项收口：master-plan §4.3 定义
// `AUTO` =「自动化测试通过，**真机体验验收未完成**」—— 一个把 `ux-gate` 写进
// `requiredEvidence` 的项，其声明本身就承认「人工验收未完成」。
// 依据：§5.7 前科（P0-SHELL-003 浮动工具栏永不显示，却因 AUTO 被当闭环）。
// **本规则只可能让项变严**（移入未闭环），不可能放宽任何一项。
const closedViaAuto = (item) => item.status === 'AUTO'
  && !(item.requiredEvidence ?? []).includes('ux-gate');
const isClosed = (item) => item.status === 'PASS-E' || item.status === 'PASS-B' || closedViaAuto(item);
/** 未闭环项的阻塞原因集合（用于在输出里按原因归类，而不是只列状态码） */
const blockers = new Set();
for (const item of ledger.items ?? []) {
  const required = item.requiredEvidence ?? [];
  for (const token of required) {
    if (BANNED_EVIDENCE.includes(token)) {
      fail(`${item.id} 的 requiredEvidence 含禁用词 '${token}'：D-W 下不做其他平台真机验证，请改用 '${token}-ci'`);
    } else if (!EVIDENCE_VOCABULARY.has(token)) {
      fail(`${item.id} 的 requiredEvidence 含未登记词 '${token}'（须先登记进 EVIDENCE_VOCABULARY）`);
    }
  }
  if (item.status === 'PASS-E') {
    for (const group of PLATFORM_EVIDENCE_GROUPS) {
      if (!group.some((token) => required.includes(token))) {
        fail(`${item.id} 标记 PASS-E 但 requiredEvidence 缺 ${group.join(' / ')}（结论不可达）`);
      }
    }
    if (!required.includes('ux-gate')) {
      fail(`${item.id} 标记 PASS-E 但 requiredEvidence 缺 ux-gate（结论不可达）`);
    }
  }
  // 未闭环项必须**声明阻塞原因**（2026-09-25）。
  //
  // 立此条的原因：此前「为什么这项没闭环」只写在 mellowTarget 的长段散文里，
  // 门禁输出只有 `P0-XXX(MAC 仅单平台)` 这样的状态码 —— 实测其中三项
  // （P0-EDITOR-004 / P0-PLATFORM-001 / P0-LAYOUT-002）**自身 requiredEvidence 已全部取得**，
  // 仅因「PASS-E 必须含 ux-gate」的全局策略而未升，状态码 `MAC 仅单平台` 反而**误导**
  // （读者会以为缺平台证据）。阻塞原因必须成为**机器可读的字段**，否则每次审计都要重读散文。
  const closed = isClosed(item);
  if (!closed) {
    if (typeof item.blockedBy !== 'string' || item.blockedBy.trim() === '') {
      fail(`${item.id} 未闭环但未声明 blockedBy（阻塞原因必须机器可读，不能只写在散文里）`);
    } else {
      blockers.add(item.blockedBy);
    }
  }
  if (item.status === 'NOT_TESTED' || item.status === 'BLOCKED' || item.status === 'ABSENT' || item.status === 'IMPL') {
    noGo.push(`${item.id}(${item.status} — ${item.blockedBy ?? '未声明阻塞原因'})`);
  } else if (['MAC', 'WIN', 'LINUX'].includes(item.status)) {
    // 仅单一平台证据：三平台未闭环，同样不得作为发布结论
    noGo.push(`${item.id}(${item.status} — ${item.blockedBy ?? '未声明阻塞原因'})`);
  } else if (item.status === 'AUTO' && !closed) {
    // ADR-0024 A3：自身声明需要 ux-gate 的 AUTO 项，不得以 AUTO 收口
    noGo.push(`${item.id}(${item.status} — ${item.blockedBy ?? '未声明阻塞原因'}；ADR-0024 A3：含 ux-gate 的项不得以 AUTO 收口)`);
  }
}
// canary：自检「未闭环项必须声明阻塞原因」这条规则本身（样本拼接构造）
{
  const SAMPLE_BAD = { id: 'P0-X', status: 'BLOCKED' };
  const SAMPLE_GOOD = { id: 'P0-X', status: 'BLOCKED', blockedBy: 'reason' };
  const closedOk = isClosed;
  if (closedOk(SAMPLE_BAD) || typeof SAMPLE_BAD.blockedBy === 'string') {
    fail('阻塞原因门禁 canary 失效：缺 blockedBy 的样本未被判为不合规');
  }
  if (!closedOk(SAMPLE_GOOD) && (typeof SAMPLE_GOOD.blockedBy !== 'string' || SAMPLE_GOOD.blockedBy === '')) {
    fail('阻塞原因门禁 canary 失效：带 blockedBy 的样本被判为不合规');
  }
}

// ── 待裁决项必须指向承载它们的 Proposed ADR（2026-09-29）──────────────────
//
// 立此节的原因：审计发现「需要裁决」的事项此前只散落在会话消息与散文里 ——
// 下一次接手的人不知道该改哪份文档、也不知道哪些是「已定」哪些是「待定」。
// 按 AGENTS.md「决策变更：正确做法是新增 ADR」，待裁决项必须有 ADR 载体，
// 且**未裁决前状态必须是 Proposed**（不得被悄悄标成 Accepted 当作已决）。
// ── 已裁决 ADR（2026-09-30）─────────────────────────────────────────────
// ADR-0024 / 0025 / 0026 原为 Proposed；用户在 2026-09-30 授权「自行评估、决策、实施」，
// 三份均已按各自 ADR 内的选项与证据裁决为 **Accepted**（裁决内容见各 ADR 的「裁决」节）。
// 断言仍保留，但方向反转：**已裁决的 ADR 不得被删除、也不得退回 Proposed** ——
// 防止「把裁决记录删掉当作问题不存在」（那会让本门禁的结论失去依据）。
const DECIDED_ADRS = [
  ['docs/adr/ADR-0024-release-closure-semantics.md', 'AUTO 是否阻断发布 / ux-gate 是否逐项前置', 'A3 / B1'],
  ['docs/adr/ADR-0025-evidence-policy-when-baseline-refuses.md', '>2MB 无基线时的证据政策', 'A1 / B1 / C1'],
  ['docs/adr/ADR-0026-perf-target-measurement-scope.md', 'PRD §110 性能目标的测量口径', 'A1 / B1 / C1'],
  // 2026-10-01 裁决（依据用户 2026-09-30 授权「全部自行评估、决策、实施，不叫我人工参与」）
  ['docs/adr/ADR-0027-engine-theme-token-reachability-and-panel-surfaces.md',
    '引擎侧浮动面板表面取色（表格工具栏 / 选区工具栏）', 'A1 / B1 / C1'],
  ['docs/adr/ADR-0028-engine-host-context-channel.md',
    '引擎侧宿主上下文通道（统一 UI 上下文桥 vs 逐项加桥）', 'A2 / B1 / C1'],
  ['docs/adr/ADR-0029-audit-pending-decisions-registry.md',
    '审计中的未登记裁决项（6 项）', 'A3 / B2 / C2 / Q4=D2（2026-10-05 补证据后裁决：从 spec 移除）/ E1 / F1'],
  // 2026-10-05 裁决：clipboard paste 优先级（image payload vs rich HTML 的处理器顺序）
  ['docs/adr/ADR-0030-clipboard-paste-priority-handler-order.md',
    'clipboard paste 优先级：image payload 与 rich HTML 的处理器顺序', 'A3（收敛到一处显式判断）'],
  // 2026-10-06 立、**同日裁决为 Accepted**（依据用户 2026-09-30 的常设授权）：
  // 审计 §4.95–§4.105 新增的四组裁决项 —— 此前只在正文里写了「登记待裁决」却**没有载体**
  // （违反 AGENTS.md「待裁决项必须有 ADR 载体」与登记表头「不得新增未登记的裁决项」），
  // 本 ADR 是按先例（ADR-0029）补的载体，并已逐问裁决：
  //   Q1=A1（删除 30 个死 i18n 键，目录 841→811，判据 D 升级为硬判据）；
  //   Q2=B3（3 个死主题 token 维持登记，与 ADR-0027 Q3 口径一致）；
  //   Q3=C3（3 个零消费者包**保留** —— AGENTS.md「不要自行修改架构」优先于常设授权）；
  //   Q4=D2（3 个 schema 外持久化键维持登记 + 补文档说明）。
  ['docs/adr/ADR-0032-audit-new-pending-decisions-2026-10-06.md',
    '审计新增四问：死 i18n 键 / 死主题 token / 零消费者包 / schema 外持久化键（§4.95–§4.105）',
    'Q1=A1 / Q2=B3 / Q3=C3 / Q4=D2'],
  // 2026-10-06 立、**同日裁决为 Accepted**：图片导出的「用主题字号」等价物 ——
  // 登记表第 7 行原写「已处置」是**过度声称**（只覆盖「自定义字号」那一半），
  // 另一半（Typora `useThemeFontSize` radio）未实施且计划写着「需单独裁决」却**没有载体**。
  // 裁决 **A2**：提供「跟随编辑器字号」开关（A3 实测等于空操作：主题无 per-theme 字号；
  // A1 会把 parity 缺口永久留着）。**默认仍为 `custom` ⇒ 既有导出输出逐字节不变。**
  ['docs/adr/ADR-0033-image-export-theme-font-size.md',
    '图片导出的「用主题字号」等价物（canvas 无主题 CSS 通道）', 'A2（跟随编辑器字号；默认 custom 不变）'],
];
// ── 待裁决 ADR（2026-10-01 起非空）────────────────────────────────────────
// ADR-0027：引擎侧主题 token 的可达性判定与浮动面板表面取色。
// 它承载一个**真实取舍**（新增 md 面板 token / 拓宽 token 桥 / 维持现状），
// 故必须是 Proposed，且**不得**被悄悄标成 Accepted。
// ADR-0029 已于 2026-10-01 裁决为 Accepted（Q1=A3 / Q2=B2 / Q3=C2 / Q4 留待 / Q5=E1 / Q6=F1）
// ADR-0030（2026-10-05 立、**同日裁决为 A3**）：clipboard paste 优先级 —— `image payload` 与 `rich HTML`
// **分处两个 eventHandler**，而 `index.ts` 的注册顺序把优先级 2 排在 3/4 之后 ⇒ 与 spec §3 相反。
// 裁决 A3 = 在 `handleSmartPaste` 内**显式让位**（有图片 payload 则 return false）⇒ 不再依赖注册顺序。
// 故它**不再**是待裁决项（已移入 DECIDED_ADRS）。
// 2026-10-07（审计 §4.120）：**重新非空** —— 偏好矩阵里 5 条 `deviation.kind === 'undecided'`
// 此前**只写在 master-plan 的轮次叙述里**，审计登记表一行都没有 ⇒ 本门禁报 `Pending decisions: 无`，
// 即**项目在机器可读层面声称「没有待裁决项」**。ADR-0034 是它们的载体（**未擅自改任何默认值**）。
// 2026-10-10（审计 §4.247）：**再增一项** —— 行内强调的**渲染语义**差异
// （`**` 紧贴全角标点且外侧紧贴汉字时，Typora 渲染成加粗、Mellow 的两条路径都判为不成对）。
// 它此前**不在任何台账条目内**（`P0-MARKDOWN-002` 说的是「格式命令」，不是「解析器语义」），
// 故按「待裁决项必须有 ADR 载体」立 ADR-0035（**未擅自改任何渲染行为**）。
const PENDING_ADRS = [
  ['docs/adr/ADR-0034-preference-deviations-2026-10-07.md',
    '偏好默认值 5 项偏离 Typora（highlight / sub·sup / mermaid / zoomByMouse）'],
  ['docs/adr/ADR-0035-cjk-inline-emphasis-semantics.md',
    '行内强调的渲染语义：`**` 紧贴全角标点时是否对齐 Typora（偏离 CommonMark）'],
  // 2026-10-10（审计 §4.248）：**再增一项** —— 11 个语法特性开关（PRD §94）只接线到**预览**一条路径，
  // HTML 导出有 3 个选项调用点不传、6 个语法完全没实现；PDF 导出无任何开关。
  // 修它会改变导出件内容 ⇒ 按「改变用户可见结果属产品决策」立 ADR-0036（**未擅自改渲染行为**）。
  ['docs/adr/ADR-0036-export-path-syntax-feature-parity.md',
    '语法特性开关与导出路径的接线缺口：三条渲染路径要不要语法一致'],
  // 2026-10-10（审计 §4.250）：PDF 里公式与图表渲染不出来（需栅格化渲染器）。
  // 台账 P0-EXPORT-001 的 blockedBy 已指向本 ADR —— **换 PDF 引擎属架构级改动**（AGENTS.md），
  // 故只登记两条路的事实与代价（pdfmake 补渲染器 vs 复用已实现的 HTML 打印管线），**未自行改**。
  ['docs/adr/ADR-0037-pdf-math-mermaid-rendering-path.md',
    'PDF 导出的公式与图表：给 pdfmake 补渲染器，还是改用已实现的 HTML 打印管线'],
];
for (const [p, what] of PENDING_ADRS) {
  if (!existsSync(resolve(root, p))) {
    fail(`待裁决 ADR 缺失：${p}（${what}）—— 待裁决项必须有 ADR 载体（AGENTS.md「决策变更」）`);
    continue;
  }
  const src = read(p);
  // 未裁决前**必须**是 Proposed。判据形态（2026-10-07 收紧，审计 §4.121）：
  // **只认行首的** `**Status:**` 行 —— 原写法 `/\*\*Status:\*\*[^\n]*Proposed/` 无锚点，
  // 会被**正文里的一句引用**满足（实测：ADR-0034 的「机器可读化」节里写着
  // 「…其 `**Status:**` 行仍为 `Proposed`…」，于是**把 Status 改成 Accepted 后判据仍然通过**）。
  // 这是本仓反复记过的「**护栏被自己写的说明文字满足**」，这次是**我写判据时踩进去的**。
  if (!/^\*\*Status:\*\*[^\n]*Proposed/m.test(src)) {
    fail(`${p}（${what}）尚未裁决，状态必须是 Proposed；若已裁决，请移入 DECIDED_ADRS 并写明结论`);
  }
}
// canary：自检上面这条规则本身（样本拼接构造，不依赖真实文件）
{
  const PROPOSED_LINE = '**Status:** **Proposed**（2026-10-01）—— 待裁决；裁决前不生效';
  const ACCEPTED_LINE = '**Status:** **Accepted**（2026-10-01）—— 已裁决';
  const RE = /^\*\*Status:\*\*[^\n]*Proposed/m;
  if (!RE.test(PROPOSED_LINE)) {
    fail('待裁决 ADR 状态护栏 canary 失效：合法的 Proposed 状态行未被检出');
  }
  if (RE.test(ACCEPTED_LINE)) {
    fail('待裁决 ADR 状态护栏 canary 失效：Accepted 状态行被误判为 Proposed');
  }
  // 反例锁：正文里出现「Proposed」字样不得让一个没有 Status 行的文件过关
  const BODY_ONLY = '本 ADR 原为 Proposed，现已裁决。';
  if (RE.test(BODY_ONLY)) {
    fail('待裁决 ADR 状态护栏过宽：正文里的 Proposed 字样被当成了状态行');
  }
  // ⚠️ 2026-10-07 新增反例（**本轮实测踩到的形态**）：正文里**引用** `**Status:**` 这一写法
  // —— 无锚点正则会把它当成状态行；加了 `^` 锚点后不会（该行以 `>` 或中文开头）。
  const ACCEPTED_WITH_QUOTED_STATUS = [
    '**Status:** **Accepted**（2026-10-01）—— 已裁决',
    '',
    '> 判据只认 `**Status:**` 那一行；裁决后必须保持 `Proposed` 直到有人拍板。',
  ].join('\n');
  if (RE.test(ACCEPTED_WITH_QUOTED_STATUS)) {
    fail('待裁决 ADR 状态护栏过宽：**正文里引用的 `**Status:**`** 被当成了状态行'
      + '（这正是 2026-10-07 实测踩到的形态 —— 判据必须锚定行首）');
  }
  // 反向：状态行**不在文件首行**时仍要能检出（锚点是行首，不是文件首）
  const LATE_STATUS = ['# ADR-9999 — x', '', '正文', '', '**Status:** **Proposed**（2026-10-01）'].join('\n');
  if (!RE.test(LATE_STATUS)) {
    fail('待裁决 ADR 状态护栏 canary 失效：非首行的 Proposed 状态行未被检出');
  }
}
for (const [p, what, decision] of DECIDED_ADRS) {
  if (!existsSync(resolve(root, p))) {
    fail(`已裁决 ADR 缺失：${p}（${what}）—— 裁决记录不得删除，否则门禁结论失去依据`);
    continue;
  }
  const src = read(p);
  // 状态行的 Accepted 可能被加粗（`**Status:** **Accepted**`），故用 [^\n]* 容错，
  // 但**必须锚定行首**（2026-10-07 收紧，审计 §4.121）：无锚点会被**正文里引用的 `**Status:**`** 满足。
  if (!/^\*\*Status:\*\*[^\n]*Accepted/m.test(src)) {
    fail(`${p} 已于 2026-09-30 裁决为 Accepted（${decision}），不得退回 Proposed 或删除`);
  }
}

// ── ⑫ ADR 的**状态取值**必须从目录**派生**，且与清单**双向**一致（2026-10-09，审计 §4.177）──
// 【为什么】`PENDING_ADRS` / `DECIDED_ADRS` 是**硬编码清单** ⇒
//   **新增一份 `Proposed` ADR（或把某份 ADR 悄悄改回 Proposed）时，门禁完全看不到它** ——
//   而门禁的 `Pending decisions:` 行会**照样报「无」**，即「项目在机器可读层面声称没有待裁决项」。
//   ⚠️ 这正是 **ADR-0029 / §4.120** 记过的形态（当时是偏好矩阵的 `undecided` 没被登记），
//   而**当时的修法是「手工把 ADR-0034 加进清单」—— 清单本身仍是硬编码**（同族：扫描面写成常量）。
//   实测：**34 份 ADR 里 24 份不在任何清单里**（门禁完全看不到它们）。
// 【判据】① 每份 `docs/adr/ADR-*.md` 的状态行必须解析出**词表内**的取值；
//   ② **派生**的 `Proposed` 集合必须 == `PENDING_ADRS`（**双向**）；
//   ③ `DECIDED_ADRS` 的每一份都必须在**派生**的 `Accepted` 集合里；
//   ④ `Conditional` 必须**显式登记**（否则它是无人守的第三种状态）。
// ⚠️ 本块**必须在抛错点之前**（§4.175 的教训）。
{
  const ADR_DIR = 'docs/adr';
  // 词表：取值 = 状态行里**第一个英文词**（容忍 `Accepted（2026-09-03）` 这种带日期的写法）
  const ADR_STATUS_VOCAB = new Set(['Accepted', 'Proposed', 'Conditional']);
  // `Conditional` 是**真有条件的第三种状态**（ADR-0002：V0.0 三平台 Gate 通过后转 Accepted）
  //   ⇒ **不是「待裁决」**，但**必须登记**（否则它会成为无人守的第三种状态）。
  const CONDITIONAL_REGISTERED = new Map([
    ['ADR-0002-desktop-runtime-qualification.md',
      '「V0.0 三平台通过 IME/Caret/Clipboard/Print/10MB Gate 后转 Accepted」—— **有条件的状态**，不是待裁决'],
  ]);
  const statusWordOf = (src) => {
    const m = /^\*\*Status:\*\*\s*([^\n]*)$/m.exec(src);
    if (m === null) return null;
    const w = m[1].replace(/\*/g, '').match(/[A-Za-z]+/);
    return w === null ? null : w[0];
  };
  // 逐文件检查用**工作区枚举**（本地 ⊇ 仓库 ⇒ 方向安全，且给 WIP 即时反馈；同 `guardFiles`）；
  // 但**数量下限**必须锚在**仓库**（`git ls-files`）—— 同 `repoGuardFiles`（§4.166/§4.167）。
  const adrFiles = readdirSync(resolve(root, ADR_DIR)).filter((f) => /^ADR-\d{4}.*\.md$/.test(f)).sort();
  const repoAdrCount = (trackedFiles ?? [])
    .filter((f) => f.startsWith(`${ADR_DIR}/ADR-`) && f.endsWith('.md')).length;
  if (repoAdrCount < 30) {
    fail(`⑫ 仓库里只跟踪到 ${repoAdrCount} 份 ADR（下限 30 = 2026-10-09 实测 34）—— 判据范围萎缩`);
  }
  // ⚠️ **过滤正则本身就是「静默豁免面」**：`/^ADR-\d{4}/` 之外的 .md 会被无声跳过
  //   ⇒ 断言「目录里的 .md 集合 == 匹配命名规范的集合」（当前实测 34 == 34，无豁免）。
  //   若将来确实要放非 ADR 的 .md 进本目录，必须**显式登记**（并说明为何不是静默豁免）。
  //   （同族：§4.152 按目录豁免 / §4.153 按文件 / §4.167 目录级排除误伤 —— 「粒度/位置当代理」。）
  const adrDirMd = readdirSync(resolve(root, ADR_DIR)).filter((f) => f.endsWith('.md')).sort();
  const adrUnmatched = adrDirMd.filter((f) => !/^ADR-\d{4}.*\.md$/.test(f));
  if (adrUnmatched.length > 0) {
    fail(`⑫ ${ADR_DIR}/ 下有不符合 ADR 命名规范（ADR-NNNN-*.md）的 .md 文件：${adrUnmatched.join('、')}`
      + ' —— 它们会被状态判据**静默跳过**（过滤正则 = 豁免面）；要么改名，要么显式登记');
  }
  const derived = new Map();
  const unparsed = [];
  for (const f of adrFiles) {
    const w = statusWordOf(read(`${ADR_DIR}/${f}`));
    if (w === null || !ADR_STATUS_VOCAB.has(w)) { unparsed.push(`${f}（取值 ${JSON.stringify(w)}）`); continue; }
    derived.set(f, w);
  }
  if (unparsed.length > 0) {
    fail(`⑫ 这些 ADR 的状态取值无法解析或不在词表 {${[...ADR_STATUS_VOCAB].join(' / ')}} 内：${unparsed.join('、')}`
      + ' —— 状态词表的语义有后果（门禁的 `Pending decisions:` 靠它）；新增状态值必须显式登记并说明含义');
  }
  const derivedProposed = new Set([...derived].filter(([, v]) => v === 'Proposed').map(([f]) => `${ADR_DIR}/${f}`));
  const declaredProposed = new Set(PENDING_ADRS.map(([p]) => p));
  for (const p of declaredProposed) {
    if (!derivedProposed.has(p)) {
      fail(`⑫ PENDING_ADRS 声明 ${p} 为待裁决，但它**派生**出来的状态不是 Proposed —— 两侧必须一致`);
    }
  }
  for (const p of derivedProposed) {
    if (!declaredProposed.has(p)) {
      fail(`⑫ ${p} 的状态是 **Proposed**，但**不在** PENDING_ADRS 里 ⇒ 门禁的 \`Pending decisions:\` 会**漏报**它`
        + '（这正是 ADR-0029 记过的形态）—— 要么裁决它，要么加进 PENDING_ADRS');
    }
  }
  const derivedAccepted = new Set([...derived].filter(([, v]) => v === 'Accepted').map(([f]) => `${ADR_DIR}/${f}`));
  for (const [p] of DECIDED_ADRS) {
    if (!derivedAccepted.has(p)) fail(`⑫ DECIDED_ADRS 声明 ${p} 已裁决，但它**派生**出来的状态不是 Accepted`);
  }
  for (const [f, v] of derived) {
    if (v === 'Conditional' && !CONDITIONAL_REGISTERED.has(f)) {
      fail(`⑫ ${ADR_DIR}/${f} 的状态是 \`Conditional\`（词表内但**必须登记**）—— `
        + '请加进 CONDITIONAL_REGISTERED 并写明条件');
    }
  }
  for (const [f, why] of CONDITIONAL_REGISTERED) {
    if (derived.get(f) !== 'Conditional') {
      fail(`⑫ CONDITIONAL_REGISTERED 的 ${f} 已不再是 Conditional（原理由：${why}）—— 请删除该登记`);
    }
  }
  // canary ①（正样本）：带日期的 `Accepted（…）` 必须解析成 `Accepted`
  if (statusWordOf('**Status:** Accepted（2026-09-03）') !== 'Accepted') {
    fail('⑫ canary 失效：带日期的 `Accepted（…）` 未解析成 Accepted');
  }
  // canary ②（正样本）：加粗形态同样能解析
  if (statusWordOf('**Status:** **Proposed**（2026-10-01）—— 待裁决') !== 'Proposed') {
    fail('⑫ canary 失效：加粗的 `**Proposed**` 未解析成 Proposed');
  }
  // canary ③（负样本）：词表外的取值必须能被识别（谓词与判定共用同一函数）
  if (ADR_STATUS_VOCAB.has(statusWordOf('**Status:** Maybe'))) {
    fail('⑫ canary 失效：词表外的取值未被识别（判据已退化成空真）');
  }
  // canary ④：**双向**检查本身（合成集合）—— 一致的不得报，未登记的必须报
  const missingFromDeclared = (der, dec) => [...der].filter((p) => !dec.has(p));
  if (missingFromDeclared(new Set(['a']), new Set(['a'])).length !== 0) {
    fail('⑫ canary 失效：一致的 Proposed 集合被误报');
  }
  if (missingFromDeclared(new Set(['a']), new Set()).length !== 1) {
    fail('⑫ canary 失效：**未登记**的 Proposed 未被检出（这正是本条要防的漏报）');
  }
}

// ── 待裁决项必须登记（唯一声明处）+ 载体必须可解析（2026-10-01，ADR-0029）──────
// 立此条的原因：项目规则是「待裁决项必须有 ADR 载体」，而审计文档里曾有 **6 处「待裁决」标记
// 而门禁 `Pending decisions:` 是「无」** —— 护栏**只做了单向**（核对「ADR → 门禁」），
// 没核对「审计的待裁决项 → 是否有 ADR」。与 §4.10 的教训同源：
// **两处各自维护同一件事的部分清单，谁都不负责核对全集。**
//
// 判据：① 审计文档必须有「待裁决项登记表（唯一声明处）」；
//      ② 表中**每行的载体**必须可解析（指向存在的 `.md` 文件，或字面量 `已处置`）；
//      ③ **双向**：`PENDING_ADRS` 里的每个 ADR 都必须被登记表引用（否则「有载体但没登记」）。
{
  const AUDIT = 'docs/qualification/release-blocker-audit-2026-09-25.md';
  const MARK = '### 待裁决项登记表';
  if (!existsSync(resolve(root, AUDIT))) {
    fail(`缺少 ${AUDIT}（待裁决项的登记处）`);
  } else {
    const doc = read(AUDIT);
    const at = doc.indexOf(MARK);
    if (at < 0) {
      fail(`${AUDIT} 缺少「${MARK}」—— 待裁决项必须有登记处（ADR-0029）；`
        + '删掉它会让「待裁决项必须有 ADR 载体」这条规则重新变成无人守');
    } else {
      const end = doc.indexOf('\n## ', at);
      const body = doc.slice(at, end < 0 ? doc.length : end);
      const rows = body.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
      // ⚠️ 2026-10-09（审计 §4.168）：本条**自述为覆盖型**（「下限在此**适用**：登记表是
      //   「不该缩小的集合」」）⇒ 按本仓纪律「**覆盖型下限 == 当前基线**」（skill §2），
      //   阈值必须是**当前行数**。原写 `10`（立表时的基线），而实际已是 **17** ⇒ 留了 7 个空位，
      //   「行被删掉会让登记表退化成空表」这个意图**被削弱了 7 行**。现改为 **17**。
      // ⚠️ **2026-10-11（审计 §4.310）：它又漂到 20 了** —— 因为当时的实现是 `< ROWS_BASELINE`，
      //   而**没有任何东西**核对「阈值 == 当前值」（判据 ⑥ 只核对「标记里的数 == 阈值」）。
      //   ⇒ 这正是「`< N` 会**静默稀释防线**」的活证据（修了一次，又在无人守时漂了 3）。
      //   现改用 `coverEq`（严格相等）⇒ 值一漂**当场红**。
      const ROWS_BASELINE = 20; // [覆盖型] 基线 20
      coverEq('待裁决项登记表行数', rows.length, ROWS_BASELINE,
        '登记表是「不该缩小的集合」；若确实删过行，请同步下调本阈值并说明');
      for (const row of rows) {
        const cols = row.split(/(?<!\\)\|/).map((c) => c.trim());
        // 归一化：表里可能写成 `` `已处置`（证据） `` —— 先去掉反引号再判定，
        // 否则「带反引号的已处置」会被判成「载体不含 .md」（本判据首跑即踩到）。
        const carrier = (cols[cols.length - 2] ?? '').replace(/`/g, '');
        if (carrier.startsWith('已处置')) continue;
        const m = /([^\s（(]+\.md)/.exec(carrier);
        if (m === null) {
          fail(`登记表某行的载体既不是「已处置」也不含 .md 路径：${row.slice(0, 70)}`);
          continue;
        }
        if (!existsSync(resolve(root, m[1]))) {
          fail(`登记表引用了**不存在**的载体文件：${m[1]} —— 待裁决项指向空气等于没登记`);
        }
      }
      // ③ 双向：PENDING_ADRS 必须都被登记表引用
      for (const [p] of PENDING_ADRS) {
        if (!body.includes(p)) {
          fail(`待裁决 ADR ${p} 未被登记表引用 —— 有载体但没登记，读者从审计文档看不到它`);
        }
      }
      // canary：三个方向
      const carrierOf = (row) => {
        const cols = row.split(/(?<!\\)\|/).map((c) => c.trim());
        return cols[cols.length - 2] ?? '';
      };
      if (!carrierOf('| 1 | x | y | 待裁决 | `docs/adr/ADR-9999-nope.md` |').includes('ADR-9999')) {
        errors.push('待裁决登记表护栏 canary 失效：载体列未被取到');
      }
      if (!carrierOf('| 1 | x | y | 已处置 | `已处置`（证据） |').replace(/`/g, '').startsWith('已处置')) {
        errors.push('待裁决登记表护栏 canary 失效：「已处置」（含反引号写法）未被识别');
      }
      if (/^\|\s*\d+\s*\|/.test('| 表头 | a | b |')) {
        errors.push('待裁决登记表护栏 canary 过宽：表头行被当成数据行');
      }

      // ── ADR 的「取代」关系必须反映到登记表（2026-10-06，审计 §4.114）──────────
      // 立此条的原因（实测）：`ADR-0031` 明写「**取代：** ADR-0024 的 **Q2 = B1**」，
      // 而登记表**第 1 行**仍写「已裁决（A3 / B1）」、载体只指 ADR-0024
      // ⇒ 读者会以为 `B1` 仍然有效（**「已裁决」≠「仍有效」**）。
      // 判据：凡某 ADR 声明「取代：ADR-NNNN」，则以**被取代 ADR** 为载体的登记表行
      //       必须提到**取代者**的 ADR 编号 —— 否则「取代」这件事只存在于 ADR 内部，
      //       而**登记表才是读者发现它的地方**（与 §4.67「唯一可发现处」母题同型）。
      const supersessionsOf = (src) => [...src.matchAll(/^\*\*取代：\*\*[^\n]*?ADR-(\d{4})/gm)].map((m) => m[1]);
      const adrDir = resolve(root, 'docs/adr');
      const supersessions = []; // [取代者, 被取代者]
      for (const f of readdirSync(adrDir).filter((n) => /^ADR-\d{4}-.*\.md$/.test(n))) {
        const me = /^ADR-(\d{4})/.exec(f)[1];
        // ⚠️ 用本文件自带的 `read()`（它已做换行归一化）——**不要**在这里另写一处归一化调用：
        // 本文件第 ⑤ 节的换行归一化 canary 用 `selfSrc.replace(anchored, …)` 只替换**第一处**，
        // 且随后检查「文件里是否还残留该转义序列」⇒ 新增第二处（**或哪怕只在注释里写出该转义序列**）
        // 都会让它误报（实测踩到两次：一次是新增调用，一次是注释里写了该序列）。
        for (const other of supersessionsOf(read(`docs/adr/${f}`))) {
          if (other !== me) supersessions.push([me, other]);
        }
      }
      if (supersessions.length === 0) {
        fail('未解析到任何 ADR 取代关系（基线 ≥ 1：ADR-0031 取代 ADR-0024 Q2=B1）—— 解析漂移会让本判据空转');
      }
      for (const [superseder, superseded] of supersessions) {
        const affected = rows.filter((row) => carrierOf(row).replace(/`/g, '').includes(`ADR-${superseded}-`));
        if (affected.length === 0) {
          fail(`ADR-${superseder} 声明取代 ADR-${superseded}，但登记表里**没有以 ADR-${superseded} 为载体**的行 —— 取代关系无处可查`);
          continue;
        }
        for (const row of affected) {
          if (!row.includes(`ADR-${superseder}`)) {
            fail(`登记表某行的载体是 ADR-${superseded}，却**未提到取代它的 ADR-${superseder}** —— `
              + '「已裁决」≠「仍有效」：读者会以为被取代的结论仍然生效（ADR-0031 取代 ADR-0024 Q2=B1 即此形态）');
          }
        }
      }
      // canary：三向（正样本 / 无取代声明 / 载体列取到取代者）
      if (supersessionsOf('**取代：** ADR-0001 的 Q2 = B1（测试）\n').join(',') !== '0001') {
        errors.push('ADR 取代关系护栏 canary 失效：`**取代：**` 行未被解析');
      }
      if (supersessionsOf('**Status:** Accepted\n').length !== 0) {
        errors.push('ADR 取代关系护栏 canary 失效：没有取代声明时被判出取代关系');
      }
      if (!carrierOf('| 1 | a | b | 已裁决 | `docs/adr/ADR-0024-x.md`；**取代者** `docs/adr/ADR-0031-y.md` |').includes('ADR-0031')) {
        errors.push('ADR 取代关系护栏 canary 失效：载体列里的取代者未被取到');
      }
    }
  }
}

// ── master-plan §12 D 表必须自洽：被引用的 D 编号必须有声明行（2026-10-01，审计 §4.67）──
// 立此条的原因（实测）：`D-AB` 被 §5.1 `G7-MENU-07` 与 §15.2 引用（写着「登记 D-AB」），
// 而 §12 D 表里**根本没有这一行** —— 它的前 3 格在 2026-09-13 的一次编辑中丢失，
// 残余的「依据」格被并进了 **D-AC** 行（D-AC 因此有 5 格）。后果两条：
//   ① GFM 渲染**丢弃超出表宽的第 5 格** ⇒ **D-AB 整条在渲染视图中不可见**（只有读源码才看得到）；
//   ② §12 自称「唯一可发现处」，而条目**实际不在**其中 ⇒ 与 D-AC 行自己记的教训**同型**
//      （「护栏注释不是决策登记处 —— 裁决必须进本 D 表，否则后续轮次无法发现」）。
// **教训：「登记表声称自己是唯一可发现处」≠「条目真的在表里」。**
// 这与 ADR-0029 记的「护栏只做单向」**同源**：凡自称自洽的登记处，必须有一条机器可读的核对。
//
// 判据：① master-plan 里凡出现的 D 编号，必须在 master-plan 中有**声明行**（表格首格形如 `| **D-A`…）
//          —— 声明行扫**全文**而非只扫 §12：`D-N` / `D-O` / `D-P` 声明在 §5.4；
//      ② 声明行必须**恰好 4 格**（锁住「5 格 ⇒ 渲染时静默丢格」这一破损形态）；
//      ③ 覆盖下限（防表被削空 ⇒ 判据退化成空真）；
//      ④ 例外表**双向**（见 `D_TABLE_NOT_DECLARED`）。
//
// ⚠️ **范围限制（如实声明，不要读成「D 表已全部核对」）**：
// 只覆盖**可静态判定**的这一半 ——「编号被引用但表里没有」。
// 另一半（「审计里新出现一个『待裁决』标记但没登记」）**需要理解自然语言**，
// 不在本护栏内 —— 同 ADR-0029 对自己那条登记表护栏的声明。
{
  const PLAN = 'docs/plans/typora-parity-master-plan.md';
  // 引用源（2026-10-08，审计 §4.164 + §4.165）：**扩到全仓**。
  // 沿革：① 起初只有 master-plan / 审计文档 / `docs/adr/*.md`；
  //   ② §4.164 纳入 **parity 数据夹具**（矩阵 / 面板独有键 / 第三面 / 台账 都用 `D-` 编号指裁决，
  //      而此前**没有任何东西核对** —— 夹具里写一个不存在的编号，读者会顺着它去找一个不存在的裁决）；
  //   ③ §4.165 发现「按类枚举」这件事**永远会漏下一类**（源码注释、spec、发布说明、qualification 报告
  //      都在引用 `D-` 编号）⇒ 改为**遍历全仓**，只按「**生成物 / 不入库的目录**」排除。
  // ⚠️ 排除项必须写明理由（否则下一个人会以为漏了）：
  //   · `node_modules` / `.git` / `target` / `dist` / `build` / `.cache` —— 依赖与构建产物；
  //   · `.workbuddy-ai/`（本工具的 memory）与 `.workbuddy/`（**另一个** AI 工具的数据目录）—— 工具数据；
  //   · `.trae/` · `apps/desktop/public/editor/` · `tests/benchmark/{fixtures,reports,results}` ——
  //     **均在 `.gitignore` 里**（不入库；memory 纪律：证据不得指向 gitignore 目录）。
  // ⚠️ 2026-10-08（审计 §4.166）：**防空转下限必须锚在「干净检出」上，不是「本地工作区」** ——
  //   本地工作区 ⊃ 仓库（未跟踪 + 生成物）。首次立判据时把总数下限写成**本地**实测的 1113，
  //   而 CI 干净检出只有 **878** ⇒ **CI 两个 parity job 双双失败**（本地却绿）。
  // ⚠️ 2026-10-08（审计 §4.166·续）：**目录级排除会误伤「被强制跟踪的文件」** —— 实测
  //   `tests/benchmark/fixtures/` 整体是生成物（`.gitignore` 里 `*`），但其中的 **`README.md`
  //   是强制加入的跟踪文件** ⇒ 目录级排除把它漏掉（本地 877 ≠ 干净检出 878）。
  //   ⇒ **改用权威真值源 `git ls-files`**：它就是「哪些文件在仓库里」的定义，
  //   **天然排除 gitignore 的生成物、又天然包含强制跟踪的文件**，且**本地与 CI 看到同一集合**。
  //   ⇒ 不再需要任何目录级排除（依赖/产物/工具数据目录**本来就不被跟踪**）。
  const REF_EXT = /\.(md|mjs|cjs|js|ts|tsx|json|yml|yaml|rs|sh|mts|cts|jsx)$/;
  //   · **canary 合成编号**：见下方 `CANARY_SYNTHETIC_IDS` —— 它们**刻意不声明**，但**必须仍被引用**
  //     （防「canary 被删了却没人发现」）。⚠️ **不按文件排除** `verify-*.mjs`：那样会把护栏里
  //     **真实的** D 引用（如 `verify-sidebar-contract.mjs` 的 `D-C`/`D-J`）也一起豁免掉。
  // ⚠️ **本文件自己现在也是引用源** ⇒ 本文件里**任何位置**（含注释、举例）都不得写「不存在的编号」字面量
  //   （PITFALLS §4.237：初稿在注释里写了那个不存在的编号，判据当场命中自己）。
  let REF_SOURCES = [];
  if (trackedFiles === null) {
    fail('D 表引用源无法枚举：`git ls-files` 执行失败 —— 本判据要求在有 git 的检出里运行');
  } else {
    REF_SOURCES = trackedFiles.filter((f) => REF_EXT.test(f));
  }

  // 确实要「提到一个没有声明行的编号」时在此登记**理由**（本仓既有 idiom，同 OFFICIAL_SHORTCUT_EXCEPTIONS）。
  // 两类合法用途：① 记下「经复核**不**创建某编号」这个决定；② 泛指占位（非具体条目）。
  const D_TABLE_NOT_DECLARED = new Map([
    ['D-AN', 'ADR-0029 Q1=A3 经 2026-10-01 复核判定为 D-AF 的**重复登记** ⇒ 显式「不创建」该编号（见 master-plan §12 的 D-AF 行 / 审计 §4.67）'],
  ]);
  // ③ 护栏**自身**的 canary 负样本（合成编号，刻意不存在）。
  // ⚠️ 这是**第三类**：既不是「决定不创建」，也不是「泛指占位」，而是「判据的测试数据」。
  // 它们**必须仍被引用**（否则是过期条目）；也**不得**被声明（否则 canary 失去意义）。
  // ⚠️ 2026-10-08（审计 §4.165）：初版把**第四个**编号也列了进来 —— 但它其实**只是 §4.164 注释里的举例**
  //   （HEAD 版本实测：全仓仅 1 处，且那处是散文），**没有任何真实使用** ⇒ 是**过期条目**，已删除。
  //   （本注释**刻意不写出那个编号的字面量** —— 本文件是引用源，写了就会被判据命中，见 PITFALLS §4.237。）
  const CANARY_SYNTHETIC_IDS = new Map([
    ['D-ZZ', '`verify-release-gate.mjs` 的 D 引用判据负样本（合成编号）'],
    ['D-QQ', '同上（`verify-release-gate.mjs`）'],
    ['D-RR', '同上（`verify-release-gate.mjs`）'],
  ]);

  const planSrc = read(PLAN);
  const DECL_ROW = /^\|\s*\*\*(D-[A-Z]{1,2})\b/;
  const ID = /\bD-[A-Z]{1,2}\b/g;

  // ① 声明行（扫全文：D-N / D-O / D-P 在 §5.4）+ ② 每行恰好 4 格
  const declared = new Set();
  let declRows = 0;
  for (const line of planSrc.split('\n')) {
    const m = DECL_ROW.exec(line);
    if (m === null) continue;
    declRows += 1;
    declared.add(m[1]);
    const cells = line.split(/(?<!\\)\|/).slice(1, -1);
    if (cells.length !== 4) {
      fail(`master-plan D 表声明行「${m[1]}」有 ${cells.length} 格（应为 4）：${line.slice(0, 60)}…`
        + ' —— 超出的格在 GFM 渲染时被**静默丢弃**（D-AB 就是这样整条从渲染视图里消失的）');
    }
  }
  if (declRows < 40) {
    fail(`master-plan 只解析出 ${declRows} 个 D 表声明行（下限 40 = 立此判据时的基线 + 2026-10-06 的 D-AJ + 2026-10-07 的 D-AK/D-AO）—— `
      + '表被削空会让「凡被引用的编号都有声明行」退化成**空真**；'
      + '若确实删过条目，请同步下调下限并说明（解析器漏成员必须响亮失败）');
  }

  // ① 引用集（来自所有 REF_SOURCES）
  // ⚠️ 抽成**纯函数**：canary 必须能对**同一谓词**做正/负样本（本仓 idiom）。
  // ⚠️ 2026-10-08（审计 §4.165）：**两个例外表的声明块本身不算「使用」** —— 否则「过期检测」是
  //   **循环判据**：编号写在表里 ⇒ 表所在文件是引用源 ⇒ 它**永远「被引用」**（注入验证第 ④ 项当场抓到）。
  const SELF_SOURCE = 'tests/parity/verify-release-gate.mjs';
  const DECL_BLOCKS = [
    /const D_TABLE_NOT_DECLARED = new Map\(\[[\s\S]*?\]\);/,
    /const CANARY_SYNTHETIC_IDS = new Map\(\[[\s\S]*?\]\);/,
  ];
  const stripDeclBlocks = (text) => DECL_BLOCKS.reduce((acc, re) => acc.replace(re, ''), text);
  const collectRefs = (sources, { stripSelfDeclBlocks = false } = {}) => {
    const set = new Set();
    for (const rel of sources) {
      if (!existsSync(resolve(root, rel))) { fail(`D 表护栏的引用源不存在：${rel}`); continue; }
      const raw = read(rel);
      const text = stripSelfDeclBlocks && rel === SELF_SOURCE ? stripDeclBlocks(raw) : raw;
      for (const m of text.matchAll(ID)) set.add(m[0]);
    }
    return set;
  };
  const isDangling = (id) => !declared.has(id)
    && !D_TABLE_NOT_DECLARED.has(id) && !CANARY_SYNTHETIC_IDS.has(id);
  const referenced = collectRefs(REF_SOURCES);
  const usedOutsideDecl = collectRefs(REF_SOURCES, { stripSelfDeclBlocks: true });
  for (const id of [...referenced].sort()) {
    if (!isDangling(id)) continue;
    fail(`D 编号 ${id} 被引用，但 master-plan 里没有它的**声明行**（表格首格形如 \`| **${id}\`）—— `
      + '§12 D 表自称「唯一可发现处」，条目不在表里 = 后续轮次无法发现该裁决；'
      + '若该引用是「**不**创建此编号」或泛指占位，请登记进 D_TABLE_NOT_DECLARED 并写明理由');
  }

  // 防空转（2026-10-08，审计 §4.164/§4.165/§4.166）：扫描面**按类**断言 —— 全仓遍历若退化成「只读了几份文档」
  // 就会让「凡引用必须有声明行」变成空真。⚠️ 下限**等于「干净检出」的实测基线**（本仓纪律：贴着基线取）。
  // ⚠️ **不是本地工作区的计数** —— 本地工作区 ⊃ 仓库（未跟踪 + 生成物），照本地写会**在 CI 红**（§4.166 实测）。
  if (REF_SOURCES.length < 878) {
    fail(`D 表引用源只枚举出 ${REF_SOURCES.length} 个文件（下限 878 = 2026-10-08 **干净检出**基线）`
      + ' —— 遍历退化会让「凡引用必须有声明行」退化成空真');
  }
  for (const [cls, prefix, min] of [
    ['parity 数据', 'tests/parity/', 31],
    ['docs/', 'docs/', 84],
    ['packages/', 'packages/', 532],
    ['apps/', 'apps/', 64],
  ]) {
    const n = REF_SOURCES.filter((s) => s.startsWith(prefix)).length;
    if (n < min) {
      fail(`D 表引用源里 \`${cls}\` 只有 ${n} 个文件（下限 ${min} = 2026-10-08 基线）`
        + ' —— 这一类被漏掉 = 静默豁免一整类');
    }
  }
  // canary ①（正样本）：夹具确实进了引用集 —— `D-AL` 只在面板独有键夹具里出现
  if (!collectRefs(['tests/parity/fixtures/typora-panel-only-keys.json']).has('D-AL')) {
    fail('D 表 canary 失效：parity 夹具没有被读进引用集（新纳入的引用源是空的）');
  }
  // canary ①b（正样本）：**源码注释**这一类也真的进了引用集 —— `D-V` 只在 `selectionToolbar.ts` 出现
  if (!collectRefs(['packages/editor-engine/src/selectionToolbar.ts']).has('D-V')) {
    fail('D 表 canary 失效：源码这一类没有被读进引用集（「全仓」是写在注释里的）');
  }
  // canary ②（负样本）：未声明的编号必须落进「悬空」这一支。
  // ⚠️ 探针编号**必须运行时拼出来** —— 本文件现在**自己也在引用源里**，写字面量就会被上面的判据命中
  //   （PITFALLS §4.237 的教训：在引用源里写不存在的编号字面量 ⇒ 判据命中自己）。
  const DANGLING_PROBE = `D-${String.fromCharCode(81)}${String.fromCharCode(90)}`;
  if (!isDangling(DANGLING_PROBE)) {
    fail('D 表 canary 失效：未声明编号未被判为悬空（判据已退化成空真）');
  }
  // canary ③（反向）：已声明的编号不得被误判
  if (isDangling([...declared][0])) {
    fail(`D 表 canary 过宽：已声明编号 ${[...declared][0]} 被误判为悬空`);
  }

  // ④ 例外表双向：必须仍被引用（否则是过期例外）；不得同时又有了声明行（自相矛盾）
  // ⚠️ 用 `usedOutsideDecl`（**已剥离声明块**）—— 见上面的循环判据说明。
  for (const [id, why] of D_TABLE_NOT_DECLARED) {
    if (!usedOutsideDecl.has(id)) {
      fail(`D 表例外 ${id} 已过期：**声明块之外**已不再引用它（原登记理由：${why}）—— 请从表中删除`);
    }
    if (declared.has(id)) {
      fail(`D 表例外 ${id} 自相矛盾：它既被登记为「无声明行」，又确实有了声明行 —— 请删除该例外`);
    }
  }
  // ⑤ canary 合成编号表双向（2026-10-08，审计 §4.165）：必须仍被引用；不得被声明
  for (const [id, why] of CANARY_SYNTHETIC_IDS) {
    if (!usedOutsideDecl.has(id)) {
      fail(`canary 合成编号 ${id} 已过期：**声明块之外**已不再引用它（原登记理由：${why}）—— 请从表中删除`);
    }
    if (declared.has(id)) {
      fail(`canary 合成编号 ${id} 自相矛盾：它既被登记为「合成负样本」，又确实有了声明行 —— canary 已失去意义`);
    }
  }
  // canary ④（机制自检）：声明块剥离**必须真的生效** —— 否则上面两条「过期检测」退化成**循环判据**
  //   （编号写在表里 ⇒ 表所在文件是引用源 ⇒ 永远「被引用」）。
  //   ⚠️ 这里**必须用行首锚定的正则**，不能用 `.includes('…= new Map')` —— 那个字符串**也出现在
  //     `DECL_BLOCKS` 自己的定义里**（剥离器的定义含有它要匹配的文本）⇒ `.includes()` 恒真、
  //     canary **永远失败**（本轮实测：第 4 次「判据命中自己」）。
  const selfRaw = read(SELF_SOURCE);
  const strippedSelf = stripDeclBlocks(selfRaw);
  if (strippedSelf === selfRaw) {
    fail('D 表 canary 失效：声明块剥离没有生效（过期检测已退化成循环判据）');
  }
  if (/^\s*const CANARY_SYNTHETIC_IDS = new Map\(\[/m.test(strippedSelf)
    || /^\s*const D_TABLE_NOT_DECLARED = new Map\(\[/m.test(strippedSelf)) {
    fail('D 表 canary 失效：例外表声明块未被剥离干净（过期检测已退化成循环判据）');
  }
  // canary ⑤（机制自检·反向）：剥离后，表里的编号**仍应能在别处找到真实使用**
  if (![...CANARY_SYNTHETIC_IDS.keys()].every((id) => usedOutsideDecl.has(id))) {
    fail('D 表 canary 失效：剥离声明块后，canary 合成编号在别处找不到使用（剥离过度）');
  }

  // ── 偏好矩阵的载体引用必须**解析得到**（2026-10-07，审计 §4.121）──────────────
  // 分工：**形状**（字段齐不齐、kind 与 ref 形态是否匹配）在 `verify-settings-contract.mjs` ⑭ 节；
  // **解析**放这里 —— 因为本文件已经持有三份数据：**D 表声明行**（`declared`，上面刚算好）、
  // **台账**（模块级的 `ledger`）与 **ADR 目录**。放到那边会**把同一个 D 表解析器写第二份**。
  //
  // 立此条的原因（实测）：矩阵里有 **5 条 `deviation.kind === 'undecided'`**
  // （`enableHighlight` / `enableSubscript` / `enableSuperscript` / `enableDiagram` / `zoomByMouse`）
  // 与 **4 条行为轴的 `behavior: differs`**（`autoEscapeImageURL` / `useRelativePathForImg` /
  // `mathFormatOnCopy` / `wordCountDelimiter`；原为 5 条，`noLegacyMath` 已于 2026-10-07 取证后
  // **改判为 `matches-default`**，见审计 §4.123）—— 它们此前**只写在 master-plan 的轮次叙述里**，
  // 审计的「待裁决项登记表（**唯一声明处**）」**一行都没有** ⇒ 本门禁据此报 `Pending decisions: 无`：
  // **项目在机器可读层面声称「没有任何待裁决项」**，而实际有 10 项。
  {
    const MX_PATH = 'tests/parity/fixtures/typora-preferences-matrix.json';
    let mx = null;
    try { mx = JSON.parse(read(MX_PATH)); } catch { fail(`偏好矩阵缺失或不是合法 JSON：${MX_PATH}`); }
    if (mx !== null) {
      const mxEntries = mx.entries ?? [];
      if (mxEntries.length < 80) {
        fail(`偏好矩阵只解析出 ${mxEntries.length} 条（下限 80）—— 解析面漂移会让本判据空转`);
      }
      const ledgerIds = new Set((ledger.items ?? ledger).map((it) => it.id));
      const adrDir = resolve(root, 'docs/adr');
      const adrFileOf = (id) => (existsSync(adrDir)
        ? readdirSync(adrDir).find((f) => f.startsWith(`${id}-`) && f.endsWith('.md'))
        : undefined);
      const isProposed = (id) => {
        const f = adrFileOf(id);
        // ⚠️ 必须锚定**行首**：无锚点会被 ADR 正文里引用的 `**Status:**` 满足
        // （2026-10-07 实测：本判据首版就是这样，注入「ADR 改 Accepted」后**仍然通过**）。
        return f !== undefined && /^\*\*Status:\*\*[^\n]*Proposed/m.test(read(`docs/adr/${f}`));
      };
      // 谓词（判据与 canary 共用同一份）
      const resolvesRef = (kind, ref) => {
        if (kind === 'deliberate') return declared.has(ref);
        if (kind === 'gap') return ledgerIds.has(ref);
        if (kind === 'undecided') return isProposed(ref);
        return false;
      };
      const unresolved = [];
      let checkedRefs = 0;
      for (const e of mxEntries) {
        const dev = e.deviation;
        if (dev?.kind === 'undecided' && typeof dev.pendingRef === 'string' && dev.pendingRef.trim() !== '') {
          checkedRefs += 1;
          if (!isProposed(dev.pendingRef.trim())) {
            unresolved.push(`${e.typora}(deviation.pendingRef ${dev.pendingRef} 解析不到：ADR 不存在或已不是 Proposed)`);
          }
        }
        const d = e.disposition;
        if (d !== undefined && typeof d?.ref === 'string' && d.ref.trim() !== '' && typeof d?.kind === 'string') {
          checkedRefs += 1;
          if (!resolvesRef(d.kind, d.ref.trim())) {
            const what = d.kind === 'deliberate' ? 'D 表里没有该声明行'
              : d.kind === 'gap' ? '台账里没有该 id'
                : 'ADR 不存在或已不是 Proposed';
            unresolved.push(`${e.typora}(disposition ${d.kind} → ${d.ref}：${what})`);
          }
        }
      }
      if (unresolved.length > 0) {
        fail(`偏好矩阵的载体引用解析失败（${unresolved.length}）：${unresolved.join(', ')} —— `
          + '载体必须是**真的解析得到**的（`deliberate`⇒D 表声明行 / `gap`⇒台账 id / `undecided`⇒仍为 Proposed 的 ADR）；'
          + '解析不到 = 这条「已登记」是空的');
      }
      // 防空转：真实数据必须真的**解析过**引用（否则本判据是空壳）
      if (checkedRefs < 8) {
        fail(`偏好矩阵只解析出 ${checkedRefs} 个载体引用（下限 8）—— 判据会空转（字段被改名/删除时不会报）`);
      }
      // canary：三向（每种 kind 的「解析得到 / 解析不到」都要能区分）
      if (!resolvesRef('deliberate', 'D-AK') || resolvesRef('deliberate', 'D-ZZ')) {
        errors.push('偏好矩阵载体解析 canary 失效：deliberate 的 D 声明行判定不能区分正/负样本');
      }
      if (!resolvesRef('gap', 'P0-EDITOR-005') || resolvesRef('gap', 'P0-NO-SUCH-ITEM')) {
        errors.push('偏好矩阵载体解析 canary 失效：gap 的台账 id 判定不能区分正/负样本');
      }
      if (!resolvesRef('undecided', 'ADR-0034') || resolvesRef('undecided', 'ADR-9999')) {
        errors.push('偏好矩阵载体解析 canary 失效：undecided 的 ADR 判定不能区分正/负样本');
      }
      if (resolvesRef('', 'D-AK')) {
        errors.push('偏好矩阵载体解析 canary 失效：非法 kind 被判成可解析');
      }
      // 本判据**不得**与上面那条「凡被引用的 D 编号必须有声明行」互相冒充：
      // 后者的引用源是**文档**（plan/audit/ADR），本条的引用源是**矩阵**。用真实数据各验一次。
      if (!declared.has('D-AK') || !declared.has('D-AO') || !isProposed('ADR-0034')) {
        errors.push('偏好矩阵载体解析 canary 失效：真实数据里 D-AK/D-AO 应有声明行、ADR-0034 应为 Proposed'
          + '（若 ADR-0034 已裁决，请把矩阵里的 undecided 一并改掉）');
      }
    }
  }

  // canary：四个方向（拼接构造样本，避免护栏检出自己）
  {
    const declOf = (s) => [...s.matchAll(/^\|\s*\*\*(D-[A-Z]{1,2})\b/gm)].map((m) => m[1]);
    const refsOf = (s) => [...s.matchAll(/\bD-[A-Z]{1,2}\b/g)].map((m) => m[0]);
    if (!declOf('| **D-ZZ**（2026-01-01） | a | b | c |').includes('D-ZZ')) {
      errors.push('D 表自洽护栏 canary 失效：声明行未被解析');
    }
    if (declOf('| **D-A**（x） | a | b | c |').includes('D-AA')) {
      errors.push('D 表自洽护栏 canary 过宽：`D-A` 被误认成 `D-AA`');
    }
    const refs = refsOf('见 **D-QQ** 行与 `D-RR`');
    if (!refs.includes('D-QQ') || !refs.includes('D-RR')) {
      errors.push('D 表自洽护栏 canary 失效：引用未被解析（加粗 / 反引号两种写法）');
    }
    if (declOf('| **D-A** | a | b | c |').includes('D-QQ')) {
      errors.push('D 表自洽护栏 canary 失效：声明集与引用集未区分');
    }
    if ('| **D-ZZ** | a | b | c | d |'.split(/(?<!\\)\|/).slice(1, -1).length !== 5) {
      errors.push('D 表自洽护栏 canary 失效：5 格行未被数出 5 格');
    }
    // ⚠️ 2026-10-11（审计 §4.321）：**区分性** canary —— 转义 `\|` **不是**分隔符。
    //    用裸 `split('|')` 会数出 5 格（假阳性）⇒ 这一条会红。
    if ('| **D-ZZ** | a \\| b | c | d |'.split(/(?<!\\)\|/).slice(1, -1).length !== 4) {
      errors.push('D 表自洽护栏 canary 失效：**转义 `\\|`** 被当成了分隔符（会把合法行判红）');
    }
    // 判据本身必须能区分「有声明 / 无声明」—— 用真实数据验一次
    if (!declared.has('D-AB') || declared.has('D-AN')) {
      errors.push('D 表自洽护栏 canary 失效：真实数据里 `D-AB` 应有声明行、`D-AN` 不应有'
        + '（若 D-AN 已被正式创建，请把它从 D_TABLE_NOT_DECLARED 移除）');
    }
  }
}

// ── 状态词与阻塞原因必须**语义一致**（2026-10-01，审计 §4.64）────────────────
// 立此条的原因（实测）：`P0-PLATFORM-001` 状态写着 `IMPL`，而其阻塞原因写的是
// 「PASS-E 全局策略额外要求 ux-gate，需人工计时会话后才能**宣称结论**」——
// 那说的是**能否宣称 PASS-E**，不是「本项证据是否齐备」。而该条记录自己早已写明
// 「本项 requiredEvidence 至此**已全部取得**」。
//
// **`IMPL` 的词义是「未实现/未完成」**，而 `ux-gate-policy` 是**人工门禁策略**（不是实现缺口）。
// 把「不能宣称 PASS-E」写成 `IMPL` = **状态词误用**：它会让读者以为还有实现工作，
// 同时**掩盖**该条其实已达 `AUTO`（=「自动化通过、真机体验验收未完成」，ADR-0024 的规则下即闭环）。
//
// 判据：**`status === 'IMPL'` 的项，其 `blockedBy` 不得**是 `ux-gate-policy`
// —— 若确实只是「差人工门禁」，状态应为 `AUTO`（或 `BLOCKED`，若强调「被阻塞」）。
// 反过来说：`IMPL` 必须配一个**实现类**的阻塞原因。
{
  const uxPolicy = 'ux-' + 'gate-policy';   // 拼接构造，避免本文件自身的注释/字符串被自己的判据命中
  const bad = (ledger.items ?? []).filter((it) => it.status === 'IMPL' && it.blockedBy === uxPolicy);
  if (bad.length > 0) {
    fail(`以下项状态为 IMPL 但阻塞原因只有 '${uxPolicy}'：${bad.map((i) => i.id).join(', ')}`
      + ' —— `IMPL` 表示「未实现」，而 ux-gate 策略是**人工门禁**、不是实现缺口；'
      + '若本项证据已齐备，状态应为 `AUTO`（ADR-0024 下即闭环），或 `BLOCKED`（强调被阻塞）');
  }
  // canary：两个方向
  const synthBad = [{ id: 'X', status: 'IMPL', blockedBy: uxPolicy }].filter((it) => it.status === 'IMPL' && it.blockedBy === uxPolicy);
  if (synthBad.length !== 1) errors.push('状态词一致性护栏 canary 失效：IMPL + ux-gate-policy 未被检出');
  const synthOk = [{ id: 'X', status: 'AUTO', blockedBy: uxPolicy }].filter((it) => it.status === 'IMPL' && it.blockedBy === uxPolicy);
  if (synthOk.length !== 0) errors.push('状态词一致性护栏 canary 过宽：AUTO + ux-gate-policy 被误判');
  const synthImpl = [{ id: 'X', status: 'IMPL', blockedBy: 'engine-i18n-plumbing-pending' }].filter((it) => it.status === 'IMPL' && it.blockedBy === uxPolicy);
  if (synthImpl.length !== 0) errors.push('状态词一致性护栏 canary 过宽：IMPL + 实现类原因被误判');
}

// ── ③ CI 门禁完整性 ─────────────────────────────────────────────────────
const ci = read('.github/workflows/ci.yml');
for (const anchor of [
  'run: pnpm -r --filter \'!mellow-desktop\' run test', // packages 单测
  'working-directory: packages/editor-engine',           // engine 单测
  'run: pnpm run build',                                 // 桌面构建
  'node scripts/verify-release-bundle.mjs',              // 渲染层指纹（G7-TYPO-04）
  'run: npm run parity',                                 // parity 护栏链
  'run: cargo test --locked',                            // Rust System Core（--locked：lockfile 必须与 manifest 一致）
]) {
  if (!ci.includes(anchor)) fail(`ci.yml 缺少门禁锚点：${anchor}`);
}
// ADR-0022：Windows 以 GitHub Actions 为正式 Runtime 证据来源。若 ci.yml 完全没有
// Windows runner，台账里 47 项要求的 windows-ci 证据就无从产生 ——
// 本轮实测发现该缺口（6 个 job 全跑 ubuntu-latest），故立此不变量防再次退化。
if (!/runs-on:\s*windows-latest/.test(ci)) {
  fail('ci.yml 没有任何 windows-latest job：ADR-0022 要求 Windows 证据以 CI 为来源，否则 windows-ci 类证据不可达');
}
// ── CI 步骤名不得内嵌**无法派生**的数字（2026-09-30）──────────────────────
// 立此条的原因：步骤名里曾写死「Unit tests (host-api 43 / app-core 217 / …)」这类数字，
// 而**没有任何东西校验它们** → 随测试增长**静默失真**（实测各包全部漂移，
// 且「当天就会变」—— 给 export 补一个测试，该包计数即从 83 变成 84）。
// 这与「菜单护栏谎称读了本机 Typora」同类：**输出里的数字若无法派生，就不要写**。
// 真实数字由 jest / cargo / 脚本自己打印（本身即派生），无需在步骤名里复述。
//
// ⚠️ 2026-09-30 扩展：原实现**只读 ci.yml** → 同一缺陷族在另外两个 workflow 里存活。
// 实测抓到 `runtime-qualification.yml` 的「Visual golden (§9.3, 14 scenes)」：
// 该「14」**无法从任何东西派生** —— 三个基线文件共 7 + 4 + 6 = 17 个键，
// 而 master plan §9.3 的场景清单列了 13 项。数字对不上任何来源，属"写了个没人校验的数"。
//
// 豁免：**引用类**数字不是「计数」，不应误报（如 `ADR-0020`、`§9.3`、`#123`、`v1.5.6`、
// 缺陷号 `G7-EDIT-11` / `P0-EDITOR-005`）。做法是先剥掉引用记号，再看是否还剩 2+ 位数字。
{
  const WORKFLOWS = ['ci.yml', 'runtime-qualification.yml', 'release.yml'];
  const stripRefs = (s) => s
    .replace(/\bADR-\d+/g, '')       // ADR-0020
    .replace(/§\s*\d+(?:\.\d+)*/g, '') // §9.3
    .replace(/\bv\d+(?:\.\d+)*/g, '')  // v1.5.6
    .replace(/\b[A-Z]\d+-[A-Z]+-\d+/g, '') // G7-EDIT-11
    .replace(/\bP\d-[A-Z]+-\d+/g, '')  // P0-EDITOR-005
    .replace(/#\d+/g, '');           // #123
  const offenders = [];
  for (const name of WORKFLOWS) {
    let src = '';
    try { src = read(`.github/workflows/${name}`); } catch { continue; }
    for (const m of src.matchAll(/^\s+- name: "?(.*?)"?$/gm)) {
      const stepName = m[1];
      if (/\d{2,}/.test(stripRefs(stepName))) offenders.push(`${name}：${stepName}`);
    }
  }
  if (offenders.length > 0) {
    fail(`workflow 步骤名不得内嵌无法派生的数字（无任何东西校验，会静默失真）：${offenders.join(' / ')}`);
  }
  // canary：自检该判定 + 引用豁免（样本拼接构造）
  const COUNT_SAMPLE = 'Unit tests (host-api ' + '43' + ')';
  const REF_SAMPLE = 'Fill release notes and mark prerelease (ADR-' + '0020' + ')';
  const SECTION_SAMPLE = 'Visual golden (§' + '9.3' + ')';
  if (!/\d{2,}/.test(stripRefs(COUNT_SAMPLE))) {
    errors.push('步骤名数字护栏 canary 失效：含计数的样本未被检出');
  }
  if (/\d{2,}/.test(stripRefs(REF_SAMPLE)) || /\d{2,}/.test(stripRefs(SECTION_SAMPLE))) {
    errors.push('步骤名数字护栏 canary 失效：ADR / 章节引用被误报（豁免规则失效）');
  }
}

// 指纹校验必须排在桌面构建之后（顺序断言，防止「先校验后构建」的假门禁）
const buildIdx = ci.indexOf('run: pnpm run build');
const fpIdx = ci.indexOf('node scripts/verify-release-bundle.mjs');
if (buildIdx === -1 || fpIdx === -1 || fpIdx < buildIdx) {
  fail('ci.yml 的 verify-release-bundle 必须排在桌面 build 之后');
}

// ── ④ 发布门禁：打包前必须校验渲染层指纹 ────────────────────────────────
const release = read('.github/workflows/release.yml');
if (!existsSync(resolve(root, '.github/workflows/release.yml'))) {
  fail('缺少 .github/workflows/release.yml');
} else {
  const jobs = release.split(/\n {2}[a-z][a-zA-Z-]*:\n/).slice(1);
  const packagingJobs = jobs.filter((job) => /tauri-apps\/tauri-action|Build .*(MSI|NSIS|DMG|AppImage|deb|rpm)/i.test(job));
  if (packagingJobs.length === 0) {
    fail('release.yml 未识别到任何打包 job（无法断言「打包前校验」）');
  }
  for (const job of packagingJobs) {
    const vIdx = job.indexOf('verify-release-bundle');
    const pIdx = job.search(/tauri-apps\/tauri-action|npx tauri|pnpm tauri/);
    if (vIdx === -1) {
      fail('release.yml 有打包 job 未在打包前跑 verify-release-bundle.mjs（指纹错配会静默加载旧引擎）');
    } else if (pIdx !== -1 && vIdx > pIdx) {
      fail('release.yml 的 verify-release-bundle 必须排在打包之前');
    }
  }

  // ── ④b 发布收口必须**机器化**：先断言制品、再自动解除 Draft（2026-10-01，审计 §4.68）──
  // 立此条的原因（实测）：finalize 原先只 `-F prerelease=true`、**不设 `draft=false`**，
  // 靠人记着执行 `gh release edit vX --draft=false`（workflow 头部注释当时就是这么写的）。
  // 代价已实测：**12 个 tag 里有 6 个从未解除 Draft**（v1.5.6/7/8/11/12/13），
  // 其中一个（v1.5.12）还只有 **12/15 个制品**（三平台有一个没传全）。
  // ⇒ **人工门禁没有机器记录时，两个方向都会漏**：漏发布、漏一个不完整构建。
  // 修法 = 把「人眼扫资产表」变成断言（关键制品存在性 + 数量下限），断言通过才解除 Draft。
  // **注意本条的判据方向**：它锁的是「**发布步骤里必须存在这些机器判据**」，
  // 而不是「release.yml 长什么样」—— 顺序也要锁（先断言、后发布），否则断言拦不住发布。
  const FINALIZE = '  finalize:';
  const PUBLISH = '-F draft=false';
  // ADR-0031（2026-10-05 用户裁决）**取代** ADR-0024 Q2=B1：发布状态由 pre-release 转为**正式发布**。
  // 故本判据锁的是 `prerelease=false` + `make_latest=true`；改回 pre-release 必须走新 ADR，不得静默回退。
  const RELEASE_STATE = '-F prerelease=false';
  const MAKE_LATEST = '-f make_latest=true';
  const ASSET_ASSERT = '缺少关键制品';
  const UNPUBLISH = '-F draft=true';
  // ⚠️ **判据必须先剥注释**：finalize 的注释里写着「**不要**在这里写 `-F draft=true`」——
  // 不剥注释的话，`/-F draft=true/` 会命中**那句说明**（本仓已踩过同型坑：护栏检出自己写的注释）。
  const stripComments = (s) => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  // ⚠️ 判据要按**实际写法**取（首版写成 /"-lt 15"/ 就匹配不到 `"$COUNT" -lt 15` ——
  // 「判据的形态假设」错一次就是一条恒真的护栏）。
  const COUNT_FLOOR = /-lt\s+15/;
  // 「先发布、后断言」= 顺序违规。**判定与 canary 共用这一个函数**（否则 canary 只是复述代码）。
  const publishBeforeAssert = (s) => {
    const p = s.indexOf(PUBLISH);
    const a = s.indexOf(ASSET_ASSERT);
    return p !== -1 && a !== -1 && p < a;
  };
  const finAt = release.indexOf(FINALIZE);
  if (finAt < 0) {
    fail('release.yml 缺少 finalize job —— 发布收口（解除 Draft）无人负责');
  } else {
    const finalizeJob = stripComments(release.slice(finAt));
    if (!finalizeJob.includes(PUBLISH)) {
      fail('release.yml 的 finalize 未解除 Draft（缺 `' + PUBLISH + '`）—— '
        + '「靠人工执行 gh release edit --draft=false」已被实测证伪：12 个 tag 里 6 个从未发布（审计 §4.68）');
    }
    if (!finalizeJob.includes(RELEASE_STATE)) {
      fail('release.yml 的 finalize 未按 **ADR-0031** 正式发布（缺 `' + RELEASE_STATE + '`）—— '
        + '发布状态是已裁决项，回退到 pre-release 必须走新 ADR，不得静默改回');
    }
    if (!finalizeJob.includes(MAKE_LATEST)) {
      fail('release.yml 的 finalize 未显式 `' + MAKE_LATEST + '`（ADR-0031：`releases/latest` 须指向本次正式发布）');
    }
    if (!finalizeJob.includes(ASSET_ASSERT)) {
      fail('release.yml 的 finalize 未断言**关键制品**（`.dmg`/`.msi`/`x64-setup.exe`/`.AppImage`/`.deb`/`.rpm`/`latest.json`）'
        + ' —— 解除 Draft 前必须机器确认三平台制品齐全（实测 v1.5.12 只有 12 个制品却照样跑完了 finalize）');
    }
    if (!COUNT_FLOOR.test(finalizeJob)) {
      fail('release.yml 的 finalize 未设**制品数量下限** —— 只做存在性断言会漏掉「数量不足」这类不完整构建');
    }
    // 两种失败（缺关键制品 / 数量不足）都必须**响亮报错**（`::error::`），不能只是 echo 一句就过。
    const loudFails = (finalizeJob.match(/::error::/g) ?? []).length;
    if (loudFails < 2) {
      fail(`release.yml 的 finalize 只有 ${loudFails} 处 ::error::（下限 2：缺关键制品 / 数量不足）`
        + ' —— 断言必须让 job 红，而不是打一行日志继续发布');
    }
    if (publishBeforeAssert(finalizeJob)) {
      fail('release.yml 的 finalize 必须**先断言制品、后解除 Draft**（顺序反了 = 断言拦不住发布）');
    }
    // ── ⑪ 发版手册的「关键制品数 / 总数下限」必须与 release.yml **现读**一致（2026-10-09，审计 §4.176）──
    // 【为什么】`docs/plans/packaging-release.md` 是**人手跟着做的发版手册**，它写着
    //   「断言 **7 个关键制品**齐全 + 总数 **≥ 15**」—— 这两个数是**无日期的快照**，
    //   而 `release.yml` 才是真值源。此前**只有「版本字面量」被绑**（§4.88），**这两个计数没有**
    //   （同族：§4.174「只锁了一半」· §4.171「扫描面只覆盖一份文档」）。
    // 【判据】两份的「关键制品数」与「总数下限」必须相等（**各自从文件现读**）。
    // ⚠️ 本块**必须在抛错点之前**（§4.175 的教训：落在之后 ⇒ 永不判定）。
    {
      const docSrc = read('docs/plans/packaging-release.md');
      // 判定与 canary **共用同一份解析**（本仓 idiom）
      const wfPatterns = (src) => [...src.matchAll(/for pat in ([^\n]*)/g)]
        .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
      const wfFloorOf = (src) => {
        const m = /-lt\s+(\d+)/.exec(src);
        return m === null ? null : Number(m[1]);
      };
      const docPatternsOf = (src) => {
        const m = /(\d+)\s*个关键制品/.exec(src);
        return m === null ? null : Number(m[1]);
      };
      const docFloorOf = (src) => {
        const m = /总数\s*≥\s*(\d+)/.exec(src);
        return m === null ? null : Number(m[1]);
      };
      const pats = wfPatterns(finalizeJob);
      const wfFloorN = wfFloorOf(finalizeJob);
      const docPatsN = docPatternsOf(docSrc);
      const docFloorN = docFloorOf(docSrc);
      if (pats.length === 0 || wfFloorN === null) {
        fail('⑪ 无法从 release.yml 现读「关键制品数 / 总数下限」—— 锚点漂移会让本判据空转');
      } else if (docPatsN === null || docFloorN === null) {
        fail('⑪ 无法从 packaging-release.md 现读「N 个关键制品 / 总数 ≥ M」—— 锚点漂移会让本判据空转');
      } else {
        if (docPatsN !== pats.length) {
          fail(`packaging-release.md 写「**${docPatsN}** 个关键制品」，而 release.yml 现有 **${pats.length}** 个 pattern`
            + `（${pats.join(' / ')}）—— 发版手册里的计数会被按「当前」读；两处必须同步`);
        }
        if (docFloorN !== wfFloorN) {
          fail(`packaging-release.md 写「总数 ≥ **${docFloorN}**」，而 release.yml 的下限是 **${wfFloorN}** —— 同上：两处必须同步`);
        }
      }
      // canary ①（正样本）：合成样本必须解析出同一批数字
      const SAMPLE_WF = "for pat in '\\.dmg$' '\\.msi$'; do\n  if [ \"$COUNT\" -lt 15 ]; then";
      if (wfPatterns(SAMPLE_WF).length !== 2 || wfFloorOf(SAMPLE_WF) !== 15) {
        fail('⑪ canary 失效：合成 workflow 样本解析不出「2 个 pattern / 下限 15」');
      }
      if (docPatternsOf('断言 2 个关键制品齐全 + 总数 ≥ 15') !== 2
        || docFloorOf('断言 2 个关键制品齐全 + 总数 ≥ 15') !== 15) {
        fail('⑪ canary 失效：合成文档样本解析不出「2 / 15」');
      }
      // canary ②（负样本）：不一致必须能检出（谓词与判定共用 ⇒ 直接比对）
      if (docPatternsOf('断言 3 个关键制品齐全') === wfPatterns(SAMPLE_WF).length) {
        fail('⑪ canary 失效：不一致的关键制品数未被识别（判据已退化成空真）');
      }
    }
    // 反向陷阱：**不得**显式 `-F draft=true` —— 那会让「重跑 finalize」把
    // **已发布**的 release 降级回 Draft（一次失败的重跑就能把线上发布撤下来）。
    // 正确做法是「不动 draft 字段」：新 tag 时它本来就是 draft（失败安全），已发布时也不会被降级。
    if (finalizeJob.includes(UNPUBLISH)) {
      fail('release.yml 的 finalize 不得设置 `' + UNPUBLISH + '`'
        + '（断言失败时会把已发布的 release 降级回 Draft）—— 正确做法是**不动 draft 字段**');
    }
    if (!/test\s+"\$\(gh release view[^)]*isDraft/.test(finalizeJob)) {
      fail('release.yml 的 finalize 未在收尾断言「已不是 Draft」—— 该步跑完必须已是已发布状态');
    }

    // ── 发布状态是「多处副本」：README 的状态行必须与 release.yml 的 `prerelease=` 一致 ──
    // 立此条的原因（实测，2026-10-05）：ADR-0031 把发布状态从 pre-release 改为正式发布后，
    // **README.md 仍写着「状态：pre-release（ADR-0020）」** —— 即「改了一处没改另一处」的第 N 次重演
    // （本仓已有 §4.54 多处副本漏 docs / §4.69 spec 数字未同步 两次同型）。
    // README 是**用户第一眼看到的**那份，过期代价最高。
    const readmeSrc = read('README.md');
    // 判定与 canary **共用**这两个函数。
    const statusFromWorkflow = (src) => {
      const m = /-F\s+prerelease=(true|false)/.exec(src);
      return m === null ? null : (m[1] === 'true' ? 'pre-release' : '正式发布');
    };
    const statusFromReadme = (src) => {
      if (src.includes('状态：正式发布')) return '正式发布';
      if (src.includes('状态：pre-release')) return 'pre-release';
      return null;
    };
    const wfStatus = statusFromWorkflow(finalizeJob);
    const readmeStatus = statusFromReadme(readmeSrc);
    if (wfStatus === null) {
      fail('无法从 release.yml 的 finalize 现算发布状态（找不到 `-F prerelease=`）—— 判据锚点漂移');
    }
    if (readmeStatus === null) {
      fail('README.md 缺少机器可读的状态行（`状态：正式发布` / `状态：pre-release`）—— '
        + '发布状态必须有单一可核对处，否则 README 会与流水线各自漂移');
    }
    if (wfStatus !== null && readmeStatus !== null && wfStatus !== readmeStatus) {
      fail(`README.md 声明「状态：${readmeStatus}」，而 release.yml 现算为「${wfStatus}」`
        + ' —— 发布状态是用户第一眼看到的那份，改了一处必须改另一处（ADR-0031）');
    }

    // ── 单一 owner 创建 draft release（2026-10-06，审计 §4.108）────────────────
    // 立此条的原因（**实测，v1.5.32**）：三个平台 job **并发**跑 `tauri-action`，
    // 而它的语义是「**找不到 draft 就创建**」⇒ 它们**同一秒**启动、都没找到
    // ⇒ **创建了两个同 tag 的 release**（macOS 的 `.dmg` 进了 A、Windows/Linux 的制品进了 B）
    // ⇒ `finalize` 只看 A（**缺 `.dmg`**）⇒ 断言失败 ⇒ **保持 Draft、不发布**。
    // 修法：先由一个 job 把 release 建好（并断言没有重复），三平台 job 依赖它
    // ⇒ 它们只会「找到」而不会「创建」。**本判据锁住这个结构，防止修复被静默改回。**
    // 解析：`jobs:` 之下 **2 空格缩进**的键 = job 名（job 内部键都是 4 空格）。
    // ⚠️ `jobs:` 允许出现在**文件首行** ⇒ 不能用 `indexOf('\njobs:')`（那会让以 `jobs:` 开头的
    // 合成夹具返回 null —— 实测被 canary 当场抓到）。
    const jobsOf = (src) => {
      const m0 = /(?:^|\n)jobs:[ \t]*\n/.exec(src);
      if (m0 === null) return null;
      const out = [];
      let cur = null;
      for (const line of src.slice(m0.index + m0[0].length).split('\n')) {
        const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
        if (m) { if (cur) out.push(cur); cur = { name: m[1], text: '' }; continue; }
        if (cur) cur.text += `${line}\n`;
      }
      if (cur) out.push(cur);
      return out;
    };
    const jobBlocks = jobsOf(release);
    if (jobBlocks === null || jobBlocks.length < 4) {
      fail('无法从 release.yml 解析出 jobs（锚点漂移会让「单一 owner」判据空转）');
    } else {
      const owners = jobBlocks.filter((j) => j.text.includes('gh release create'));
      const tauriJobs = jobBlocks.filter((j) => j.text.includes('tauri-apps/tauri-action'));
      if (tauriJobs.length < 3) {
        fail(`release.yml 只识别到 ${tauriJobs.length} 个 tauri-action 打包 job（下限 3）—— 扫描面漂移`);
      }
      if (owners.length !== 1) {
        fail(`release.yml 里「创建 release」的 job 有 ${owners.length} 个，**必须恰好 1 个** —— `
          + '多个 job 各自 find-or-create 会**并发创建同 tag 的多个 release**'
          + '（v1.5.32 实测：macOS 的 dmg 与 Windows/Linux 的制品分落到两个 release ⇒ finalize 断言失败、卡 Draft）');
      }
      const ownerName = owners.length === 1 ? owners[0].name : null;
      // 谓词抽成**纯函数**，canary 复用同一份（避免「canary 测的是副本」）。
      const ownerGuardsNonTag = (text) => text.includes('GITHUB_REF_TYPE') && text.includes('!= "tag"');
      const ownerAssertsNoDuplicate = (text) => text.includes('::error::') && text.includes('-gt 1');
      if (ownerName !== null) {
        if (!ownerAssertsNoDuplicate(owners[0].text)) {
          fail(`release.yml 的 ${ownerName} 未**断言没有重复 release** —— `
            + '把「同 tag 多个 release」从静默怪状变成**响亮失败**的那条检查不得删除');
        }
        // owner 必须**只在 tag 触发时**创建 release。两个锚点缺一不可：
        // ① 不加守卫 ⇒ `workflow_dispatch`（本 workflow 也支持）会为**分支名**建 release；
        // ② 但**不能**写成 job 级 `if: startsWith(github.ref,'refs/tags/')` ——
        //    三平台 job `needs: [create-release]` ⇒ owner 被跳过会**连带全被跳过**（把「仅构建」路径弄没）。
        //    ⚠️ 这正是本轮修竞态时**我自己踩过**的坑（初版就是 job 级 `if:`）。
        if (!ownerGuardsNonTag(owners[0].text)) {
          fail(`release.yml 的 ${ownerName} 未按 \`GITHUB_REF_TYPE\` **只在 tag 触发时**创建 release —— `
            + '本 workflow 也支持 `workflow_dispatch`，不加守卫会为**分支名**建 release；'
            + '而写成 job 级 `if:` 又会因三平台 `needs:` 而**连带跳过构建**（实测踩过）');
        }
        for (const j of tauriJobs) {
          const needs = /needs:\s*\[([^\]]*)\]/.exec(j.text);
          if (needs === null || !needs[1].includes(ownerName)) {
            fail(`release.yml 的 ${j.name} 未 \`needs: [${ownerName}]\` —— `
              + '打包 job 必须在单一 owner **建好 release 之后**才启动，否则 find-or-create 会再次并发创建');
          }
        }
      }
      // canary：合成夹具（解析器 + 「必须依赖 owner」的谓词各自验一次）
      const YAML_OK = 'jobs:\n'
        + '  owner:\n    steps:\n      - run: gh release create x --draft\n'
        + '  build:\n    needs: [owner]\n    steps:\n      - uses: tauri-apps/tauri-action@v0\n';
      const YAML_BAD = 'jobs:\n'
        + '  owner:\n    steps:\n      - run: gh release create x --draft\n'
        + '  build:\n    steps:\n      - uses: tauri-apps/tauri-action@v0\n';
      const jOk = jobsOf(YAML_OK);
      const jBad = jobsOf(YAML_BAD);
      if (!jOk || jOk.length !== 2 || jOk[0].name !== 'owner' || jOk[1].name !== 'build') {
        errors.push('单一 owner 护栏 canary 失效：jobs 解析器未取到正确的 job 名');
      }
      if (!jOk || !/needs:\s*\[([^\]]*)\]/.exec(jOk[1].text)?.[1].includes('owner')) {
        errors.push('单一 owner 护栏 canary 失效：`needs: [owner]` 未被识别（正样本）');
      }
      if (!jBad || /needs:\s*\[([^\]]*)\]/.exec(jBad[1].text)) {
        errors.push('单一 owner 护栏 canary 失效：缺少 needs 的 job 被判成「有依赖」（负样本）');
      }
      // canary：`create-release` 这种带连字符的 job 名必须被解析到
      if (!jobsOf('jobs:\n  create-release:\n    steps: []\n')?.some((j) => j.name === 'create-release')) {
        errors.push('单一 owner 护栏 canary 失效：带连字符的 job 名未被解析');
      }
      // canary：owner 的两个谓词（正 / 负样本）
      if (!ownerAssertsNoDuplicate('run: echo "::error::x"; if [ "$C" -gt 1 ]; then')) {
        errors.push('单一 owner 护栏 canary 失效：「断言没有重复」的正样本未被识别');
      }
      if (ownerAssertsNoDuplicate('run: echo ok')) {
        errors.push('单一 owner 护栏 canary 失效：「断言没有重复」的负样本被判成有断言');
      }
      if (!ownerGuardsNonTag('if [ "${GITHUB_REF_TYPE:-}" != "tag" ]; then')) {
        errors.push('单一 owner 护栏 canary 失效：`GITHUB_REF_TYPE != tag` 守卫未被识别');
      }
      if (ownerGuardsNonTag('run: gh release create x --draft')) {
        errors.push('单一 owner 护栏 canary 失效：没有 tag 守卫的 owner 被判成有守卫（负样本）');
      }
    }

    // ── 同一 tag 的运行必须**串行**（2026-10-06，审计 §4.110）────────────────────
    // v1.5.32 的竞态本质是「**并发操作同一个 release**」：那次是三个 job 之间；
    // 而**两次运行之间**的并发是同一形态（重跑 / 重推标签 ⇒ 两次运行同时上传同一个 release），
    // 症状同样是「制品分落 / 断言失败」，且**更难复现**。
    // 判定与 canary **共用**同一份解析函数。
    const concurrencyOf = (src) => {
      const m = /^concurrency:[ \t]*\n((?:[ \t]+.*\n)*)/m.exec(src);
      if (m === null) return null;
      return {
        group: /group:[ \t]*(.+)/.exec(m[1])?.[1].trim() ?? null,
        cancelInProgress: /cancel-in-progress:[ \t]*(\S+)/.exec(m[1])?.[1] ?? null,
      };
    };
    const conc = concurrencyOf(release);
    if (conc === null) {
      fail('release.yml 缺少 `concurrency:` —— 同一 tag 的两次运行会**并发操作同一个 release**'
        + '（与 v1.5.32 竞态同型：制品分落 / 断言失败，且更难复现）');
    } else {
      if (conc.group === null || !conc.group.includes('github.ref')) {
        fail('release.yml 的 `concurrency.group` 必须按 `github.ref` 分组 —— '
          + '否则**不同 tag 之间**会互相阻塞（前一个版本的发布没跑完，后一个就得排队）');
      }
      if (conc.cancelInProgress !== 'false') {
        fail('release.yml 的 `concurrency.cancel-in-progress` 必须是 `false` —— '
          + '**不能取消**正在跑的发布：取消会留下半成品 release，而 release 是**对外**的');
      }
    }
    // canary：三向（正样本 / 缺 group / cancel 为 true）
    const C_OK = 'concurrency:\n  group: release-${{ github.ref }}\n  cancel-in-progress: false\njobs:\n';
    const C_NOGROUP = 'concurrency:\n  cancel-in-progress: false\n';
    const C_CANCEL = 'concurrency:\n  group: release-${{ github.ref }}\n  cancel-in-progress: true\n';
    if (concurrencyOf(C_OK)?.group !== 'release-${{ github.ref }}'
      || concurrencyOf(C_OK)?.cancelInProgress !== 'false') {
      errors.push('串行发布护栏 canary 失效：正样本未被正确解析');
    }
    if (concurrencyOf(C_NOGROUP)?.group !== null) {
      errors.push('串行发布护栏 canary 失效：缺 group 时未判为 null');
    }
    if (concurrencyOf(C_CANCEL)?.cancelInProgress !== 'true') {
      errors.push('串行发布护栏 canary 失效：`cancel-in-progress: true` 未被解析（会漏掉「不得取消」这条）');
    }
    if (concurrencyOf('jobs:\n  a:\n') !== null) {
      errors.push('串行发布护栏 canary 失效：没有 concurrency 时未判为 null');
    }
    // canary：四个方向
    if (statusFromWorkflow('x -F prerelease=false y') !== '正式发布'
      || statusFromWorkflow('x -F prerelease=true y') !== 'pre-release') {
      errors.push('README 状态护栏 canary 失效：从流水线现算状态的判据不能区分正/负样本');
    }
    if (statusFromWorkflow('x -F draft=false y') !== null) {
      errors.push('README 状态护栏 canary 过宽：没有 prerelease= 时不应返回状态');
    }
    if (statusFromReadme('**状态：正式发布**') !== '正式发布'
      || statusFromReadme('**状态：pre-release**') !== 'pre-release') {
      errors.push('README 状态护栏 canary 失效：README 状态行未被正确解析');
    }
    if (statusFromReadme('没有状态行') !== null) {
      errors.push('README 状态护栏 canary 过宽：缺少状态行却仍返回了状态');
    }
  }
  // canary：四个方向（样本拼接构造，避免护栏检出自己）
  {
    const on = `  finalize:\n      - run: -F prerelease=false -F draft=false -f make_latest=true`;
    const off = `  finalize:\n      - run: -F prerelease=false`;
    if (!on.includes(PUBLISH) || off.includes(PUBLISH)) {
      errors.push('发布收口护栏 canary 失效：`draft=false` 的存在性判据不能区分正/负样本');
    }
    if (off.includes(RELEASE_STATE) === false) {
      errors.push('发布收口护栏 canary 失效：`' + RELEASE_STATE + '` 的存在性判据不能区分正样本');
    }
    if (!on.includes(MAKE_LATEST) || off.includes(MAKE_LATEST)) {
      errors.push('发布收口护栏 canary 失效：`make_latest=true` 的存在性判据不能区分正/负样本');
    }
    const orderBad = `  finalize:\n      - run: -F draft=false\n      - run: echo 缺少关键制品`;
    const orderOk = `  finalize:\n      - run: echo 缺少关键制品\n      - run: -F draft=false`;
    if (!publishBeforeAssert(orderBad) || publishBeforeAssert(orderOk)) {
      errors.push('发布收口护栏 canary 失效：顺序判据不能区分「先发布」与「先断言」');
    }
    if (publishBeforeAssert(`  finalize:\n      - run: -F draft=false`)) {
      errors.push('发布收口护栏 canary 过宽：没有断言时不应判为顺序违规');
    }
    if (!/-F draft=true/.test('  finalize:\n      - run: -F draft=true')
      || /-F draft=true/.test('  finalize:\n      - run: -F draft=false')) {
      errors.push('发布收口护栏 canary 失效：「不得 draft=true」的判据不能区分正/负样本');
    }
    // **剥注释**的 canary（本条首跑就被自己的注释打红）：注释里的字样不算。
    if (stripComments('  finalize:\n    # 不要写 -F draft=true\n    - run: -F draft=false').includes(UNPUBLISH)) {
      errors.push('发布收口护栏 canary 失效：剥注释后仍被**注释里**的字样命中');
    }
    if (!stripComments('  finalize:\n    - run: -F draft=true').includes(UNPUBLISH)) {
      errors.push('发布收口护栏 canary 失效：剥注释把**真实违规**也剥掉了（判据会被架空）');
    }
  }
}

// ── drift canary：移除一个护栏后，① 必须转为失败态 ──────────────────────
const removed = guardFiles[0];
const driftedChain = testChain.replace(removed, '');
if (driftedChain.includes(removed) || guardFiles.length === 0) {
  fail('Release Gate 护栏自检失败：无法模拟护栏断链，护栏已失效');
}
const driftedMissing = guardFiles.filter((name) => !driftedChain.includes(name));
if (driftedMissing.length === 0) {
  fail('Release Gate 护栏自检失败：断链未被检出（假绿），护栏已失效');
}

// ── ⑤ 护栏必须容忍 CRLF（2026-09-13 Windows CI 事故）────────────────────
// Windows 的 `actions/checkout` 以 CRLF 检出源码，而护栏大量依赖
// `.replace()` 做注入与 canary 自检 —— 锚点里的 `\n` 在 CRLF 下全部失配，
// 表现为「注入没有生效」/「canary 未武装」，于是 Windows job 连挂而
// Linux / macOS 全绿。故每个读取源码的护栏都必须做换行归一化。
{
  const parityDir = resolve(root, 'tests/parity');
  const guardFiles = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs'))
    : [];
  for (const f of guardFiles) {
    const src = read(`tests/parity/${f}`);
    if (/readFileSync/.test(src) && !/\\r\\n/.test(src)) {
      errors.push(`${f} 读取源码但未归一化 CRLF（Windows 下注入 / canary 会失配）`);
    }
  }
  // canary：去掉自身的归一化必须被检出（证明断言不是摆设）
  const selfSrc = read('tests/parity/verify-release-gate.mjs');
  const anchored = "readFileSync(resolve(root, p), 'utf8').replace(/\\r\\n/g, '\\n')";
  const drifted = selfSrc.replace(anchored, "readFileSync(resolve(root, p), 'utf8')");
  if (drifted === selfSrc) {
    errors.push('CRLF canary 未武装：无法模拟「去掉归一化」的漂移，护栏已失效');
  } else if (/\\r\\n/.test(drifted)) {
    errors.push('CRLF canary 失效：注入后仍未检出缺失归一化');
  }
}

// ── ⑥ 覆盖型下限的「标记 ↔ 阈值」自洽（2026-10-09，审计 §4.168）────────────
// 分工（本仓 idiom）：**CI 守自洽**（标记里的基线与阈值一致），**本机工具守完整**
//   （`tests/parity/tools/audit-guard-bounds.mjs` 用「抬 1 仍绿」二分实测真实值，判定是否过时）。
// 【为什么需要标记】下限有**两类**，取法相反：
//   · **覆盖型**（防「成员悄悄消失」，集合是**人工维护的枚举**）⇒ **必须 == 当前基线**（skill §2）；
//   · **健康度型**（防「解析器 / 扫描面失效」，集合由**内容**产生）⇒ **必须留余量**。
//   不标出来，下一个审计者**无法判断该紧还是该松** —— §4.167 实测：38 处「过松」里 **37 处**
//   自述为健康度型（留余量是设计意图），只有 1 处是覆盖型。故约定：**覆盖型下限必须带
//   `[覆盖型] 基线 N` 标记**，且 N == 阈值。
{
  const MARKER = /\[覆盖型\]\s*基线\s*(\d+)/;
  // 阈值形态：**窗口内第一个比较运算**（`<` / `<=` / `>=` / `>` 后跟数字），或 `const NAME = N`。
  // ⚠️ 不能只认 `X.length/size <op> N` —— 实测有 `if (linkCount < 27)`（**变量**，无 `.length`）。
  // ⚠️ 2026-10-11（审计 §4.317）：运算符**增加** `!==` / `===` —— 覆盖型下限的**忠实形态**
  //   是「必须 == 当前值」，本仓已把它落成 `!== <基线>`（或 `=== <基线>`）⇒ 本判据必须认它。
  const BOUND_EXPR = /(?:<=|<|>=|>|!==|===)\s*(\d+)/;
  const BOUND_CONST = /const\s+[A-Z][A-Z0-9_]*\s*=\s*(\d+)/;
  const guards6 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  let marked = 0;
  for (const f of guards6) {
    const lines = read(`tests/parity/${f}`).split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const m = MARKER.exec(lines[i]);
      if (m === null) continue;
      marked += 1;
      const baseline = Number(m[1]);
      // 阈值必须出现在**同一行或紧随其后 3 行内**（允许中间夹注释）
      const window = lines.slice(i, i + 4).join('\n');
      const hit = BOUND_EXPR.exec(window) ?? BOUND_CONST.exec(window);
      if (hit === null) {
        fail(`${f}:${i + 1} 有「[覆盖型] 基线 ${baseline}」标记，但**紧随其后找不到阈值**`
          + ' —— 标记必须贴在它所描述的那条下限旁（`X.length/size <op> N` 或 `const NAME = N`）');
        continue;
      }
      if (Number(hit[1]) !== baseline) {
        fail(`${f}:${i + 1} 覆盖型下限**自相矛盾**：标记写「基线 ${baseline}」，而阈值是 ${hit[1]}`
          + ' —— 覆盖型下限必须 == 当前基线（skill §2）；若基线确实变了，请**同时**改标记与阈值');
      }
    }
  }
  if (marked < 5) {
    fail(`全仓只找到 ${marked} 处「[覆盖型] 基线 N」标记（下限 5）—— `
      + '标记被删空会让「覆盖型下限必须 == 当前基线」这条纪律重新变成**无人守**（§4.168 实测 8 处）');
  }
  // ⚠️ canary 样本**必须用拼接构造** —— 本文件**自己也在扫描面里**（它的真实标记要被本判据检查），
  //   若把 `[覆盖型] 基线 <数字>` 写成字面量，样本本身会被当成一条标记（本轮实测：2 处真标记
  //   变成 5 处 ⇒ 样本被判「找不到阈值」）⇒ 本会话第 5 次「判据命中自己」。
  const mark = (n) => `[覆盖型] 基线 ${n}`; // 运行时拼出；源码里不出现「…基线 <数字>」整串
  // canary ①（正样本）：标记与阈值一致 ⇒ 不得报错
  const okSample = `// ${mark(9)}\nif (checked.length < 9) {`;
  if (Number(BOUND_EXPR.exec(okSample)[1]) !== Number(MARKER.exec(okSample)[1])) {
    fail('⑥ canary 失效：合法样本被判为不一致');
  }
  // canary ②（负样本）：标记与阈值不一致 ⇒ 必须能检出
  const badSample = `// ${mark(9)}\nif (checked.length < 8) {`;
  if (Number(BOUND_EXPR.exec(badSample)[1]) === Number(MARKER.exec(badSample)[1])) {
    fail('⑥ canary 失效：不一致的样本未被检出（判据已退化成空真）');
  }
  // canary ③：`const NAME = N` 形态也必须能被取到阈值
  const constSample = `// ${mark(4)}\nconst MIN_SAMPLERS = 4;`;
  if (Number(BOUND_CONST.exec(constSample)[1]) !== 4) {
    fail('⑥ canary 失效：`const NAME = N` 形态的阈值取不到');
  }
  // canary ④：**变量**形态（无 `.length`，如 `if (linkCount < 27)`）也必须能取到阈值
  const varSample = `// ${mark(27)}\nif (linkCount < 27) {`;
  if (Number(BOUND_EXPR.exec(varSample)[1]) !== 27) {
    fail('⑥ canary 失效：变量形态（无 `.length`）的阈值取不到');
  }
}

// ── ⑦ 护栏收口行的「canary 计数」不得手写（2026-10-09，审计 §4.172）────────
// 【判据】护栏收口行里的 canary 计数必须是**派生**的（`${canaryCount}`），**不得是字面数字**。
// 【为什么】「手写的计数必然漂移」本仓**已记过**、且**已修过一次**
//   （`verify-package-conventions.mjs`：收口行原手写「canary 5 项」而实际 **4** 条）；
//   本轮普查**其余 3 处**手写计数，实测到 `verify-tauri-capability-contract.mjs` **已经漂了 1**
//   （手写 13 而实际 **12**）⇒ **形态记过 ≠ 系统化**（同 §4.170/§4.171）。
// 【处置】3 处全部改为 `canary(ok, msg)` 派生计数；本判据防新增。
{
  // ⚠️ 模式**运行时拼接**（本文件自己也在扫描面里 ⇒ 写字面量会被自己命中，PITFALLS §4.237 的教训）
  // ⚠️ **两种形态都要覆盖**（2026-10-09，审计 §4.180）：`canary N 项`（canary 在**前**）
  //   与 `N 项…canary`（canary 在**后**）。实测 `verify-upstream-manifest.mjs` 的收口行写
  //   「含 **5 项**逻辑 canary」而当时已有 **7** 条 ⇒ **原谓词只覆盖前一种 ⇒ 静默漏检**。
  const CANARY_LITERAL = new RegExp(`canary\\s+${'\\d'}+\\s*项|${'\\d'}+\\s*项[^。\\n]{0,12}canary`);
  // ⚠️ **先剥注释**：说明性文字里会**引用**这个坏形态（如「原手写「canary 5 项全绿」」），
  //   不剥会把**解释**当成**违规**（同 §4.156「散文提及满足了判据」的老坑）。
  const stripLineComments = (src) => src.split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  const guards7 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const offenders7 = [];
  let derived7 = 0;
  // ⚠️ **显式排除自身**：本文件在**它的 fail 消息里**同时写着 `const canary = (ok,` 与 `${canaryCount}`
  //   （作为「该怎么改」的示例）⇒ 两个谓词都会命中自己 ⇒ 计数虚高 1 ⇒ 防空转下限**永远满足**
  //   （本会话第 6 次「判据命中自己」：PITFALLS §4.156 / PITFALLS §4.157 / PITFALLS §4.237 / PITFALLS §4.240 / PITFALLS §4.168 / 本节）。
  //   ⚠️ 换成「收紧谓词」不成立（参数名 `msg` vs `message` 属实现细节）⇒ **显式排除**才是稳的。
  const SELF7 = 'verify-release-gate.mjs';
  for (const f of guards7) {
    const src = stripLineComments(read(`tests/parity/${f}`));
    if (f !== SELF7 && /const canary = \(ok,/.test(src) && /\$\{canaryCount\}/.test(src)) derived7 += 1;
    src.split('\n').forEach((l, i) => {
      if (CANARY_LITERAL.test(l)) offenders7.push(`${f}:${i + 1}`);
    });
  }
  if (offenders7.length > 0) {
    fail(`收口行里的 canary 计数是**手写**的：${offenders7.join('、')} —— 手写的计数**必然漂移**`
      + '（实测两次：一次手写 5 而实际 4、一次手写 13 而实际 12）⇒ 改为**派生**：'
      + '`let canaryCount = 0; const canary = (ok, msg) => { canaryCount += 1; if (!ok) errors.push(msg); };`'
      + ' + 收口行打印 `${canaryCount}`');
  }
  // 防空转：必须**至少**扫到 3 个「派生」的收口行（否则判据已不覆盖任何护栏）
  if (derived7 < 3) {
    fail(`只有 ${derived7} 个护栏的收口行用了**派生**的 canary 计数（下限 3 = 2026-10-09 实测）`
      + ' —— 判据范围萎缩会让本判据空转');
  }
  // canary ①（正样本）：派生形态不得被判为手写
  if (CANARY_LITERAL.test(`canary ${'${canaryCount}'} 项全绿`)) {
    fail('⑦ canary 失效：派生形态被误判为手写');
  }
  // canary ②（负样本）：手写形态必须能检出（用**拼接**构造，避免自己命中自己）
  if (!CANARY_LITERAL.test(`canary ${4} 项全绿`)) {
    fail('⑦ canary 失效：手写形态未被检出（判据已退化成空真）');
  }
  // canary ④（负样本）：**canary 在「后」**的形态也必须检出
  //   （`${4}` 写法 ⇒ 源码里是 `$` 而非数字 ⇒ **不会自己命中自己**）
  if (!CANARY_LITERAL.test(`含 ${4} 项逻辑 ${'canary'}`)) {
    fail('⑦ canary 失效：canary 在**后**的手写形态未被检出');
  }
  // canary ③（前提自检）：**剥注释**必须真的生效 —— 否则说明性引用会被当成违规
  if (CANARY_LITERAL.test(stripLineComments(`// 原手写「canary ${5} 项全绿」`))) {
    fail('⑦ canary 失效：剥注释未生效（说明性引用会被误判为违规）');
  }
}

// ── ⑧ 护栏**输出**里不得出现手写的「N-单词」计数（2026-10-09，审计 §4.173）────
// 【判据】`console.log` 的字符串里不得有形如「**N**-config」/「**N**-scene」的**手写计数**。
// 【为什么】`verify-visual-golden.mjs` 的收口行原写「§9.3 **14**-scene coverage —
//   visual-golden(**6**) + sidebar-golden(**4**) + scenes-golden(**7**)」——**6+4+7 = 17 ≠ 14**，
//   **同一句话内自相矛盾**；而审计 §4.8 早已判定那个「14」**对不上任何来源**
//   （只有在「`Light / Dark` 算两项」这个**从未写明的约定**下才成立），并给出处置原则
//   「**不再有任何数字**，因此不可能漂移」。⇒ 落成判据（同族：§4.172 的「手写计数必然漂移」）。
{
  // ⚠️ 模式与**示例**都运行时拼接：本文件在扫描面内，且它会在注释/消息里**引用**坏形态（PITFALLS §4.237 的教训）
  const N_WORD = new RegExp(`\\b${'\\d'}+-[a-z][a-z-]*`);
  // ⚠️ **中文量词形态**（2026-10-09，审计 §4.181）：`N-word` 只覆盖**英文连字符**写法。
  //   实测 `verify-doc-code-refs.mjs` 的输出写「升版 **4 处**一致」，而真值源
  //   `VERSION_SOURCES.length` 也恰好是 4 ⇒ 加第 5 个版本源就会**静默漂**（同族「只锁了一半」）。
  //   判定法：先**剥掉 `${...}`**（含嵌套）—— 剩下的**字面**部分里不得出现「数字 + 中文量词」。
  const stripInterp = (s) => {
    let out = ''; let depth = 0;
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] === '$' && s[i + 1] === '{') { depth += 1; i += 1; continue; }
      if (depth > 0 && s[i] === '}') { depth -= 1; continue; }
      if (depth === 0) out += s[i];
    }
    return out;
  };
  const CJK_COUNT = new RegExp(`${'\\d'}+\\s*(项|个|条|处|类|份|种)`);
  // 豁免：**历史叙述**（记录**已发生**的事实，本就不该变）—— 必须登记 + 给理由（双向核对）。
  const CJK_COUNT_EXEMPT = new Map([
    ['verify-i18n-contract.mjs|30 个', '「30 个死键已按 ADR-0032 Q1=A1 删除，目录 841 → 811」'
      + ' = **已发生的历史**（裁决记录），不是可漂的计数'],
  ]);
  const guards8 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const offenders8 = [];
  for (const f of guards8) {
    // ⚠️ **不要再加 CRLF 归一化** —— `read()` 已经归一化过；而本文件里**任何地方**出现
    //   那个两字符转义序列（**包括注释里**）都会**破坏本文件自己的 CRLF canary**（⑤ 会报
    //   「注入后仍未检出缺失归一化」，本轮实测踩到）。
    const src = read(`tests/parity/${f}`);
    for (const m of src.matchAll(/console\.log\(([\s\S]{0,1200}?)\);/g)) {
      const at = src.slice(0, m.index).split('\n').length;
      // ⚠️ **必须剥掉语句内的注释行**：多行 `console.log(...)` 里可以插注释（实测
      //   `verify-package-conventions.mjs` 就插了「本行原**手写**『canary 5 项全绿』」），
      //   那是**说明**不是**输出** ⇒ 不剥会把解释当成违规（§4.156 的老坑）。
      const body = m[1].split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      const hit = N_WORD.exec(body);
      if (hit !== null) offenders8.push(`${f}:${at}（${hit[0]}）`);
      // 中文量词形态：**剥掉 `${...}`** 后仍含「数字 + 量词」⇒ 是**字面**计数（会漂）
      const cjk = CJK_COUNT.exec(stripInterp(body));
      if (cjk !== null && !CJK_COUNT_EXEMPT.has(`${f}|${cjk[0]}`)) {
        offenders8.push(`${f}:${at}（${cjk[0]}）`);
      }
    }
  }
  if (offenders8.length > 0) {
    fail(`护栏**输出**里有**手写**的计数：${offenders8.join('、')} —— `
      + '这类计数会漂（实测：① 某收口行写「14-scene」而同句列出 6+4+7 = 17，**自相矛盾**；'
      + '② 某收口行写「升版 4 处一致」，而该数应来自 `VERSION_SOURCES.length`）'
      + '⇒ **要么从制品派生，要么不写数字**'
      + `（例：把「${4}${'-'}config」改为直接列配置、「N-scene」改为从基线现读的分项之和、`
      + '「4 处」改为 `${VERSION_SOURCES.length} 处`）'
      + '；若确属**历史叙述**（记录已发生的事实、本就不该变），登记进 `CJK_COUNT_EXEMPT` 并给理由');
  }
  // 豁免表**双向**：登记了却不再命中 ⇒ 请删除（否则例外表会永久留在那里，同 §4.60）
  for (const key of CJK_COUNT_EXEMPT.keys()) {
    const [ef, ehit] = key.split('|');
    let seen = false;
    for (const m of read(`tests/parity/${ef}`).matchAll(/console\.log\(([\s\S]{0,1200}?)\);/g)) {
      const body = m[1].split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      const c = CJK_COUNT.exec(stripInterp(body));
      if (c !== null && c[0] === ehit) { seen = true; break; }
    }
    if (!seen) fail(`⑧ 的 CJK_COUNT_EXEMPT 登记了 ${key}，但它已不再命中 —— 请删除该例外条目`);
  }
  // ⚠️ **已知局限（如实声明）**：本判据覆盖**三种形态** —— `N-word`（英文连字符）、
  //   `canary N 项`、**中文量词的字面计数**（2026-10-09，审计 §4.181 补）；
  //   但 `\${4}-config` 这种「**表达式里写死数字**」它**看不见** —— 那是「派生」与「写死」的边界模糊处，
  //   机械判据无法区分（`\${4}` 与 `\${count}` 同形）。⇒ 这一半**只能靠人**（同 §4.162 的边界声明）。
  // canary ①（正样本）：派生形态（`${...}` 拼出的数字）不得被判为手写
  if (N_WORD.test('console.log(`Visual golden: layout contract armed (900x600)`)')) {
    fail('⑧ canary 失效：无计数的样本被误判');
  }
  // canary ②（负样本）：手写形态必须能检出（拼接构造，避免自己命中自己）
  if (!N_WORD.test(`x ${4}${'-'}config`)) {
    fail('⑧ canary 失效：手写「N-单词」形态未被检出（判据已退化成空真）');
  }
  // canary ③（正样本）：**派生**的中文量词（`${n} 项`）不得被判为手写
  //   （样本**不含** `console.log(` 字样 ⇒ 不会被本判据的扫描面误当成语句）
  if (CJK_COUNT.test(stripInterp('共 ${n} 项'))) {
    fail('⑧ canary 失效：派生的中文量词被误判为手写');
  }
  // canary ④（负样本）：**字面**的中文量词必须检出
  if (!CJK_COUNT.test('升版 4 处一致')) {
    fail('⑧ canary 失效：字面中文量词未被检出（判据已退化成空真）');
  }
}

// ── qualification README 的门禁表数字必须与实际一致（2026-10-01）────────────
// 立此节的必要性：`tests/qualification/README.md` 是 **ADR-0019 §3 Gate 条款**指定的
// 「三平台 Pass/Fail 表」载体，而它的**护栏数量**长期未刷新 —— 实测：写「14 个」而实际 **17 个**
//（同段的包用例数也过期：写 editor-engine 1135 而实际 1277）。**数字过期会误导覆盖度判断**，
// 且这类「自述与现实不符」在本项目已出现多次。
//
// ⚠️ **本节的落位本身就是一次教训**：首版把它写在 `if (errors.length > 0)` **之后** ——
// 那里已经没有检查点了，`fail()` 只是往数组里塞字符串，**永远不会被判定**（= 护栏卫生里的
// 「护栏看不见我」）。是 canary（注入漂移后**应当**失败却 exit 0）当场暴露的。
// **新增断言必须落在错误检查点之前**；且**只做注入验证不够，必须验证「能翻转」**。
//
// ⚠️ 覆盖边界（2026-10-08 审计 §4.153 **更正**）：
// 旧声明写「只锁护栏数量；**包用例数需实跑，无法在此校验**」—— **太宽**，它把两件事混为一谈：
//   ① 无法对**现实**校验（需实跑）—— 真的；
//   ② 无法对**同文件内的真值源**校验 —— **假的**。实测：该文件里包用例数有**两处**写法
//      （Pass/Fail 表内联 与 「各包规模」行），**4 处内联数字全部**与真值源矛盾
//      （`editor-engine 971` / `export 72` / `settings 13` / `app-core 200`
//       vs 真值源 `1277` / `89` / `17` / `258`）⇒ **这是可机械判的**。
// ⇒ 判据：**单一真源 = 「各包规模」行**；文件其它位置出现的 `<包名> <数字>` 必须与之一致。
//    （更正说明会**引用旧值** ⇒ 与 `verify-doc-code-refs.mjs` 的 `LOOKS_LIKE_QUOTE` 同源，逐行豁免。）
{
  const readme = read('tests/qualification/README.md');
  const STATED_RE = /Parity 契约护栏 \*\*(\d+) 个\*\*/;
  const stated = STATED_RE.exec(readme)?.[1];
  if (stated === undefined) {
    fail('qualification README 缺少「Parity 契约护栏 N 个」声明（护栏需同步更新，不要静默漏检）');
  } else if (Number(stated) !== guardFiles.length) {
    fail(`qualification README 的护栏数量过期：写 ${stated} 个，实际 ${guardFiles.length} 个`
      + ' —— 该文件是 ADR-0019 §3 Gate 条款的 Pass/Fail 表载体，数字过期会误导覆盖度判断');
  }
  // canary：改掉那个数字必须被检出
  const drift = readme.replace(STATED_RE, 'Parity 契约护栏 **1 个**');
  if (drift === readme) {
    errors.push('qualification README 数字一致性 canary 未武装：无法注入漂移（锚点漂移，请更新护栏）');
  } else if (Number(STATED_RE.exec(drift)?.[1]) === guardFiles.length) {
    errors.push('qualification README 数字一致性 canary 失效：注入漂移后仍判定一致');
  }

  // ── 「**清单**」也必须锁（2026-10-09，审计 §4.238）──────────────────────────────
  // 【为什么】README 自己写着「**数量与清单由护栏锁定**」，而本节此前**只锁了数量** ——
  //   ⇒ **声称强于实际**（本仓纪律：「读数强度必须匹配结论强度」）。
  //   ⚠️ 且该清单**有前科**：README 自己记着「上一版写 14 个且**清单里缺**
  //      i18n-contract / doc-code-refs / no-color-only-status 三条 —— 数量**与清单**都已过期」。
  //   ⇒ 「数量对了」**不能**推出「清单也对」（两者是**独立**的漂移面）。
  // 【判据】**双向**（同一不变量族的另一半，**不新开判据号**）：
  //   ① 每个实际护栏名必须在声明行里**作为 token** 出现（防子串误判）；
  //   ② 声明行里的「**段首 token**」必须都是真实护栏 —— 尾句「外加 `tests/qualification/
  //      ux-gate-recorder.mjs --self-test`」里的名字**不是**护栏 ⇒ 用 `NOT_A_GUARD` 例外表
  //      **显式登记**（**双向核对**，不静默豁免）。
  // ⚠️ 谓词与 canary **共用**；样本**运行时拼接**（本行会被判据自己引用）。
  const guardListLine = readme.split('\n').find((l) => /^Parity 契约护栏 \*\*\d+ 个\*\*/.test(l));
  /** 声明行里「**段首 token**」（`/` 切分后的首个标识符）—— 判定与 canary **共用**。 */
  const listHeadsOf = (line) => {
    const i = line.indexOf('：');
    const after = i < 0 ? line : line.slice(i + 1);
    return [...new Set(after.split('/')
      .map((s) => (/^\s*\*{0,2}([a-z][a-z0-9-]*)\*{0,2}/.exec(s) ?? [])[1])
      .filter(Boolean))];
  };
  /** 某名字是否作为 **token** 出现在行里（`-` 也属名字字符 ⇒ 防 `a-b` 命中 `a-b-c`）。 */
  const hasToken = (line, name) => new RegExp(`(^|[^a-z0-9-])${name.replace(/-/g, '\\-')}([^a-z0-9-]|$)`).test(line);
  const NOT_A_GUARD = new Map([
    ['ux-gate-recorder', '声明行**尾句**提到的记录器（`tests/qualification/ux-gate-recorder.mjs --self-test`），**不是** parity 护栏'],
    ['qualification', '同上尾句里的目录名（由 `tests/qualification/ux-gate-recorder.mjs` 按 `/` 切分产生），**不是**护栏'],
  ]);
  if (guardListLine === undefined) {
    fail('qualification README 的「Parity 契约护栏 N 个」声明行找不到 —— 清单判据无处可依');
  } else {
    const shortNames = guardFiles.map((f) => f.replace(/^verify-/, '').replace(/\.mjs$/, ''));
    const absent = shortNames.filter((n) => !hasToken(guardListLine, n));
    if (absent.length > 0) {
      fail(`qualification README 的护栏**清单漏了**：${absent.join('、')}`
        + ' —— 该行自称「数量**与清单**由护栏锁定」，清单必须与实际一致（数量对 ≠ 清单对）');
    }
    const heads = listHeadsOf(guardListLine);
    const phantom = heads.filter((n) => !shortNames.includes(n) && !NOT_A_GUARD.has(n));
    if (phantom.length > 0) {
      fail(`qualification README 的护栏**清单里有不存在的护栏**：${phantom.join('、')}`
        + ' —— 若它不是护栏（如尾句提到的其它脚本），请登记进 `NOT_A_GUARD` 并写明理由');
    }
    // 例外表**双向核对**（不再出现 ⇒ 报错，防化石）
    const staleNotGuard = [...NOT_A_GUARD.keys()].filter((n) => !heads.includes(n));
    if (staleNotGuard.length > 0) {
      fail(`NOT_A_GUARD 里这些名字**已不再出现**在声明行：${staleNotGuard.join('、')}`
        + ' —— 例外表要**双向**核对（防化石）');
    }
    // canary：三向（判定与 canary **共用** hasToken / listHeadsOf）
    const SAMPLE = 'Parity 契约护栏 **3 个**：' + ['aa-bb', 'cc-dd', 'ee-ff'].join(' / ') + '。';
    if (!hasToken(SAMPLE, 'aa-bb') || hasToken(SAMPLE, 'aa-bb-cc')) {
      errors.push('护栏清单一致性 canary 失效：token 匹配不能区分 `aa-bb` 与 `aa-bb-cc`（子串会误判）');
    }
    if (listHeadsOf(SAMPLE).join(',') !== 'aa-bb,cc-dd,ee-ff') {
      errors.push('护栏清单一致性 canary 失效：**段首 token** 未按 `/` 正确切分');
    }
  }

  // ── vendored CoreEditor 的**用例数**也必须与真值源一致（2026-10-10，审计 §4.244）──────────
  // 【为什么】真值源行里写着「（另有 vendored CoreEditor **N**）」—— 该数**不在** `packages/*` 的 jest 里，
  //   而它在**活文档 5 处**被复述。实测（2026-10-10）：复述写 **185**，而实跑 `yarn test` 是 **200**
  //   ⇒ 一处**已漂**的复述数字（与「各包规模」同一类；该类的可执行对账由本机工具
  //   `tests/parity/tools/audit-pkg-test-counts.mjs` 承担，本判据只锁**文件间自洽**）。
  //   ⚠️ 同源前科：ADR-0021 的**更正块**更新了同一行的 3 个数字（5 job / wrapper 14 / 486），
  //   **漏了同行第 4 个（vendored 185）** ⇒ 又一次「修一处没修另一处」。
  // 【判据】**表驱动**（**不**做全仓模糊匹配 —— 记录类里的「185」是**当时快照**，合法）：
  //   下表每条的**每个**捕获都必须 == 真值源里的 vendored 数；总捕获数下限 5（防空转）。
  {
    const vendored = /另有 vendored CoreEditor \*\*(\d+)\*\*/.exec(readme)?.[1];
    if (vendored === undefined) {
      fail('qualification README 的「各包规模」行里找不到「另有 vendored CoreEditor **N**」—— 真值源缺失');
    } else {
      const RESTATED = [
        ['tests/qualification/README.md', /另有 vendored CoreEditor \*\*(\d+)\*\*/g],
        ['tests/qualification/README.md', /CoreEditor \*\*(\d+)\*\* \+ 全仓 jest/g],
        ['packages/editor-core/README.md', /jest (\d+) 用例/g],
        ['packages/editor-core/CONTRACT.md', /`yarn test` = (\d+)\/\d+/g],
        ['docs/architecture/migration.md', /CoreEditor jest 测试（(\d+) 用例/g],
      ];
      let seen = 0;
      for (const [rel, re] of RESTATED) {
        if (!existsSync(resolve(root, rel))) { fail(`vendored 用例数复述表里的 ${rel} 不存在`); continue; }
        for (const m of read(`${rel}`).matchAll(re)) {
          seen += 1;
          if (m[1] !== vendored) {
            fail(`${rel} 复述的 vendored 用例数是 ${m[1]}，而真值源写 ${vendored} —— 同一数字多处出现时必须一致`);
          }
        }
      }
      if (seen < 5) {
        fail(`vendored 用例数的复述只解析出 ${seen} 处（下限 5 = 立此判据时的实测）—— 谓词或文档漂移会让本判据**空转**`);
      }
    }
  }

  // ── 写了「不重复写数字以免二次漂移」的段落，**不得**出现规模计数（2026-10-10，审计 §4.245）──
  // 【为什么】实测：`tests/qualification/README.md` 的 macOS 证据段自己写着
  //   「**本行不重复写数字以免二次漂移**」，而**同一段**却复述了「Rust 83 + jest 1613」——
  //   而 jest 的当前合计是 **1915**（§4.244 刚把真值源做成实跑对账）⇒ **自己的规则 + 自己违反**，
  //   且该数字**已漂**（1613 → 1915）。⇒ 「声称不写数字」的段落本身是一个**可机械复核**的断言。
  // 【判据】活文档里凡出现「不重复写数字 / 以免二次漂移」的行，其 **±3 行窗口**内不得出现
  //   **规模计数**（`jest N` / `Rust N` / `N 例` / `合计 N`）。
  //   ⚠️ **记录类排除**（目录 + **文件名含日期**）：记录里的旧值是**当时快照**，合法。
  //   ⚠️ **不含「N 错误」**：那是**通过 / 不通过**的断言（不为 0 就是红的），不是会漂的规模。
  {
    const DUP_RULE = /不重复写数字|以免二次漂移/;
    const SCALE = /(?:jest|Rust)\s*\*{0,2}\d{2,}|\d{2,}\s*例|合计\s*\*{0,2}\d{2,}/;
    const RECORD_DIRS = ['docs/qualification/', 'docs/plans/archive/'];
    let dupSections = 0;
    const dupBad = [];
    for (const rel of trackedFiles ?? []) {
      if (!rel.endsWith('.md')) continue;
      if (RECORD_DIRS.some((d) => rel.startsWith(d))) continue;
      if (rel.startsWith('.github/release-notes-')) continue;
      if (rel.startsWith('docs/adr/')) continue;
      if (/\d{4}-\d{2}-\d{2}/.test(rel.split('/').pop())) continue;   // 文件名含日期 ⇒ 记录
      // ⚠️ **不要**在这里再归一化 —— `read()` 已归一化；而本文件里**任何地方**出现那个两字符
      //   转义序列（**包括注释里**）都会**破坏本文件自己的 CRLF canary**（⑤ 会报，见 L1539 的警告）。
      const lines = read(rel).split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (!DUP_RULE.test(lines[i])) continue;
        dupSections += 1;
        for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j += 1) {
          if (SCALE.test(lines[j])) dupBad.push(`${rel}:${j + 1}「${lines[j].trim().slice(0, 60)}」`);
        }
      }
    }
    for (const b of dupBad) {
      fail(`写了「不重复写数字以免二次漂移」的段落里仍有**规模计数**：${b}`
        + ' —— 要么删掉数字（改为指向真值源），要么去掉那句规则');
    }
    if (dupSections < 1) {
      fail('一处「不重复写数字 / 以免二次漂移」的声明都没找到（立此判据时 1 处）—— 锚点漂移会让本判据**空转**');
    }
    // canary：三向（判定与 canary **共用** DUP_RULE / SCALE）
    if (!DUP_RULE.test('本行不重复写数字以免二次漂移')) {
      fail('数字不重复护栏 canary 失效：规则句未被识别');
    }
    if (!SCALE.test('Rust 83 + jest 1613')) {
      fail('数字不重复护栏 canary 失效：规模计数未被识别');
    }
    if (SCALE.test('`tsc --noEmit` **0 错误**')) {
      fail('数字不重复护栏**过宽**：`0 错误` 这种**通过 / 不通过断言**被当成了规模计数');
    }
  }

  // ── 包用例数：**单一真源 = 「各包规模」行**；文件其它位置必须与之一致（2026-10-08）──────
  // 判定与 canary **共用**本谓词（`pkgAudit`）：返回 `{truthSize,total,bad}`，真值源缺失返回 `null`。
  const PKGS = ['editor-engine', 'app-core', 'export', 'host-api', 'commands',
    'document-model', 'editor-core', 'desktop-ui', 'settings', 'i18n', 'extension-api', 'themes'];
  const NOTE_LINE = /原写|上一版|更正|实跑为|而实际|过期|曾长期/;
  // ⚠️ 真值源行必须**按内容选**，不能按「第一行含『各包规模』」选 ——
  //    本轮实测踩到：我在表格标题下加了一条**引用**「各包规模」的说明 ⇒ `findIndex` 取到了那条说明
  //    （含 0 个包）⇒ 判据报「只解析出 0 个包」。⇒ **在候选行里取「含包数最多」的那一行**。
  const truthOf = (text) => {
    const ls = text.split('\n');
    let best = -1; let bestN = 0;
    ls.forEach((l, i) => {
      if (!/各包规模/.test(l)) return;
      const n = [...l.matchAll(/([a-z][a-z0-9-]*) \*\*(\d+)\*\*/g)].filter((m) => PKGS.includes(m[1])).length;
      if (n > bestN) { bestN = n; best = i; }
    });
    if (best === -1) return null;
    const truth = new Map();
    // ⚠️ 包名**含数字**（`i18n`）⇒ 字符类必须允许数字，否则 `i18n` 静默漏掉、合计少 15（实测踩到）。
    for (const m of ls[best].matchAll(/([a-z][a-z0-9-]*) \*\*(\d+)\*\*/g)) {
      if (PKGS.includes(m[1])) truth.set(m[1], Number(m[2]));
    }
    return { ls, si: best, truth };
  };
  const pkgAudit = (text) => {
    // ⚠️ **不要再在这里做 CRLF 归一化**：入参已由 `read()` 归一化，
    //    而本文件上方的 **CRLF canary** 断言「去掉 `read()` 的归一化后，文件里不再出现该转义序列」
    //    ⇒ 多写一处（**哪怕写在注释里**）会让那条 canary **失去鉴别力**
    //    （2026-10-08 实测踩到两次：先是代码、再是注释，已移除）。
    const t = truthOf(text);
    if (t === null) return null;
    const { ls, si, truth } = t;
    const bad = []; let total = 0;
    ls.forEach((line, i) => {
      if (i === si || NOTE_LINE.test(line)) return;
      for (const m of line.matchAll(/([a-z][a-z0-9-]*) (\*\*)?(\d+)/g)) {
        if (!truth.has(m[1])) continue;
        total += 1;
        if (Number(m[3]) !== truth.get(m[1])) {
          bad.push(`L${i + 1} \`${m[1]} ${m[3]}\`≠\`${m[1]} ${truth.get(m[1])}\``);
        }
      }
    });
    return { truthSize: truth.size, total, bad };
  };
  const pkg = pkgAudit(readme);
  if (pkg === null) {
    fail('qualification README 缺少「各包规模」行（包用例数的**单一真值源**）—— 判据会空转');
  } else {
    if (pkg.truthSize < 10) {
      fail(`qualification README 的「各包规模」行只解析出 ${pkg.truthSize} 个包（下限 10）—— 判据会空转`);
    }
    if (pkg.total < 3) {
      fail(`qualification README 里只解析出 ${pkg.total} 处「包名 + 用例数」（下限 3 = 立此判据时的基线）`
        + ' —— 谓词或文档漂移会让本判据**空转**');
    }
    if (pkg.bad.length > 0) {
      fail(`qualification README 里包用例数与「各包规模」真值源不一致（${pkg.bad.length}）：${pkg.bad.join('、')}`
        + ' —— 包用例数**只能有一个真值源**，刷新时必须两处一起改'
        + '（实测：立此判据时 4 处内联数字**全部**是旧值）');
    }
  }
  // canary：四向（一致 ⇒ 放行 / 漂移 ⇒ 报 / 更正说明 ⇒ 豁免 / 无真值源 ⇒ null）
  const C_OK = '各包规模：settings **17**\n| x | ✅（settings 17） |';
  const C_BAD = '各包规模：settings **17**\n| x | ✅（settings 13） |';
  const C_NOTE = '各包规模：settings **17**\n> ⚠️ 上一版写「settings 13」\n';
  if (pkgAudit(C_OK)?.bad.length !== 0) {
    errors.push('qualification README 包用例数 canary 失效：一致样本被判为不一致');
  }
  if (pkgAudit(C_BAD)?.bad.length !== 1) {
    errors.push('qualification README 包用例数 canary 失效：漂移样本未被检出');
  }
  if (pkgAudit(C_NOTE)?.bad.length !== 0 || pkgAudit(C_NOTE)?.total !== 0) {
    errors.push('qualification README 包用例数 canary 失效：更正说明里引用的旧值未被豁免');
  }
  if (pkgAudit('没有真值源行') !== null) {
    errors.push('qualification README 包用例数 canary 过宽：无真值源时不应返回结果');
  }

  // ── 「合计 N 例」必须 == 真值源各包之和（2026-10-08）────────────────────────────
  // 立此条的原因：合计是**可从各包派生**的数，却在本文件里**写了两遍**
  //（「12 包 jest 1824 例」与「各包规模」行的「合计 1824 例」）⇒ 典型的「可派生却手写」。
  // ⚠️ 谓词必须**收窄**：文件里还有「联合矩阵 8 例」「md-link 15 例」「corpus 4 例」这类**子集**，
  //    它们**不是**总数 ⇒ 只认 `jest N 例` / `合计 N 例` 两种写法。
  const totalOf = (text) => {
    const t = truthOf(text);
    if (t === null) return null;
    const { ls, truth } = t;
    if (truth.size === 0) return null;
    const sum = [...truth.values()].reduce((a, b) => a + b, 0);
    const bad = [];
    ls.forEach((line, i) => {
      if (NOTE_LINE.test(line)) return;
      for (const m of line.matchAll(/(?:jest|合计)\s*\*{0,2}(\d+)\s*例/g)) {
        if (Number(m[1]) !== sum) bad.push(`L${i + 1} 写 ${m[1]}，各包之和是 ${sum}`);
      }
    });
    return { sum, bad };
  };
  const tot = totalOf(readme);
  if (tot === null) {
    fail('qualification README：无法从「各包规模」行求合计（包解析为空）—— 判据会空转');
  } else if (tot.bad.length > 0) {
    fail(`qualification README 的「合计」与各包之和（${tot.sum}）不一致：${tot.bad.join('；')}`
      + ' —— 合计是**可派生**的数，刷新时两处都要改');
  }
  // canary：三向（正确 ⇒ 放行 / 错误 ⇒ 报 / 更正说明 ⇒ 豁免）
  if (totalOf('各包规模：settings **17** / i18n **15**\n合计 32 例')?.bad.length !== 0) {
    errors.push('qualification README 合计 canary 失效：正确的合计被判为不一致');
  }
  if (totalOf('各包规模：settings **17** / i18n **15**\n合计 30 例')?.bad.length !== 1) {
    errors.push('qualification README 合计 canary 失效：错误的合计未被检出');
  }
  if (totalOf('各包规模：settings **17**\n> 上一版合计 30 例')?.bad.length !== 0) {
    errors.push('qualification README 合计 canary 失效：更正说明里引用的旧合计未被豁免');
  }
  if (totalOf('各包规模：settings **17**\n| 子集 8 例 |')?.bad.length !== 0) {
    errors.push('qualification README 合计 canary 过宽：子集（「X N 例」）被当成了总数');
  }
}

// ── ⑨ README 的**状态快照**必须与门禁**现算**一致（2026-10-09，审计 §4.174）──────
// 【为什么】`README.md` 第 9 行写着「`PASS-E = 0/50`、未闭环 **9 项**依然成立」——
//   这是一句**无日期、会被按「当前」读**的快照（本仓老形态：「不带日期的数字会被按「当前」读」）。
//   而**只有状态行**（`状态：正式发布`，见上文 ⑤ 族）被护栏锁，**这半句数字没有**
//   ⇒ 台账一变，README 就**静默漂**（同族：「只锁了一半」）。
//   同一句快照还散在约 12 份 `docs/qualification/*` 记录里 —— 那些是**带日期的记录**
//   （且都带「当前状态真值源 = 门禁输出」的指针），**登记为残量、不做机械全改**。
// 【判据】README 里出现的 `PASS-E = N/M` 与「未闭环 N 项」必须 == 门禁**现算**的值。
//   ⚠️ 判据只读 `README.md`（不读本文件）⇒ **不会命中自己的消息文本**（self-hit 规避）。
// ⚠️ **本节的落位**：必须在 `if (errors.length > 0)` **之前**。首版落在**之后** ⇒
//   `fail()` 只是往数组塞字符串、**永不判定**（注入验证 3/3 全绿才发现 ——
//   本文件早已记录过同型教训：「新增断言必须落在错误检查点之前」⇒ **第 2 次**）。
const totalItems = (ledger.items ?? []).length;
const passECount = (ledger.items ?? []).filter((i) => i.status === 'PASS-E').length;
{
  const readmeSnapshot = read('README.md');
  // 判定与 canary **共用同一份正则**（本仓 idiom）
  const passEOf = (s) => {
    const m = /PASS-E\s*=\s*(\d+)\s*\/\s*(\d+)/.exec(s);
    return m === null ? null : [Number(m[1]), Number(m[2])];
  };
  // ⚠️ **两种语序都要覆盖**（2026-10-09，审计 §4.189）：`未闭环 N 项`（正装）与 `N 项未闭环`（**倒装**）
  //   —— 实测活文档里有 **8 处倒装**（含 2 处带「当前状态真值源」标记的），而原谓词**只认正装**
  //   ⇒ 静默漏检（同族「**同一语义多种写法**」**第 4 次**：§4.180 的 canary 语序 · §4.181 的中文量词 ·
  //   PITFALLS §4.293）。
  const unclosedOf = (s) => {
    const m = /未闭环\s*\**\s*(\d+)\s*项|\**(\d+)\s*项\**\s*未闭环/.exec(s);
    if (m === null) return null;
    return Number(m[1] ?? m[2]);
  };
  const statedPassE = passEOf(readmeSnapshot);
  const statedUnclosed = unclosedOf(readmeSnapshot);
  if (statedPassE !== null && (statedPassE[0] !== passECount || statedPassE[1] !== totalItems)) {
    fail(`README.md 写「PASS-E = ${statedPassE[0]}/${statedPassE[1]}」，而门禁**现算**为 `
      + `${passECount}/${totalItems} —— 这是**无日期的快照**，会被按「当前」读；`
      + '要么同步，要么改为指向门禁输出（`node tests/parity/verify-release-gate.mjs`）');
  }
  if (statedUnclosed !== null && statedUnclosed !== noGo.length) {
    fail(`该处写「未闭环 ${statedUnclosed} 项」（或**倒装**「${statedUnclosed} 项未闭环」），`
      + `而门禁**现算**为 ${noGo.length} 项 —— 同上：快照会漂`);
  }
  // 防空转：README 必须**真的**还带这类快照（否则本判据失去靶子）
  if (statedPassE === null && statedUnclosed === null) {
    fail('README.md 既没有 `PASS-E = N/M` 也没有「未闭环 N 项」—— 本判据失去靶子；'
      + '若确属**有意删除**（不再披露完成度），请**同步删除本节**并说明');
  }
  // canary ①（正样本）：合法样本必须能取到
  if (JSON.stringify(passEOf('PASS-E = 0/50')) !== JSON.stringify([0, 50])) {
    fail('⑨ canary 失效：`PASS-E = N/M` 合法样本取不到');
  }
  // canary ②：带后缀 / 加粗形态也要能取到（README 里是「未闭环 **9 项**」）
  if (unclosedOf('未闭环 **9 项**依然成立') !== 9) {
    fail('⑨ canary 失效：加粗形态「未闭环 **N 项**」取不到');
  }
  // canary ④：**倒装**形态也要能取到（活文档里 8 处，含 2 处带「当前状态真值源」标记的）
  if (unclosedOf('（**9 项未闭环 / `PASS-E = 0/50`**）') !== 9) {
    fail('⑨ canary 失效：倒装形态「N 项未闭环」取不到');
  }
  // canary ⑤（负样本）：倒装的不一致值也必须能取到（防「只取了正装」）
  if (unclosedOf('8 项未闭环') === noGo.length) {
    fail('⑨ canary 失效：倒装形态的不一致值未被识别');
  }
  // canary ③（负样本）：不一致必须能检出（谓词与判定共用 ⇒ 直接比对现算值）
  if (passEOf('PASS-E = 1/50')[0] === passECount) {
    fail('⑨ canary 失效：不一致的 PASS-E 未被识别（判据已退化成空真）');
  }
}

// ── ⑨b 凡**声称「当前状态」**的 `PASS-E` / 「未闭环 N 项」必须 == 门禁现算（2026-10-09，审计 §4.178）
// 【为什么】⑨ 只锁了 `README.md` **一份** —— 而「**当前状态真值源 = 门禁输出（… `PASS-E = M/K`、未闭环 N 项）**」
//   是一句**显式声称「当前」**的标记句，实测散在 **11 份 `docs/qualification/*`** 记录里
//   + **3 份活文档**（`packaging-release.md` / `master-plan` / `runtime-qualification-plan.md`），共 **14 处**。
//   ⚠️ ⑨ 的注释把它们笼统记作「**带日期的记录**」而豁免 —— 但「当前状态真值源」行**本身不带日期**
//   （带日期的是**紧邻上一行**的「快照声明」）⇒ 它**声称的是当前**，必须与门禁一致。
//   ⇒ 同族「只锁了一半」**第 7 次**（§4.170/§4.171/§4.172/§4.173/§4.176/§4.177/本节）。
// 【判据】凡含「当前状态真值源」**且能解析出** `PASS-E = M/K` 的行：M/K 必须 == 现算；
//   若同行含「N 项未闭环」或「未闭环 N 项」，N 也必须 == 现算。
//   ⚠️ 谓词用**显式标记**（不是「含 `PASS-E` 的行」）⇒ **不误伤带日期的历史**（轮次表 / 历史审计 / ADR）。
//   ⚠️ **排除审计日志本身**（`docs/qualification/release-blocker-audit-*.md`）：它的**职责是记录历史**，
//      与「声明当前」语义相反（§4.152：豁免**按职责**写、不按位置写）；且它是本判据的说明载体
//      （在它里面写出标记短语 ⇒ 会 self-hit）。
// ⚠️ 落位：必须在 `if (errors.length > 0)` **之前**（§4.175）。
{
  const CURRENT_MARK = '当前状态真值源';
  const AUDIT_LOG = /^docs\/qualification\/release-blocker-audit-.*\.md$/;
  const passEOfB = (s) => {
    const m = /PASS-E\s*=\s*(\d+)\s*\/\s*(\d+)/.exec(s);
    return m === null ? null : [Number(m[1]), Number(m[2])];
  };
  // 两种形态都要认：「未闭环 N 项」（README / 手册）与「N 项未闭环」（qualification 模板）
  const unclosedOfB = (s) => {
    let m = /未闭环\s*\**\s*(\d+)\s*项/.exec(s);
    if (m !== null) return Number(m[1]);
    m = /(\d+)\s*\**\s*项\s*未闭环/.exec(s);
    return m === null ? null : Number(m[1]);
  };
  const mdFilesB = (trackedFiles ?? []).filter((f) => f.endsWith('.md')
    && !f.startsWith('archive/') && !f.startsWith('docs/adr/') && !AUDIT_LOG.test(f));
  let claimedB = 0;
  const badB = [];
  for (const f of mdFilesB) {
    const lines = read(f).split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes(CURRENT_MARK)) continue;
      // ⚠️ 声明可能**跨行**（标记在上一行、数字在续行）—— 首版按**单行**取 ⇒ `packaging-release.md`
      //   （标记与数字分居两行）被**静默漏检**（注入验证 ② 未转红才抓到）。⇒ 窗口 = 标记行 + 紧邻下一行。
      const win = lines[i] + '\n' + (lines[i + 1] ?? '');
      const stated = passEOfB(win);
      if (stated === null) continue; // 只是**引用**该短语（说明文字）⇒ 不是声明
      claimedB += 1;
      if (stated[0] !== passECount || stated[1] !== totalItems) {
        badB.push(`${f}:${i + 1} 写「PASS-E = ${stated[0]}/${stated[1]}」，现算 ${passECount}/${totalItems}`);
      }
      const u = unclosedOfB(win);
      if (u !== null && u !== noGo.length) {
        badB.push(`${f}:${i + 1} 写「未闭环 ${u} 项」，现算 ${noGo.length} 项`);
      }
    }
  }
  if (claimedB < 10) {
    fail(`⑨b 只找到 ${claimedB} 处「${CURRENT_MARK}」声明（下限 10 = 2026-10-09 实测 14）—— 判据范围萎缩`);
  }
  if (badB.length > 0) {
    fail('⑨b 声称「当前状态」却与门禁**现算**不一致（无日期的数字会被按「当前」读）：' + badB.join('；'));
  }
  // canary ①（正样本）：标记行里的 `PASS-E = M/K` 必须能取到
  if (JSON.stringify(passEOfB(`${CURRENT_MARK} = 门禁（PASS-E = 0/50）`)) !== JSON.stringify([0, 50])) {
    fail('⑨b canary 失效：标记行里的 `PASS-E = M/K` 取不到');
  }
  // canary ②（正样本）：**两种**「未闭环」形态都要认
  if (unclosedOfB('未闭环 **9 项**') !== 9) fail('⑨b canary 失效：「未闭环 N 项」取不到');
  if (unclosedOfB('实测 **9 项未闭环** / PASS-E') !== 9) fail('⑨b canary 失效：「N 项未闭环」取不到');
  // canary ③（负样本）：不一致必须能检出（谓词与判定共用 ⇒ 直接比对现算值）
  if (passEOfB('PASS-E = 1/50')[0] === passECount) {
    fail('⑨b canary 失效：不一致的 PASS-E 未被识别（判据已退化成空真）');
  }
  // canary ④（负样本）：**不带标记**的历史行不得被纳入（否则会误伤轮次表 / 历史审计）
  if (AUDIT_LOG.test('docs/qualification/release-blocker-audit-2026-09-25.md') !== true
    || AUDIT_LOG.test('docs/qualification/real-desktop-execution-bundle.md') !== false) {
    fail('⑨b canary 失效：审计日志的排除谓词不精确（会误伤/漏掉）');
  }
  // canary ⑤（正样本）：**跨行**声明（标记行 + 续行）必须能取到
  //   —— 首版按**单行**取 ⇒ `packaging-release.md`（标记与数字分居两行）**静默漏检**（注入验证 ② 抓到）。
  if (JSON.stringify(passEOfB(`${CURRENT_MARK} = 门禁的输出**\n> （**PASS-E = 0/50**、未闭环 9 项）`))
    !== JSON.stringify([0, 50])) {
    fail('⑨b canary 失效：跨行声明取不到（窗口必须含紧邻下一行）');
  }
}

// ── ⑨c README 的「V1.0 门槛」数字必须 == `ADR-0020 §2` **现读**（2026-10-09，审计 §4.179）
// 【为什么】`README.md` 写着「「V1.0 正式发布」的门槛未变（ADR-0020 §2 未被取代）
//   = PRD P0 范围 + 发布评审 18 项验收全部通过（… UX Score ≥ 92 实测、30 任务效率 Gate …）」
//   （⚠️ 这两处**都没有加粗** —— 引用原文时如实引用。）
//   —— 这三个数字是**逐字抄自 `ADR-0020 §2`** 的**副本**，且**没有任何判据**：
//   · 判据 ⑨ / ⑨b 锁的是 `PASS-E` / 「未闭环 N 项」= **当前状态**；
//   · 状态行 ⇄ `release.yml` 的 `prerelease=` 锁的是**发布状态**；
//   · 而**门槛**（18 / 92 / 30）**无人守** ⇒ 若将来**新 ADR 取代 `ADR-0020 §2`**（ADR 只追加 ⇒
//     门槛变更必须新 ADR），README 会**静默漂**（同族「只锁了一半」**第 8 次**）。
// 【判据】**两侧都从文件现读**（任一侧写成常量 ⇒ 改那一侧不会红）：`ADR-0020 §2` 的三个门槛数字
//   必须 == `README.md` 里对应位置的数字；两侧都必须能现读（否则报「锚点漂移」）。
{
  const stripBold = (s) => s.replace(/\*\*/g, '');
  const gateOf = (s) => ({
    review: (/发布评审\s*(\d+)\s*项验收/.exec(s) ?? [])[1] ?? null,
    ux: (/UX Score\s*≥\s*(\d+)/.exec(s) ?? [])[1] ?? null,
    tasks: (/(\d+)\s*任务效率 Gate/.exec(s) ?? [])[1] ?? null,
  });
  const adrGate = gateOf(stripBold(read('docs/adr/ADR-0020-release-state-correction.md')));
  const readmeGate = gateOf(stripBold(read('README.md')));
  const GATE_KEYS = [['review', '发布评审 N 项验收'], ['ux', 'UX Score ≥ N'], ['tasks', 'N 任务效率 Gate']];
  for (const [side, g] of [['ADR-0020', adrGate], ['README.md', readmeGate]]) {
    for (const [k, label] of GATE_KEYS) {
      if (g[k] === null) {
        fail(`⑨c ${side} 的「V1.0 门槛」里读不到「${label}」—— 锚点漂移（判据不得静默跳过）`);
      }
    }
  }
  for (const [k, label] of GATE_KEYS) {
    if (adrGate[k] !== null && readmeGate[k] !== null && adrGate[k] !== readmeGate[k]) {
      fail(`⑨c 「${label}」两侧不一致：ADR-0020 §2 = ${adrGate[k]}，README.md = ${readmeGate[k]}`
        + ' —— README 是**副本**，必须与真值源一致（改门槛请走新 ADR 并同步 README）');
    }
  }
  // canary ①（正样本）：**加粗**形态经 stripBold 后必须能解析（**防御性** —— 两侧当前都无加粗，
  //   但有人给门槛加粗时判据不应失效）
  if (gateOf(stripBold('发布评审 **18 项**验收 + UX Score ≥ **92** + **30 任务**效率 Gate')).review !== '18') {
    fail('⑨c canary 失效：加粗形态「发布评审 **N 项**验收」取不到');
  }
  // canary ②（负样本）：不一致必须能检出（谓词与判定共用）
  if (gateOf('发布评审 20 项验收').review === gateOf('发布评审 18 项验收').review) {
    fail('⑨c canary 失效：不一致的门槛未被识别（判据已退化成空真）');
  }
  // canary ③（正样本）：**无空格**形态（ADR 写的是 `UX Score≥92`）也要能取到
  if (gateOf('UX Score≥92').ux !== '92') fail('⑨c canary 失效：`UX Score≥N`（无空格）取不到');
}

// ── ⑩ 判据的「落位」：抛错点之后不得再有断言（2026-10-09，审计 §4.175）────────
// 【判据】每个护栏的**最后一个抛错点**（`throw new Error(`）之后，**不得**出现行首的
//   `fail(` / `errors.push(`（= 语句级断言）—— 那些断言**永不判定**。
// 【为什么】本文件**同族已 3 次**：
//   ① 文件自己的注释记过（「首版把它写在 `if (errors.length > 0)` 之后…永远不会被判定」）；
//   ② §4.174 我新加的判据 ⑨（注入验证 3/3 全绿才发现）；
//   ③ **「A3 规则自检」canary 块**（2026-09-30 立起就一直在检查点之后 ⇒ **3 条 canary 从未运行**）。
//   ⇒ 静态阅读**看不出**（`fail` 在、`errors` 在、逻辑也对）⇒ 必须机械守。
// ⚠️ 谓词用**行首锚定**（语句级）：非锚定的 `errors.push(` 会命中**消息字符串里**的
//   「该怎么改」示例（实测 4 处 ⇒ 3 处是假阳性）。⚠️ 但示例**若整行开头**就会被误报 ⇒
//   判据自己与所有护栏的示例都必须**避免让示例独占一行**（本判据的示例用拼接构造）。
{
  // ⚠️ **必须有 `m` 标志**：首版漏了它 ⇒ `^` 只匹配**整个字符串的开头** ⇒ 谓词**永不命中**
  //   （而 canary ② 的样本**恰好从位置 0 开始**，所以没抓到 —— 注入验证才抓到）。
  //   ⇒ canary ② 的样本**故意不放在开头**，让「缺 `m`」必然被抓。
  const TAIL_ASSERT = new RegExp(`^[ \\t]*(${'fail'}\\(|errors\\.push\\()`, 'm');
  const guards10 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const offenders10 = [];
  let checked10 = 0;
  for (const f of guards10) {
    const src = read(`tests/parity/${f}`);
    // ⚠️ 2026-10-11（审计 §4.291）**扩面**：首版只把 **`throw new Error(`** 当检查点标记
    //   ⇒ **用 `process.exit(1)` 作检查点的护栏完全不在扫描面内**。实测 3 个护栏没有
    //   `throw new Error(`（`verify-context-menu-guard.mjs` / `verify-context-menu-parity.mjs` /
    //   `verify-parity-ledger.mjs`）—— 其中两个用 `process.exit(1)` 收口，**目前恰好干净，
    //   但没有任何护栏保证它们保持干净**（那正是本判据要守的性质）。
    //   ⇒ 标记集合扩成「`throw new Error(` **或** `process.exit(1)`」。
    const marks = [...src.matchAll(/throw new Error\(|process\.exit\(\s*1\s*\)/g)].map((m) => m.index);
    if (marks.length === 0) continue;
    checked10 += 1;
    const last = marks[marks.length - 1];
    const tail = src.slice(last);
    const hit = TAIL_ASSERT.exec(tail);
    if (hit !== null) {
      offenders10.push(`${f}（抛错点之后第 ${tail.slice(0, hit.index).split('\n').length} 行起）`);
    }
  }
  if (offenders10.length > 0) {
    fail(`这些护栏在**抛错点之后**还有断言（**永不判定**）：${offenders10.join('、')} —— `
      + '`fail()` / `errors.push()` 只是往数组塞字符串，而检查点已经过去；'
      + '把断言**上移到检查点之前**（本文件同族已 3 次）');
  }
  // 防空转：必须**真的**检查到了带检查点的护栏（否则判据已不覆盖任何文件）
  const CHECKPOINT_BASELINE = 23; // [覆盖型] 基线 23
  coverEq('带检查点的护栏数', checked10, CHECKPOINT_BASELINE,
    '判据范围萎缩会让本判据空转');
  // canary ①（正样本）：抛错点之后**没有**断言 ⇒ 不得报
  if (TAIL_ASSERT.test('console.log("done");')) {
    fail('⑩ canary 失效：无断言的尾部被误判');
  }
  // canary ②（负样本）：行首断言必须能检出（**拼接构造**，避免本判据命中自己）
  //   ⚠️ 样本**故意不放在位置 0**（前面垫一行）—— 否则「谓词缺 `m` 标志」会被掩盖（实测踩到）。
  if (!TAIL_ASSERT.test(`console.log('x');\n  ${'fail'}('y');`)) {
    fail('⑩ canary 失效：抛错点之后的行首断言未被检出（判据已退化成空真；**检查是否漏了 `m` 标志**）');
  }
  // canary ③（前提自检）：**非行首**的示例（消息字符串里）不得被误判
  if (TAIL_ASSERT.test(`  + '… if (!ok) ${'errors.push'}(msg); };'`)) {
    fail('⑩ canary 失效：消息字符串里的示例被误判为断言（行首锚定失效）');
  }
  // canary ④（2026-10-11 扩面）：**`process.exit(1)` 也必须是检查点标记**
  //   —— 否则「用 exit 收口的护栏」整类漏检（实测 2 个）。样本拼接构造。
  const EXIT_MARK = new RegExp(`throw new Error\\(|process\\.exit\\(\\s*1\\s*\\)`);
  if (!EXIT_MARK.test('if (errors.length > 0) { process.exit(1); }')
    || !EXIT_MARK.test('if (errors.length > 0) { throw new Error(`x`); }')) {
    fail('⑩ canary 失效：检查点标记未同时认 `throw new Error(` 与 `process.exit(1)`（扩面未生效）');
  }
}

// ⚠️ 它此前位于 `if (errors.length > 0)` **之后** ⇒ **3 条 canary 永不运行**
//   （`errors.push` 只是往数组塞字符串，而检查点已经过去了）—— **既有缺陷**，
//   现由**判据 ⑩**（「落位」判据）机械守住。
// 防止本规则被静默退回「AUTO 一律不阻断」：样本拼接构造，避免护栏检出自己。
{
  const AUTO = 'AUTO';
  const UX = 'ux-' + 'gate';
  if (isClosed({ status: AUTO, requiredEvidence: ['unit'] }) !== true) {
    errors.push('ADR-0024 A3 canary 失效：不含 ux-gate 的 AUTO 项应视为不阻断');
  }
  if (isClosed({ status: AUTO, requiredEvidence: ['unit', UX] }) !== false) {
    errors.push('ADR-0024 A3 canary 失效：含 ux-gate 的 AUTO 项**不得**视为已闭环');
  }
  if (isClosed({ status: 'PASS-E', requiredEvidence: [UX] }) !== true) {
    errors.push('ADR-0024 A3 canary 失效：PASS-E 项应视为已闭环');
  }
}

// ── ⑬ 每个护栏的**末条语句**必须是「自述输出」（2026-10-10，审计 §4.269 后续）──────────────
// 【为什么】§4.269 落新判据时，我**用新块替换掉了** `verify-runtime-qualification-workflow.mjs`
//   末尾的自述行（`console.log('Runtime Qualification embeds frontendDist …')`）——
//   **没有任何判据因此变红**（该护栏照样退出 0）。⇒ 「每个护栏跑一次就能自报它查了什么」
//   这条约定**无人守**（「明文规则 ≠ 有人守」）。⚠️ **约束只写在注释里就不算约束** ⇒ 机械守。
// 【判据】取每个 `verify-*.mjs` 里**最后**一次 `console.log(` / `process.stdout.write(`，
//   用**括号配平**（跳过注释 / 字符串 / 模板字面量）找它的结束位置；要求其后只剩空白 / 注释 / 一个 `;`。
//   ⚠️ **不能按行判断**：实测 **15/23** 个护栏的自述输出是**多行模板字面量**（续行以 `}` 或 `+` 开头）
//     ⇒ 朴素「最后一行以 `console.log(` 开头」会误报 15 个（本轮实测）。
{
  // 样本**拼接构造**：避免本判据的样本被自己（或 ⑩）当成真的调用点命中。
  const SELF_OUT = ['console' + '.log(', 'process' + '.stdout.write('];
  const THROW = 'throw new ' + 'Error(';
  // 从 `(` 起配平，返回匹配 `)` 的下标（跳过注释 / 单双引号 / 模板字面量含 `${}` 嵌套）
  const matchParen = (src, start) => {
    let depth = 0;
    let i = start;
    while (i < src.length) {
      const c = src[i];
      const c2 = src[i + 1];
      if (c === '/' && c2 === '/') { const j = src.indexOf('\n', i); i = j === -1 ? src.length : j; continue; }
      if (c === '/' && c2 === '*') { const j = src.indexOf('*/', i + 2); i = j === -1 ? src.length : j + 2; continue; }
      if (c === "'" || c === '"') {
        i += 1;
        while (i < src.length && src[i] !== c) { if (src[i] === '\\') i += 1; i += 1; }
        i += 1;
        continue;
      }
      if (c === '`') {
        i += 1;
        let nest = 0;
        while (i < src.length) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '$' && src[i + 1] === '{') { nest += 1; i += 2; continue; }
          if (src[i] === '}' && nest > 0) { nest -= 1; i += 1; continue; }
          if (src[i] === '`' && nest === 0) break;
          i += 1;
        }
        i += 1;
        continue;
      }
      if (c === '(') { depth += 1; i += 1; continue; }
      if (c === ')') { depth -= 1; i += 1; if (depth === 0) return i; continue; }
      i += 1;
    }
    return -1;
  };
  // 从 `from` 起是否只剩空白 / 一个 `;` / 注释
  const tailIsBlank = (src, from) => {
    let i = from;
    while (i < src.length) {
      const c = src[i];
      const c2 = src[i + 1];
      if (/\s/.test(c) || c === ';') { i += 1; continue; }
      if (c === '/' && c2 === '/') { const j = src.indexOf('\n', i); i = j === -1 ? src.length : j; continue; }
      if (c === '/' && c2 === '*') { const j = src.indexOf('*/', i + 2); i = j === -1 ? src.length : j + 2; continue; }
      return false;
    }
    return true;
  };
  const isSelfDescribing = (src) => {
    let at = -1;
    let parenAt = -1;
    for (const anchor of SELF_OUT) {
      const k = src.lastIndexOf(anchor);
      if (k > at) { at = k; parenAt = k + anchor.length - 1; }
    }
    if (at === -1) return false;
    const close = matchParen(src, parenAt);
    return close !== -1 && tailIsBlank(src, close + 1);
  };

  const guards13 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const offenders13 = guards13.filter((f) => !isSelfDescribing(read(`tests/parity/${f}`)));
  if (offenders13.length > 0) {
    fail(`这些护栏的**末条语句不是自述输出**（跑一次无法自报它查了什么）：${offenders13.join('、')} —— `
      + '自述行必须留在文件**末尾**；**新增判据块时不要把已有的自述行替换掉**'
      + '（审计 §4.269 实测发生过一次，且当时没有任何判据变红）');
  }
  // 防空转：**覆盖型**（下限 = 立此判据时的基线；新护栏加入时须一并上调）
  const GUARD_BASELINE = 23; // [覆盖型] 基线 23
  coverEq('verify-*.mjs 护栏数', guards13.length, GUARD_BASELINE,
    '扫描面萎缩会让本判据空转');
  // canary ① 正样本：多行模板字面量 + 尾随注释 / `;` ⇒ 不得报
  if (!isSelfDescribing(`const a = 1;\n${'console'}.log(\`line1\n} line2\`);\n// trailing note\n`)) {
    fail('⑬ canary 失效：正常的自述输出（多行模板 + 尾随注释）未被识别');
  }
  // canary ② 负样本：自述输出**之后还有语句** ⇒ 必须报
  if (isSelfDescribing(`${'console'}.log('done');\nconst a = 1;`)) {
    fail('⑬ canary 失效：自述输出之后**还有语句**却未检出');
  }
  // canary ③ 负样本：完全没有自述输出 ⇒ 必须报
  if (isSelfDescribing(`const a = 1;\n${THROW}"x");`)) {
    fail('⑬ canary 失效：没有任何自述输出的文件未被检出');
  }
}

// ── ⑭ 「就地突变仓库文件」的工具：自愈锁**不得落在仓库之外**（2026-10-10，审计 §4.273）──
// 【为什么】`tests/parity/tools/audit-guard-bounds.mjs` 用「把下限抬 1 再跑护栏」的办法普查下限是否过松 ——
//   它**就地改写护栏源码**，靠 `git checkout --` 兜底还原。`finally` 与信号处理器**都救不了 SIGKILL**，
//   所以它另有一道**锁文件**：突变前把目标文件写进锁，**下次启动时先清理**（`git checkout --` 幂等）。
//   ⚠️ **锁原本落在 `os.tmpdir()`** —— 在 macOS 上是 `/var/folders/…/T/`，**随重启 / 系统定期清理而消失**
//     （换机、改 `TMPDIR` 也会丢）。⇒ 锁一丢，残留突变**再也无人还原**；而「工作区必须干净」的前置检查
//     会让工具**拒绝运行** ⇒ **自愈机制失效**（正是该文件自己注释里警告过的失败模式，从另一条路径复现）。
//   ✅ **实测复现**（本轮）：手工造一处残留突变 + 删掉 `/tmp` 锁 ⇒ 工具报「拒绝运行：工作区不干净」，
//     残留**永久留下**。而残留是「阈值抬 1」⇒ **护栏照样全绿** ⇒ **可能被直接提交**（一次静默改判据）。
//   ✅ **已结构性修复**：锁改落在 `<git-dir>/mellow-audit-guard-bounds.lock`（不进版本库、不被系统清理、
//     随仓库存在）+ 保留对旧 `/tmp` 锁的兼容清理 + 还原后**校验**并显式报错。
// 【判据】**具名登记 + 双向**（本仓惯用法）：
//   ① **候选发现**：`tests/parity/tools/*.mjs` 与 `tools/*.mjs` 里**同时**出现 `writeFileSync(` 与
//      `checkout` 的文件 = 「疑似就地突变」；
//   ② 每个候选必须登记进 `IN_PLACE_MUTATORS`（受**三条安全前提**约束）**或** `IN_PLACE_MUTATORS_EXEMPT`
//      （写明「为什么它不是就地突变」）；
//   ③ 两张表**双向**：登记项的文件必须存在，且**必须仍在候选集合里**（否则是过期登记）；
//   ④ 受约束的每个必须满足三条安全前提：
//      · 自愈锁**不得落在仓库之外** —— 源码里**不得**出现 `tmpdir(`；
//      · 有「工作区必须干净」的**机器可读**前置检查 —— 必须出现 `--porcelain`；
//      · 还原走 `git checkout --`（而不是内存副本）—— 必须出现 `checkout`。
//   ⚠️ **如实声明：这是「代理」** —— 它判的是**实现形态**，不是行为（真验证 = 有人真跑那个工具）。
//     形态判据的价值在于：**这三条正是「安全前提」，而它们的失效是静默的**（本轮实测：失效后
//     护栏全绿、只有 `git status` 能看出来）。
{
  const TOOL_DIRS = ['tests/parity/tools', 'tools'];
  // 受三条安全前提约束的：**会就地突变仓库文件**（写别人的文件 + 靠 git 还原）
  const IN_PLACE_MUTATORS = new Map([
    ['tests/parity/tools/audit-guard-bounds.mjs',
      '把下限抬 1 再跑护栏 —— **就地改写护栏源码**，靠 `git checkout --` 还原 + 自愈锁'],
  ]);
  // 候选里**不是**就地突变的（写明理由；双向：理由失效即报错）
  // ⚠️ **刻意为空**（2026-10-10）：首版谓词用裸子串 `checkout` ⇒ `tools/gen-upstream-manifest.mjs`
  //   被**误报**为候选（它只在注释/消息里出现该词），当时为它登记了一条例外。
  //   谓词收窄成「**带引号的实参** `'checkout'`」后它不再命中 ⇒ **例外随之删除**（双向检查抓到的）。
  //   ⚠️ 本表**不因空而删** —— 将来若有「疑似但确非」的工具，登记处就在这。
  const IN_PLACE_MUTATORS_EXEMPT = new Map();
  const candidates = [];
  /** 去掉 `//` 行注释与 `/* … *\/` 块注释（块注释**保留换行数**）——
   *  ⚠️ 「源码里有没有 X」**必须排除注释**，否则「注释里提到」会被当成「代码里有」。
   *  实测（本判据首版）：`tmpdir(` 只出现在**注释里**（解释「曾经落在 os.tmpdir()」）⇒ 判据**命中自己**。
   *  ⚠️ **还必须排除「消息字符串里的提及」** —— 首版用裸子串判 `--porcelain`，
   *  而工具末尾有一句 `console.log('… git status --porcelain')` ⇒ 把**真的**前置检查删掉后
   *  判据照样绿（注入 B **未抓**，实测）。⇒ 一律用**带引号的实参形态**（`'--porcelain'`）。 */
  const stripComments = (src) => src
    // ⚠️ 剥块注释**必须字符串感知**（审计 §4.296）：朴素 `replace(/\/\*[\s\S]*?\*\//g, …)` 会把**行注释里**的
    //   `/*`（glob `packages/**`）与**字符串 / 正则字面量里**的 `/*`（`'/*'`）当注释起始，**一路吃掉真实代码**
    //   （实测 68 文件 / 247 段）⇒ **假阴性、无人知**。故保留分支必须含「字符串 / 模板 / 行注释 / 正则字面量」。
    .replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|(?!\*\/)[^/\\\n])+?\/[a-z]*)|(\/\*[\s\S]*?\*\/)/g,
      (m, keep) => (keep === undefined ? m.replace(/[^\n]/g, ' ') : keep))
    .replace(/\/\/[^\n]*/g, '');
  const hasQuoted = (src, tok) => src.includes(`'${tok}'`) || src.includes(`"${tok}"`);
  for (const dir of TOOL_DIRS) {
    const abs = resolve(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (!name.endsWith('.mjs')) continue;
      const rel = `${dir}/${name}`;
      const src = stripComments(readFileSync(resolve(root, rel), 'utf8'));
      if (src.includes('writeFileSync(') && hasQuoted(src, 'checkout')) candidates.push(rel);
    }
  }
  const unregistered = candidates.filter(
    (c) => !IN_PLACE_MUTATORS.has(c) && !IN_PLACE_MUTATORS_EXEMPT.has(c),
  );
  if (unregistered.length > 0) {
    fail(`这些工具**疑似就地突变仓库文件**（同时出现 \`writeFileSync(\` 与 \`checkout\`），但**未登记**：`
      + `${unregistered.join('、')} —— 请登记进 IN_PLACE_MUTATORS（它必须满足三条安全前提）`
      + '或 IN_PLACE_MUTATORS_EXEMPT（写明为什么它不是就地突变）');
  }
  for (const [rel, why] of IN_PLACE_MUTATORS) {
    if (!existsSync(resolve(root, rel))) { fail(`IN_PLACE_MUTATORS 登记了 \`${rel}\`，但**该文件不存在**`); continue; }
    if (!candidates.includes(rel)) {
      fail(`IN_PLACE_MUTATORS 登记了 \`${rel}\`，但它**已不再是候选**（不再同时出现 writeFileSync 与 checkout）`
        + ` —— 登记过期，请复核（原理由：${why}）`);
    }
    const src = stripComments(readFileSync(resolve(root, rel), 'utf8'));
    if (src.includes('tmpdir(')) {
      fail(`${rel} 是「就地突变仓库文件」的工具，但它的自愈锁落在**仓库之外**（用了 \`os.tmpdir()\`）—— `
        + '系统临时目录**随重启 / 定期清理而消失**（换机、改 TMPDIR 也会丢）⇒ 锁一丢，'
        + '被 SIGKILL 留下的突变**再也无人还原**，而工具会因「工作区不干净」**拒绝运行**（自愈失效）；'
        + '残留的突变是「阈值抬 1」⇒ **护栏照样全绿** ⇒ 可能被直接提交。'
        + '锁必须落在 `<git-dir>/` 下（不进版本库、不被系统清理）');
    }
    if (!hasQuoted(src, '--porcelain')) {
      fail(`${rel} 是「就地突变仓库文件」的工具，但没有「工作区必须干净」的**机器可读**前置检查`
        + '（缺 `\'--porcelain\'` 这一**实参**）—— 没有它，工具会去改一个已经脏的工作区，'
        + '残留突变将与开发者的真实改动**无法区分**'
        + '（⚠️ 只把 `--porcelain` 写在**消息字符串**里不算 —— 本判据首版就是这么被骗过的）');
    }
  }
  for (const [rel, why] of IN_PLACE_MUTATORS_EXEMPT) {
    if (!existsSync(resolve(root, rel))) { fail(`IN_PLACE_MUTATORS_EXEMPT 登记了 \`${rel}\`，但**该文件不存在**`); continue; }
    if (!candidates.includes(rel)) {
      fail(`IN_PLACE_MUTATORS_EXEMPT 为 \`${rel}\` 登记了「不是就地突变」，但它**已不在候选里** —— `
        + `请删除该例外（原理由：${why}）`);
    }
  }
  // 防空转：**覆盖型**（下限 = 立此判据时的基线；新增突变型工具时须一并上调）
  const MUTATION_TOOL_BASELINE = 1; // [覆盖型] 基线 1
  coverEq('IN_PLACE_MUTATORS 登记项数', IN_PLACE_MUTATORS.size, MUTATION_TOOL_BASELINE,
    '登记表被删空会让本判据**空转**');
  // canary：三向（与判定**共用**同一个「疑似就地突变」谓词；样本运行时拼接）
  const looksMutating = (s) => s.includes('writeFileSync(') && hasQuoted(stripComments(s), 'checkout');
  if (!looksMutating(`const a=1; ${'writeFileSync'}('x'); git(['${'checkout'}']);`)) {
    fail('⑭ canary 失效：一个**确实**就地突变的样本未被识别为候选');
  }
  if (looksMutating('const a = 1; // 只是读文件')) {
    fail('⑭ canary **过宽**：只读的工具被误判为候选');
  }
  if (IN_PLACE_MUTATORS.size < 1) {
    fail('⑭ canary 失效：IN_PLACE_MUTATORS 被清空（登记机制本身失效）');
  }
  console.log(`Release gate: 就地突变工具候选 ${candidates.length} 个 —— 受约束 ${IN_PLACE_MUTATORS.size} 个`
    + `**安全前提齐备**（锁在仓库内 / 有干净前置检查 / 走 \`git checkout --\` 还原）`
    + `；已登记非突变 ${IN_PLACE_MUTATORS_EXEMPT.size} 个（⚠️ 代理判据，不替代真跑）`);
}

// ── ⑮ 每个 CI job 必须有**超时边界** `timeout-minutes`（2026-10-10，审计 §4.276）──────────────
// 【为什么】GitHub 的默认 job 超时是 **360 min** ⇒ 一个**卡住**的 job 要 **6 小时**才被发现。
//   而本仓三个 workflow 里**只有一个**做了这件事：`runtime-qualification.yml` 三个 job 都有
//   `timeout-minutes: 45`，而 `ci.yml`（8 个 job）与 `release.yml`（5 个 job）**一个都没有**
//   ⇒ 同类配置在 3 个文件里只做了 1 个（本仓「只锁了一半」的又一形态）。
//   ⚠️ `release.yml` 尤其要紧：它的 `concurrency.cancel-in-progress: false`（对外，取消会留半成品）
//     ⇒ 卡住的 job **不会**被下一次推送取消，会把发布管线堵满 6 小时。
// 【判据】每个 `.github/workflows/*.yml` 的**每个 job** 必须有 `timeout-minutes`，
//   且必须是 **1–180** 的整数（⚠️ ≥ 360 等于 GitHub 默认值 ⇒ **等于没设**）。
//   ⚠️ **按行结构读**（不引 `js-yaml`：那会在护栏里引入新的裸依赖，被 C6 抓；且 pnpm 隔离下
//     根目录解析不到它）。形态按本仓约定：`jobs:` 之下的 job 名是 **2 空格**缩进，
//     job 级键（`runs-on` / `timeout-minutes` …）是 **4 空格**缩进。
//   ⚠️ **如实声明**：这是**结构判据**，只锁「有没有设、设得合不合理」；
//     **「改流水线本机验不了行为」** ⇒ 不得声称「超时已生效」（那要等一次真跑）。
{
  const WF_DIR = '.github/workflows';
  const JOB_HEAD = /^ {2}([A-Za-z0-9_-]+):\s*$/;
  const TIMEOUT = /^ {4}timeout-minutes:\s*(\d+)\s*$/;
  const MIN_TIMEOUT = 1;
  const MAX_TIMEOUT = 180;
  /** 判定（与 canary **共用**；纯函数 —— 只吃文本，**不碰文件系统**，见 PITFALLS §4.395）。 */
  const jobsOf = (text) => {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
    if (start < 0) return null; // 没有 jobs: 段
    const out = [];
    let cur = null;
    const flush = () => { if (cur !== null) out.push(cur); };
    for (let i = start + 1; i < lines.length; i += 1) {
      const m = JOB_HEAD.exec(lines[i]);
      if (m !== null) { flush(); cur = { name: m[1], timeout: null }; continue; }
      const t = TIMEOUT.exec(lines[i]);
      if (t !== null && cur !== null) cur.timeout = Number(t[1]);
    }
    flush();
    return out;
  };
  const wfFiles = existsSync(resolve(root, WF_DIR))
    ? readdirSync(resolve(root, WF_DIR)).filter((f) => /\.ya?ml$/.test(f)).sort()
    : [];
  let jobCount = 0;
  for (const f of wfFiles) {
    const jobs = jobsOf(read(`.github/workflows/${f}`));
    if (jobs === null) { fail(`${WF_DIR}/${f} 里找不到 \`jobs:\` 段 —— 判据锚点漂移`); continue; }
    jobCount += jobs.length;
    for (const j of jobs) {
      if (j.timeout === null) {
        fail(`${WF_DIR}/${f} 的 job \`${j.name}\` **没有 \`timeout-minutes\`** —— GitHub 默认 **360 min**`
          + ' ⇒ 卡住时要 **6 小时**才发现（`release.yml` 的 `cancel-in-progress: false` ⇒ 不会被下次推送取消）。'
          + '请按**实测耗时**的数倍设一个边界（本仓先例：`runtime-qualification.yml` 三个 job 都是 45）');
      } else if (j.timeout < MIN_TIMEOUT || j.timeout > MAX_TIMEOUT) {
        fail(`${WF_DIR}/${f} 的 job \`${j.name}\` 的 \`timeout-minutes: ${j.timeout}\` 不在 ${MIN_TIMEOUT}–${MAX_TIMEOUT}`
          + ' —— ⚠️ **≥ 360 等于 GitHub 默认值 ⇒ 等于没设**；请按实测耗时设一个有意义的边界');
      }
    }
  }
  // 防空转：**覆盖型**（下限 = 立此判据时的基线；加 workflow / job 时须一并上调）
  const JOB_BASELINE = 16; // [覆盖型] 基线 16
  coverEq('三个 workflow 里的 job 数', jobCount, JOB_BASELINE,
    '谓词或扫描面漂移会让本判据**空转**');
  // canary：四向（与判定**共用** jobsOf）
  const OK_WF = `jobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 30\n`;
  const NO_WF = `jobs:\n  a:\n    runs-on: ubuntu-latest\n`;
  if (jobsOf(OK_WF)?.[0]?.timeout !== 30) {
    fail('⑮ canary 失效：合法样本的 `timeout-minutes` 未被解析出');
  }
  if (jobsOf(NO_WF)?.[0]?.timeout !== null) {
    fail('⑮ canary 失效：**缺** `timeout-minutes` 的 job 未被判为 null');
  }
  if (jobsOf(OK_WF)?.length !== 1 || jobsOf(`${OK_WF}  b:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n`)?.length !== 2) {
    fail('⑮ canary 失效：job 切分不对（多 job 被并成一个）');
  }
  if (jobsOf(`on:\n  push:\n    branches: [main]\n`)?.[0] !== undefined) {
    fail('⑮ canary **过宽**：`on:` 段的子键被当成了 job（必须只在 `jobs:` 之下找）');
  }
  console.log(`Release gate: ${wfFiles.length} 个 workflow / ${jobCount} 个 job —— **均有超时边界**`
    + `（${MIN_TIMEOUT}–${MAX_TIMEOUT} min；⚠️ 结构判据，行为需等一次真跑）`);
}

// ── ⑯ 每个 workflow 必须**显式声明** `permissions:`（2026-10-10，审计 §4.277）──────────────
// 【为什么】不写 `permissions:` 时，该 workflow 的有效 token 权限由**仓库设置**
//   `default_workflow_permissions` 决定 —— 那**不在仓库里**、**无法审计**。
//   实测：三个 workflow 里 **`release.yml`（write）与 `runtime-qualification.yml`（read）都写了**，
//   而 **`ci.yml` 没写** ⇒ 同类配置 2/3，且**唯一那个的有效权限依赖仓库外的状态**。
//   ✅ **实测（`gh api repos/<owner>/<repo>/actions/permissions/workflow`）**：本仓当前该设置是
//     **`read`** ⇒ **今天没有安全缺口**；但换个仓库 / 有人改了那个设置 ⇒ `ci.yml` 会**静默**获得写权限。
//   ⇒ 判据把「有效权限」拉回**仓库内可审**。
// 【判据】每个 `.github/workflows/*.yml`：
//   ① 必须有**顶层** `permissions:`（标量 `read-all`/`write-all` 或具名映射都算「有」）；
//   ② 具名映射里**除 `contents` 外不得有 `write`** —— 本仓只需要 `contents: write`（发版）。
//   ⚠️ **按行结构读**（顶层键在第 0 列、其下条目 2 空格缩进）；**不引 `js-yaml`**（见判据 ⑮ 的同一理由）。
//   ⚠️ **如实声明**：这是**结构判据**；「改流水线本机验不了行为」⇒ 只能验「YAML 实解 + 结构」。
{
  const WF_DIR = '.github/workflows';
  const PERM_HEAD = /^permissions:\s*$/;
  const PERM_SCALAR = /^permissions:\s*(\S+)\s*$/;
  const PERM_ITEM = /^ {2}([a-z-]+):\s*(\S+)\s*$/;
  /** 判定（与 canary **共用**；纯函数，不碰文件系统）。返回 null = **没有**顶层 permissions。 */
  const permissionsOf = (text) => {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const scalar = PERM_SCALAR.exec(lines[i]);
      if (scalar !== null) return { scalar: scalar[1], scopes: {} };
      if (PERM_HEAD.test(lines[i])) {
        const scopes = {};
        for (let j = i + 1; j < lines.length; j += 1) {
          if (lines[j].trim() === '' || /^\s*#/.test(lines[j])) continue;
          const item = PERM_ITEM.exec(lines[j]);
          if (item === null) break; // 缩进变了 ⇒ 块结束
          scopes[item[1]] = item[2];
        }
        return { scalar: null, scopes };
      }
    }
    return null;
  };
  const wfFiles = existsSync(resolve(root, WF_DIR))
    ? readdirSync(resolve(root, WF_DIR)).filter((f) => /\.ya?ml$/.test(f)).sort()
    : [];
  for (const f of wfFiles) {
    const p = permissionsOf(read(`.github/workflows/${f}`));
    if (p === null) {
      fail(`${WF_DIR}/${f} **没有顶层 \`permissions:\`** —— 不写它时，该 workflow 的有效 token 权限`
        + '由**仓库设置** `default_workflow_permissions` 决定，而那**不在仓库里、无法审计**。'
        + '请显式声明（本仓先例：`release.yml` = `contents: write`、'
        + '`runtime-qualification.yml` = `contents: read`）');
      continue;
    }
    if (p.scalar === 'write-all') {
      fail(`${WF_DIR}/${f} 声明了 \`permissions: write-all\` —— 过宽（本仓只需要 \`contents: write\`）`);
    }
    for (const [scope, val] of Object.entries(p.scopes)) {
      if (val === 'write' && scope !== 'contents') {
        fail(`${WF_DIR}/${f} 给 \`${scope}\` 声明了 **write** —— 本仓只需要 \`contents: write\`（发版）；`
          + '其它 scope 的写权限属过宽（最小权限原则）');
      }
    }
  }
  // 防空转：**覆盖型**（下限 = 立此判据时的基线；加 workflow 时须一并上调）
  const WF_PERM_BASELINE = 3; // [覆盖型] 基线 3
  coverEq('workflow 文件数', wfFiles.length, WF_PERM_BASELINE,
    '扫描面萎缩会让本判据**空转**');
  // canary：四向（与判定**共用** permissionsOf）
  if (permissionsOf(`permissions:\n  contents: read\n`)?.scopes?.contents !== 'read') {
    fail('⑯ canary 失效：具名映射形态的 `permissions` 未被解析出');
  }
  if (permissionsOf(`permissions: read-all\n`)?.scalar !== 'read-all') {
    fail('⑯ canary 失效：标量形态 `permissions: read-all` 未被识别为「有声明」');
  }
  if (permissionsOf(`name: X\non:\n  push:\n`) !== null) {
    fail('⑯ canary 失效：**没有** `permissions:` 的样本未被判为 null');
  }
  if (permissionsOf(`permissions:\n  contents: read\n\njobs:\n`)?.scopes?.jobs !== undefined) {
    fail('⑯ canary **过宽**：`permissions` 块之后的顶层键被当成了 scope');
  }
  console.log(`Release gate: ${wfFiles.length} 个 workflow —— 均**显式声明 token 权限**`
    + '（本仓只需 `contents: write` 用于发版；⚠️ 结构判据，行为需等一次真跑）');
}

// ── ⑰ **每个**被跟踪文件的换行符属性必须与「它是不是二进制」一致（2026-10-10，审计 §4.279 / §4.280）──
// 【为什么】`.gitattributes` 的注释自己写着「二进制：**显式**标注（不依赖 `text=auto` 的内容探测）
//   —— 让政策可读，也避免探测边界上的意外」。但实测：**3 个被跟踪的 `.jpeg`** 的内容含 NUL
//   （= git 自己的二进制启发式会判为二进制），而 `git check-attr text` 返回 **`auto`**
//   ⇒ 它们**没有**被显式声明 ⇒ 与那句注释**不符**。
//   ⚠️ **后果**：`text=auto` 会**自动探测**，所以这些文件**当前是安全的**；但「探测」只在
//     **前 8000 字节含 NUL** 时判为二进制 —— 一个**恰好不含 NUL** 的二进制会被当成文本
//     ⇒ 在检出时被 `eol=lf` **改写 CRLF** ⇒ **静默损坏**。显式声明的价值正是「不依赖探测边界」。
// 【判据】**两半都要锁**（2026-10-10 审计 §4.280 扩面 —— 首版**只锁了二进制那一半**）：
//   · **二进制类**（前 8000 字节含 NUL）⇒ `git check-attr text` 必须 **`unset`**；
//   · **文本类**（无 NUL）⇒ `text` 必须 **`auto`** 且 `eol` 必须 **`lf`**。
//   ⇒ 合起来 = **全部被跟踪文件**（立此判据时 1069 个）都落在判据里 —— 不再是「一半」。
//   ⚠️ 用 **git 自己的谓词**（`git check-attr --stdin text eol`，批量一次调用）
//     + **git 自己的启发式**（8000 字节内找 NUL）⇒ 无需维护扩展名清单。
//   ⚠️ **不改任何文件内容** —— 只补 `.gitattributes` 的声明（立此判据时已补 `*.jpeg`）。
{
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const NUL_WINDOW = 8000;
  /** 判定（与 canary **共用**）：前 8000 字节是否含 NUL。 */
  const hasNul = (abs) => {
    let fd = null;
    try {
      fd = openSync(abs, 'r');
      const buf = Buffer.alloc(NUL_WINDOW);
      const n = readSync(fd, buf, 0, NUL_WINDOW, 0);
      return buf.subarray(0, n).includes(0);
    } catch { return false; } finally { if (fd !== null) closeSync(fd); }
  };
  const binFiles = tracked.filter((f) => hasNul(resolve(root, f)));
  const textFiles = tracked.filter((f) => !hasNul(resolve(root, f)));
  const attrs = new Map(); // path → { text, eol }
  if (tracked.length > 0) {
    const out = execFileSync('git', ['check-attr', '--stdin', 'text', 'eol'],
      { cwd: root, input: tracked.join('\n'), encoding: 'utf8' });
    for (const line of out.split('\n').filter(Boolean)) {
      const m = /^(.*): (text|eol): (.*)$/.exec(line);
      if (m === null) continue;
      if (!attrs.has(m[1])) attrs.set(m[1], {});
      attrs.get(m[1])[m[2]] = m[3];
    }
  }
  const binBad = [];
  for (const f of binFiles) {
    if (attrs.get(f)?.text !== 'unset') binBad.push(`${f} → \`text: ${attrs.get(f)?.text}\``);
  }
  if (binBad.length > 0) {
    fail(`这些**被跟踪**文件的内容含 NUL（git 会判为二进制），但没有被 \`.gitattributes\` **显式**声明为 binary：`
      + `${binBad.join('、')} —— \`.gitattributes\` 的注释自己写着「**显式**标注（**不依赖** \`text=auto\` 的内容探测）」。`
      + '⚠️ 探测只在**前 8000 字节含 NUL** 时判为二进制 ⇒ 一个**恰好不含 NUL** 的二进制会被当成文本，'
      + '在检出时被 `eol=lf` **改写 CRLF** ⇒ **静默损坏**。请按扩展名补一条 `binary` 规则（放在 `*` 规则**之后**）');
  }
  const textBad = [];
  for (const f of textFiles) {
    const a = attrs.get(f) ?? {};
    if (a.text !== 'auto' || a.eol !== 'lf') textBad.push(`${f} → \`text: ${a.text}\` / \`eol: ${a.eol}\``);
  }
  if (textBad.length > 0) {
    fail(`这些**被跟踪**文件没有 NUL（git 会判为文本），但换行符属性不是 \`text: auto\` + \`eol: lf\`：`
      + `${textBad.slice(0, 10).join('、')}${textBad.length > 10 ? ` …（共 ${textBad.length} 处）` : ''}`
      + ' —— `.gitattributes` 的换行符政策是「检出时一律写 LF」；'
      + '属性不符会让**同一份代码在不同平台上检出不同**（本仓已因 CRLF 出过一次真实事故：审计 §4.252）');
  }
  // 防空转：**覆盖型**（下限 = 立此判据时的基线；文件增删时须一并复核）
  const NUL_BASELINE = 84; // [覆盖型] 基线 84
  coverEq('二进制（前 ${NUL_WINDOW} 字节含 NUL）文件数', binFiles.length, NUL_BASELINE,
    '扫描面或启发式漂移会让本判据**空转**');
  // ⚠️ **本条是 `[健康度型]`，不是 `[覆盖型]`**（2026-10-11，审计 §4.310 修正）：
  //   集合由 `git ls-files` **内容产生**，且**随正常开发频繁增长**（实测 985 → 988）⇒
  //   「阈值 == 当前值」**不可行**（每加一个文本文件都要改基线）。它的用途只是
  //   「**扫描面失效时别空转**」= 健康度型语义 ⇒ **留余量**。
  const TEXT_BASELINE = 900; // [健康度型] 下限 900（当前 988）
  if (textFiles.length < TEXT_BASELINE) {
    fail(`只找到 ${textFiles.length} 个「无 NUL」的被跟踪文件（[健康度型] 下限 ${TEXT_BASELINE}）`
      + ' —— 扫描面漂移会让本判据的**文本那一半**空转（⚠️ 集合随正常开发增长 ⇒ 是**健康度型**，'
      + '留余量是设计意图；不要把它改成 `[覆盖型]` 的 `coverEq`，那会让每次加文件都红）');
  }
  // canary：四向（与判定**共用** hasNul；样本用**临时文件**构造）
  const tmpA = join(tmpdir(), `mellow-nul-canary-${process.pid}-a`);
  const tmpB = join(tmpdir(), `mellow-nul-canary-${process.pid}-b`);
  writeFileSync(tmpA, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
  writeFileSync(tmpB, Buffer.from('plain text, no nul here\n'));
  if (!hasNul(tmpA)) fail('⑰ canary 失效：含 NUL 的样本未被判为二进制');
  if (hasNul(tmpB)) fail('⑰ canary **过宽**：纯文本样本被判为二进制');
  rmSync(tmpA, { force: true });
  rmSync(tmpB, { force: true });
  if (binFiles.length + textFiles.length !== tracked.length) {
    fail('⑰ canary 失效：两类之和 ≠ 被跟踪文件数（分诊有遗漏）');
  }
  console.log(`Release gate: 换行符属性 —— **全部 ${tracked.length} 个**被跟踪文件已分诊：`
    + `二进制 ${binFiles.length} 个（\`text: unset\`）/ 文本 ${textFiles.length} 个（\`text: auto\` + \`eol: lf\`）`);
}

// ── ⑱ CI action 的**运行时**必须登记，且不得退回已被 runner 移除的运行时（2026-10-10，审计 §4.283）──
// 【为什么】判据 ⑯ 锁的 `.nvmrc` 只管 **job 里跑的 Node**；action **自己声明的运行时**
//   （`action.yml` 的 `runs.using`）是**第二条完全独立的轴**，此前**没有任何登记处**。
//   实测：本仓 5 个 action 停在 `node20`，而 runner 已于 **2026-09-23 移除 Node 20**
//   （GitHub changelog「Deprecation of Node 20 on GitHub Actions runners」，2026-08-25 更新删除日期）
//   ⇒ 它们一直在**未声明支持的运行时**上被强制运行。CI run 38035994927 里有 36 条
//   `Node.js 20 is deprecated` 就是现场证据。
//   ⚠️ 同一条轴**此前查过**，但当时只问了「各 job 之间的 `@vN` **一不一致**」，结论是
//   「实测每个 action 只有一个版本 ✅ ⇒ 无漂移」（审计 §4.264 三、第 1 行）——
//   **「一致」≠「还活着」**：那次谓词问的是「有没有漂移」，不是「这个版本还能不能跑」。
//   这是同族「只锁了一半」的又一种形态：**问错了问题**，于是整条轴看起来已被覆盖。
//   ⚠️ 另一条：**CI 告警清单 ≠ 真实 node20 清单** —— `actions/upload-artifact@v4` 经 `gh api`
//   读 `action.yml` 实测也是 `node20`，却**不在**告警里（原因未查证，如实记录，不编造根因）
//   ⇒ **只按告警清单去修会漏掉它**；这也是本判据读登记表、而不读 CI 日志的原因。
// 【真值源】tests/parity/fixtures/ci-actions.json（只存事实与理由，**不存计数**）。
// 【守什么】双向登记 + 禁浮动 ref（例外表**双向**）+ pin 主版本 ≥ `minMajorForNode24`
//   + 自述 runtime 不得为 node20 + `latestKnown` 不得比 pin 更旧。
//   **不守**「上游是否又发了新版」—— 离线判据无法知道（这是本节的已知边界，不假装守住了）。
{
  const REG = 'tests/parity/fixtures/ci-actions.json';
  const WF_DIR = '.github/workflows';
  const reg = JSON.parse(read(REG));
  const entries = reg.actions ?? [];
  const dateOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const majorOf = (ref) => (/^v(\d+)$/.exec(String(ref))?.[1] ?? null);
  /** 判定与 canary **共用**：从一行 YAML 取 `uses:` 的 `<owner>/<repo>@<ref>`；整行注释返回 null。 */
  const usesOf = (line) => {
    const t = line.trim();
    if (t.startsWith('#')) return null; // 剥整行注释（注释里必须能写坏形态）
    return /^(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#.*)?$/.exec(t)?.[1] ?? null;
  };
  /** 判定与 canary **共用**：一条登记项是否合规（null = 合规，否则返回原因）。 */
  const verdict = (a) => {
    if (a.runtime === 'non-js') {
      return a.minMajorForNode24 === null ? null : 'non-js 项不应声明 minMajorForNode24';
    }
    if (a.runtime !== 'node24') {
      return `自述 runtime = ${a.runtime}（登记表里不得留下被 runner 移除的运行时）`;
    }
    const major = majorOf(a.ref);
    if (major === null) return `JS action 的 ref 必须是 \`v<N>\` 形态（现值 \`${a.ref}\`）`;
    if (!Number.isInteger(a.minMajorForNode24) || a.minMajorForNode24 < 0) {
      return 'minMajorForNode24 必须是非负整数';
    }
    if (Number(major) < a.minMajorForNode24) {
      return `pin 的主版本 ${major} < 该 action 声明 node24 的起始主版本 ${a.minMajorForNode24}`
        + ' ⇒ 运行在**已被 runner 移除**的运行时上';
    }
    return null;
  };

  // 现读全部 workflow 里的 `uses:`（**遍历 + 过滤**，不枚举文件）
  const found = new Map();
  for (const f of readdirSync(resolve(root, WF_DIR)).filter((n) => /\.ya?ml$/.test(n)).sort()) {
    for (const line of read(`${WF_DIR}/${f}`).split('\n')) {
      const key = usesOf(line);
      if (key !== null) found.set(key, (found.get(key) ?? 0) + 1);
    }
  }

  // ① 双向登记
  const regKeys = new Set(entries.map((a) => `${a.action}@${a.ref}`));
  for (const key of [...found.keys()].sort()) {
    if (!regKeys.has(key)) {
      fail(`⑱ workflow 里的 \`uses: ${key}\` **未登记**在 \`${REG}\` —— 新增 / 改版 action 必须登记`
        + '（含它的运行时与出处）；否则「退回被弃用运行时」这件事**无人能发现**');
    }
  }
  for (const key of [...regKeys].sort()) {
    if (!found.has(key)) {
      fail(`⑱ \`${REG}\` 登记了 \`${key}\`，但 workflow 里**一处也没有** —— 登记表与事实脱节`
        + '（要么删掉该条，要么说明它跑在哪份 workflow 里）');
    }
  }

  // ② 禁浮动 ref（例外表**双向**：例外只能豁免已登记项）
  const floatOk = new Set((reg.floatingRefExceptions ?? []).map((e) => `${e.action}@${e.ref}`));
  for (const key of [...floatOk].sort()) {
    if (!regKeys.has(key)) {
      fail(`⑱ \`floatingRefExceptions\` 里的 \`${key}\` 不在 \`actions\` 里 —— 例外表只能豁免**已登记**项`);
    }
  }
  for (const a of entries) {
    const key = `${a.action}@${a.ref}`;
    if (majorOf(a.ref) !== null || floatOk.has(key)) continue;
    fail(`⑱ \`${key}\` 的 ref 既不是主版本标签 \`v<N>\`，也不在 \`floatingRefExceptions\` 里 ——`
      + ' 浮动 ref 会**静默换实现**（今天跑得通，明天跑的是另一份代码）');
  }

  // ③ 运行时判定 + 出处 + 日期形态（全部与 canary 共用 verdict）
  for (const a of entries) {
    const key = `${a.action}@${a.ref}`;
    const bad = verdict(a);
    if (bad !== null) fail(`⑱ \`${key}\`：${bad}`);
    if (typeof a.evidence !== 'string' || a.evidence.trim() === '') {
      fail(`⑱ \`${key}\` 没有 \`evidence\` —— 运行时是**人工核实的事实**，必须带出处（否则下一个审计者无从复核）`);
    }
    if (!dateOk(a.checkedAt)) {
      fail(`⑱ \`${key}\` 的 \`checkedAt\` 不是 \`YYYY-MM-DD\`（现值 \`${a.checkedAt}\`）`);
    }
    const latest = majorOf(a.latestKnown);
    const pin = majorOf(a.ref);
    if (latest === null) {
      fail(`⑱ \`${key}\` 的 \`latestKnown\` 不是 \`v<N>\` 形态（现值 \`${a.latestKnown}\`）`);
    } else if (pin !== null && Number(latest) < Number(pin)) {
      fail(`⑱ \`${key}\` 的 \`latestKnown\`（${a.latestKnown}）比 pin 的 ${a.ref} **还旧** —— 字段填反了`);
    }
  }
  if (!dateOk(reg.reviewedAt)) fail(`⑱ \`${REG}\` 的 \`reviewedAt\` 不是 \`YYYY-MM-DD\``);

  // 防空转：**覆盖型**（下限 = 立此判据时的基线；action 增删时须一并复核）
  const REG_BASELINE = 8; // [覆盖型] 基线 8
  const USES_BASELINE = 61; // [覆盖型] 基线 61
  const usesTotal = [...found.values()].reduce((s, n) => s + n, 0);
  coverEq('⑱ 登记表条目数', entries.length, REG_BASELINE,
    '条目被删会让本判据**空转**');
  coverEq('⑱ workflow 里的 `uses:` 处数', usesTotal, USES_BASELINE,
    '扫描面或提取谓词漂移会让本判据**空转**');

  // canary：多向（与判定**共用** usesOf / verdict；样本**运行时构造**）
  if (usesOf('      - uses: actions/checkout@v5') !== 'actions/checkout@v5') {
    fail('⑱ canary 失效：普通 `- uses:` 行未被提取');
  }
  if (usesOf('        uses: actions/upload-artifact@v6  # 制品') !== 'actions/upload-artifact@v6') {
    fail('⑱ canary 失效：带行尾注释的 `uses:` 行未被提取');
  }
  if (usesOf('      # - uses: actions/checkout@v4') !== null) {
    fail('⑱ canary **过宽**：整行注释里的 `uses:` 被当成真引用（注释里必须能写坏形态）');
  }
  if (usesOf('      - run: echo "uses: actions/checkout@v4"') !== null) {
    fail('⑱ canary **过宽**：消息字符串里的 `uses:` 被当成真引用');
  }
  const CANARIES = [
    [{ action: 'a/b', ref: 'v4', runtime: 'node20', minMajorForNode24: 5 }, false, '自述 node20'],
    [{ action: 'a/b', ref: 'v4', runtime: 'node24', minMajorForNode24: 5 }, false, '主版本低于下限'],
    [{ action: 'a/b', ref: 'stable', runtime: 'node24', minMajorForNode24: 5 }, false, 'ref 非 v<N>'],
    [{ action: 'a/b', ref: 'v1', runtime: 'non-js', minMajorForNode24: 3 }, false, 'non-js 却声明了下限'],
    [{ action: 'a/b', ref: 'v5', runtime: 'node24', minMajorForNode24: 5 }, true, '合规'],
    [{ action: 'a/b', ref: 'v1', runtime: 'non-js', minMajorForNode24: null }, true, '合规（non-js）'],
  ];
  for (const [sample, shouldPass, what] of CANARIES) {
    if ((verdict(sample) === null) !== shouldPass) {
      fail(`⑱ canary ${shouldPass ? '**过宽**' : '失效'}：${what} 的样本被误判`);
    }
  }

  // 落后项**只报不判**（离线判据无法知道上游有没有更新；报出来是为了不让它变成隐形债）
  const behind = entries.filter((a) => {
    const pin = majorOf(a.ref);
    const latest = majorOf(a.latestKnown);
    return pin !== null && latest !== null && Number(latest) > Number(pin);
  });
  console.log(`Release gate: CI action 运行时 —— ${entries.length} 个 action / ${usesTotal} 处 \`uses:\` 已登记；`
    + `pin 主版本均 ≥ 各自声明 node24 的起始主版本；浮动 ref 例外 ${floatOk.size} 个`
    + (behind.length > 0
      ? `；⚠️ ${behind.length} 个**落后于已知最新**（仅登记、不判）：${behind.map((a) => `${a.action}@${a.ref}→${a.latestKnown}`).join('、')}`
      : ''));
}

// ── ⑲ 夹具的**字段契约**：字段必须被声明过，「出处」必须自洽（2026-10-10，审计 §4.284）──
// 【为什么】§4.257 用过「孤儿字段」透镜（夹具字段有没有人消费），但那次只覆盖 **5** 份夹具，
//   而且**谓词不健全**。本轮用两种口径重跑同一批夹具，得到 **11（朴素）/ 24（剥注释+属性访问）**，
//   **两个数都不是答案**：
//     · 假阳性 ①：**动态读词表**（`Object.keys(vocab)`）⇒ 档位名本就不出现在源码里（§4.257 已记）。
//     · 假阳性 ②：**泛型读取**（`Object.entries(e)` / 解构 / 展开）⇒ `why` / `todo` / `what` 这类
//       字段名**根本不会以属性访问形态出现**。
//     · 假阴性 ③：**名字撞车** —— 朴素口径说 `why`「被引用」，实为 6 个**别的**护栏里的**局部变量名**；
//       而 `note` 在**两种口径里都没被报出来**，可它在 `ci-actions.json` 里**确实没人读**。
//   ⇒ **靠 grep 判「有没有人读」不成立**（同一透镜的第二次失效，第 1 次见 §4.257 的探针 bug ①）。
//   可靠做法是**让消费方声明它读什么** —— 即「字段契约」：声明面 = 本表，消费面 = 各护栏的读取，
//   两者相减 = 可复核的「声明了但没人读」清单。
//   ⚠️ 触发本轮的直接事实：**我自己上一轮建的 `ci-actions.json` 里，20 个字段有 10 个没人读（50%）** ——
//     正是 §4.280「刚立的判据也要问锁了几分之几」的又一次复现（这次是我自己的产物）。
// 【判据】① **顶层键契约**：7 份夹具的顶层键必须与本表**双向相等**。
//   ② **条目键契约**：`ci-actions.json` 再细到条目键（双向）。
//   ③ **出处自洽**：夹具正文里每个 `run <数字>` 必须在 `evidenceRuns` 里；`evidenceRuns` 的每个 id
//      也必须真的被引用（防化石）。
//   ④ **登记表形状**：`knownFutureMigrations` / `knownRemainingWarnings` 每条必须有非空
//      `what` / `observedIn` / `todo`。
//   ⑤ **表头散文**：`source` / `why` / `note` 若存在必须是非空字符串（形状统一，读者才能判断
//      「这个字段是真值源还是装饰」—— §4.257 的根因）。
// 【边界如实声明】② 现已覆盖**全部夹具的条目键**（2026-10-11 审计 §4.288 补齐 ——
//   §4.284 立此判据时只落地了 `ci-actions.json`，其余 6 份当时**登记为后续项**，本轮已落地）。
//   ⚠️ **仍未覆盖**：夹具里**嵌套字典的值**的形状（如 `statusVocabulary` 的每个档位对象）—— 如实声明。
{
  const FIX_DIR = 'tests/parity/fixtures';
  // 顶层键契约（与夹具实际**双向**相等；加/删字段必须同时改这里）
  const TOP_CONTRACT = {
    'ci-actions.json': ['actions', 'evidenceRuns', 'floatingRefExceptions', 'knownFutureMigrations',
      'knownRemainingWarnings', 'note', 'reviewedAt', 'source', 'staleAfterDays', 'why'],
    'ci-secrets.json': ['note', 'reviewedAt', 'secrets', 'source', 'staleAfterDays', 'why'],
    'cross-package-edges.json': ['edges', 'note', 'source', 'why'],
    'export-collaborators.json': ['callSites', 'entries', 'note', 'source', 'statusVocabulary', 'why'],
    'export-feature-parity.json': ['entries', 'note', 'source', 'statusVocabulary', 'why'],
    'local-tools.json': ['note', 'reviewedAt', 'source', 'staleAfterDays', 'tools', 'why'],
    'node-types.json': ['divergences', 'note', 'reviewedAt', 'source', 'staleAfterDays', 'why'],
    'typora-panel-only-keys.json': ['entries', 'note', 'source', 'why'],
    'typora-persisted-uncovered.json': ['entries', 'extract', 'kindVocabulary', 'note', 'source'],
    'typora-preferences-matrix.json': ['entries', 'note', 'source'],
  };
  // 条目键契约（**全部夹具** —— 2026-10-11 审计 §4.288 补齐：§4.284 登记时只落地了 `ci-actions.json`）
  const ENTRY_CONTRACT = {
    'ci-actions.json': {
      actions: ['action', 'checkedAt', 'evidence', 'latestKnown', 'minMajorForNode24', 'note', 'ref', 'runtime'],
      floatingRefExceptions: ['action', 'reason', 'ref'],
      knownFutureMigrations: ['observedIn', 'todo', 'what', 'windowOpensAt'],
      knownRemainingWarnings: ['observedIn', 'todo', 'what', 'whyNotAnActionIssue'],
    },
    'ci-secrets.json': {
      secrets: ['consequence', 'name', 'status', 'why'],
    },
    'cross-package-edges.json': {
      edges: ['from', 'reason', 'to'],
    },
    'export-collaborators.json': {
      entries: ['callSite', 'env', 'evidence', 'field', 'ref', 'refId', 'status'],
    },
    'export-feature-parity.json': {
      entries: ['evidence', 'html', 'pdf', 'preview', 'ref', 'settingId', 'syntax'],
    },
    'local-tools.json': {
      tools: ['advisoryWhy', 'evidence', 'failsOn', 'name', 'runsIn', 'signal', 'why'],
    },
    'node-types.json': {
      divergences: ['kind', 'package', 'typesMajor', 'why'],
    },
    'typora-panel-only-keys.json': {
      entries: ['anchor', 'blockedBy', 'consumer', 'consumerNote', 'internal', 'key', 'mellow', 'note',
        'pendingRef', 'status'],
    },
    'typora-persisted-uncovered.json': {
      entries: ['key', 'kind', 'reason'],
    },
    'typora-preferences-matrix.json': {
      entries: ['behavior', 'behaviorNote', 'comparable', 'comparableNote', 'dCarrier', 'default',
        'deviation', 'disposition', 'mellow', 'note', 'polarity', 'status', 'typora'],
    },
  };
  const HEADER_FIELDS = ['source', 'why', 'note'];
  /** 判定与 canary **共用**：从任意字符串里抽 `run <id>`。 */
  const runsIn = (s) => [...s.matchAll(/\brun\s+(\d{6,})\b/g)].map((m) => m[1]);
  const diff = (actual, declared) => ({
    missing: declared.filter((k) => !actual.includes(k)),
    extra: actual.filter((k) => !declared.includes(k)),
  });

  const names = readdirSync(resolve(root, FIX_DIR)).filter((n) => n.endsWith('.json')).sort();
  const parsed = new Map();
  for (const n of names) {
    try { parsed.set(n, JSON.parse(read(`${FIX_DIR}/${n}`))); } catch (e) {
      fail(`⑲ \`${FIX_DIR}/${n}\` 不是合法 JSON：${e.message}`);
    }
  }

  // ① 顶层键契约（双向）
  for (const n of names) {
    const fx = parsed.get(n);
    if (fx === null || typeof fx !== 'object' || Array.isArray(fx)) {
      fail(`⑲ \`${n}\` 的顶层必须是对象（否则顶层键契约无从判定）`);
      continue;
    }
    const declared = TOP_CONTRACT[n];
    if (declared === undefined) {
      fail(`⑲ 新增夹具 \`${n}\` **未在字段契约里登记** —— 夹具的顶层键必须被声明，`
        + '否则读者无法判断哪些字段是真值源、哪些是装饰（§4.257 的根因）');
      continue;
    }
    const { missing, extra } = diff(Object.keys(fx), declared);
    if (missing.length > 0 || extra.length > 0) {
      fail(`⑲ \`${n}\` 的顶层键与契约不符：`
        + (missing.length > 0 ? `契约有而夹具没有 [${missing.join(', ')}]；` : '')
        + (extra.length > 0 ? `夹具**多出** [${extra.join(', ')}]；` : '')
        + '—— 加 / 删字段必须**同时**改本判据（否则字段可以永远是错的而没人知道）');
    }
  }
  for (const n of Object.keys(TOP_CONTRACT).sort()) {
    if (!names.includes(n)) {
      fail(`⑲ 字段契约登记了 \`${n}\`，但夹具目录里没有它 —— 契约与事实脱节`);
    }
  }

  // ② 条目键契约（只对已落地的那份）
  for (const [n, groups] of Object.entries(ENTRY_CONTRACT)) {
    const fx = parsed.get(n);
    if (fx === undefined) continue;
    for (const [group, declared] of Object.entries(groups)) {
      const arr = fx[group];
      if (!Array.isArray(arr)) {
        fail(`⑲ \`${n}.${group}\` 不是数组（条目键契约无从判定）`);
        continue;
      }
      const actual = [...new Set(arr.flatMap((e) => (e && typeof e === 'object' ? Object.keys(e) : [])))];
      const { missing, extra } = diff(actual, declared);
      if (missing.length > 0 || extra.length > 0) {
        fail(`⑲ \`${n}.${group}\` 的条目键与契约不符：`
          + (missing.length > 0 ? `契约有而条目没有 [${missing.join(', ')}]；` : '')
          + (extra.length > 0 ? `条目**多出** [${extra.join(', ')}]；` : ''));
      }
    }
  }

  // ③ 出处自洽（双向）+ ④ 登记表形状 + ⑤ 表头散文
  for (const n of names) {
    const fx = parsed.get(n);
    if (fx === null || typeof fx !== 'object' || Array.isArray(fx)) continue;
    for (const f of HEADER_FIELDS) {
      if (f in fx && (typeof fx[f] !== 'string' || fx[f].trim() === '')) {
        fail(`⑲ \`${n}\` 的 \`${f}\` 存在但**不是非空字符串** —— 表头散文必须形状统一，`
          + '否则读者无法从形状判断「这个字段是真值源还是装饰」');
      }
    }
    if ('evidenceRuns' in fx) {
      const declaredRuns = fx.evidenceRuns;
      if (!Array.isArray(declaredRuns) || declaredRuns.length === 0
        || declaredRuns.some((r) => typeof r !== 'string' || !/^\d{6,}$/.test(r))) {
        fail(`⑲ \`${n}\` 的 \`evidenceRuns\` 必须是非空、元素为纯数字串（run id）的数组`);
      } else {
        const cited = new Set();
        const walk = (v) => {
          if (typeof v === 'string') { for (const id of runsIn(v)) cited.add(id); return; }
          if (Array.isArray(v)) { for (const x of v) walk(x); return; }
          if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x);
        };
        walk(fx);
        for (const id of [...cited].sort()) {
          if (!declaredRuns.includes(id)) {
            fail(`⑲ \`${n}\` 的正文引用了 \`run ${id}\`，但它**不在** \`evidenceRuns\` 里 —— 出处清单与正文脱节`);
          }
        }
        for (const id of [...declaredRuns].sort()) {
          if (!cited.has(id)) {
            fail(`⑲ \`${n}\` 的 \`evidenceRuns\` 里有 \`${id}\`，但正文**一处也没引用** —— 化石条目`);
          }
        }
      }
    }
    for (const key of ['knownFutureMigrations', 'knownRemainingWarnings']) {
      const arr = fx[key];
      if (arr === undefined) continue;
      if (!Array.isArray(arr)) { fail(`⑲ \`${n}\` 的 \`${key}\` 必须是数组`); continue; }
      arr.forEach((e, i) => {
        for (const f of ['what', 'observedIn', 'todo']) {
          if (typeof e?.[f] !== 'string' || e[f].trim() === '') {
            fail(`⑲ \`${n}\` 的 \`${key}[${i}]\` 缺 \`${f}\`（或为空）—— 登记的条目必须能独立读懂`);
          }
        }
      });
    }
    if (Array.isArray(fx.actions)) {
      fx.actions.forEach((a, i) => {
        if (typeof a?.note !== 'string') {
          fail(`⑲ \`${n}\` 的 \`actions[${i}]\` 缺 \`note\`（字符串，可为空）—— 形状必须**统一**，`
            + '否则读者无法从形状判断「这个字段是真值源还是装饰」');
        }
      });
    }
  }

  // 防空转：**覆盖型**（夹具增删时须一并复核）
  // ⚠️ 2026-10-11（审计 §4.310）：`coverEq` 上线时实测 **9**，而基线写的是 **7** ⇒
  //   两次夹具新增（`ci-actions.json` / `node-types.json`）**都没同步基线** ——
  //   `< 7` 静默容忍了它们。现同步为 9。
  const FIXTURE_BASELINE = 10; // [覆盖型] 基线 10
  coverEq('⑲ 夹具份数', names.length, FIXTURE_BASELINE,
    '扫描面漂移会让本判据**空转**');
  // canary：三向（与判定**共用** runsIn）
  if (runsIn('CI run 38035994927 日志点名 checkout@v4').join() !== '38035994927') {
    fail('⑲ canary 失效：`run <id>` 未被提取');
  }
  if (runsIn('上游已发 action-v1.0.0（2026-06-29）').length !== 0) {
    fail('⑲ canary **过宽**：版本号被当成了 run id');
  }
  if (runsIn('运行 38035994927 次').length !== 0) {
    fail('⑲ canary **过宽**：没有 `run` 前缀的数字被提取');
  }

  const withContract = Object.keys(ENTRY_CONTRACT).length;
  console.log(`Release gate: 夹具字段契约 —— ${names.length} 份夹具的顶层键已双向锁定`
    + `（其中 ${withContract} 份细到条目键）；出处 \`run <id>\` 与 \`evidenceRuns\` 双向一致；`
    + '两张「已知 / 待办」登记表条目形状齐备。'
    + '⚠️ 边界：未覆盖夹具里**嵌套字典**（如 `statusVocabulary`）的值的形状。');
}

// ── ⑳ 「本机工具」的**分类**必须登记（2026-10-11，审计 §4.287）──
// 【为什么】`tests/parity/tools/*.mjs` 这 8 个脚本此前**没有任何分类判据** ——
//   谁该在 CI 跑、谁只能在本机跑，**从来没被登记过**。后果实测：
//   `audit-pkg-test-counts.mjs` **当前就是红的**（`export` 声明 100 / 实跑 104），
//   而**没有任何 CI 会跑它、也没有任何登记说它属于谁** ⇒ 它可以一直红下去。
//   ⇒ 与 §4.286「**判据有效 ≠ 有人跑**」同族，只是对象换成了**工具本身**。
// 【真值源】`tests/parity/fixtures/local-tools.json`（只存分类与理由，**不存计数**）。
// 【判据】① **双向登记**：每个 `tools/*.mjs` 必须在表里；表里每条必须在磁盘上。
//   ② 每条必须自洽：`runsIn` ∈ {ci, local-only} · `signal` ∈ {hard, advisory} · 非空 `why` / `evidence`。
//   ③ `signal: advisory`（恒退出 0、只报线索）⇒ 必须再给非空 `advisoryWhy`，说明**为什么不做成硬判据**
//      —— 这是 §4.286「**软报 = 没报**」的机械化：**软可以，但必须写出为什么软**。
//   ④ `runsIn: ci` ⇒ 必须**真的**出现在某个 workflow 里（防空转：当前 0 条也要**打印**出来 ——
//      这条规则的用途是「**将来**第一个接进 CI 的工具必须真接线」）。
{
  const TOOLS_DIR = 'tests/parity/tools';
  const TOOLS_REG = 'tests/parity/fixtures/local-tools.json';
  const RUNS_IN = ['ci', 'local-only'];
  const SIGNAL = ['hard', 'advisory'];
  const reg = JSON.parse(read(TOOLS_REG));
  const entries = reg.tools ?? [];
  /** 判定与 canary **共用**：一条登记项是否自洽（null = 合规）。 */
  const entryVerdict = (t) => {
    if (!RUNS_IN.includes(t.runsIn)) return `\`runsIn\` 必须是 ${RUNS_IN.join(' / ')}（现值 \`${t.runsIn}\`）`;
    if (!SIGNAL.includes(t.signal)) return `\`signal\` 必须是 ${SIGNAL.join(' / ')}（现值 \`${t.signal}\`）`;
    for (const f of ['why', 'evidence']) {
      if (typeof t[f] !== 'string' || t[f].trim() === '') return `缺 \`${f}\`（或为空）`;
    }
    if (t.signal === 'advisory' && (typeof t.advisoryWhy !== 'string' || t.advisoryWhy.trim() === '')) {
      return '是 `advisory`（恒退出 0、只报线索）却没有 `advisoryWhy` —— '
        + '「**软报 = 没报**」（§4.286）：软可以，但**必须写出为什么软**';
    }
    return null;
  };

  const onDisk = readdirSync(resolve(root, TOOLS_DIR)).filter((n) => n.endsWith('.mjs')).sort();
  const regNames = entries.map((t) => t.name);
  const wfSrc = readdirSync(resolve(root, '.github/workflows'))
    .filter((n) => /\.ya?ml$/.test(n))
    .map((n) => read(`.github/workflows/${n}`)).join('\n');

  // ① 双向登记
  for (const n of onDisk) {
    if (!regNames.includes(n)) {
      fail(`⑳ \`${TOOLS_DIR}/${n}\` **未登记**在 \`${TOOLS_REG}\` —— 新增本机工具必须登记它的`
        + '**运行位置**（`runsIn`）与**理由**；否则它会成为「**没有归属的工具**」'
        + '（实测代价：一个当前就红的工具可以一直红下去，审计 §4.287）');
    }
  }
  for (const n of regNames) {
    if (!onDisk.includes(n)) {
      fail(`⑳ \`${TOOLS_REG}\` 登记了 \`${n}\`，但 \`${TOOLS_DIR}\` 里没有它 —— 登记表与事实脱节`);
    }
  }
  // ② + ③ 每条自洽（共用 entryVerdict）
  for (const t of entries) {
    const bad = entryVerdict(t);
    if (bad !== null) fail(`⑳ \`${t.name}\`：${bad}`);
  }
  // ④ `runsIn: ci` 必须真的接线
  const ciTools = entries.filter((t) => t.runsIn === 'ci');
  for (const t of ciTools) {
    if (!wfSrc.includes(`tools/${t.name}`)) {
      fail(`⑳ \`${t.name}\` 登记为 \`runsIn: ci\`，但**没有任何 workflow 调用它** ——`
        + ' 「登记为在 CI 跑」不等于**真的在跑**');
    }
  }
  // 防空转：**覆盖型**（工具增删时须一并复核）
  const TOOLS_BASELINE = 8; // [覆盖型] 基线 8
  coverEq('⑳ 登记表条目数', entries.length, TOOLS_BASELINE,
    '条目被删会让本判据**空转**');
  // canary：四向（与判定**共用** entryVerdict）
  const CANARIES = [
    [{ name: 'x', runsIn: 'local', signal: 'hard', why: 'w', evidence: 'e' }, false, '`runsIn` 非枚举值'],
    [{ name: 'x', runsIn: 'ci', signal: 'soft', why: 'w', evidence: 'e' }, false, '`signal` 非枚举值'],
    [{ name: 'x', runsIn: 'ci', signal: 'hard', why: '', evidence: 'e' }, false, '`why` 为空'],
    [{ name: 'x', runsIn: 'ci', signal: 'advisory', why: 'w', evidence: 'e' }, false, 'advisory 缺 advisoryWhy'],
    [{ name: 'x', runsIn: 'ci', signal: 'hard', why: 'w', evidence: 'e' }, true, '合规（ci + hard）'],
    [{ name: 'x', runsIn: 'local-only', signal: 'advisory', why: 'w', evidence: 'e', advisoryWhy: 'a' }, true,
      '合规（local-only + advisory 带理由）'],
  ];
  for (const [sample, shouldPass, what] of CANARIES) {
    if ((entryVerdict(sample) === null) !== shouldPass) {
      fail(`⑳ canary ${shouldPass ? '**过宽**' : '失效'}：${what} 的样本被误判`);
    }
  }

  const advisory = entries.filter((t) => t.signal === 'advisory');
  console.log(`Release gate: 本机工具分类 —— ${onDisk.length} 个工具**全部已登记**`
    + `（runsIn: ${ciTools.length} 个 ci / ${entries.length - ciTools.length} 个 local-only；`
    + `signal: ${advisory.length} 个 advisory 均已写出「为什么软」）。`
    + '⚠️ 本节只保证「**归属与理由已声明**」，**不保证本机工具有人跑** —— 那需要人。');
}

// ⚠️ **模块级**常量：㉑ 与 ㉓ 都要扫「本仓代码面」—— 基线**只能有一处**。
//   ⚠️ 2026-10-11（审计 §4.292）：首版把它写在 ㉑ 的**块内**，而 ㉓ 引用它 ⇒
//     `ReferenceError: CODE_BASELINE is not defined` —— **我在 §4.290 刚写完「未定义标识符」的判据，
//     下一节就自己犯了同一个错**（且 ㉒ 抓不到：它只认 `fail` / `assert` 两个**函数**名，
//     不认**变量**引用）⇒ 已提到模块级，并把该边界写进 ㉒ 的注释。
const CODE_BASELINE = 400; // [健康度型] 立此判据时实测 575

// ── **剥注释的唯一实现**（㉑ ㉒ ㉓ ㉔ 共用；2026-10-11，审计 §4.295）────────────────
// ⚠️ **两条硬约束，都来自实测事故**：
//   ① **块注释只认「行首（可带前导空白）的 `/*`」** —— 朴素实现 `s.replace(/\/\*[\s\S]*?\*\//g, '')`
//      会被**字符串里的 `/*`** 骗到（如 glob 模式 `"src/**/*.ts"`）⇒ 从那里一路吃到下一个 `*/`
//      ⇒ **静默删掉真实代码**。实测：`verify-doc-code-refs.mjs` 里的 **5 个**例外表定义
//      被吃到只剩 **1 个**（本条判据的「例外表数 16 ≠ 21」就是这么来的）。
//   ② **行注释只在「前面没有引号」时才截断** —— 否则 `const u = 'http://x'; fail('y')`
//      会被截成 `const u = 'http:` ⇒ **`fail(` 被吃掉** ⇒ 假阴性。
//   ⇒ **取舍方向**：宁可**留注释**（只会**假阳性**，会有人来修），**不可吃代码**（**假阴性，无人知**）。
//   ⚠️ **边界如实声明**：行内块注释（`x(); /* c */`）**不剥**；引号后跟的 `//` 注释**不剥**。
const stripJsComments = (s) => {
  const cutLine = (l) => {
    if (l.trimStart().startsWith('//')) return '';
    const i = l.search(/[ \t]\/\//);
    if (i < 0) return l;
    return /['"`]/.test(l.slice(0, i)) ? l : l.slice(0, i);
  };
  return s.split('\n').map(cutLine).join('\n')
    .replace(/^([ \t]*)\/\*[\s\S]*?\*\//gm, '$1');
};

// ── 剥**字符串**（`'` `"` `` ` `` 三种，含转义）—— **保留换行数**（便于报行号）──────────
// 【为什么必须有】本仓纪律：**静态检查的谓词必须剥字符串**。否则「**错误消息里的示例**」全是假阳性 ——
//   实测代价（§4.296 / §4.293）：`fail('… 必须 writeFileSync(…)')` 这类**消息**会被当成**调用**。
// ⚠️ **顺序**：必须先 `stripJsComments`（它**字符串感知**）再本函数 —— 反过来会让**注释里的引号**
//   开一个「假字符串」⇒ 脱同步 ⇒ 假阳性（§4.306 的镜像判据首版就踩了这个）。
// ⚠️ **本函数是模块级的唯一实现**：`㉒`（断言辅助函数）与 `㉚`（`node:*` 导入）**共用它** ——
//   同族判据的**剥法必须一致**（否则它们只是「两个带不同 bug 的意见」；§4.306 的教训）。
const stripStrings = (s) => s.replace(
  /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
  (m) => m.replace(/[^\n]/g, ' '),
);

// ── ㉑ 本仓**代码面**不得使用已弃用的 Node API（2026-10-11，审计 §4.289）──
//   （`[DEP0040] punycode` ×12 · `[DEP0169] url.parse()` ×8 · `[DEP0005] Buffer()` ×1）
//   **全部由我们使用的 action 自身发出**（告警所在的**步骤名就是 action 名**）。
//   但「**不是我们的**」这句话若只靠**一次人工核对**，就会过期 ⇒ 用判据把它钉住：
//   **本仓代码面不得出现 `punycode` / `new Buffer(`** ⇒ 那两类告警**不可能来自本仓**。
//   ⚠️ **豁免 vendored 发布制品**（`CoreEditor/.yarn/releases/*.cjs`）—— 它是上游产物、非本仓源码
//     （实测**唯一**命中就在那里）。
//   ⚠️ 扫面与判据 **㊺** 的规范面一致（`ts|tsx|mts|cts|mjs|cjs|js|jsx`），且**必须剥注释**
//     （注释里提到 API 名不算「使用」—— 本仓通则）。
//   ⚠️ **canary 样本必须运行时拼接**：本文件**自己也在扫描面里**，直接写字面量会**命中自己**。
{
  const CODE_EXT = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/;
  const VENDORED = /CoreEditor\/\.yarn\/|node_modules\//;
  // ⚠️ **全部拼接构造**：本文件**自己也在扫描面里** ⇒ 直接写字面量会**命中自己**（本仓已记 11 次）。
  const PUNY = 'puny' + 'code';
  const NEWB = 'new ' + 'Buffer(';
  const DEPRECATED_API = [
    { name: `\`${PUNY}\` 模块`, re: new RegExp(`(require\\(\\s*['"]${PUNY}['"]\\s*\\))|(from\\s+['"]${PUNY}['"])`) },
    { name: `\`${NEWB}\``, re: new RegExp(NEWB.replace('(', '\\(')) },
  ];
  // ⚠️ 用**模块级的唯一实现**（首版朴素版会被字符串里的 `/*` 吃掉代码；见 `stripJsComments`）。
  const stripComments = stripJsComments;
  const hitOf = (s) => DEPRECATED_API.some((a) => a.re.test(stripComments(s)));

  let codeScanned = 0;
  const apiHits = [];
  // 口径与 `verify-doc-code-refs.mjs` 的 `committedFiles()` 一致（索引 + 未跟踪但不被忽略）。
  // ⚠️ 本文件**没有** `committedFiles()` 这个辅助（那是另一个护栏里的）⇒ 直接执行同一条命令。
  let repoFiles = [];
  try {
    repoFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
  } catch {
    fail('㉑ 无法枚举仓库文件集（`git ls-files` 失败）—— 本判据要求在有 git 的检出里运行');
  }
  for (const f of repoFiles) {
    if (!CODE_EXT.test(f) || VENDORED.test(f)) continue;
    codeScanned += 1;
    const src = stripComments(read(f));
    for (const api of DEPRECATED_API) {
      if (api.re.test(src)) apiHits.push(`${f} → ${api.name}`);
    }
  }
  if (apiHits.length > 0) {
    fail(`㉑ 本仓**代码面**里出现了已弃用的 Node API：${apiHits.join('、')}`
      + ' —— 这会让 CI 日志里的弃用告警**无法再归给上游**（审计 §4.289 的登记建立在「本仓零使用」上）。'
      + '要么改掉，要么在 `ci-actions.json` 的 `knownRemainingWarnings` 里如实登记并说明');
  }
  // 防空转：必须**真的**扫到代码面（否则本判据**空转**，而输出照打「未使用」）
  // ⚠️ `CODE_BASELINE` 定义在**模块级**（㉓ 也用）—— 见本块上方的注释。
  if (codeScanned < CODE_BASELINE) {
    fail(`㉑ 只扫到 ${codeScanned} 个代码文件（[健康度型] 下限 ${CODE_BASELINE}，立此判据时 575）`
      + ' —— 扫描面萎缩会让本判据**空转**');
  }
  // canary：三向（与判定**共用** hitOf；样本**拼接构造**）
  const S_REQ = `const p = require(${JSON.stringify(PUNY)});`;
  const S_BUF = `const b = ${NEWB}4);`;
  if (!hitOf(S_REQ)) fail('㉑ canary 失效：`punycode` 的 require 写法**未被检出**');
  if (!hitOf(S_BUF)) fail(`㉑ canary 失效：\`${NEWB}\` 写法**未被检出**`);
  if (hitOf('Buffer.from(x)') || hitOf(`// 注释里提到 ${NEWB} 不算使用`)) {
    fail('㉑ canary **过宽**：正确写法 / 注释被误判为使用');
  }
  console.log(`Release gate: 本仓代码面 —— ${codeScanned} 个文件**未使用** \`${PUNY}\` / \`${NEWB}\``
    + '（⇒ CI 日志里这两类弃用告警**不可能来自本仓**；vendored 发布制品已豁免）');
}

// ── ㉒ 护栏里调用的「断言辅助函数」必须有定义 / import（2026-10-11，审计 §4.290）──
// 【为什么】实测 `verify-parity-ledger.mjs` 里有 **8 处** `fail(...)` 调用，而 `fail` **从未定义**
//   ⇒ 那 8 条断言的**失败路径**一直是坏的：条件一旦成立就抛 `ReferenceError`，
//   丢掉可操作消息，而且**整条护栏当场中断 ⇒ 其后的判据从未判定**。
//   ⚠️ 它藏了很久，因为**那 8 个分支从未被触发过** —— 是**注入验证**当场抓到的
//     （**静态阅读看不出**：`fail(` 长得完全正常）。
//   ⇒ 用一条**廉价的定向 lint** 钉住：**调用了就必须有定义 / import / globalThis**。
//   ⚠️ **必须剥注释**（本仓通则）—— 否则注释里提到的 `fail(` 会被当成真调用。
//   ⚠️ **覆盖边界（如实声明）**：只认 `HELPERS` 里那两个**函数名**；
//     **变量 / 其它 helper 的未定义引用不在覆盖内** —— 实测 2026-10-11（审计 §4.292）：
//     我在 ㉓ 里引用了 ㉑ 块内的 `CODE_BASELINE`（块级作用域）⇒ 运行即抛 `ReferenceError`，
//     **而本判据抓不到它**（那是**变量**引用）。⇒ 那条边界只能靠**运行**兜住（响亮崩）。
{
  const HELPERS = ['fail', 'assert'];
  // ⚠️ 用**模块级的唯一实现**（首版朴素版会被字符串里的 `/*` 吃掉代码；见 `stripJsComments`）。
  const stripComments22 = stripJsComments;
  // ⚠️ **2026-10-11（审计 §4.310）：必须**再剥字符串** —— 实测（本轮当场踩到）：我在
  //   `COVERAGE_EQ_PENDING` 的**理由字符串**里写了 `` `assert()`（throw）型 `` ⇒ 被当成
  //   「调用了未定义的 `assert(`」**假阳性**。同族的 `㉚` **一直**是剥字符串的（§4.293）⇒
  //   本条**漏了同一句话的另一半**。现共用模块级 `stripStrings`（同族剥法必须一致）。
  const scrub22 = (s) => stripStrings(stripComments22(s));
  const guards22 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const undefinedCalls = [];
  let scanned22 = 0;
  for (const f of guards22) {
    const src = scrub22(read(`tests/parity/${f}`));
    scanned22 += 1;
    for (const h of HELPERS) {
      const callRe = new RegExp(`(?<![\\w.$])${h}\\(`, 'g');
      const hits = src.match(callRe);
      if (hits === null) continue;
      const defined = new RegExp(`(?:const|let|var|function)\\s+${h}\\b`).test(src);
      const imported = new RegExp(`import\\s*\\{[^}]*\\b${h}\\b[^}]*\\}`).test(src)
        || new RegExp(`import\\s+${h}\\b`).test(src);
      const globalized = new RegExp(`globalThis\\.${h}\\b`).test(src);
      if (!defined && !imported && !globalized) {
        undefinedCalls.push(`${f} → \`${h}(\`（${hits.length} 处调用）`);
      }
    }
  }
  if (undefinedCalls.length > 0) {
    fail(`㉒ 这些护栏**调用了未定义的断言辅助函数**：${undefinedCalls.join('、')}`
      + ' —— **静态阅读看不出**（`fail(` 长得完全正常），但**失败路径**会抛 `ReferenceError`：'
      + '丢掉可操作消息，且**整条护栏当场中断 ⇒ 其后的判据从未判定**。'
      + '请补上定义（或 import），别指望「反正会红」');
  }
  // 防空转：**覆盖型**（护栏增删时须一并复核）
  const GUARD22_BASELINE = 23; // [覆盖型] 基线 23
  coverEq('㉒ 扫描到的护栏数', scanned22, GUARD22_BASELINE,
    '扫描面萎缩会让本判据**空转**');
  // canary：三向（与判定**共用**同一套正则；样本**拼接构造**）
  const callReC = (h) => new RegExp(`(?<![\\w.$])${h}\\(`);
  const defReC = (h) => new RegExp(`(?:const|let|var|function)\\s+${h}\\b`);
  const H = 'fa' + 'il';
  const OK_SAMPLE = `const ${H} = (m) => errors.push(m);\n${H}('x');`;
  const BAD_SAMPLE = `${H}('x');`;
  if (!callReC(H).test(OK_SAMPLE) || !defReC(H).test(OK_SAMPLE)) {
    fail('㉒ canary 失效：合规样本未被判为「有定义」');
  }
  if (callReC(H).test(BAD_SAMPLE) && defReC(H).test(BAD_SAMPLE)) {
    fail('㉒ canary **过宽**：只有调用、没有定义的样本被判为有定义');
  }
  if (callReC(H).test(stripComments22(`// ${H}(x) 在注释里不算调用`))) {
    fail('㉒ canary **过宽**：注释里的调用被当成真调用（必须剥注释）');
  }
  // ⚠️ **2026-10-11（审计 §4.310）新增第四向**：**字符串里的提及不算调用**（本轮当场踩到的假阳性）
  if (callReC(H).test(scrub22(`const why = '${H}() 是 throw 型';`))) {
    fail('㉒ canary **过宽**：**字符串里**的提及被当成真调用（必须剥字符串 —— 本仓通则）');
  }
  // ⚠️ 反面：剥字符串**只该剥掉字面量，不该吃掉调用**（假阴性无人知）。
  //   ⚠️ 断言的是「**调用形态**存活」而不是「整行字面量存活」—— 实参**也会**被剥掉
  //     （首版写成 `.includes("${H}('x')")` ⇒ 假报红；**这正是 canary 该干的事**）。
  if (!scrub22(`const why = '${H}() 是 throw 型';\n${H}('x');`).includes(`${H}(`)) {
    fail('㉒ canary 失效：剥字符串**吃掉了真调用**（假阴性，无人知）');
  }
  console.log(`Release gate: 护栏的断言辅助函数 —— 扫描 ${scanned22} 个护栏，`
    + `${HELPERS.join(' / ')} **均有定义或 import**（未定义的调用会让失败路径抛 ReferenceError）`);
}

// ── ㉓ 空 `catch` 必须写明理由（2026-10-11，审计 §4.292）──
// 【为什么】`catch {}` 会把异常**静默吞掉** ⇒ 「失败了」看起来像「成功了」。
//   与 §4.289 同族：那一节管的是**告警**，本节管的是**异常**。
//   本仓已有的空 catch 大多**带理由注释**（「未就绪 no-op」/「view 已销毁」/「best effort」）
//   —— 那**正是**要保住的性质；要防的是**新加的、连理由都没有的**空 catch。
// 【判据】代码面里 `catch` 的**函数体只含空白**（连注释都没有）⇒ 报错，要求写明理由。
//   ⚠️ **必须剥字符串**：首版没剥 ⇒ 命中**夹具样本**（`verify-settings-contract.mjs` 的负样本
//     字符串里就写着 `catch {}`）⇒ **假阳性**。
//   ⚠️ **必须保留注释**：第二版把注释也剥了 ⇒ 「带理由的空 catch」与「真空 catch」**混在一起**
//     （实测 **15 → 60** 处）⇒ **不可判**。保留注释后 ⇒ 只剩 **1 处**（已补理由）。
//   ⚠️ **边界如实声明**：**模板字面量里的生成 JS 不在扫描面内**（被字符串剥离排除）——
//     实测有 2 处（`build-editor-bundle.mjs` 注入浏览器的桥接脚本），已**人工补理由注释**。
{
  // ⚠️ 扫描面**必须与规范面一致**（`ts|tsx|mts|cts|mjs|cjs|js|jsx`）——
  //   首版漏了 `jsx`，`verify-doc-code-refs.mjs` **判据 ㊺** 当场报红（它正是为防这个而立的；审计 §4.282）。
  const CODE_EXT23 = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/;
  const VENDORED23 = /CoreEditor\/\.yarn\/|node_modules\//;
  /** 判定与 canary **共用**：剥字符串（**保留注释** —— 注释是「理由」的载体）。 */
  const stripStrings23 = (s) => s
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/gs, '``');
  /** 判定与 canary **共用**：`catch` 体**只含空白**。 */
  const EMPTY_CATCH_RE = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
  let repoFiles23 = [];
  try {
    repoFiles23 = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
  } catch {
    fail('㉓ 无法枚举仓库文件集（`git ls-files` 失败）—— 本判据要求在有 git 的检出里运行');
  }
  const emptyCatches = [];
  let code23 = 0;
  for (const f of repoFiles23) {
    if (!CODE_EXT23.test(f) || VENDORED23.test(f)) continue;
    code23 += 1;
    const s = stripStrings23(read(f));
    for (const m of s.matchAll(EMPTY_CATCH_RE)) {
      emptyCatches.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
  if (emptyCatches.length > 0) {
    fail(`㉓ 这些地方的 \`catch\` **体只含空白**（连理由注释都没有）⇒ 异常被**静默吞掉**：`
      + `${emptyCatches.join('、')} —— 「失败了」会看起来像「成功了」。`
      + '请写明理由（本仓既有写法：「未就绪 no-op」/「view 已销毁」/「best effort」），'
      + '或改为上报（`console.error` / 抛错 / 计数）');
  }
  // 防空转：**覆盖型**（立此判据时：全部带理由 ⇒ 0 处）
  const EMPTY_CATCH_BASELINE = 0; // [覆盖型] 基线 0
  coverEq('㉓ 真空 catch 数', emptyCatches.length, EMPTY_CATCH_BASELINE,
    '真空 catch 一律不得存在（该集合的「当前值」恒为 0）');
  if (code23 < CODE_BASELINE) {
    fail(`㉓ 只扫到 ${code23} 个代码文件（[健康度型] 下限 ${CODE_BASELINE}）—— 扫描面萎缩会让本判据**空转**`);
  }
  // canary：四向（与判定**共用** stripStrings23 / EMPTY_CATCH_RE）
  const emptyIn = (s) => [...stripStrings23(s).matchAll(EMPTY_CATCH_RE)].length;
  if (emptyIn('try { x(); } catch {}') !== 1 || emptyIn('try { x(); } catch (e) { }') !== 1) {
    fail('㉓ canary 失效：真空 catch 的两种写法**未被检出**');
  }
  if (emptyIn('try { x(); } catch { /* 未就绪 no-op */ }') !== 0) {
    fail('㉓ canary **过宽**：**带理由注释**的空 catch 被误判');
  }
  if (emptyIn("const s = 'try { x(); } catch {}';") !== 0) {
    fail('㉓ canary **过宽**：**字符串里的** `catch {}`（夹具样本）被当成真代码（必须剥字符串）');
  }
  console.log(`Release gate: 空 \`catch\` —— 扫描 ${code23} 个代码文件，`
    + `**全部带理由注释**（${emptyCatches.length} 处真空 catch，[覆盖型] 基线 ${EMPTY_CATCH_BASELINE}）`
    + '；⚠️ 模板字面量里的生成 JS **不在扫描面内**');
}

// ── ㉔ 「例外表」必须有**陈旧检查**（2026-10-11，审计 §4.295）──
// 【为什么】本仓纪律是「例外表**按被豁免对象分表 + 双向**」，其中**最容易缺的一半**是
//   **陈旧检查**（表里的条目对应的东西已经不存在了 ⇒ 例外永久驻留、豁免面悄悄变大）。
//   实测 21 个例外表**全部**有陈旧检查（0 缺陷）⇒ 本条把这条纪律**钉住**，防它悄悄退化。
// 【判据】对每个护栏里的**例外表常量**（命名含 `EXEMPT|ALLOW|EXCEPTION|SENTINEL|FROZEN|WHITELIST|IGNORE|SKIP`）：
//   搜该表名在文件里的**所有出现点**，要求**至少一处**的 ±3 行内**同时**出现
//   ① 一个断言（`fail(` / `errors.push(`）与 ② 一个陈旧关键词。
//   ⚠️ **谓词必须搜「所有出现点」，不能只看「定义点附近的窗口」** —— 实测首版用 4000 字窗口
//      ⇒ **4 个全部假阳性**（检查点在**判据体内**，离定义很远）。**这是本节的直接教训。**
//   ⚠️ **必须剥注释**（否则注释里提到「请删除」会被当成检查）；但**不能剥字符串**
//      （陈旧关键词就在 `fail('…')` 的**消息字符串**里）。
//   ⚠️ **边界如实声明**：本谓词是**形态匹配** —— 它保证「有一处像检查」，**不保证检测正确**。
{
  // ⚠️ **命名模式不含 `SKIP` / `IGNORE`** —— 它们是**扫描器跳过表**（`node_modules` / `dist` / `target`），
  //   **不是**「豁免某个对象」的例外表 ⇒ 要求它们有陈旧检查是**错的**（实测踩到：
  //   `RS_SKIP` / `FE_SKIP_DIR` / `FE_SKIP_FILE` 被误报为「缺陈旧检查」）。
  //   ⚠️ 若将来用 `SKIP` 命名**豁免表**，需回来扩本条（并说明）。
  // ⚠️ 2026-10-11（审计 §4.302）：`TABLE_RE` **原先要求 `^const`（列 0）** ⇒
  //   **缩进声明的例外表整类不在扫描面内**（实测 9 张：`BOLD_FROZEN` / `CJK_COUNT_EXEMPT` /
  //   `ID_REF_EXEMPT` / `SCREENSHOT_ORPHAN_EXEMPT` / …）—— 而「例外表必须有陈旧检查」这条纪律
  //   对它们**从来没生效过**。⇒ 改成 `^\s*const`（与 §4.295 的教训同族：**谓词的扫描面漏了一整类**）。
  const TABLE_RE = /^\s*const ([A-Z][A-Z0-9_]*(?:EXEMPT|ALLOW|EXCEPTION|SENTINEL|FROZEN|WHITELIST)[A-Z0-9_]*)\s*=/gm;
  const STALE_KW = ['已过期', '过期', '请移除', '请删除', '已不存在', '不再存在', '陈旧', '化石'];
  // ⚠️ 用**模块级的唯一实现**（首版朴素版会被字符串里的 `/*` 吃掉代码；见 `stripJsComments`）。
  const stripComments24 = stripJsComments;
  const guards24 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const tables = [];
  const missing = [];
  for (const f of guards24) {
    const src = stripComments24(read(`tests/parity/${f}`));
    const lines = src.split('\n');
    for (const m of src.matchAll(TABLE_RE)) {
      const name = m[1];
      tables.push(`${f} → ${name}`);
      const occ = lines.map((l, i) => (l.includes(name) ? i : -1)).filter((i) => i >= 0);
      const hasStale = occ.some((i) => {
        const win = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
        return /(?:fail|errors\.push)\(/.test(win) && STALE_KW.some((k) => win.includes(k));
      });
      if (!hasStale) missing.push(`${f} → \`${name}\``);
    }
  }
  if (missing.length > 0) {
    fail(`㉔ 这些**例外表没有陈旧检查**：${missing.join('、')}`
      + ' —— 本仓纪律是「例外表**分表 + 双向**」，而**最容易缺的一半**就是陈旧检查：'
      + '表里的条目对应的东西已不存在时，例外会**永久驻留、豁免面悄悄变大**。'
      + '请补一条「已过期 ⇒ 报错并请移除」的检查（形态：`fail(\'…已过期，请移除…\')`）');
  }
  // 防空转：**覆盖型**（立此判据时实测 25 个例外表 —— 已排除扫描器跳过表；
  //   ⚠️ 2026-10-11（§4.302）：原为 **17**，修掉「`^const` 只认列 0」的扫描面缺陷后
  //   纳入 **8 张缩进表** ⇒ 25）
  const TABLE_BASELINE = 27; // [覆盖型] 基线 27
  coverEq('㉔ 例外表个数', tables.length, TABLE_BASELINE,
    '命名约定漂移或扫描面萎缩会让本判据**空转**');
  // canary：三向（与判定**共用** TABLE_RE / STALE_KW / stripComments24）
  const staleIn = (s) => {
    const t = stripComments24(s);
    const ls = t.split('\n');
    const m = TABLE_RE.exec(t);
    TABLE_RE.lastIndex = 0;
    if (m === null) return null;
    const occ = ls.map((l, i) => (l.includes(m[1]) ? i : -1)).filter((i) => i >= 0);
    return occ.some((i) => {
      const win = ls.slice(Math.max(0, i - 3), i + 4).join('\n');
      return /(?:fail|errors\.push)\(/.test(win) && STALE_KW.some((k) => win.includes(k));
    });
  };
  if (staleIn('const X_EXEMPT = new Set();\nfor (const x of X_EXEMPT) { fail(`已过期，请移除 ${x}`); }') !== true) {
    fail('㉔ canary 失效：**有**陈旧检查的样本被判为缺检查');
  }
  if (staleIn('const X_EXEMPT = new Set();\nfor (const x of X_EXEMPT) { use(x); }') !== false) {
    fail('㉔ canary **过宽**：**没有**陈旧检查的样本被判为有');
  }
  if (staleIn('const X_EXEMPT = new Set();\n// 这里提到 X_EXEMPT 的条目已过期请删除\nfor (const x of X_EXEMPT) { use(x); }') !== false) {
    fail('㉔ canary **过宽**：**注释里**的陈旧措辞被当成检查（必须剥注释）');
  }
  // canary ④（2026-10-11 §4.295 的事故本身）：**字符串里的 `/*` 不得吃掉真实代码**。
  //   朴素剥块注释（`s.replace(/\/\*[\s\S]*?\*\//g,'')`）会被 glob 模式 `"src/**/*.ts"` 骗到，
  //   一路吃到下一个 `*/` ⇒ 把**真实定义**删掉（实测某文件里的 5 个定义被吃到只剩 1 个）。
  const GLOB_SAMPLE = `const X_EXEMPT = new Set();\nconst G = "src/**/*.ts";\nfor (const x of X_EXEMPT) { fail(\`已过期，请移除 \${x}\`); }`;
  if (staleIn(GLOB_SAMPLE) !== true) {
    fail('㉔ canary 失效：**含 glob 字符串**的文件里，陈旧检查被「吃代码」的剥注释实现弄丢了'
      + '（这正是 §4.295 的事故形态）');
  }
  if (stripJsComments(`const A = 1;\nconst G = "src/**/*.ts";\nconst B = 2;`).includes('const B = 2;') === false) {
    fail('㉔ canary 失效：剥注释**吃掉了 `const B = 2;`**（字符串里的 `/*` 被当成了块注释起点）');
  }
  console.log(`Release gate: 例外表的陈旧检查 —— ${tables.length} 个例外表`
    + `**全部带陈旧检查**（[覆盖型] 基线 ${TABLE_BASELINE}）`
    + '；⚠️ 谓词是**形态匹配**：保证「有一处像检查」，**不保证检测正确**');
}

// ── ㉕ 护栏源码里不得出现**朴素块注释剥离**（2026-10-11，审计 §4.296）──
// 【判据】每个 `verify-*.mjs` 的源码（**先剥注释**）里**不得**出现
//   「以 `/*…*/` 为**唯一**分支的 matcher」（= 朴素实现）。
// 【为什么】它会吃掉真实代码 ⇒ 判据的扫描面**静默缩水**（**假阴性、无人知**）。
//   实测全仓曾有 **19 处**（14 个护栏 + 1 处产品码），吃掉 **44 文件 / 130 段 / 151201 字符**。
// ⚠️ **needle 运行时拼接**（两半）：否则本判据会**命中自己的源码**（第 13 次踩，同 ㉑ 的 `new Buffer(`）。
// ⚠️ **必须剥注释**：14 个护栏的注释里**写着**这个反面教材（教学用）—— 不剥会全红（假阳性）。
// ⚠️ **边界如实声明**：谓词是**字面量匹配**，只认这一种写法。若将来有护栏把朴素形态当
//   **字符串样本**（而不是注释里的教材），会被误报 ⇒ 那时请改**拼接构造**或登记豁免。
{
  const N1 = '/\\/\\*[\\s\\S]*?';
  const N2 = '\\*\\//g';
  const NAIVE_MATCHER = N1 + N2; // 值 = `/\/\*[\s\S]*?\*\//g`
  const offenders25 = [];
  let scanned25 = 0;
  for (const f of guardFiles) {
    const src = read(`tests/parity/${f}`);
    if (!src.includes('replace(')) continue;
    scanned25 += 1;
    if (stripJsComments(src).includes(NAIVE_MATCHER)) offenders25.push(f);
  }
  if (offenders25.length > 0) {
    fail(`这些护栏里还有**朴素块注释剥离**（会把真实代码当注释吃掉 ⇒ 假阴性）：${offenders25.join('、')}`
      + ' —— 改用「字符串 / 模板 / 行注释 / 正则字面量」四保留分支的形态（见 `stripJsComments`；审计 §4.296）');
  }
  // 防空转：[覆盖型] 基线 = 立此判据时的护栏数（防「扫描面萎缩 ⇒ 永远绿」）
  const GUARD25_BASELINE = 23; // [覆盖型] 基线 23
  coverEq('㉕ 扫描到的护栏数', scanned25, GUARD25_BASELINE,
    '判据范围萎缩会让本判据空转');
  // canary ①（负样本）：朴素形态必须被**检出**（needle 拼接构造）
  if (!stripJsComments(`const strip = (s) => s.replace(${NAIVE_MATCHER}, '');`).includes(NAIVE_MATCHER)) {
    fail('㉕ canary 失效：朴素形态**未被检出**（判据已退化成空真）');
  }
  // canary ②（**核心**：防「不剥注释 ⇒ 假阳性」）：注释里的**反面教材**不得被当成真实现
  //   ⚠️ 这条不是装饰：14 个护栏的注释里**真的**写着这个反面教材（本节自己的注释也是）。
  if (stripJsComments(`// 反面教材：${NAIVE_MATCHER}\nconst x = 1;`).includes(NAIVE_MATCHER)) {
    fail('㉕ canary 失效：**注释里**的反面教材被当成真实现（必须剥注释）');
  }
  // canary ③（过宽）：带**保留分支**的形态（有第 1 个捕获组）不得被误判
  const KEEP_BRANCH = '/("(?:[^"\\\\]|\\\\.)*"|\\\\/\\\\/[^\\\\n]*)|(\\\\/\\\\*[\\\\s\\\\S]*?\\\\*\\\\/)/g';
  if (stripJsComments(`const strip = (s) => s.replace(${KEEP_BRANCH}, (m, keep) => keep);`)
    .includes(NAIVE_MATCHER)) {
    fail('㉕ canary **过宽**：带保留分支的形态被误判为朴素实现');
  }
  console.log(`Release gate: 护栏的剥注释实现 —— 扫描 ${scanned25} 个护栏，`
    + `朴素块注释剥离 ${offenders25.length} 处（[覆盖型] 基线 ${GUARD25_BASELINE}）`
    + '；⚠️ 谓词是**字面量匹配**，只认「以 `/*…*/` 为唯一分支」这一种写法');
}

// ── ㉖ ADR 的**问数自述**必须与文档实际一致（2026-10-11，审计 §4.297）──
// 【为什么】ADR-0034 实测：文档被**追加**了 Q11 / Q12 / Q13，而**计数没同步** ——
//   标题写「9 项（默认值轴 5 + 行为轴 4）」、段内写「10 项」、小节头写「行为轴 4 项」，
//   实际是 **12 问**。这四份 ADR 是**待裁决**的（人要看它才能定），而「裁决成本 = 看一眼就能定」
//   正是它们存在的理由 ⇒ **读者按标题会低估成本**。本仓纪律「**手写计数必然漂移**」，
//   而 `verify-doc-code-refs.mjs` 的判据 ㊻ 只守审计文档的「同族次数 + 区间」，**不守 ADR 的问数**。
// 【判据】每份 `docs/adr/ADR-*.md`（**仅当含 `## Q<N>` 小节**）：
//   ① **「裁决」节**里形如 `N 问` 的自述（若有）必须 == 实际问数（**最多一处**）；
//   ② **标题行**里形如 `N 项 / N 问` 的计数若 != 实际问数，则**标题之后 20 行内必须有 `> **⚠️` 更正块**。
// 【为什么 ② 不是「直接改标题」】本仓规则是「ADR **只追加不修改**」（`AGENTS.md` 统一规则 16 /
//   `README.md` 的目录约定）⇒ 过期计数**保留为历史**，但**必须**紧跟更正块，否则读者只看到错数。
// ⚠️ **问数按「问号」计、不按小节计**：`## Q2 / Q3 — …` 是**一个**小节里的**两个**问
//   （ADR-0034 的 Q2 / Q3 是同一个 Mellow 键 `markdown.supSub` 的两个方向，合写一节）。
// ⚠️ **无 `## Q<N>` 小节的 ADR 一律跳过** —— 本仓多数 Accepted ADR 只留 `### Q1 = …` 形态，
//   那类**不在覆盖内**（如实声明；若将来给它们加 `## Q` 小节，请回来扩面）。
{
  const ADR_DIR_26 = 'docs/adr';
  const WITHQ26_FLOOR = 3; // [健康度型] 下限（立此判据时 5 份含 Q 小节）
  /** 判定（与 canary **共用**同一份谓词）：一份 ADR 源码的问数自述问题。 */
  const adrCountIssues = (src) => {
    const out = [];
    const qs = (() => {
      const set = new Set();
      for (const m of src.matchAll(/^##\s*Q([\d\s/、,，]+)/gm)) {
        for (const n of m[1].match(/\d+/g) ?? []) set.add(Number(n));
      }
      return [...set].sort((a, b) => a - b);
    })();
    if (qs.length === 0) return { qs, issues: out };
    const lines = src.split('\n');
    const at = lines.findIndex((l) => /^##\s*裁决/.test(l));
    if (at >= 0) {
      const end = lines.findIndex((l, i) => i > at && /^## /.test(l));
      const decl = [...lines.slice(at, end < 0 ? lines.length : end).join('\n')
        .matchAll(/(\d+)\s*问/g)].map((m) => Number(m[1]));
      if (decl.length > 1) {
        out.push(`「裁决」节有 ${decl.length} 处「N 问」自述（${decl.join(' / ')}）—— 只允许一处`);
      } else if (decl.length === 1 && decl[0] !== qs.length) {
        out.push(`「裁决」节自述 ${decl[0]} 问，实际 ${qs.length} 问`);
      }
    }
    const titleNums = [...lines[0].matchAll(/(\d+)\s*(项|问)/g)].map((m) => Number(m[1]));
    if (titleNums.length > 0 && !titleNums.includes(qs.length)
      && !lines.slice(1, 21).some((l) => /^>\s*\*\*⚠️/.test(l))) {
      out.push(`标题计数 ${titleNums.join('/')} ≠ 实际 ${qs.length} 问，且标题后 20 行内**没有** ⚠️ 更正块`);
    }
    return { qs, issues: out };
  };
  const adrFiles26 = existsSync(resolve(root, ADR_DIR_26))
    ? readdirSync(resolve(root, ADR_DIR_26)).filter((f) => /^ADR-\d{4}.*\.md$/.test(f)).sort()
    : [];
  const offenders26 = [];
  let withQ26 = 0;
  for (const f of adrFiles26) {
    const { qs, issues } = adrCountIssues(read(`docs/adr/${f}`));
    if (qs.length === 0) continue;
    withQ26 += 1;
    if (issues.length > 0) offenders26.push(`${f}（${issues.join('；')}）`);
  }
  if (offenders26.length > 0) {
    fail(`这些 ADR 的**问数自述**与文档实际不符：${offenders26.join('、')} —— `
      + '「手写计数必然漂移」；ADR **只追加不修改** ⇒ 过期计数**保留为历史**，'
      + '但**必须**紧跟 `> **⚠️` 更正块，且「裁决」节那一处**必须**是当前值'
      + '（那是读者据以评估裁决成本的地方；审计 §4.297）');
  }
  if (withQ26 < WITHQ26_FLOOR) {
    fail(`㉖ 只找到 ${withQ26} 份含 \`## Q<N>\` 小节的 ADR（[健康度型] 下限 ${WITHQ26_FLOOR}）`
      + ' —— 扫描面漂移会让本判据空转');
  }
  // canary ①（正样本）：自述与实际一致 ⇒ 不得报
  const OK_SAMPLE = '# ADR-9999 — 示例\n\n**Status:** **Proposed**\n\n'
    + '## Q1 — a\n\n## Q2 — b\n\n## 裁决\n\n**待裁决（2 问）。**\n';
  if (adrCountIssues(OK_SAMPLE).issues.length !== 0) {
    fail('㉖ canary 失效：自述与实际一致的样本被误报');
  }
  // canary ②（负样本）：「裁决」节自述与实际**不符** ⇒ 必须报
  const BAD_DECL = OK_SAMPLE.replace('（2 问）', '（3 问）');
  if (!adrCountIssues(BAD_DECL).issues.some((s) => s.includes('「裁决」节自述'))) {
    fail('㉖ canary 失效：「裁决」节自述与实际不符**未被检出**（判据已退化成空真）');
  }
  // canary ③（负样本）：标题计数不符且**无**更正块 ⇒ 必须报
  const BAD_TITLE = OK_SAMPLE.replace('示例', '示例 **7 项**');
  if (!adrCountIssues(BAD_TITLE).issues.some((s) => s.includes('标题计数'))) {
    fail('㉖ canary 失效：标题计数不符且无更正块**未被检出**');
  }
  // canary ④（正样本）：标题计数不符但**有**更正块 ⇒ 不得报（本仓「只追加不修改」的落地形态）
  const FIXED_TITLE = BAD_TITLE.replace(
    '**Status:** **Proposed**',
    '**Status:** **Proposed**\n\n> **⚠️ 2026-10-11 更正**：标题的 7 项已过期。',
  );
  if (adrCountIssues(FIXED_TITLE).issues.some((s) => s.includes('标题计数'))) {
    fail('㉖ canary **过宽**：标题计数不符但**有** ⚠️ 更正块，仍被误报');
  }
  // canary ⑤（正样本）：**无** `## Q<N>` 小节的 ADR 一律跳过（本仓多数 Accepted ADR 属此）
  if (adrCountIssues('# ADR-9999 — 示例 **7 项**\n\n## 裁决\n\n待裁决。\n').issues.length !== 0) {
    fail('㉖ canary 失效：无 Q 小节的 ADR 被误报');
  }
  console.log(`Release gate: ADR 的问数自述 —— 扫描 ${adrFiles26.length} 份 ADR，`
    + `其中 ${withQ26} 份含 \`## Q<N>\` 小节、自述不一致 ${offenders26.length} 份`
    + `（[健康度型] 下限 ${WITHQ26_FLOOR}）`
    + '；⚠️ 只锁「裁决」节那一处与「标题计数不符时必须有 ⚠️ 更正块」，不锁标题本身');
}

// ── ㉗ **带日期的登记**必须有「到期机制」（2026-10-11，审计 §4.298）──
// 【为什么】判据 ⑱ 只校验 `checkedAt` / `reviewedAt` 的**格式**（`YYYY-MM-DD`），**没有保质期** ——
//   于是「**人工核实的外部事实**」（`latestKnown` / `minMajorForNode24`）可以**永久留在那里**而无人复核；
//   而 `knownFutureMigrations` 的**未来日期**（`runs-on: ubuntu-latest` → Ubuntu 26，2026-10-19）
//   此前**连字段都没有**（日期只写在 `observedIn` 散文里）⇒ **到点无人知**。
//   ⇒ 这正是本仓记过的「**「登记为已知」≠「有人守」**」（`PITFALLS §4.394`）：**登记了日期，但没有任何东西会因它过期而响**。
// 【判据】两份**带日期的登记表**（`ci-actions.json` / `local-tools.json`）：
//   ① 顶层必须有**正整数** `staleAfterDays` —— **阈值写在登记表里、不写进判据**（可复核、可解释）；
//   ② 每条 `checkedAt`（`local-tools.json` 用顶层 `reviewedAt`）必须是合法 `YYYY-MM-DD` 且**不得是未来**；
//   ③ **今天 − 最早的日期** ≤ `staleAfterDays`（**取最早**：只更新一半仍是「只锁了一半」）；
//   ④ 每条 `knownFutureMigrations` 必须有合法 `windowOpensAt`；**今天 ≥ `windowOpensAt` ⇒ 红**
//      （**到期不是自动通过，而是强制重新分诊**：处置它，或**更新 `windowOpensAt` 并写明新的观察依据**）。
// ⚠️ **边界如实声明**：本判据**不能**阻止「无限推期」（那要人判断）；它只保证
//   **每次推期都必须有人动手**（而不是静默过期）。⚠️ 也**不守**「上游是否真的又发了新版」—— 离线判据无法知道。
// ⚠️ **本判据依赖「今天」**（UTC）⇒ 结果**会随时间变化** —— 这是**设计意图**（它就是那个闹钟）。
{
  const DATED_REGISTRIES = [
    { file: 'tests/parity/fixtures/ci-actions.json', dateKey: 'checkedAt', in: 'actions' },
    // ⚠️ 2026-10-11（审计 §4.312）：`ci-secrets.json` 的 `status` 是**快照**（CI 里不查 `gh secret list`）
    //   ⇒ 必须挂到「**到期变红**」这套机制上（㉗），否则「配了凭据却没人更新散文」永远不会被发现。
    { file: 'tests/parity/fixtures/ci-secrets.json', dateKey: 'reviewedAt', in: null },
    { file: 'tests/parity/fixtures/local-tools.json', dateKey: 'reviewedAt', in: null },
    { file: 'tests/parity/fixtures/node-types.json', dateKey: 'reviewedAt', in: null },
  ];
  const DAY_MS = 86400000;
  const todayUtc = () => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  const parseDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s))
    ? Date.UTC(Number(String(s).slice(0, 4)), Number(String(s).slice(5, 7)) - 1, Number(String(s).slice(8, 10)))
    : null);
  /** 判定与 canary **共用**：一份登记表的**保质期**问题。 */
  const stalenessIssues = (fx, spec, today) => {
    const out = [];
    const stale = fx?.staleAfterDays;
    if (!Number.isInteger(stale) || stale <= 0) {
      out.push('`staleAfterDays` 缺失或不是正整数（**阈值必须显式写进登记表**，不放判据里）');
      return out;
    }
    const rows = spec.in === null ? [{ [spec.dateKey]: fx?.[spec.dateKey] }] : (fx?.[spec.in] ?? []);
    const days = [];
    for (const [i, r] of rows.entries()) {
      const t = parseDay(r?.[spec.dateKey]);
      const at = `${spec.in ?? '（顶层）'}[${i}].${spec.dateKey}`;
      if (t === null) { out.push(`${at} 不是 \`YYYY-MM-DD\``); continue; }
      if (t > today) out.push(`${at} 是**未来**日期`);
      days.push({ at, t });
    }
    if (days.length === 0) { out.push(`没有解析出任何 \`${spec.dateKey}\``); return out; }
    const oldest = days.reduce((a, b) => (b.t < a.t ? b : a));
    const age = Math.floor((today - oldest.t) / DAY_MS);
    if (age > stale) {
      out.push(`最早的 \`${spec.dateKey}\`（${oldest.at}）距今 **${age} 天**，超过 \`staleAfterDays\` = ${stale}`
        + ' ⇒ 请复核并用 `gh api` 重读上游事实，然后更新日期');
    }
    return out;
  };
  /** 判定与 canary **共用**：`knownFutureMigrations` 的**到期**问题。 */
  const expiryIssues = (arr, today) => {
    const out = [];
    for (const [i, e] of (arr ?? []).entries()) {
      const t = parseDay(e?.windowOpensAt);
      if (t === null) {
        out.push(`knownFutureMigrations[${i}] 的 \`windowOpensAt\` 不是 \`YYYY-MM-DD\``
          + '（**删掉字段不能绕过本判据**）');
        continue;
      }
      if (today >= t) {
        out.push(`knownFutureMigrations[${i}]（${e?.what ?? '?'}）的 \`windowOpensAt\` = ${e.windowOpensAt} **已到点**`
          + ' ⇒ 请**重新分诊**：① 已适配 ⇒ 删除该条目；② 尚未 ⇒ **更新 `windowOpensAt` 并写明新的观察依据**');
      }
    }
    return out;
  };
  const today = todayUtc();
  let datedChecked = 0;
  const offenders27 = [];
  for (const spec of DATED_REGISTRIES) {
    if (!existsSync(resolve(root, spec.file))) { fail(`㉗ 缺少登记表 ${spec.file}`); continue; }
    datedChecked += 1;
    const fx = JSON.parse(read(spec.file));
    for (const s of stalenessIssues(fx, spec, today)) offenders27.push(`${spec.file}：${s}`);
    for (const s of expiryIssues(fx.knownFutureMigrations, today)) offenders27.push(`${spec.file}：${s}`);
  }
  if (offenders27.length > 0) {
    fail(`带日期的登记**过期或未声明保质期**：${offenders27.join('；')}`);
  }
  const DATED_REGISTRY_BASELINE = 4; // [覆盖型] 基线 4
  coverEq('㉗ 带日期的登记表份数', datedChecked, DATED_REGISTRY_BASELINE,
    '扫描面漂移会让本判据空转');
  // canary ①（正样本）：**未过期**的样本不得报
  const SPEC_A = { file: 'x', dateKey: 'checkedAt', in: 'actions' };
  if (stalenessIssues({ staleAfterDays: 90, actions: [{ checkedAt: '2026-10-10' }] }, SPEC_A, today).length !== 0) {
    fail('㉗ canary 失效：未过期的样本被误报');
  }
  // canary ②（负样本）：**超期**必须检出（与判定共用谓词）
  if (!stalenessIssues({ staleAfterDays: 90, actions: [{ checkedAt: '2020-01-01' }] }, SPEC_A, today)
    .some((s) => s.includes('超过'))) {
    fail('㉗ canary 失效：超期样本**未被检出**（判据已退化成空真）');
  }
  // canary ③（负样本）：**缺** `staleAfterDays` 必须检出
  if (!stalenessIssues({ actions: [{ checkedAt: '2026-10-10' }] }, SPEC_A, today)
    .some((s) => s.includes('staleAfterDays'))) {
    fail('㉗ canary 失效：缺 `staleAfterDays` **未被检出**');
  }
  // canary ④（负样本）：**未来**日期必须检出（否则「填 2099 年」就能绕过保质期）
  if (!stalenessIssues({ staleAfterDays: 90, actions: [{ checkedAt: '2099-01-01' }] }, SPEC_A, today)
    .some((s) => s.includes('未来'))) {
    fail('㉗ canary 失效：**未来**日期未被检出（填 2099 年即可绕过保质期）');
  }
  // canary ⑤（负样本）：`windowOpensAt` **已到点**必须检出
  if (!expiryIssues([{ what: 'w', windowOpensAt: '2020-01-01' }], today).some((s) => s.includes('已到点'))) {
    fail('㉗ canary 失效：已到点的 `windowOpensAt` **未被检出**');
  }
  // canary ⑥（正样本 + **防绕过**）：未到点不得报；但**缺字段**必须报（不能「没有字段就跳过」）
  if (expiryIssues([{ what: 'w', windowOpensAt: '2099-01-01' }], today).length !== 0) {
    fail('㉗ canary 失效：未到点的 `windowOpensAt` 被误报');
  }
  if (expiryIssues([{ what: 'w' }], today).length !== 1) {
    fail('㉗ canary 失效：缺 `windowOpensAt` 的条目**未被检出** —— 那样「把字段删掉」就能绕过本判据');
  }
  console.log(`Release gate: 带日期的登记 —— 检查 ${datedChecked} 份登记表的保质期与到期日，`
    + `过期 ${offenders27.length} 项（[覆盖型] 基线 ${DATED_REGISTRY_BASELINE}）`
    + '；⚠️ 不守「上游是否真的又发了新版」（离线判据无法知道），也不能阻止「无限推期」');
}

// ── ㉘ 「Node 的版本」的**第三条轴**：类型定义（`@types/node`）（2026-10-11，审计 §4.299）──
// 【为什么】本仓已守**两条**轴：① **job 运行时** = `.nvmrc`（判据 ⑯，审计 §4.278）；
//   ② **action 自己声明的运行时** = `action.yml` 的 `runs.using`（判据 ⑱ + `ci-actions.json`，§4.283）。
//   **第三条轴此前没人守**：**类型定义的 Node 版本** = `@types/node`。
//   它的后果是**静默**的 —— TS 会接受 Node 24/26 才有的 API ⇒ `npm run typecheck` 通过、
//   **运行时（`.nvmrc` = 22）崩**。实测（2026-10-11）：**4 处声明 / 2 个主版本**（24 ×3、26 ×1）；
//   `pnpm-lock.yaml` 里 `@types/node@24.13.3` 与 `@types/node@26.2.0` **并存**（同仓两套 Node 类型）。
// 【真值源】`tests/parity/fixtures/node-types.json`（**只登记偏离**，不复制完整 spec ⇒ 无副本可漂）。
// 【判据】① **运行时主版本从 `.nvmrc` 派生**（登记表里**不写**该值）；
//   ② 每个声明了 `@types/node` 的包，若主版本 != 运行时主版本，必须在 `divergences` 里**且 `typesMajor` 相符**
//      （否则「悄悄换成 30」不会被发现）；
//   ③ `divergences` 每条必须**真的**对应一个偏离的包（**双向**，防化石条目）；
//   ④ `kind` ∈ {`pendingDecision`, `deliberate`}，且 `why` 非空。
// ⚠️ **范围**：排除 vendored `packages/editor-core/CoreEditor/`（独立 yarn 工程、有自己的 lockfile，
//   依赖是上游的事 —— 同 `verify-package-conventions.mjs` 的 C1–C7 先例）。
// ⚠️ **只核对主版本**：minor/patch 的变动不是决策（`^24.13.3` → `^24.20.0` 不该红）。
// ⚠️ **本判据不改任何依赖**（`AGENTS.md`：依赖变更属方案级）—— 它只让「偏离」**可见且必须被登记**。
{
  const REG28 = 'tests/parity/fixtures/node-types.json';
  const KINDS28 = ['pendingDecision', 'deliberate'];
  const VENDORED28 = '/CoreEditor/';
  /** 判定与 canary **共用**：一个包的 `@types/node` 声明（`devDependencies` 优先）。 */
  const typesSpecOf = (pkg) => (pkg?.devDependencies?.['@types/node']
    ?? pkg?.dependencies?.['@types/node'] ?? null);
  const majorOf28 = (spec) => {
    const m = /(\d+)/.exec(String(spec ?? ''));
    return m === null ? null : Number(m[1]);
  };
  if (!existsSync(resolve(root, REG28))) {
    fail(`㉘ 缺少登记表 ${REG28} —— 「类型定义的 Node 版本」是**第三条轴**，没有登记处就等于没人守`);
  } else if (!existsSync(resolve(root, '.nvmrc'))) {
    fail('㉘ 缺少 `.nvmrc` —— 运行时主版本**必须从它派生**（不写进登记表，避免副本）');
  } else {
    const runtimeMajor = majorOf28(read('.nvmrc').trim());
    const reg = JSON.parse(read(REG28));
    const divs = Array.isArray(reg.divergences) ? reg.divergences : [];
    const pkgFiles = (trackedFiles ?? [])
      .filter((f) => f === 'package.json' || f.endsWith('/package.json'))
      .filter((f) => !f.includes('node_modules') && !f.includes(VENDORED28))
      .sort();
    const actual = new Map(); // 包目录 → { major, spec }
    for (const f of pkgFiles) {
      const spec = typesSpecOf(JSON.parse(read(f)));
      if (spec === null) continue;
      const dir = f === 'package.json' ? '.' : f.slice(0, -'/package.json'.length);
      actual.set(dir, { major: majorOf28(spec), spec });
    }
    const declared = new Map(divs.map((d) => [d.package, d]));
    // ② 偏离必须登记（且 `typesMajor` 相符）
    for (const [dir, { major, spec }] of actual) {
      if (major === null) {
        fail(`㉘ \`${dir}\` 的 \`@types/node\` 取不出主版本（现值 \`${spec}\`）`);
        continue;
      }
      if (major === runtimeMajor) {
        if (declared.has(dir)) {
          fail(`㉘ \`${dir}\` 的 \`@types/node\`（${spec}）**已与运行时主版本一致**，`
            + '但 `divergences` 里仍有它 —— **化石条目**，请删除（双向检查）');
        }
        continue;
      }
      const d = declared.get(dir);
      if (d === undefined) {
        fail(`㉘ \`${dir}\` 的 \`@types/node\` 主版本是 **${major}**，而运行时（\`.nvmrc\`）是 **${runtimeMajor}**，`
          + `但它**不在** \`${REG28}\` 的 \`divergences\` 里 —— 请登记并写明理由`
          + '（TS 会因此接受运行时没有的 API：**typecheck 通过、运行时崩**）');
        continue;
      }
      if (d.typesMajor !== major) {
        fail(`㉘ \`${dir}\` 登记的是 \`typesMajor: ${d.typesMajor}\`，而**现读**是 **${major}** —— 登记值已漂`);
      }
      if (!KINDS28.includes(d.kind)) {
        fail(`㉘ \`${dir}\` 的 \`kind\` = \`${d.kind}\` 不在合法值里（${KINDS28.join(' / ')}）`);
      }
      if (typeof d.why !== 'string' || d.why.trim() === '') {
        fail(`㉘ \`${dir}\` 的偏离没有 \`why\` —— **没有理由的偏离等于没登记**`);
      }
    }
    // ③ 反向：登记的包必须真的存在（且真的偏离 —— 由上面的化石分支覆盖）
    for (const d of divs) {
      if (!actual.has(d.package)) {
        fail(`㉘ \`divergences\` 里的 \`${d.package}\` **不存在**（或没有声明 \`@types/node\`）—— 化石条目`);
      }
    }
    // 防空转：**覆盖型**（下限 = 立此判据时的基线；包增删时须一并复核）
    const NODE_PKG_BASELINE = 4; // [覆盖型] 基线 4
    coverEq('㉘ 声明了 `@types/node` 的包数', actual.size, NODE_PKG_BASELINE,
      '扫描面漂移会让本判据空转');
    console.log(`Release gate: Node 的**第三条轴**（类型定义）—— 现读 ${actual.size} 个声明了 \`@types/node\` 的包，`
      + `其中 ${divs.length} 个与运行时主版本（${runtimeMajor}，**派生自 \`.nvmrc\`**）不同且已登记`
      + '；⚠️ 本判据**不改依赖**，只让偏离**可见且必须被登记**');
  }
  // canary：三向（与判定**共用** typesSpecOf / majorOf28）
  if (majorOf28('^24.13.3') !== 24 || majorOf28('26.2.0') !== 26) {
    fail('㉘ canary 失效：`@types/node` 主版本解析错');
  }
  if (majorOf28('latest') !== null) {
    fail('㉘ canary **过宽**：非数字 spec 未被判为「取不出主版本」');
  }
  if (typesSpecOf({ devDependencies: { '@types/node': '^24.0.0' }, dependencies: { '@types/node': '^26.0.0' } })
    !== '^24.0.0') {
    fail('㉘ canary 失效：`devDependencies` 未优先于 `dependencies`');
  }
}

// ── ㉙ 根 README 的**目录结构树**必须与实际一致（2026-10-11，审计 §4.300）──
// 【为什么】`README.md` 的「目录结构」段是**门面**：读者据它判断「这个仓库里有什么」。
//   实测（2026-10-11）：`docs/` 实际 **9** 个子目录而树里只列 **6**（漏 `accessibility/` / `security/` / `superpowers/`）、
//   `tests/` 实际 **7** 个而只列 **3**（**漏了 `tests/parity/` —— 23 条护栏的家**），根目录还漏了 `tools/`。
//   ⚠️ §4.94（2026-10-06）修过一次，但修的是「**列出的条目**要准确」（易漂清单改为指向真值源）
//   —— **从没锁「该列的有没有列」** ⇒ 同族「**只锁了一半**」。
// 【判据】根 `README.md` 的「目录结构」代码块里提取**目录条目**（**层级感知**），与实际**双向**核对：
//   ① 每个**列出的**目录路径必须**存在**（防「列了已删的目录」）；
//   ② 实际的**顶层目录**（排除生成物）必须**全部被列出**；
//   ③ 实际的 **`docs/*` 与 `tests/*` 二级目录**必须**全部被列出**。
// ⚠️ **必须层级感知**：若只比对「目录名」（basename），`packages/shared/` 会**掩盖** `tests/shared/` 的缺失。
// ⚠️ **范围如实声明**：`packages/*` **不在覆盖内** —— 它的 15 个包已由 `verify-doc-code-refs.mjs` 的
//   「`monorepo.md` 的 15 个包 == `packages/` 目录数」判据守住，README 里那一段是它的**副本**
//   ⇒ 本判据**只补没人守的那一半**。⚠️ **排除生成物**：`node_modules` / `.git` 不出现在树里是**正常的**。
{
  const README29 = 'README.md';
  const SKIP_TOP29 = new Set(['node_modules', '.git', 'dist', 'target', 'build', 'coverage']);
  const TREE_HEAD29 = /^##\s*目录结构\s*$/;
  /** 判定与 canary **共用**：从「目录结构」代码块里提取**带层级的目录路径**。 */
  const treeDirsOf = (src) => {
    const lines = src.split('\n');
    const at = lines.findIndex((l) => TREE_HEAD29.test(l));
    if (at < 0) return null; // 找不到该节 ⇒ 由调用方报错（不静默跳过）
    let start = -1;
    for (let i = at + 1; i < lines.length; i += 1) {
      if (/^```/.test(lines[i])) { start = i + 1; break; }
      if (/^##\s/.test(lines[i])) return null;
    }
    if (start < 0) return null;
    const out = [];
    const stack = [];
    for (let i = start; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^```/.test(line)) break;
      if (!/[├└]──/.test(line)) continue;
      const gi = line.search(/[├└]──/);
      const level = Math.floor(gi / 4);
      const rest = line.slice(gi + 3).replace(/\s*#.*$/, '');
      const names = [...rest.matchAll(/([A-Za-z0-9._-]+)\//g)].map((m) => m[1]);
      if (names.length === 0) continue;
      stack.length = level;
      for (const [k, name] of names.entries()) {
        if (k === 0) {
          stack[level] = name;
          out.push(stack.filter((x) => x !== undefined).join('/'));
        } else {
          // ⚠️ 同一行内联的多个目录是**兄弟**（如 `workspace/ commands/ i18n/ …`）
          //   ⇒ 路径 = **上一层** + 名字（首版误写成 `level + 1` ⇒ 拼出 `packages/workspace/commands`）
          out.push([...stack.filter((x) => x !== undefined).slice(0, level), name].join('/'));
        }
      }
    }
    return out;
  };
  const readme29 = read(README29);
  const listed = treeDirsOf(readme29);
  if (listed === null) {
    fail(`${README29} 找不到「## 目录结构」代码块 —— 删掉它会让「README 说得对不对」重新变成无人守`);
  } else {
    const isDir = (rel) => existsSync(resolve(root, rel)) && statSync(resolve(root, rel)).isDirectory();
    const listedSet = new Set(listed);
    const actualTop = readdirSync(root)
      .filter((n) => !n.startsWith('.') && n !== 'node_modules' && isDir(n))
      .sort();
    const actualSecond = [];
    for (const top of ['docs', 'tests']) {
      if (!isDir(top)) continue;
      for (const n of readdirSync(resolve(root, top))) {
        if (isDir(`${top}/${n}`)) actualSecond.push(`${top}/${n}`);
      }
    }
    actualSecond.sort();
    const problems = [];
    // ① 列出的必须存在
    for (const p of listed) if (!isDir(p)) problems.push(`列出但**不存在**：\`${p}/\``);
    // ② 顶层必须全列
    for (const n of actualTop) {
      if (SKIP_TOP29.has(n)) continue;
      if (!listedSet.has(n)) problems.push(`**顶层目录** \`${n}/\` 未列出`);
    }
    // ③ `docs/*` 与 `tests/*` 必须全列
    for (const p of actualSecond) {
      if (!listedSet.has(p)) problems.push(`**\`${p}/\`** 未列出`);
    }
    if (problems.length > 0) {
      fail(`${README29} 的「目录结构」树与实际不符：${problems.join('；')}`
        + ' —— 该段是**门面**，读者据它判断仓库里有什么；'
        + '「列出的条目要准确」在 §4.94 修过，但**从没锁「该列的有没有列」**（审计 §4.300）');
    }
    // 防空转：**健康度型**（条目数由 README 内容产生 ⇒ 留余量；立此判据时 30 个目录条目）
    if (listed.length < 20) {
      fail(`㉙ 只从 README 的目录树里解析出 ${listed.length} 个目录条目（[健康度型] 下限 20）`
        + ' —— 解析器失效或该段被删空会让本判据空转');
    }
    console.log(`Release gate: README 的「目录结构」树 —— 解析出 ${listed.length} 个目录条目，`
      + `与实际（顶层 ${actualTop.length} / docs+tests 二级 ${actualSecond.length}）**双向一致**`
      + '；⚠️ 范围只到**顶层 + docs/* + tests/***（`packages/*` 由另一条判据守）');
  }
  // canary：三向（与判定**共用** treeDirsOf）
  const SAMPLE_TREE = '## 目录结构\n\n```\nmellow/\n├── docs/\n│   ├── adr/\n│   └── specs/\n└── tests/\n    └── parity/\n```\n';
  const parsed = treeDirsOf(SAMPLE_TREE);
  if (parsed === null || !parsed.includes('docs/adr') || !parsed.includes('tests/parity')) {
    fail('㉙ canary 失效：树里的**二级**目录未被解析出（层级感知失效）');
  }
  if (parsed.includes('docs') === false || parsed.filter((p) => p === 'docs').length !== 1) {
    fail('㉙ canary 失效：顶层目录未被解析出');
  }
  if (treeDirsOf('## 别的节\n\n```\n├── docs/\n```\n') !== null) {
    fail('㉙ canary **过宽**：没有「## 目录结构」节的文档被当成了有');
  }
  if (treeDirsOf(SAMPLE_TREE).includes('adr') || treeDirsOf(SAMPLE_TREE).includes('parity')) {
    fail('㉙ canary 失效：二级目录被当成了**顶层**（层级未生效）');
  }
}

// ── ㉚ 护栏里调用的 `node:*` 导出名必须先 import（2026-10-11，审计 §4.301）──
// 【为什么】判据 ㉒ 守「调用了未定义的**断言辅助函数**」，但它**只认 `fail` / `assert` 两个名字**
//   （§4.292 明写了这个边界）。**其他名字**调用了却没定义 ⇒ 抛 `ReferenceError` ⇒
//   **整条护栏中断、其后判据从未判定** —— 而**静态阅读看不出**（名字在、逻辑也对）。
//   ⚠️ **本轮实测（活证据）**：新写的 ㉙ 用了 `statSync` 却**没 import** ⇒ 运行即
//   `ReferenceError: statSync is not defined` ⇒ **㉙ 从未判定**；
//   而 `node --check` 只做**语法**检查，**抓不到**未定义标识符。
// 【判据】每个护栏源码（**剥注释 + 剥字符串**）里：凡**裸调用**了「全仓护栏从 `node:*` 导入过的名字」
//   中的某一个，而该名字在本护栏里**既没 import 也没本地定义**（`const/let/var/function/class NAME`）⇒ 红。
// ⚠️ **词表是派生的**（全仓 `node:*` import 名字的**并集**）⇒ 自维护、无副本。
// ⚠️ **必须剥字符串**：实测 6 处假阳性**全部**是「`fail('…必须 writeFileSync(…)')` 的消息」与
//   「canary 样本字符串」⇒ **不剥字符串这条判据不可用**（本轮实测）。
// ⚠️ **边界如实声明**：**模板字面量整体被剥** ⇒ `${statSync(x)}` 这类**表达式内**的调用**不在覆盖内**；
//   属性访问（`fs.statSync(`）与本地定义（`const statSync = …`）**正确地不报**。
// ⚠️ **与 ㉒ 的分工**：㉒ 守「**断言辅助函数**」、本判据守「**`node:*` 导出名**」
//   —— 两者合起来才覆盖「**调用了就必须有定义**」这一句话。
// ⚠️ **边界（实测，必须声明）：本判据**不能保护它自己所在的文件**。**
//   实测（2026-10-11）：把本文件的 `statSync` 从 import 里拿掉 ⇒ **本文件直接崩**
//   （`ReferenceError`）⇒ **本判据自己也不会运行** ⇒ 报的是崩溃、不是这条消息。
//   ⇒ 但**不会假绿**：崩溃 = CI 红 = 有人来查（**丢的是「具体性」，不是「正确性」**）。
//   其余 22 个护栏**由本判据覆盖**（实测：往 `verify-menu-contract.mjs` 注入裸 `spawnSync` ⇒ 被抓住）。
{
  const NODE_IMPORT30 = /^[ \t]*import\s*\{([^}]+)\}\s*from\s*'node:[^']+'/gm;
  // ⚠️ **2026-10-11（审计 §4.310）**：原为本块内的局部 `stripStrings30` ⇒ 现提到**模块级**
  //   `stripStrings`，与 `㉒` **共用同一实现**（同族判据的剥法必须一致 —— 否则它们只是
  //   「两个带不同 bug 的意见」）。
  const stripStrings30 = stripStrings;
  /** 判定与 canary **共用**：一份护栏源码里「调用了 `node:*` 导出名却没 import / 没本地定义」的名字。 */
  const missingNodeImports = (rawSrc, vocab, imported) => {
    const src = stripStrings30(stripJsComments(rawSrc));
    const out = [];
    for (const name of vocab) {
      if (imported.has(name)) continue;
      if (!new RegExp(`(^|[^.\\w$])${name}\\s*\\(`).test(src)) continue;
      if (new RegExp(`(?:const|let|var|function|class)\\s+${name}\\b`).test(src)) continue;
      out.push(name);
    }
    return out;
  };
  const guards30 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const vocab30 = new Set();
  const importedOf30 = new Map();
  const srcOf30 = new Map();
  for (const f of guards30) {
    const s = read(`tests/parity/${f}`);
    srcOf30.set(f, s);
    const set = new Set();
    // ⚠️ **import 解析必须在「剥注释 + 行首锚定」的文本上做**（2026-10-11，审计 §4.306 实测）：
    //   首版直接在**原文**上匹配 `import { … } from 'node:…'` ⇒ **本判据自己的 canary 样本**
    //   （写成字符串的 `import { statSync } from 'node:fs';`）**被当成了真 import**
    //   ⇒ `statSync` 进了「已 import」集合 ⇒ **真正的缺失被样本掩盖**（**假阴性**，且只有
    //   在「本文件少 import 一个名字」时才暴露 —— 而那正是本判据要抓的形态）。
    //   ⇒ ① 剥注释（注释里的示例不再污染）；② **行首锚定**（真 import 在行首，
    //      而样本在**字符串**里、不在行首）。⚠️ 边界：**含真实换行的模板样本**仍可能污染。
    for (const m of stripJsComments(s).matchAll(NODE_IMPORT30)) {
      for (const n of m[1].split(',').map((x) => x.trim()).filter(Boolean)) { vocab30.add(n); set.add(n); }
    }
    importedOf30.set(f, set);
  }
  const offenders30 = [];
  for (const f of guards30) {
    const miss = missingNodeImports(srcOf30.get(f), vocab30, importedOf30.get(f));
    if (miss.length > 0) offenders30.push(`${f}（${[...new Set(miss)].join(', ')}）`);
  }
  if (offenders30.length > 0) {
    fail(`这些护栏**调用了未 import 的 \`node:*\` 导出名**：${offenders30.join('、')} —— `
      + '运行即 `ReferenceError` ⇒ **整条护栏中断、其后判据从未判定**（而 `node --check` 只查语法、抓不到）；'
      + '请补 import（审计 §4.301）');
  }
  // 防空转：[健康度型] 词表由全仓 import 产生 ⇒ 留余量（立此判据时 24 个）
  if (vocab30.size < 15) {
    fail(`㉚ 只从全仓护栏里收集到 ${vocab30.size} 个 \`node:*\` 导入名（[健康度型] 下限 15）`
      + ' —— 词表塌缩会让本判据空真');
  }
  // canary：五向（与判定**共用** missingNodeImports）
  const VOCAB30_SAMPLE = new Set(['statSync', 'readFileSync']);
  const BAD30 = 'const a = statSync("x");';
  if (!missingNodeImports(BAD30, VOCAB30_SAMPLE, new Set()).includes('statSync')) {
    fail('㉚ canary 失效：**未 import 的裸调用**未被检出（判据已退化成空真）');
  }
  if (missingNodeImports(`import { statSync } from 'node:fs';\n${BAD30}`, VOCAB30_SAMPLE, new Set(['statSync'])).length !== 0) {
    fail('㉚ canary **过宽**：已 import 的名字被误报');
  }
  if (missingNodeImports('const statSync = (p) => p;\nstatSync("x");', VOCAB30_SAMPLE, new Set()).length !== 0) {
    fail('㉚ canary **过宽**：**本地定义**的名字被误报');
  }
  if (missingNodeImports('fs.statSync("x");', VOCAB30_SAMPLE, new Set()).length !== 0) {
    fail('㉚ canary **过宽**：**属性访问**（`fs.statSync(`）被误报');
  }
  // ⚠️ 本向**就是本轮 6 处假阳性的形态**：名字出现在**字符串**里（消息 / canary 样本）
  if (missingNodeImports(`fail('必须 writeFileSync(OUT, next)');`, VOCAB30_SAMPLE, new Set()).length !== 0) {
    fail('㉚ canary **过宽**：**字符串里**的调用被误报（必须剥字符串 —— 本轮实测的 6 处假阳性形态）');
  }
  console.log(`Release gate: 护栏的 \`node:*\` 导入 —— 扫描 ${guards30.length} 个护栏、词表 ${vocab30.size} 个名字，`
    + `未 import 的裸调用 ${offenders30.length} 处`
    + '；⚠️ 只覆盖**裸调用**（属性访问 / 本地定义不报；**模板内的 `${…}` 表达式不在覆盖内**）');
}

// ── ㉛ workflow 里**不得**用 `continue-on-error` 吞掉失败（2026-10-11，审计 §4.302）──
// 【为什么】`continue-on-error: true` 把**步骤失败降级成 job 成功** ⇒ **假绿**（本仓 #1 形态）。
//   ⚠️ 本仓**真的发生过**（§4.51「发现 2」）：`runtime-qualification.yml` 的两个视觉步骤曾是
//   `continue-on-error: true`，理由写的是「本步骤用于**采集**基线……**基线入库后**如需作为门禁，
//   再改为严格比对」—— 而三平台基线**都已入库** ⇒ **该理由按它自己的条件已失效** ⇒
//   回归**随 v1.5.16 发布**、而门禁**报绿**。修掉之后，注释里立了**明文规则**
//   「**不得**用 `continue-on-error` 掩盖」—— 但**没有任何判据守它**
//   （本轮实测：全仓 6 处提及**全在注释里**、**0 处实际使用**）⇒ 明文规则问「**谁在守它**」。
// 【判据】`.github/workflows/*.yml` 里 `continue-on-error` 的**取值不得是 `true`**
//   （**step 级与 job 级同形**；`false` 是默认值、不报；表达式（`${{ … }}`）**也要登记**——
//   它同样是「按条件吞掉失败」）。豁免必须登记进 `CONTINUE_ON_ERROR_EXEMPT` 并给理由（**双向**）。
// ⚠️ **边界如实声明**：同类还有 **`|| true` / `set +e`**（实测 19 处，**全部**在**诊断 / 清理**类
//   命令上 —— `pkill` / `cat` / `grep -c` / `xdotool`）⇒ **不做机械禁止**（会大面积假阳性，
//   而「**做假阳性判据不如不做**」）。本判据只锁**语义最明确**的那一种。
{
  const WF_DIR31 = '.github/workflows';
  const COE_LINE = /^\s*continue-on-error:\s*(.+?)\s*(?:#.*)?$/;
  /** 判定与 canary **共用**：一行是否命中「`continue-on-error` 取值 != `false`」。 */
  const hits31Like = (re, line) => {
    const m = re.exec(line);
    return m !== null && m[1] !== 'false';
  };
  // 豁免登记处（目前为空 —— 确需豁免时在此登记并给理由；**双向**检查在下方）
  const CONTINUE_ON_ERROR_EXEMPT = new Map();
  const wfFiles31 = existsSync(resolve(root, WF_DIR31))
    ? readdirSync(resolve(root, WF_DIR31)).filter((f) => /\.ya?ml$/.test(f)).sort()
    : [];
  const hits31 = new Map(); // `${file}:${line}` → 取值
  for (const f of wfFiles31) {
    read(`${WF_DIR31}/${f}`).split('\n').forEach((l, i) => {
      // ⚠️ 注释行不匹配：`^\s*continue-on-error` 要求它紧跟空白（`# …` 开头的不匹配）
      if (hits31Like(COE_LINE, l)) hits31.set(`${f}:${i + 1}`, COE_LINE.exec(l)[1]);
    });
  }
  const unregistered31 = [...hits31.entries()].filter(([k]) => !CONTINUE_ON_ERROR_EXEMPT.has(k));
  if (unregistered31.length > 0) {
    fail(`这些 workflow 里 \`continue-on-error\` 会**把步骤失败降级成 job 成功**（**假绿**）：`
      + `${unregistered31.map(([k, v]) => `${k}（取值 \`${v}\`）`).join('、')} —— `
      + '本仓明文规则「**不得**用 `continue-on-error` 掩盖」（§4.51 发现 2：回归曾随 v1.5.16 发布、'
      + '而门禁报绿）；确需豁免请登记进 `CONTINUE_ON_ERROR_EXEMPT` 并给理由（审计 §4.302）');
  }
  // 豁免表**双向**：登记了却不再命中 ⇒ **已过期，请移除**（否则例外永久驻留、豁免面悄悄变大）
  for (const [key, why] of CONTINUE_ON_ERROR_EXEMPT) {
    if (!hits31.has(key)) {
      fail(`㉛ 的 CONTINUE_ON_ERROR_EXEMPT 登记了 ${key}（理由：${why}），`
        + '但它已不再命中 —— 已过期，请移除该例外条目');
    }
  }
  // 防空转：**覆盖型**（立此判据时的 workflow 数；加 workflow 时须一并上调）
  const WF31_BASELINE = 3; // [覆盖型] 基线 3
  coverEq('㉛ workflow 文件数', wfFiles31.length, WF31_BASELINE,
    '扫描面萎缩会让本判据**空转**');
  // canary：四向（与判定**共用** COE_LINE）
  if (!hits31Like(COE_LINE, '        continue-on-error: true')) {
    fail('㉛ canary 失效：`continue-on-error: true` **未被检出**（判据已退化成空真）');
  }
  if (!hits31Like(COE_LINE, '    continue-on-error: true   # 有意')) {
    fail('㉛ canary 失效：**带尾注释**的形态未被检出');
  }
  if (hits31Like(COE_LINE, '        continue-on-error: false')) {
    fail('㉛ canary **过宽**：`false`（默认值）被误报');
  }
  if (hits31Like(COE_LINE, '        # continue-on-error: true（说明为何移除）')) {
    fail('㉛ canary **过宽**：**注释里**的提及被误报（本仓 6 处提及全在注释里）');
  }
  if (!hits31Like(COE_LINE, '    continue-on-error: ${{ github.event_name == \'push\' }}')) {
    fail('㉛ canary 失效：**表达式**形态未被检出（它同样是「按条件吞掉失败」）');
  }
  console.log(`Release gate: workflow 的 \`continue-on-error\` —— 扫描 ${wfFiles31.length} 个 workflow，`
    + `会吞掉失败的步骤 ${hits31.size} 处（[覆盖型] 基线 ${WF31_BASELINE}）`
    + '；⚠️ 同类 `|| true` / `set +e`（**诊断 / 清理类**）不做机械禁止，如实声明');
}

// ── ㉜ JS/TS 测试文件**必须有用例，且有用例就必须有断言**（2026-10-11，审计 §4.304）──
// 【为什么】本仓**已有**「空壳测试」检查 —— 但**只覆盖 Rust**（`verify-parity-ledger.mjs` 的
//   「函数体只有 `let _ = f(...)` 的**恒真空壳**」；起因是 `P0-EDITOR-005` 的拼写建议测试
//   长期是恒真空壳）。**JS/TS 侧没有对应的检查** ⇒ 同族「只锁了一半」的**语言轴那一半**。
// 【判据】每个 `*.test.*` / `*.spec.*` 文件（**排除 vendored `CoreEditor/`**）：
//   ① 必须至少有 **1 个用例**（`it(` / `test(` / `it.each(` / `test.each(`）——
//      「被 jest 收集、但 0 个用例」= **文件级空壳**（jest 会平静地报 `0 tests`）；
//   ② 有用例 ⇒ 必须至少有 **1 个断言**（`expect(`）—— 「有用例但零断言」= **体级空壳**
//      （不抛异常即通过，断言本体不检查任何东西 —— 与 Rust 侧**同一形态**）。
// ⚠️ **范围如实声明**：只覆盖 `expect(` 这一种断言形态（本仓 148 个测试文件**实测全部**用它）；
//   若将来引入别的断言库（`assert` / `chai`），需回来扩面。
// ⚠️ **实测（2026-10-11）**：148 个文件 · **0 个零用例** · **0 个零断言** ⇒ 本判据**落地即绿**，
//   作用是**防它出现**（同 §4.265「0 缺陷也落判据」）。
{
  const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
  const VENDORED32 = '/CoreEditor/';
  const testFiles32 = (trackedFiles ?? [])
    .filter((f) => TEST_FILE.test(f) && !f.includes(VENDORED32))
    .sort();
  const CASE_RE = /(?:^|[^.\w])(?:it|test)(?:\.\w+)?\s*\(/g;
  const EXPECT_RE = /(?:^|[^.\w])expect\s*\(/g;
  /** 判定与 canary **共用**：一份测试源码的「空壳」问题（返回原因数组）。 */
  const shellIssues = (src) => {
    const out = [];
    const cases = (src.match(CASE_RE) ?? []).length;
    const expects = (src.match(EXPECT_RE) ?? []).length;
    if (cases === 0) out.push('**0 个用例**（文件级空壳：被 jest 收集但什么也不跑）');
    else if (expects === 0) out.push(`有 ${cases} 个用例但 **0 个断言**（体级空壳：不抛异常即通过）`);
    return out;
  };
  const offenders32 = [];
  for (const f of testFiles32) {
    const issues = shellIssues(read(f));
    if (issues.length > 0) offenders32.push(`${f}（${issues.join('；')}）`);
  }
  if (offenders32.length > 0) {
    fail(`这些测试文件是**空壳**：${offenders32.join('、')} —— `
      + '本仓对 **Rust** 已有「恒真空壳」检查（`P0-EDITOR-005` 的拼写建议测试曾是恒真空壳），'
      + '而 **JS/TS 侧此前没有对应检查**（审计 §4.304）；请补上用例与断言');
  }
  // 防空转：**健康度型**（测试文件数由仓库内容产生 ⇒ 留余量；立此判据时 148 个）
  if (testFiles32.length < 100) {
    fail(`㉜ 只找到 ${testFiles32.length} 个测试文件（[健康度型] 下限 100）`
      + ' —— 扫描面漂移会让本判据**空转**');
  }
  // canary：三向（与判定**共用** shellIssues）
  if (shellIssues("it('a', () => { expect(1).toBe(1); });").length !== 0) {
    fail('㉜ canary **过宽**：正常用例被误报为空壳');
  }
  if (!shellIssues("it('a', () => { doThing(); });").some((s) => s.includes('0 个断言'))) {
    fail('㉜ canary 失效：**有用例但零断言**未被检出（判据已退化成空真）');
  }
  if (!shellIssues('describe("x", () => {});').some((s) => s.includes('0 个用例'))) {
    fail('㉜ canary 失效：**零用例**的文件未被检出');
  }
  console.log(`Release gate: JS/TS 测试的**空壳** —— 扫描 ${testFiles32.length} 个测试文件`
    + `（[健康度型] 下限 100），空壳 ${offenders32.length} 个`
    + '；⚠️ 只覆盖 `expect(` 这一种断言形态（Rust 侧的同类检查在 `verify-parity-ledger.mjs`）');
}

// ── ㉝ 每个护栏的**判据头编号必须连续**（2026-10-11，审计 §4.307）──
// 【为什么】判据 **①** 守「`tests/parity/verify-*.mjs` 的每一个都必须出现在两条脚本链里」——
//   即**防「某人悄悄删掉一条护栏」**。但它守的是**文件**粒度
//   ⇒ **「护栏内某一条判据被删掉」没有任何信号**（`verify-doc-code-refs.mjs` 判据 ㊸ 只守「**同一护栏内不重复**」，不守「**缺号**」）。
//   ⇒ 同族「只锁了一半」的**粒度轴那一半**：**文件 vs 判据**。
// 【判据】每个 `verify-*.mjs` 的「`// ── <圈号>`」判据头编号集合必须**连续**：
//   允许**子编号**（`③-b` / `⑳c`）与**合并写法**（`① + ②`）—— 解析方式与 ㊸ **同款**（㊸ 守重复、本条守缺号）。
//   缺号 ⇒ 报「某条判据被删过，请确认它守的纪律是否还有人守（或把编号补齐）」。
// ⚠️ **代价如实声明**：**重编号**（把后面的判据往前挪以填洞）也会红 —— 那是**有意的**：
//   编号是「每护栏本地」的定位符（`verify-doc-code-refs.mjs` 判据 ㊸ 的注释写了这一点）⇒ 删号会让「`<护栏>` 判据 N」**永久指空**。
// ⚠️ **边界**：只覆盖「`// ── <圈号>`」这一种判据头形态（本仓实测**全部**判据头都是它）；
//   用别的形态写判据头 ⇒ 不在扫描面内（本判据会因总数下限而**响亮失败**，不会静默）。
{
  const CIRCLED33 = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿';
  const CLASS33 = '①-⑳㉑-㉟㊱-㊿';
  const TOKEN33 = new RegExp(`^\\s*([${CLASS33}]|C\\d+)(-?[a-z])?`);
  const HAS33 = new RegExp(`^(?:[${CLASS33}]|C\\d+)`);
  /** 判定与 canary **共用**（与 ㊸ 同款）：该行 `// ──` 头里的编号 token 列表。 */
  const headerTokens33 = (line) => {
    const m = /^\s*\/\/ ──\s*(.*)$/.exec(line);
    if (m === null) return [];
    let rest = m[1];
    const out = [];
    for (;;) {
      const t = TOKEN33.exec(rest);
      if (t === null) break;
      out.push(t[1] + (t[2] ?? ''));
      rest = rest.slice(t[0].length);
      // 合并写法 `① + ②`：分隔符后可再跟一个圈号
      const sep = new RegExp(`^\\s*[+·/、]\\s*(?=[${CLASS33}])`).exec(rest);
      if (sep !== null) rest = rest.slice(sep[0].length);
      if (!HAS33.test(rest)) break;
    }
    return out;
  };
  const guards33 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const offenders33 = [];
  let withHeads33 = 0;
  for (const f of guards33) {
    const nums = new Set();
    for (const line of read(`tests/parity/${f}`).split('\n')) {
      for (const tk of headerTokens33(line)) {
        const c = tk[0];
        const n = CIRCLED33.indexOf(c);
        if (n >= 0) nums.add(n + 1);
      }
    }
    if (nums.size === 0) continue;
    withHeads33 += 1;
    const arr = [...nums].sort((a, b) => a - b);
    const gaps = [];
    for (let i = arr[0]; i < arr[arr.length - 1]; i += 1) if (!nums.has(i)) gaps.push(i);
    if (gaps.length > 0) {
      offenders33.push(`${f}（缺号：${gaps.map((g) => CIRCLED33[g - 1]).join('、')}）`);
    }
  }
  if (offenders33.length > 0) {
    fail(`这些护栏的**判据头编号不连续**：${offenders33.join('、')} —— `
      + '判据 ① 守的是「**护栏文件**不被悄悄删掉」，而**护栏内某一条判据被删**此前**没有任何信号**；'
      + '编号是「每护栏本地」的定位符 ⇒ **删号会让「`<护栏>` 判据 N」永久指空**。'
      + '请**补齐编号**，或在删号处写明「为什么这条纪律不再需要」（审计 §4.307）');
  }
  // 防空转：[健康度型] 集合由源码内容产生 ⇒ 留余量（立此判据时 9 个护栏有判据头）
  if (withHeads33 < 6) {
    fail(`㉝ 只解析出 ${withHeads33} 个带判据头的护栏（[健康度型] 下限 6）`
      + ' —— 解析器失效或扫描面漂移会让本判据**空转**');
  }
  // canary：四向（与判定**共用** headerTokens33；样本运行时拼接）
  if (headerTokens33(`// ── ${'①'} + ${'②'} 核心包 ──`).join(',') !== '①,②') {
    fail('㉝ canary 失效：合并写法 `① + ②` 只解析出一个 token（那样缺号判定会漏一半）');
  }
  if (headerTokens33(`// ── ${'③'}-b Windows ──`).join(',') !== '③-b') {
    fail('㉝ canary 失效：子编号 `③-b` 的后缀被丢掉');
  }
  if (headerTokens33('// ── 侧栏截图：判据由「文件存在」改为… ──').length !== 0) {
    fail('㉝ canary **过宽**：无圈号的 `// ──` 头被解析出了 token');
  }
  if (headerTokens33(`    // ── ${'⑪'} 发版手册 ──`).length !== 1) {
    fail('㉝ canary 失效：**缩进**的判据头未被解析（实测本仓有缩进头 ⇒ 漏掉会让缺号判定失真）');
  }
  console.log(`Release gate: 判据头编号连续性 —— 扫描 ${guards33.length} 个护栏，`
    + `其中 ${withHeads33} 个有判据头、不连续 ${offenders33.length} 个`
    + '；⚠️ 与 ㊸ 的分工：**㊸ 守重复、本条守缺号**，两条合起来才是「编号空间健全」');
}

// ── ㉞ workflow 的**缩进**必须与解析器的假设一致（2 / 4 空格）（2026-10-11，审计 §4.308）──
// 【为什么】判据 **⑮**（每个 job 必须有 `timeout-minutes`）与 **⑯**（每个 workflow 必须声明 `permissions:`）
//   都**按行结构读 YAML**（不引 `js-yaml`，见 ⑮ 的注释），因此**假设了固定缩进**：
//   ⑮ 的 `JOB_HEAD = /^ {2}(…):\s*$/` 与 `TIMEOUT = /^ {4}timeout-minutes:\s*(\d+)\s*$/`；
//   ⑯ 的 `PERM_ITEM = /^ {2}([a-z-]+):\s*(\S+)\s*$/`。
//   ⚠️ **YAML 允许任意缩进** ⇒ 换个缩进（或**手工重排一个 job**）会让这些解析器**静默漏检**：
//   `timeout-minutes` 被漏掉 ⇒ 该 job **无超时边界**、而判据不报（**假阴性**）。
//   ⚠️ **防空转只挡「整体改变」**（job 数骤降会红）—— **挡不住「局部改一个 job」**。
// 【判据】每个 `.github/workflows/*.yml`：
//   ① **`jobs:` 块内的最小缩进必须恰好是 2**（⇒ **job 头**就在 2 空格 —— ⑮ 的 `^ {2}` 才抓得到）；
//   ② **`timeout-minutes:`** 必须**恰好 4 空格**缩进，且值是**裸整数**（不带引号 / 表达式）。
//   ⇒ 把「解析器的假设」变成**响亮失败**，而不是静默漏检。
// ⚠️ **首版谓词错了**（实测：报 **61 处**假阳性）：它把「**任意**缩进的键」都当成 job 头 ⇒
//   `steps:` 下的深层键全被误判。**正解 = 看块内最小缩进**（job 头 = `jobs:` 的直接子键 = 最浅那层）。
// ⚠️ **边界如实声明**：本判据**不判断** YAML 的其它缩进风格（`steps` / `with` 等不在覆盖内），
//   也不声称「2/4 是唯一正确的 YAML」—— 它只是**本仓解析器的假设**。
{
  const WF_DIR34 = '.github/workflows';
  const KEY_LINE34 = /^( +)([A-Za-z0-9_-]+):(\s|$)/;
  const TIMEOUT34 = /^( +)timeout-minutes:\s*(\S+)\s*$/;
  const wfFiles34 = existsSync(resolve(root, WF_DIR34))
    ? readdirSync(resolve(root, WF_DIR34)).filter((f) => /\.ya?ml$/.test(f)).sort()
    : [];
  const offenders34 = [];
  let jobs34 = 0;
  for (const f of wfFiles34) {
    const lines = read(`${WF_DIR34}/${f}`).split('\n');
    const at = lines.findIndex((l) => /^jobs:\s*$/.test(l));
    if (at < 0) continue;
    const indents = new Set();
    let blockJobs34 = 0;
    for (let i = at + 1; i < lines.length; i += 1) {
      const l = lines[i];
      if (l.trim() === '' || /^\s*#/.test(l)) continue;
      if (/^\S/.test(l)) break; // 回到顶层键 ⇒ jobs 块结束
      const k = KEY_LINE34.exec(l);
      if (k !== null) {
        indents.add(k[1].length);
        // ⚠️ **只在 `jobs:` 块内计数**（首版在全文件上数 ⇒ 把 `on:` 块里的 2 空格键也算成 job ⇒ 报 29 而实际 16）
        if (k[1].length === 2) blockJobs34 += 1;
      }
      const t = TIMEOUT34.exec(l);
      if (t === null) continue;
      if (t[1].length !== 4) {
        offenders34.push(`${f}:${i + 1} \`timeout-minutes\` 缩进 **${t[1].length} 空格**（解析器假设 4）`);
      } else if (!/^\d+$/.test(t[2])) {
        offenders34.push(`${f}:${i + 1} \`timeout-minutes\` 的值 \`${t[2]}\` **不是裸整数**（解析器假设 \`\\d+\`）`);
      }
    }
    if (indents.size === 0) continue;
    const minIndent = Math.min(...indents);
    if (minIndent !== 2) {
      offenders34.push(`${f} 的 \`jobs:\` 块**最小缩进是 ${minIndent} 空格**（解析器假设 2 ⇒ job 头在 2 空格）`);
    } else {
      jobs34 += blockJobs34;
    }
  }
  if (offenders34.length > 0) {
    fail(`workflow 的缩进与**解析器的假设**不一致：${offenders34.join('；')} —— `
      + '判据 ⑮ / ⑯ **按行结构读 YAML**（不引 `js-yaml`）⇒ **假设 job 头 2 空格、`timeout-minutes` 4 空格且为裸整数**。'
      + '**YAML 允许任意缩进**，但换个缩进会让它们**静默漏检**（假阴性）；'
      + '本判据把该假设变成**响亮失败**（审计 §4.308）');
  }
  // 防空转：[健康度型] job 数由仓库内容产生 ⇒ 留余量（立此判据时 16 个 job）
  if (jobs34 < 10) {
    fail(`㉞ 只解析出 ${jobs34} 个 2 空格缩进的 job 头（[健康度型] 下限 10）`
      + ' —— 解析器失效会让本判据**空转**');
  }
  // canary：四向（与判定**共用** KEY_LINE34 / TIMEOUT34）
  if (!KEY_LINE34.test('  build:')) {
    fail('㉞ canary 失效：2 空格的键未被识别');
  }
  if (TIMEOUT34.exec('    timeout-minutes: 15') === null
    || TIMEOUT34.exec('    timeout-minutes: 15')[1].length !== 4) {
    fail('㉞ canary 失效：4 空格的 `timeout-minutes` 未被识别');
  }
  if (TIMEOUT34.exec('      timeout-minutes: 15')[1].length === 4) {
    fail('㉞ canary **过宽**：6 空格的 `timeout-minutes` 被当成了 4 空格');
  }
  if (/^\d+$/.test('"15"')) {
    fail('㉞ canary 失效：带引号的数值被当成了裸整数');
  }
  console.log(`Release gate: workflow 的**缩进假设** —— 扫描 ${wfFiles34.length} 个 workflow / ${jobs34} 个 job 头，`
    + `与「2 / 4 空格 + 裸整数」不一致 ${offenders34.length} 处`
    + '；⚠️ 只锁**解析器假设的那两处**（`steps` / `with` 等不在覆盖内），不声称 2/4 是唯一正确的 YAML');
}

// ── ㉟ `signal: hard` 必须**指出**它的失败点（2026-10-11，审计 §4.309）──
// 【为什么】判据 ⑳ 把「**软**」管住了（`signal: advisory` 必须写 `advisoryWhy`），
//   却**完全没管「假硬」** —— 而 `hard` 是**更强**的声明（「会因发现而失败」），
//   反而**零举证**：一个工具可以声称会拦住，而实际恒退出 0（= 事实上的 advisory，却
//   **不需要**写任何理由）。⇒ 与 §4.286「软报 = 没报」**镜像**：那次管的是「软」，
//   这次是「**假硬**」—— 同一句话（`signal` 的语义）的另一半。
//   ⚠️ 实测代价（本轮，两条声明**都与实际相反**）：
//     · `audit-guard-bounds.mjs` 登记 `hard` —— 它**唯一**的两处非零退出是
//       「工作区不干净 ⇒ **拒绝运行** `process.exit(2)`」与信号处理 `143/130`；
//       它的头部**逐字**写着「本工具的输出是『候选』，不是『缺陷』」⇒ **从不因发现而失败**。
//     · `audit-bold-pairing.mjs` 登记 `advisory`（语义 = **恒退出 0**），
//       而它末行是 `process.exit(bad === 0 ? 0 : 1)` ⇒ **它其实会失败**。
// 【判据】每条 `signal: hard` 必须给 `failsOn`：一段**逐字**取自该工具源码的片段，且
//   ① 在源码里**恰好出现一次**（唯一 ⇒ 强制精确到能区分同一文件里的别的退出路径）；
//   ② 含**非零**退出（`process.exit(非 0)` / `process.exitCode = 非 0` / `throw`）；
//   ③ **不是信号处理器**（片段里不得出现 `process.on(` / `SIGTERM|SIGINT|SIGHUP|SIGQUIT`）。
//   ⚠️ 比较按**逐行 trim** 后拼接（对缩进不敏感）—— §4.308 的教训：**绝对缩进假设会静默漏检**。
// 【边界如实声明】
//   ⚠️ 本判据**不能**证明「该退出路径真的会因『发现』而触发」（静态不可判定）。它只保证
//     「**声明**指向一条**真实存在、唯一、非零、非信号**的退出路径」—— 把「假硬」从
//     「一句无人核对的话」变成「**必须挑出一行代码**」。
//   ⚠️ 反向（`advisory` 却其实会失败 = 「假软」）**不在覆盖内**：静态上无法与
//     「canary 失败 / 拒绝运行」区分（实测 `audit-doc-counts.mjs` 的 `process.exitCode = 1`
//     就在 `failCanary` 里）⇒ 如实登记为盲区。本轮的两条实例是**人工**核对出来的。
{
  const TOOLS_REG35 = 'tests/parity/fixtures/local-tools.json';
  const reg35 = JSON.parse(read(TOOLS_REG35));
  const entries35 = reg35.tools ?? [];
  /** 逐行 trim 后拼接 —— 对缩进不敏感。
   *  ⚠️ **这里刻意不做 CRLF 归一化**（首版做了，被判据 ⑤ 的 canary 当场抓住 ✅）：
   *    · 工具源码经 `read()` 读入 —— 它**已经**归一化（判据 ⑤ 要求全文件**只有那一处**归一化）；
   *    · `failsOn` 来自 JSON 夹具 —— 文本文件走 `.gitattributes` 的 `eol: lf`（判据 ⑰ 守）。 */
  const normLines35 = (s) => s.split('\n').map((l) => l.trim()).join('\n');
  const NONZERO_EXIT35 = /process\.exit\s*\(\s*(?!0\s*\))/;
  const NONZERO_CODE35 = /process\.exitCode\s*=\s*(?!0\b)\d/;
  const THROW35 = /\bthrow\s+(new\s+)?\w/;
  const SIGNAL35 = /process\.on\s*\(|\bSIGTERM\b|\bSIGINT\b|\bSIGHUP\b|\bSIGQUIT\b/;
  /** 判定与 canary **共用**：`failsOn` 是否合格（null = 合格）。 */
  const failsOnVerdict = (failsOn, src) => {
    if (typeof failsOn !== 'string' || failsOn.trim() === '') return '缺 `failsOn`（或为空）';
    if (!(NONZERO_EXIT35.test(failsOn) || NONZERO_CODE35.test(failsOn) || THROW35.test(failsOn))) {
      return '`failsOn` 里**没有非零退出**（`process.exit(非 0)` / `process.exitCode = 非 0` / `throw`）';
    }
    if (SIGNAL35.test(failsOn)) {
      return '`failsOn` 指向的是**信号处理器**（`process.on(` / `SIGTERM` / `SIGINT` / …）'
        + ' —— 那不是「因发现而失败」';
    }
    const hay = normLines35(src);
    const needle = normLines35(failsOn);
    const at = hay.indexOf(needle);
    if (at < 0) return '`failsOn` **在该工具源码里找不到**（必须逐字取自源码）';
    if (hay.indexOf(needle, at + 1) >= 0) {
      return '`failsOn` 在源码里**出现多于一次**（不唯一）—— 请把片段写长到能**唯一定位**那一条退出路径';
    }
    return null;
  };
  const hard35 = entries35.filter((t) => t.signal === 'hard');
  for (const t of hard35) {
    let src = '';
    try { src = read(`tests/parity/tools/${t.name}`); } catch { continue; }
    const bad = failsOnVerdict(t.failsOn, src);
    if (bad !== null) {
      fail(`㉟ \`${t.name}\` 声称 \`signal: hard\`（「会因发现而失败」），但 ${bad}`
        + ' —— `hard` 是**更强**的声明，**必须**指出那行代码；'
        + '若它其实只报线索，请改 `signal: advisory` 并写 `advisoryWhy`（审计 §4.309）');
    }
  }
  // 防空转：[覆盖型] hard 条目数（登记表增删时必须一并复核）
  const HARD35_BASELINE = 5; // [覆盖型] 基线 5
  coverEq('㉟ `signal: hard` 条目数', hard35.length, HARD35_BASELINE,
    '登记表被删条目会让本判据**空转**');
  // canary：六向（与判定**共用** failsOnVerdict）
  const SRC_A35 = normLines35(
    'if (bad > 0) {\n'
    + '  process.exit(1);\n'
    + '}\n'
    + 'if (forged.length > 0) {\n'
    + "  throw new Error('boom');\n"
    + '}\n'
    + "process.on('SIGTERM', () => { process.exit(143); });\n"
    + 'process.exit(0);',
  );
  const SRC_B35 = normLines35('process.exit(1);\nprocess.exit(1);');
  const CANARIES35 = [
    ['process.exit(1);', SRC_A35, true, '合格样本（非零 + 唯一 + 非信号）'],
    ["throw new Error('boom');", SRC_A35, true, '`throw` 也算失败点'],
    ['process.exit(0);', SRC_A35, false, '**零**退出不算失败点'],
    ["process.on('SIGTERM', () => { process.exit(143); });", SRC_A35, false, '信号处理器不算'],
    ['process.exit(1);', SRC_B35, false, '出现多于一次 ⇒ 不唯一'],
    ['process.exit(9);', SRC_A35, false, '源码里找不到'],
  ];
  for (const [failsOn, src, shouldPass, what] of CANARIES35) {
    if ((failsOnVerdict(failsOn, src) === null) !== shouldPass) {
      fail(`㉟ canary ${shouldPass ? '**过宽**' : '失效'}：${what} 的样本被误判`);
    }
  }
  console.log(`Release gate: 本机工具的 \`signal: hard\` 失败点 —— ${hard35.length} 条 hard 条目`
    + '（每条 `failsOn` 都**逐字存在、唯一、含非零退出、不是信号处理器**）；'
    + '⚠️ 只保证「声明指向一条真实的失败路径」，**不保证**它真会因「发现」而触发（静态不可判定）；'
    + '⚠️ 反向（`advisory` 却其实会失败 = 假软）**不在覆盖内**，如实登记为盲区');
}

// ── ㊱ `[覆盖型]` 基线必须由 `coverEq` 实现（2026-10-11，审计 §4.310）──
// 【为什么】判据 ⑥ 只核对「**标记里的数 == 阈值**」，**不核对「阈值 == 实际值」** ——
//   后者被**显式分工**给本机工具（`audit-guard-bounds.mjs`，用「抬 1 仍绿」二分），
//   而它**不在 CI**、且**只给候选、由人判断**（它自己的头部写着「输出是『候选』，不是『缺陷』」）。
//   ⇒ 后果实测：`[覆盖型]` 的下限普遍用 `< N` 实现，而 `< N` **只挡「缩小」**：
//     **集合增长时会静默稀释防线**。两条活证据（本轮由 `coverEq` 当场抓出）：
//       · 待裁决项登记表：`10 → 17`（§4.168 **修过一次**）**又漂到 20** —— 没人守；
//       · ⑲ 夹具份数：写 `7`，而实际 **9**（两次夹具新增都没同步基线）。
//   ⚠️ 更根本的是：`[覆盖型]` 的**定义**（集合是**人工维护的枚举**）与**用法**系统性不符 ——
//     21 处里 ≈15 处的**报错消息自己写着**「会让本判据**空转**」/「扫描面萎缩」= **健康度型语义**。
// 【判据】每个 `[覆盖型] 基线 N` 标记，其窗口（标记行起 4 行）内必须出现 `coverEq(` ——
//   即「阈值 == 当前值」必须**在 CI 里被断言**，而不是只写在注释里。
//   ⚠️ **逃生口**：若某集合**会随正常开发频繁增长**（如「文本文件数」，实测 985 → 988），
//     `==` 不可行 ⇒ 应改标 `[健康度型] 下限 N`（留余量）**而不是**硬套 `coverEq`。
//     本判据**只管 `[覆盖型]`** ⇒ 改标即自动合规（这正是它想要的判断）。
{
  const guards36 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const MARKER36 = /\[覆盖型\]\s*基线\s*(\d+)/;
  /** 判定与 canary **共用**：某段源码里，每个标记的窗口内是否有「**严格相等**」的实现。
   *  ⚠️ **2026-10-11（审计 §4.317）：迁移完成，两种形态都接受** ——
   *    ① `coverEq(...)`（本文件的助手）；② 与**数字**的 `!==` / `===` 比较
   *    （其余护栏的失败机制不同 —— `fail()` push vs `assert()` throw —— 故**不必**抽共享助手；
   *    判据只要求「**阈值 == 当前值**」这件事**被断言**，不要求用同一个函数）。
   *    ⚠️ `< N` / `>= N` **不算**合规（它们只挡一个方向，增长时会**静默稀释防线**）。 */
  const allMarkedHaveEq = (src) => {
    const ls = src.split('\n');
    return ls.every((l, i) => !MARKER36.test(l)
      || /(?:coverEq\(|(?:!==|===)\s*(?:\d|[A-Z][A-Z0-9_]*\b))/.test(ls.slice(i, i + 4).join('\n')));
  };
  /** 某文件里 `[覆盖型]` 标记的行号（空数组 = 该文件没有标记）。 */
  const markerLines = (src) => src.split('\n')
    .map((l, i) => (MARKER36.test(l) ? i + 1 : 0)).filter((x) => x > 0);
  // ⚠️ **2026-10-11（审计 §4.317）：`COVERAGE_EQ_PENDING`（未迁移登记表）已**删除** —— 迁移完成。
  //   原先的 5 个文件全部落地：4 处改 `!==` / `===`（人工枚举 / 显式决定），3 处改标 `[健康度型]`（内容派生），
  //   1 处**删除冗余**（adapter 的 bundle target 下限 —— `missing`/`extra` 双向已覆盖）。
  //   ⇒ 登记表的存在本身就是「**已知未守**」⇒ 迁移完成后**结构性消除**它（本仓「能消除就不要守」）。
  let marked36 = 0;
  const noEq36 = [];
  const migrated36 = [];
  for (const f of guards36) {
    const src = read(`tests/parity/${f}`);
    const n = markerLines(src).length;
    if (n === 0) continue;
    if (allMarkedHaveEq(src)) { migrated36.push(f); marked36 += n; continue; }
    noEq36.push(`${f}（${markerLines(src).join('、')} 行）`);
  }
  if (noEq36.length > 0) {
    fail(`㊱ 这些文件有 \`[覆盖型] 基线\` 标记，但**窗口内没有**「严格相等」的实现：${noEq36.join('；')}`
      + ' —— `[覆盖型]` 的定义是「阈值必须 == 当前基线」，而 `< N` **只挡「缩小」**，'
      + '**集合增长时会静默稀释防线**（实测：待裁决项登记表 17 → 20 无人知；夹具 7 → 9 无人知）。'
      + '请改用 `coverEq(...)`；**若该集合会随正常开发频繁增长**，则它**不是**覆盖型 ⇒ '
      + '改标 `[健康度型] 下限 N`（留余量）；确需后续迁移则**登记**并写明理由');
  }
  // 防空转：[覆盖型] 下限数（**只数已迁移的文件**；标记增删时须一并复核）
  const COVERAGE_MARK_BASELINE = 32; // [覆盖型] 基线 32（2026-10-11 §4.321：新增 ㊹ 的标记）
  coverEq('㊱ 已迁移文件里的 [覆盖型] 下限数', marked36, COVERAGE_MARK_BASELINE,
    '标记被删空会让「覆盖型必须 == 当前值」重新变成**无人守**（§4.168 实测）');
  // canary：两向（与判定**共用** allMarkedHaveEq）
  // ⚠️ 样本**必须用拼接构造** —— 本文件**自己也在扫描面里**（它的真实标记要被本判据检查），
  //   把 `[覆盖型] 基线 <数字>` 写成字面量会让样本本身被当成一条标记（⑥ 已记过这个坑）。
  const mk36 = (n) => `[覆盖型] 基线 ${n}`;
  if (!allMarkedHaveEq(`const X = 7; // ${mk36(7)}\ncoverEq('x', y, X);`)) {
    fail('㊱ canary 失效：合法样本（标记 + `coverEq`）被判为不合规');
  }
  if (!allMarkedHaveEq(`const X = 7; // ${mk36(7)}\nif (y !== X) { fail('x'); }`)) {
    fail('㊱ canary 失效：`!== 常量` 形态的样本被判为不合规（§4.317 后这是**合法形态**）');
  }
  if (allMarkedHaveEq(`const X = 7; // ${mk36(7)}\nif (y < X) { fail('x'); }`)) {
    fail('㊱ canary **过宽**：只用 `<` 实现的样本被判为合规');
  }
  console.log(`Release gate: \`[覆盖型]\` 下限的**实现** —— ${migrated36.length} 个文件、共 ${marked36} 处标记`
    + '**全部**由「**严格相等**」实现（`coverEq(...)` 或 `!== 数字` / `=== 数字`）'
    + ' ⇒ 阈值 == 当前值**在 CI 里被断言**（`< N` 只挡「缩小」，增长会**静默稀释防线**）；'
    + '⚠️ **迁移已完成**（§4.317）：原「未迁移登记表」已**删除**；'
    + '⚠️ **内容派生**的集合应改标 `[健康度型]`（留余量），改标即合规');
}

// ── ㊲ 每个护栏必须有 **canary 断言**（2026-10-11，审计 §4.311）──
// 【为什么】本仓纪律：**「判据有效 ≠ 有人跑」**、**「空壳测试」必须落判据**（㉜ 是 JS/TS 侧的那一半）。
//   护栏侧的**同一句话**是：**「谓词从未被证明会红」** —— 一条**没有 canary** 的护栏，
//   它的断言可能是**恒真**的（恒真的断言看起来一样绿）。本仓已实测过一次同型后果：
//   `audit-pkg-test-counts.mjs` 漂了而无人知（§4.287）。
//   实测（2026-10-11）：23 个护栏里 **22 个**有 canary 断言、**1 个**没有
//   （`verify-context-menu-guard.mjs` —— 它是 **mutation harness**，本职就是注入已知缺陷
//   并断言**下游护栏**拒绝，故**登记豁免**）。
// 【判据】剥注释后，每个 `verify-*.mjs` 必须至少出现 **1 次**词 `canary`。
//   ⇒ 它是「该护栏的谓词被证明过会红」的**最低可核对证据**。
// 【边界如实声明 —— **不落判据的那一半**】
//   ⚠️ **「canary：N 向」的自述数不可机械核对**：一个「向」是**测试方向**，不等于**断言条数**。
//     实测**两版量具都不健全**：① 按**文件**计数 ⇒ 与「每判据块」的自述**口径不符**（23 个文件全报不符）；
//     ② 按 `// ── <圈号>` 切块 ⇒ 段边界与 canary 所在块**不重合**，且**漏了** `failures.push(` /
//     `throw new Error(` 两种上报形态 ⇒ 把 3 个护栏**误报**成「0 条」。
//   ⚠️ **登记读数**（2026-10-11 实测）：canary **两向**（失效 + 过宽）16 个 / **单向** 6 个 / **无** 1 个。
//     **「单向」不判** —— 「过宽」canary 是否可能**取决于谓词**（静态判不了）⇒ 不落判据。
{
  const CANARY_EXEMPT = new Map([
    ['verify-context-menu-guard.mjs',
      '**mutation harness** —— 它注入已知缺陷并断言**下游护栏**拒绝（且自检「注入没有生效」）；'
      + '「canary」一词不出现是**设计**，不是缺口'],
  ]);
  const guards37 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const hasCanary = (src) => /\bcanary\b/.test(stripJsComments(src));
  let withCanary37 = 0;
  const noCanary37 = [];
  for (const f of guards37) {
    if (hasCanary(read(`tests/parity/${f}`))) { withCanary37 += 1; continue; }
    if (!CANARY_EXEMPT.has(f)) noCanary37.push(f);
  }
  if (noCanary37.length > 0) {
    fail(`㊲ 这些护栏**没有任何 canary 断言**：${noCanary37.join('、')}`
      + ' —— 没有 canary 的护栏，「它的谓词会红」这句话**从未被证明**'
      + '（恒真的断言看起来一样绿）。请至少给一条断言配一个「注入后必须红」的样本；'
      + '确属 **mutation harness** 等特例请登记进 `CANARY_EXEMPT` 并写明理由');
  }
  // 双向：登记的豁免项必须**真的**没有 canary（否则陈旧 —— 它会掩盖「该护栏将来失去 canary」）
  for (const [f] of CANARY_EXEMPT) {
    if (!guards37.includes(f)) {
      fail(`㊲ \`CANARY_EXEMPT\` 登记了**不存在**的护栏 \`${f}\` —— 登记表与事实脱节`);
    } else if (hasCanary(read(`tests/parity/${f}`))) {
      fail(`㊲ \`${f}\` 登记在 \`CANARY_EXEMPT\` 里，但它**已经有 canary 断言**`
        + ' —— 该豁免项已过期，请移除');
    }
  }
  // 防空转：[覆盖型]（护栏增删时须一并复核）
  const CANARY_BASELINE = 22; // [覆盖型] 基线 22
  coverEq('㊲ 有 canary 断言的护栏数', withCanary37, CANARY_BASELINE,
    '标记被删空会让「护栏必须有 canary」重新变成**无人守**');
  // canary：两向（样本**拼接构造** —— 本文件自己也在扫描面里）
  const w37 = 'cana' + 'ry';
  if (!hasCanary(`fail('${w37} 失效：x')`)) {
    fail('㊲ canary 失效：带 canary 消息的样本未被识别');
  }
  if (hasCanary(`// ${w37}：注释里提到它不算断言`)) {
    fail('㊲ canary **过宽**：注释里的词被当成了 canary 断言（必须剥注释）');
  }
  console.log(`Release gate: 护栏的 **canary** —— ${guards37.length} 个护栏里 ${withCanary37} 个有 canary 断言`
    + `（豁免 ${CANARY_EXEMPT.size} 个：mutation harness）；`
    + '⚠️ **边界**：「canary：N 向」的**自述数不可机械核对**（一个「向」≠ 一条断言；'
    + '实测两版量具都不健全）⇒ 已把读数（两向 16 / 单向 6 / 无 1）**登记**，**不落判据**');
}

// ── ㊳ workflow 引用的 `secrets.*` 必须登记（2026-10-11，审计 §4.312）──
// 【为什么】**未配置的 secret 不会报错** —— GitHub 把 `${{ secrets.X }}` 求值为**空字符串**。
//   实测代价：`release.yml` 引用 **11** 个 secret，仓库里**只配置了 2 个**（另有 1 个是自动的
//   `GITHUB_TOKEN`）⇒ macOS **不签名不公证**、Windows **不签名**，而**构建照样成功**
//   （`release.yml:287-304` 显式处理缺失分支：`if [ -n "$APPLE_CERTIFICATE" ]` → `echo "Apple 凭据未配置…"`）。
//   ⚠️ 这件事此前只写在**散文**里（README / ADR-0031 / release template / 7 份 release notes /
//     `packaging-release.md` / workflow 注释）—— **没有机器可读的清单**，也**没有「到点重新分诊」**：
//     哪天配了凭据，**没有任何东西**提醒去更新那 6 处散文。
// 【真值源】`tests/parity/fixtures/ci-secrets.json`（带 `reviewedAt` + `staleAfterDays` ⇒ 判据 ㉗ 守）。
// 【判据】① **双向**：workflow 里引用的每个 `secrets.X` 必须在表里；表里每条必须被引用；
//   ② 每条自洽：`status` ∈ {auto, configured, missing} · 非空 `why`；
//   ③ `status: missing` ⇒ 必须给非空 `consequence`（**缺了可以，但必须写出缺了什么**）。
// 【边界如实声明】⚠️ **`status` 是快照** —— 本判据**无法**核对「GitHub 上现在到底配了没有」
//   （需要 `gh secret list` + 网络 + token 权限，**CI 里不做**）⇒ 靠 `reviewedAt` + `staleAfterDays`
//   的**到期变红**强制重新分诊（判据 ㉗）。⚠️ 与 ⑱（`ci-actions.json`）同族但对象不同：
//   ⑱ 守 **action 的版本 / pin**，本条守 **secret 的配置状态**。
{
  const SECRETS_REG = 'tests/parity/fixtures/ci-secrets.json';
  const SECRET_STATUS = ['auto', 'configured', 'missing'];
  const reg = JSON.parse(read(SECRETS_REG));
  const entries = reg.secrets ?? [];
  /** 判定与 canary **共用**：一条登记项是否自洽（null = 合规）。 */
  const secretVerdict = (e) => {
    if (!SECRET_STATUS.includes(e.status)) return `\`status\` 必须是 ${SECRET_STATUS.join(' / ')}（现值 \`${e.status}\`）`;
    if (typeof e.why !== 'string' || e.why.trim() === '') return '缺非空 `why`（谁提供 / 用途）';
    if (e.status === 'missing' && (typeof e.consequence !== 'string' || e.consequence.trim() === '')) {
      return '是 `missing` 却没有 `consequence` —— 「**软报 = 没报**」：**缺了可以，但必须写出缺了什么**'
        + '（否则「未签名未公证」只能靠读散文发现）';
    }
    return null;
  };
  const wfDir38 = '.github/workflows';
  const wfFiles38 = existsSync(resolve(root, wfDir38))
    ? readdirSync(resolve(root, wfDir38)).filter((f) => /\.ya?ml$/.test(f)).sort()
    : [];
  const referenced = new Set();
  for (const f of wfFiles38) {
    for (const m of read(`${wfDir38}/${f}`).matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)) referenced.add(m[1]);
  }
  const declared = new Set(entries.map((e) => e.name));
  for (const n of [...referenced].sort()) {
    if (!declared.has(n)) {
      fail(`㊳ workflow 引用了 \`secrets.${n}\`，但它**未登记**在 \`${SECRETS_REG}\` —— `
        + '**未配置的 secret 不会报错**（表达式求值为空字符串）⇒ 必须先登记「谁提供 / 用途 / 当前状态」，'
        + '否则「签名没配」这件事只能靠读散文发现（审计 §4.312）');
    }
  }
  for (const e of entries) {
    if (!referenced.has(e.name)) {
      fail(`㊳ \`${SECRETS_REG}\` 登记了 \`secrets.${e.name}\`，但**没有任何 workflow 引用它**`
        + ' —— 登记表与事实脱节（引用被删了？请同步删掉该条）');
      continue;
    }
    const bad = secretVerdict(e);
    if (bad !== null) fail(`㊳ \`secrets.${e.name}\`：${bad}`);
  }
  // 防空转：[覆盖型]（workflow 增删 secret 引用时须一并复核）
  const SECRET_BASELINE = 11; // [覆盖型] 基线 11
  coverEq('㊳ 登记表条目数', entries.length, SECRET_BASELINE,
    '条目被删会让「引用的 secret 都有登记」重新变成**无人守**');
  // canary：四向（与判定**共用** secretVerdict）
  const CANARIES38 = [
    [{ name: 'x', status: 'configured', why: 'w' }, true, '合规（configured + why）'],
    [{ name: 'x', status: 'missing', why: 'w', consequence: 'c' }, true, '合规（missing + consequence）'],
    [{ name: 'x', status: 'missing', why: 'w' }, false, '`missing` 缺 `consequence`'],
    [{ name: 'x', status: 'unknown', why: 'w' }, false, '`status` 非枚举值'],
    [{ name: 'x', status: 'auto', why: '' }, false, '`why` 为空'],
  ];
  for (const [sample, shouldPass, what] of CANARIES38) {
    if ((secretVerdict(sample) === null) !== shouldPass) {
      fail(`㊳ canary ${shouldPass ? '**过宽**' : '失效'}：${what} 的样本被误判`);
    }
  }
  const miss38 = entries.filter((e) => e.status === 'missing').length;
  console.log(`Release gate: CI \`secrets.*\` —— workflow 引用 ${referenced.size} 个 / 登记 ${entries.length} 条**双向一致**`
    + `（auto ${entries.filter((e) => e.status === 'auto').length}`
    + ` / configured ${entries.filter((e) => e.status === 'configured').length}`
    + ` / **missing ${miss38}**）；⚠️ 缺 ${miss38} 个 ⇒ macOS **不签名不公证** / Windows **不签名**`
    + '（`release.yml` 显式走 else 分支，**构建照样成功**）；'
    + '⚠️ **边界**：`status` 是**快照**（CI 里不查 `gh secret list`）⇒ 靠 `reviewedAt` + `staleAfterDays` 到期**变红**强制重新分诊');
}

// ── ㊴ `includes('<针>')` 的针**不得只在注释里**（2026-10-11，审计 §4.314）──
// 【为什么】本仓的「X 必须存在」类判据大量用 `read('路径')` + `X.includes('针')`。
//   实测（2026-10-11）：全仓**可解析目标路径**的这类检查共 **32** 处（**已剥护栏自己的注释** ——
//   不剥会把注释里写的示例当成真检查，实测多报 3 处），其中 **11** 处的针在目标文件里
//   **不唯一** ⇒ 「检查强度」取决于「**针的写法有多特异**」。
//   本轮用**注入**证明了 **2 处真缺陷**（§4.314）：删掉「契约定义行」/「`import` + 用法」之后，
//   判据**仍然绿** —— 因为**注释里还剩同样的字样**。⇒ 两处已**锚定到代码形态**并配 canary。
//   ⚠️ 本条只锁**能机械判定的那一半**：**针必须在「剥注释后」的目标文件里出现 ≥1 次**。
//     ⚠️ 它**不**覆盖「定义被删而用法尚存」（那需要理解「**哪一处才是真的**」）—— **如实声明**。
//   ⚠️ 另一条边界：本仓的 `stripJsComments` **保留字符串字面量**（那是设计）⇒ 「针只在**字符串**里」
//     仍会被算作「在代码里」。**登记为已知边界**（不假装覆盖）。
// 【判据】对每处 `<X>.includes('<针>')`（`X` 由**字符串字面量路径**的 `read`/`readFileSync` 赋值）：
//   目标文件**剥注释后**必须仍含该针；否则红（除非登记进 `COMMENT_ONLY_NEEDLE_EXEMPT`）。
{
  const COMMENT_ONLY_NEEDLE_EXEMPT = new Map([
    ['verify-sidebar-contract.mjs|only the last **one** file operation',
      '该判据**故意**检查「**不变量注释**仍在」（它守的是**文档化的不变量**，不是代码符号）'
      + ' —— 这是唯一一处「用注释当证据」是**设计**的情形'],
  ]);
  // ⚠️ **「针不唯一」的登记表**（2026-10-11，审计 §4.315）：键 = `护栏文件|针|目标文件`。
  //   登记的是「**为什么多处也算证据**」（多为「**至少一处**」语义：声明 + 使用、值导出 + 类型导出…）。
  //   ⚠️ **双向**：登记了却不再命中 ⇒ 红（针变唯一了 / 检查被删 / 目标路径变了）。
  const UNANCHORED_NEEDLE = new Map([
    ['verify-adapter-contract.mjs|__TAURI__|apps/desktop/scripts/build-editor-bundle.mjs',
      '「**接线存在**」是**至少一处**语义 —— 该脚本把 `__MELLOW_BRIDGE__` 接到 `__TAURI__.core`，多处调用都是接线的一部分'],
    ['verify-adapter-contract.mjs|jump_list_add_recent|apps/desktop/src-tauri/src/lib.rs',
      '**定义 + 注册**各一处（`fn jump_list_add_recent` 与 `invoke_handler` 列表）—— 判据要的是「命令**已注册**」⇒ 至少一处'],
    ['verify-menu-contract.mjs|serde::Deserialize|apps/desktop/src-tauri/src/menu.rs',
      '`#[derive(serde::Deserialize)]` 出现在**多个 struct** 上 —— 判据要的是「该文件**用 serde 反序列化**」⇒ 至少一处'],
    ['verify-settings-contract.mjs|mellow.updater.skippedVersion|apps/desktop/src/App.tsx',
      '**读 + 写**各一处（读跳过版本 / 写跳过版本）⇒ 至少一处'],
    ['verify-settings-contract.mjs|__MELLOW_MD_LINK_EXISTS__|apps/desktop/src/App.tsx',
      '**类型声明 + 赋值**各一处（同一契约的两种写法）⇒ 至少一处'],
    ['verify-settings-contract.mjs|__MELLOW_MD_LINK_REFRESH__|packages/editor-core/src/core.ts',
      '**类型声明 + 调用**各一处（同 `__MELLOW_MD_LINK_EXISTS__`）⇒ 至少一处'],
    ['verify-sidebar-contract.mjs|SidebarFooter|packages/desktop-ui/src/index.ts',
      '**值导出 + 类型导出**各一处（`export { X }` / `export type { XProps }`）⇒ 至少一处'],
    ['verify-sidebar-contract.mjs|.sidebar-footer|apps/desktop/src/styles.css',
      'CSS **类名**在多个选择器里出现是**正常**的 —— 判据要的是「**有该类的样式**」⇒ 至少一处'],
    ['verify-sidebar-contract.mjs|highlightNonce|packages/desktop-ui/src/OutlineList.tsx',
      '**声明 + 使用**各一处 ⇒ 至少一处'],
    ['verify-sidebar-contract.mjs|ContextMenuAction|apps/desktop/src/ContextMenu.tsx',
      '**类型 + 用法**各一处 ⇒ 至少一处'],
    ['verify-sidebar-contract.mjs|context-menu-action|apps/desktop/src/ContextMenu.tsx',
      '**DOM 类名**（与上一条同族：类名在多处出现是正常）⇒ 至少一处'],
  ]);
  const guards39 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  const onlyInComments = [];
  const unanchored = [];
  const unanchoredHit = new Set();
  let checked39 = 0;
  let exemptHit39 = 0;
  let unique39 = 0;
  for (const f of guards39) {
    // ⚠️ **必须剥注释**（2026-10-11，审计 §4.315）：否则**注释里写的示例**（例如「原判据是
    //   `X.includes('…')`」这种说明）会被当成**真检查** —— 实测它让本判据多报了 3 处幻影。
    //   ⚠️ 与 §4.314 的教训**同源**：**注释冒充证据**。
    const src = stripJsComments(read(`tests/parity/${f}`));
    /** 变量 → 目标文件（**只认字符串字面量路径**；非字面量一律跳过并计数） */
    const targetOf = new Map();
    for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:read|readFileSync)\(\s*(?:resolve\([^,]+,\s*)?'([^']+)'\s*\)?/g)) {
      targetOf.set(m[1], m[2]);
    }
    for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\.includes\(\s*(['"])([^'"\\]{1,40})\2\s*\)/g)) {
      const [, v, , needle] = m;
      if (!targetOf.has(v)) continue;
      const rel = targetOf.get(v);
      // ⚠️ 用 `read()`（它**已经**做换行归一化）—— 本文件里**任何地方**再写一遍那个两字符转义
      //   都会破坏本文件自己的 CRLF canary（⑤）。
      const relPath = existsSync(resolve(root, rel)) ? rel : `tests/parity/${rel}`;
      if (!existsSync(resolve(root, relPath))) continue;
      checked39 += 1;
      const body = stripJsComments(read(relPath));
      if (!body.includes(needle)) {
        const key = `${f}|${needle}`;
        if (COMMENT_ONLY_NEEDLE_EXEMPT.has(key)) { exemptHit39 += 1; continue; }
        onlyInComments.push(`${f} → \`${needle}\`（目标 ${relPath}）`);
        continue;
      }
      // ⚠️ **第二半**（2026-10-11，审计 §4.315）：针在**剥注释后**出现 **>1** 次 ⇒
      //   检查**不锚定**（删掉「该处」不会红）⇒ 必须登记「为什么多处也算证据」。
      const codeCount = body.split(needle).length - 1;
      if (codeCount === 1) { unique39 += 1; continue; }
      const uKey = `${f}|${needle}|${relPath}`;
      if (UNANCHORED_NEEDLE.has(uKey)) { unanchoredHit.add(uKey); continue; }
      unanchored.push(`${f} → \`${needle}\`（目标 ${relPath}，**剥注释后 ${codeCount} 处**）`);
    }
  }
  if (onlyInComments.length > 0) {
    fail(`㊴ 这些 \`includes('<针>')\` 的针**在目标文件里只出现在注释中**：${onlyInComments.join('；')}`
      + ' —— 「注释里提过」**不是**「代码里有」（§4.314 实测：删掉契约定义 / `import` 后，'
      + '注释里的字样让判据**仍然绿**）。请**锚定到代码形态**，或登记进 `COMMENT_ONLY_NEEDLE_EXEMPT` 并写明理由');
  }
  if (unanchored.length > 0) {
    fail(`㊴ 这些 \`includes('<针>')\` 的针**在目标文件里不唯一**（剥注释后仍 >1 处），且**未登记**：`
      + `${unanchored.join('；')}`
      + ' —— 针不唯一 ⇒ **删掉「该处」不会红**（检查强度 = 「针有多特异」，§4.314 的教训）。'
      + '要么**锚定到代码形态**（正则锁声明/导入/调用），要么登记进 `UNANCHORED_NEEDLE` 并写明'
      + '「**为什么多处也算证据**」（例如「至少一处」语义）');
  }
  // 双向：两表的登记项都必须**真的**命中（否则陈旧）
  if (exemptHit39 !== COMMENT_ONLY_NEEDLE_EXEMPT.size) {
    fail(`㊴ \`COMMENT_ONLY_NEEDLE_EXEMPT\` 有 ${COMMENT_ONLY_NEEDLE_EXEMPT.size} 条，但只有 ${exemptHit39} 条命中`
      + ' —— 其余已**过期**（该针现在要么在代码里出现、要么那条检查已被删），请移除');
  }
  for (const k of UNANCHORED_NEEDLE.keys()) {
    if (!unanchoredHit.has(k)) {
      fail(`㊴ \`UNANCHORED_NEEDLE\` 登记了 \`${k}\`，但它**已不再命中**`
        + ' —— 该登记项已**过期**（针现在唯一了 / 该检查已删 / 目标路径变了），请移除');
    }
  }
  // 防空转：[健康度型]（输入是「别的护栏的写法」，随开发变化 ⇒ 留余量）
  const NEEDLE_CHECK_BASELINE = 30; // [健康度型] 下限 30（立此判据时实测 32）
  if (checked39 < NEEDLE_CHECK_BASELINE) {
    fail(`㊴ 只解析出 ${checked39} 处可核对目标的 \`includes\` 检查（[健康度型] 下限 ${NEEDLE_CHECK_BASELINE}）`
      + ' —— 解析器失效会让本判据**空转**');
  }
  // canary：两向（与判定**共用** stripJsComments）
  if (stripJsComments('const x = 1; // note: NEEDLE_TOKEN').includes('NEEDLE_TOKEN')) {
    fail('㊴ canary 失效：**行注释**里的针未被剥掉');
  }
  if (!stripJsComments('const s = "NEEDLE_TOKEN";').includes('NEEDLE_TOKEN')) {
    fail('㊴ canary **过宽**：**字符串字面量**里的针被误剥（那会制造**假阳性**）');
  }
  const COMMENT_ONLY_BASELINE = 1; // [覆盖型] 基线 1
  coverEq('㊴ 「只在注释里」的豁免条数', COMMENT_ONLY_NEEDLE_EXEMPT.size, COMMENT_ONLY_BASELINE,
    '豁免被删空会让本条重新变成**无人守**');
  const UNANCHORED_BASELINE = 11; // [覆盖型] 基线 11
  coverEq('㊴ 「针不唯一」的登记条数', UNANCHORED_NEEDLE.size, UNANCHORED_BASELINE,
    '登记被删空会让「针必须锚定」重新变成**无人守**');
  console.log(`Release gate: \`includes\` 型判据的**针** —— 可核对目标 ${checked39} 处：`
    + `**唯一**（自锚定）${unique39} 处 · **只在注释里**${onlyInComments.length} 处`
    + `（豁免 ${COMMENT_ONLY_NEEDLE_EXEMPT.size}）· **不唯一**${unanchored.length} 处`
    + `（登记 ${UNANCHORED_NEEDLE.size}，理由：多为「**至少一处**」语义）；`
    + '⚠️ **边界**：只锁「针不得只在注释里」+「针不唯一必须登记」，**不覆盖**「定义被删而用法尚存」'
    + '（那半靠**锚定正则 + canary**，§4.314 已修）；⚠️ 另一边界：`stripJsComments` **保留字符串字面量**'
    + ' ⇒ 「针只在**字符串**里」仍算「在代码里」');
}

// ── ㊵ CI 的 `cargo` 命令必须带 `--locked`（2026-10-11，审计 §4.316）──
// 【为什么】发版手册**逐字**写着「改完用 `cargo check --locked` 验证」「漏改 `Cargo.lock` 会让
//   `--locked` 构建失败」—— 但 **CI 的 6 条 `cargo` 命令一条都没带 `--locked`** ⇒
//   lockfile 陈旧时 cargo 会**就地重写**它并**继续构建**（`--locked` 才会失败）。
//   ⚠️ 实测代价：`tools/source-fidelity/Cargo.lock` **落后 28 个版本**（`1.5.5` vs `1.5.33`）——
//     因为发版手册只写「**4 处**」、判据只守 4 处，而该工具 **path-依赖** `mellow-desktop`。
//     （本轮已修：手册改「5 处」、`VERSION_SOURCES` 纳入它。）
// 【判据】`.github/workflows/*.yml` 里每个单行 `run: cargo <subcommand>` 都必须带 `--locked`。
//   ⚠️ **边界如实声明**：只锁**单行** `run: cargo …`（多行 `run: |` 里的 cargo 不在覆盖内）。
// 【为什么安全】加之前**实测**过：`cargo metadata --locked` 对**两份** lockfile 都 EXIT=0
//   ⇒ lockfile 与 manifest 一致 ⇒ 加 `--locked` **不会**让 CI 红（§4.316 的取证）。
{
  const wfDir40 = '.github/workflows';
  const wfFiles40 = existsSync(resolve(root, wfDir40))
    ? readdirSync(resolve(root, wfDir40)).filter((f) => /\.ya?ml$/.test(f)).sort()
    : [];
  /** 判定与 canary **共用**：从一行里抽 `run: cargo …` 的命令体（null = 不是 cargo 行）。 */
  const cargoRunOf = (l) => {
    const m = /^\s*(?:-\s*)?run:\s*(cargo\s+.+?)\s*$/.exec(l);
    return m === null ? null : m[1];
  };
  const offenders40 = [];
  let cargoLines40 = 0;
  for (const f of wfFiles40) {
    read(`${wfDir40}/${f}`).split('\n').forEach((l, i) => {
      const cmd = cargoRunOf(l);
      if (cmd === null) return;
      cargoLines40 += 1;
      if (!/\s--locked\b/.test(cmd)) offenders40.push(`${f}:${i + 1} → \`${cmd}\``);
    });
  }
  if (offenders40.length > 0) {
    fail(`㊵ 这些 CI \`cargo\` 命令**没有** \`--locked\`：${offenders40.join('；')}`
      + ' —— 没有 `--locked` 时，lockfile 与 manifest 不一致 ⇒ cargo **就地重写 lock 并继续**'
      + '（**静默**），而发版手册**逐字**要求 `--locked`。请补 `--locked`');
  }
  // 防空转：[覆盖型]（cargo 命令增删时须一并复核）
  const CARGO_CMD_BASELINE = 6; // [覆盖型] 基线 6
  coverEq('㊵ CI 里的 cargo 命令数', cargoLines40, CARGO_CMD_BASELINE,
    '命令被删会让「CI 必须用 --locked」重新变成**无人守**');
  // canary：两向（与判定**共用** cargoRunOf）
  if (!/\s--locked\b/.test(cargoRunOf('        run: cargo test --locked'))) {
    fail('㊵ canary 失效：带 `--locked` 的样本被判为缺');
  }
  if (/\s--locked\b/.test(cargoRunOf('        run: cargo build --release --features custom-protocol'))) {
    fail('㊵ canary **过宽**：不带 `--locked` 的样本被判为有');
  }
  console.log(`Release gate: CI 的 \`cargo\` 命令 —— ${cargoLines40} 条**全部带 \`--locked\`**`
    + '（lockfile 与 manifest 不一致时**响亮失败**，而不是**就地重写**）；'
    + '⚠️ **边界**：只锁**单行** `run: cargo …`（多行 `run: |` 里的 cargo 不在覆盖内）');
}

// ── ㊶ 本机工具的 `evidence` 必须**可对账**（含日期 + 退出码）（2026-10-11，审计 §4.318）──
// 【为什么】本仓纪律「**「能失败」+「没人跑」= 它可以一直红**」**实测又一次生效**：
//   `audit-pkg-test-counts.mjs` 的 `evidence` 写「已刷新、复跑 EXIT=0」，而**同一天又漂了一次**
//   （`themes` 12 → 13 / 合计 1919 → 1920）—— **没有人再跑它**。
//   ⚠️ 根因不是「判据不够」，而是 **`evidence` 是快照、却长得像承诺**：
//     它写「实测 EXIT=0」而**不写日期与退出码**时，读者无法一眼对账（也就无法发现它过期）。
// 【判据】`local-tools.json` 的每条 `evidence` 必须**同时**含
//   ① 一个日期（`YYYY-MM-DD`）· ② 一个退出码（`EXIT=<数字>`）。
//   ⇒ 让「实测」这件事**可对账**（下次有人跑时一眼比对），而不是一句散文。
// 【边界如实声明】⚠️ 本判据**只锁形状**（有没有日期与退出码），**不锁数值** ——
//   「声明的退出码 == 当前实跑」**不可 CI 守**（8 个工具全是 `local-only`，需 Typora / 逐包跑 jest）
//   ⇒ 那半**只能靠人**（`reviewedAt` + `staleAfterDays` 的**到期变红**是唯一的机械化提醒，判据 ㉗）。
{
  const TOOLS_REG41 = 'tests/parity/fixtures/local-tools.json';
  const reg41 = JSON.parse(read(TOOLS_REG41));
  const entries41 = reg41.tools ?? [];
  /** 判定与 canary **共用**：`evidence` 是否「可对账」（null = 合规）。 */
  const evidenceVerdict = (e) => {
    if (typeof e !== 'string' || e.trim() === '') return '缺 `evidence`';
    if (!/\d{4}-\d{2}-\d{2}/.test(e)) return '`evidence` 里没有**日期**（`YYYY-MM-DD`）—— 快照必须能被看出「什么时候测的」';
    if (!/EXIT=\d/.test(e)) return '`evidence` 里没有**退出码**（`EXIT=<数字>`）—— 「实测」必须**可对账**';
    return null;
  };
  for (const t of entries41) {
    const bad = evidenceVerdict(t.evidence);
    if (bad !== null) {
      fail(`㊶ \`${t.name}\`：${bad}`
        + ' —— 「**能失败」+「没人跑」= 它可以一直红**（§4.287 的原始案例、§4.318 的第二次实证）'
        + '⇒ `evidence` 必须写清**日期**与**退出码**，让「实测」**可对账**，而不是一句散文');
    }
  }
  // 防空转：[覆盖型]（工具增删时须一并复核）
  const EVIDENCE_BASELINE = 8; // [覆盖型] 基线 8
  coverEq('㊶ 有可对账 evidence 的工具数', entries41.length, EVIDENCE_BASELINE,
    '工具被删会让「evidence 可对账」重新变成**无人守**');
  // canary：三向（与判定**共用** evidenceVerdict）
  if (evidenceVerdict('2026-10-11 实测 EXIT=0（尾部输出…）') !== null) {
    fail('㊶ canary 失效：合规样本（日期 + 退出码）被判为不合规');
  }
  if (evidenceVerdict('实测 EXIT=0（尾部输出…）') === null) {
    fail('㊶ canary **过宽**：**没有日期**的样本被判为合规');
  }
  if (evidenceVerdict('2026-10-11 实测通过，输出见上') === null) {
    fail('㊶ canary **过宽**：**没有退出码**的样本被判为合规');
  }
  console.log(`Release gate: 本机工具的 \`evidence\` —— ${entries41.length} 条**全部可对账**`
    + '（各含**日期**与**退出码** `EXIT=<数字>`）；'
    + '⚠️ **边界**：只锁**形状**，**不锁数值** —— 「声明的退出码 == 当前实跑」不可 CI 守'
    + `（${entries41.length} 个工具全是 \`local-only\`）⇒ 那半**只能靠人**（㉗ 的**到期变红**是唯一的机械化提醒）`);
}

// ── ㊷ markdown 表格：**表头格数必须 == 分隔行格数**（2026-10-11，审计 §4.319）──
// 【为什么】本仓**只对 §12 的 D 表**守了「**恰好 4 格**」—— 理由是 GFM 会**静默丢弃**超出表宽的格
//   （实测代价：D-AB 的前 3 格在一次编辑中丢失 ⇒ **整条在渲染视图中不可见**）。
//   ⇒ **同一句话的另一半**：**其余 809 张表**的**结构健全**没有任何判据。
// 【为什么只锁「表头 vs 分隔行」】分隔行**只含** `-` / `:` / `|` / 空格 ⇒ **无行内码、无转义**
//   ⇒ 格数**可精确判定**（**无假阳性**）。
//   ⚠️ **数据行的格数不锁** —— 但**理由不是「谓词不健全」**（2026-10-11，审计 §4.321 **更正**）：
//     **GFM 的表格规则使这个谓词本就健全** —— 表内**未转义**的 `|` **一律**是分隔符，
//     **行内代码不提供保护**（要写字面 `|` 必须写 `\|`）⇒ 格数**可精确判定**，**不需要** CommonMark 扫描器。
//     真正的理由是**分工**：`verify-doc-code-refs.mjs` 判据 **㉙** 已经锁了「**行 > 表头**」
//     （危险方向 —— GFM 会**静默丢弃**溢出格）⇒ 本条**不重复**它，只锁另一半。
//     （§4.319 原写「不能确证 / 需要 CommonMark 同长定界扫描器」—— **那条理由与 ㉙ 的代码相反**，已更正。）
// 【判据】扫全部被跟踪的 `.md`（跳过围栏代码块）：每张表（表头行 + 紧跟的 `|---|` 分隔行）
//   两者的**格数必须相等**；**格数**按 GFM 规则计（**未转义**的 `|` 才算分隔）。
{
  const tracked42 = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((f) => f.endsWith('.md'));
  /** 判定与 canary **共用**：一行的格数（**认 GFM 转义 `\|`** —— 它**不是**分隔符）。
   *  ⚠️ 2026-10-11（审计 §4.321）：原实现是裸 `split('|')` —— 而本判据的立论只证明了
   *  「**分隔行**无行内码、无转义」，代码却把**同一个谓词也用在表头行上**，而表头**可以**含 `\|`
   *  ⇒ 一旦出现，一张**合法**表会被判红（**潜在假阳性**；立此判据时实测表头含 `\|` **0 处**）。 */
  const cellCount42 = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).length;
  const isSep42 = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
  let tables42 = 0;
  const bad42 = [];
  for (const f of tracked42) {
    const lines = read(f).split('\n');
    let inFence = false;
    for (let i = 0; i + 1 < lines.length; i += 1) {
      if (/^\s*(```|~~~)/.test(lines[i])) { inFence = !inFence; continue; }
      if (inFence) continue;
      if (!/^\s*\|/.test(lines[i]) || !isSep42(lines[i + 1])) continue;
      tables42 += 1;
      const a = cellCount42(lines[i]);
      const b = cellCount42(lines[i + 1]);
      if (a !== b) bad42.push(`${f}:${i + 1}（表头 ${a} 格 / 分隔行 ${b} 格）`);
    }
  }
  if (bad42.length > 0) {
    fail(`㊷ 这些 markdown 表格的**表头格数与分隔行不一致**：${bad42.slice(0, 8).join('、')}`
      + `${bad42.length > 8 ? ` …（共 ${bad42.length} 处）` : ''}`
      + ' —— GFM 的**列数由分隔行决定**：表头多出的格会被**静默丢弃**、少的会渲染为空'
      + '（本仓已记过同型代价：D-AB 的前 3 格丢失 ⇒ **整条在渲染视图中不可见**）。'
      + '请把两者对齐（审计 §4.319）');
  }
  // 防空转：[健康度型]（输入是「文档里的表格数」，随开发增长 ⇒ 留余量）
  const TABLE_SCAN_BASELINE = 700; // [健康度型] 下限 700（立此判据时实测 809 张）
  if (tables42 < TABLE_SCAN_BASELINE) {
    fail(`㊷ 只扫到 ${tables42} 张 markdown 表格（[健康度型] 下限 ${TABLE_SCAN_BASELINE}）`
      + ' —— 解析器或扫描面失效会让本判据**空转**');
  }
  // canary：四向（与判定**共用** cellCount42 / isSep42）
  if (cellCount42('| a | b | c |') !== 3 || cellCount42('|---|---|---|') !== 3) {
    fail('㊷ canary 失效：3 格样本未被数成 3');
  }
  if (cellCount42('| a \\| b | c |') !== 2) {
    fail('㊷ canary 失效：**转义 `\\|`** 被当成了分隔符（那会把**合法**表判红 —— §4.321）');
  }
  if (!isSep42('|---|:--:|---|')) fail('㊷ canary 失效：带对齐冒号的分隔行未被识别');
  if (isSep42('| a | b |')) fail('㊷ canary **过宽**：**数据行**被当成了分隔行');
  console.log(`Release gate: markdown 表格的**表结构** —— 扫描 ${tracked42.length} 份 md / ${tables42} 张表，`
    + `**表头格数 ≠ 分隔行格数** ${bad42.length} 处；`
    + '⚠️ **边界**：只锁**表头 vs 分隔行**；「**行 > 表头**」由 `verify-doc-code-refs.mjs` 判据 **㉙** 锁'
    + '（**分工，不重复**）；两者共用同一条 GFM 规则 —— 表内**未转义**的 `|` 一律分隔'
    + '（**行内代码不保护**）⇒ 谓词**健全**（§4.321 更正了 §4.319 的「需 CommonMark 扫描器」）');
}

// ── ㊸ markdown 的**围栏代码块必须成对闭合**（2026-10-11，审计 §4.320）──
// 【为什么】本仓**多处判据**依赖「**跳过围栏代码块**」这个假设（`verify-doc-code-refs.mjs` 的链接检查 /
//   加粗配对 / 本护栏的 ⑧ 手写计数 / ㊷ 表结构 …）⇒ 一个**未闭合**的围栏会让**其后全部内容**
//   被当成代码 ⇒ 那些判据**静默漏检尾部**（**假阴性、无人知**）。
//   ⚠️ 它在**渲染层**显眼（文档后半段变成代码块），但在**护栏层**是**静默**的。
// ⚠️ **本条不是新缺陷类**：`verify-doc-code-refs.mjs` 判据 **㉚**（2026-10-09，审计 §4.228/§4.229）
//   **早已**守同一谓词。§4.320 **如实记录**：本条第一版的立论前提（「没人守」）**是错的** ——
//   见审计节的**自我更正**。留存本条的理由是下面的「**真实增量 = 面，不是谓词**」。
// 【真实增量一：面】㉚ 的面 = `committedFiles()` 的 `.md` **减去** `tests/fixtures/**` 与
//   `tests/benchmark/**`（立此判据时 173 份）；本条的面 = **全部被跟踪的 `.md`**（立此判据时 217 份）
//   ⇒ **㉚ 豁免掉的那一面由本条补上**。两者**同谓词、本条面为超集** ⇒ **互为镜像**：
//   任一护栏所在文件崩掉，另一方仍能指出同类破损。
// 【真实增量二：谓词】㉚ 的正则**只认反引号**（`(`{3,})`）⇒ **波浪号栅栏在 ㉚ 面上完全不可见**；本条补上。
//   （实测全仓 `~` 栅栏 **0 行** ⇒ 当前**无输入**，如实登记。）
// 【为什么夹具也该守】㉚ 的豁免理由是「语料**故意**含异形语法」—— 但**未闭合的围栏不是「语法异形」，
//   是「结构破损」**：它让语料**后半段整体变成代码块** ⇒ **依赖该语料的渲染 / 性能测试静默少测**。
//   实测（立此判据时）夹具与基准语料 **0 处未闭合** ⇒ 那条豁免在**这一维**上**从未被需要**。
// 【判据】GFM 规则：闭合栅栏须与开启栅栏**同字符**（`` ` `` / `~`）且**长度 ≥**；
//   反引号栅栏的**开启行 info string 含反引号则那一行不是栅栏**；**闭合行不得带 info string**；
//   **引用块前缀**（`> `）一并识别。
// 【边界如实声明】
//   ⚠️ **不锁语言标注**（新增语言标识是**合法**的 —— 机械禁止会挡住 `go` / `sql` / `swift`）⇒ 只登记读数。
//   ⚠️ 缩进按**绝对**缩进识别（`^\s*`）—— **这不是 CommonMark 的规则**（列表容器内按相对缩进算）
//     ⇒ 正确实现需要块级解析器；本仓合规的扫描器只存在于**本机工具** `audit-bold-pairing.mjs`（不进 CI）
//     ⇒ 护栏**不能复用** ⇒ 如实登记，不落更强的判据（§4.320 记了这条边界）。
{
  const mdFiles43 = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((f) => f.endsWith('.md'));
  /** 判定与 canary **共用**：该行是不是**栅栏标记行**（GFM：允许 `>` 前缀与缩进）。
   *  返回 `{ ch, len, rest }`，否则 null。 */
  const fenceOf43 = (l) => {
    const m = /^(\s*(?:>+\s*)*)(`{3,}|~{3,})(.*)$/.exec(l);
    return m === null ? null : { ch: m[2][0], len: m[2].length, rest: m[3].trim() };
  };
  /** 判定与 canary **共用**：返回**未闭合**的开启栅栏 `{line, ch, len}`，无则 null。 */
  const unclosedFence43 = (lines) => {
    let open = null;
    for (const [i, l] of lines.entries()) {
      const f = fenceOf43(l);
      if (f === null) continue;
      if (open === null) {
        // GFM：反引号栅栏的 info string **含反引号** ⇒ 该行**不是**开启栅栏
        if (f.ch === '`' && f.rest.includes('`')) continue;
        open = { line: i + 1, ch: f.ch, len: f.len };
      } else if (f.ch === open.ch && f.len >= open.len && f.rest === '') {
        open = null;   // 合法闭合（同字符 + 长度 ≥ + 不带 info string）
      }
    }
    return open;
  };
  let fences43 = 0;
  let fences43Blockquote = 0;
  let fences43Tilde = 0;
  const bad43 = [];
  for (const f of mdFiles43) {
    const lines = read(f).split('\n');
    for (const l of lines) {
      const x = fenceOf43(l);
      if (x === null) continue;
      fences43 += 1;
      if (/^\s*>/.test(l)) fences43Blockquote += 1;
      if (x.ch === '~') fences43Tilde += 1;
    }
    const u = unclosedFence43(lines);
    if (u !== null) {
      bad43.push(`${f}:${u.line}（\`${String(u.ch).repeat(u.len)}\` 未闭合）`);
    }
  }
  if (bad43.length > 0) {
    fail(`㊸ 这些 markdown 的**围栏代码块未闭合**：${bad43.slice(0, 6).join('、')}`
      + `${bad43.length > 6 ? ` …（共 ${bad43.length} 处）` : ''}`
      + ' —— 未闭合的围栏会让**其后全部内容**被当成代码 ⇒ **依赖「跳过围栏」的判据会静默漏检尾部**'
      + '（假阴性、无人知）⇒ 请补上闭合标记（审计 §4.320）');
  }
  // 防空转：[健康度型]（输入是「文档里的围栏数」，随开发增长 ⇒ 留余量）
  const FENCE_SCAN_BASELINE = 700; // [健康度型] 下限 700（立此判据时实测 938 行）
  if (fences43 < FENCE_SCAN_BASELINE) {
    fail(`㊸ 只扫到 ${fences43} 个围栏标记行（[健康度型] 下限 ${FENCE_SCAN_BASELINE}）`
      + ' —— 解析器或扫描面失效会让本判据**空转**');
  }
  // canary：六向（与判定**共用** fenceOf43 / unclosedFence43）
  if (unclosedFence43(['```js', 'x', '```']) !== null) {
    fail('㊸ canary 失效：**成对闭合**的样本被判为未闭合');
  }
  if (unclosedFence43(['```js', 'x']) === null) {
    fail('㊸ canary 失效：**未闭合**的样本未被检出');
  }
  if (unclosedFence43(['````', '```', '````']) !== null) {
    fail('㊸ canary 失效：**长度规则**未生效（4 个反引号包 3 个反引号被判成未闭合）');
  }
  if (unclosedFence43(['```', 'x', '``']) === null) {
    fail('㊸ canary 失效：**闭合标记比开启短**的样本未被检出');
  }
  if (unclosedFence43(['```', 'x', '~~~']) === null) {
    fail('㊸ canary 失效：**换字符**（反引号开 / 波浪号闭）的样本未被检出');
  }
  if (unclosedFence43(['```js `x`', 'a', '```']) === null) {
    fail('㊸ canary **过宽**：info string 含反引号的行被当成了开启栅栏');
  }
  if (unclosedFence43(['> ```', '> a', '> ```']) !== null) {
    fail('㊸ canary 失效：**引用块内成对**的栅栏被判为未闭合');
  }
  if (unclosedFence43(['> ```', '> a']) === null) {
    fail('㊸ canary 失效：**引用块内未闭合**的栅栏未被检出（`>` 前缀未被识别）');
  }
  console.log(`Release gate: markdown 的**围栏代码块** —— 扫描 ${mdFiles43.length} 份 md / ${fences43} 个围栏标记行`
    + `（引用块前缀 ${fences43Blockquote} · 波浪号 ${fences43Tilde}），**未闭合** ${bad43.length} 处；`
    + '⚠️ 与 `verify-doc-code-refs.mjs` 判据 **㉚ 同谓词、本条面为超集**（含夹具与基准语料）⇒ **互为镜像**');
}

// ── ㊹ 表格**格数**谓词必须认 GFM 转义 `\|`（2026-10-11，审计 §4.321）──
// 【为什么】GFM 的表格规则：表内**未转义**的 `|` **一律**是单元格分隔符，**行内代码不提供保护**
//   （要写字面 `|` 必须写 `\|`）⇒ 一个**裸**切分遇到 `\|` 会**多切一格** ⇒
//   把**合法**表判成「格数不符」= **假阳性**（护栏红了、内容其实没错 ⇒ 人们学会忽略它）。
//   ⚠️ 本仓**刚实测**过同族形态（§4.321 的 ㊷）：**立论只论证了「分隔行」**（无行内码、无转义），
//   代码却把同一个谓词**也用在表头行上** ⇒ 「**论证了一半的谓词，用在两半上**」。
//   ⚠️ 立此判据时全仓**表内 `\|` 实测 0 处** ⇒ 这是**潜在**假阳性、**不是**现行缺陷 —— **照样落判据**
//   （本仓先例：㉜「0 缺陷也落判据」—— 缺陷为零不等于谓词健全）。
// 【判据】扫全部 `tests/parity/verify-*.mjs`，**剥注释**后（注释里写切分写法是**说明**、不是用法）：
//   每处**裸**切分必须在 `BARE_PIPE_SPLIT` 里**逐字**登记 + 写理由。
//   **双向**：① 每处用法都要有登记；② 每条登记都必须**仍然存在**（陈旧条目 ⇒ 失败）。
// 【边界如实声明】
//   ⚠️ 只认**三种字面写法**（单引号 / 双引号 / 正则）；「先 `replace` 再切」的写法**也会**被命中
//     ⇒ 必须登记（理由写清它**已经**是转义感知的）。
//   ⚠️ **不覆盖**「用别的办法算格数」（`matchAll` 数分隔符 / 手写扫描器）—— 那半**只登记读数**。
{
  const guards44 = existsSync(parityDir)
    ? readdirSync(parityDir).filter((f) => f.startsWith('verify-') && f.endsWith('.mjs')).sort()
    : [];
  // ⚠️ **运行时拼出**（抄 ⑥ 的做法）：本判据的登记键与 canary 样本里**不出现**裸写法整串，
  //    否则它们自己会被判定命中（「判据命中自己」）。
  const PIPE44 = '|';
  /** 判定与 canary **共用**：一段代码里**裸**切分的写法（**转义感知**的 `(?<!\\)` **不在内**）。 */
  const barePipeSplits44 = (code) => {
    const out = [];
    for (const l of code.split('\n')) {
      if (/split\(\s*(?:'\|'|"\|"|\/\\?\|\/)\s*\)/.test(l)) out.push(l.trim());
    }
    return out;
  };
  /** 登记表：键 = 该行 `trim()` 后的代码文本（**逐字**）⇒ 代码改了形状就会**陈旧**并被判失败。 */
  const BARE_PIPE_SPLIT = new Map([
    [`for (const cell of body.replace(/\\\\\\${PIPE44}/g, '\\u0000').split('${PIPE44}')) {`,
      '**已经**是转义感知的（先把 `\\|` 换成 NUL 再切）—— 另一种写法，不是漏网'],
    [`const cur = m[1].split('${PIPE44}');`,
      '切的是**正则的交替分支**（`SURFACE`），不是表格行'],
    [`for (const m of stripComments(src).matchAll(SURFACE)) if (m[1].split('${PIPE44}').includes('ts')) surfaces += 1;`,
      '同上（`SURFACE` 的交替分支）'],
    [`const [ef, ehit] = key.split('${PIPE44}');`,
      '切的是**复合键** `file|needle`，不是表格行'],
  ]);
  const found44 = new Set();
  for (const f of guards44) {
    for (const l of barePipeSplits44(stripJsComments(read(`tests/parity/${f}`)))) found44.add(l);
  }
  const unregistered44 = [...found44].filter((l) => !BARE_PIPE_SPLIT.has(l));
  if (unregistered44.length > 0) {
    fail(`㊹ 这些护栏代码里有**裸**切分 \`|\`（不认 GFM 转义）：${unregistered44.slice(0, 4).join(' ⏎ ')}`
      + `${unregistered44.length > 4 ? ` …（共 ${unregistered44.length} 处）` : ''}`
      + ' —— GFM 里表内**未转义**的 `|` 一律是分隔符 ⇒ 裸切分遇到 `\\|` 会**多切一格** ⇒'
      + ' 把**合法**表判红（**假阳性**）。请改用**转义感知**的切分，或在本判据的 `BARE_PIPE_SPLIT` 里'
      + '**逐字**登记并写明「它不是表格格数」（审计 §4.321）');
  }
  const stale44 = [...BARE_PIPE_SPLIT.keys()].filter((k) => !found44.has(k));
  if (stale44.length > 0) {
    fail(`㊹ \`BARE_PIPE_SPLIT\` 有**陈旧条目**（代码里已不存在）：${stale44.slice(0, 3).join(' ⏎ ')}`
      + ' —— 陈旧登记会让「每处裸切分都已登记」这句话**悄悄失效**');
  }
  // 防空转：[健康度型] 扫描面（护栏数）+ [覆盖型] 登记数（人工枚举）
  if (guards44.length < 20) {
    fail(`㊹ 只扫到 ${guards44.length} 个护栏（[健康度型] 下限 20）—— 扫描面萎缩会让本判据**空转**`);
  }
  const BARE44_BASELINE = 4; // [覆盖型] 基线 4
  coverEq('㊹ 裸切分的登记条数', BARE_PIPE_SPLIT.size, BARE44_BASELINE,
    '登记被删空会让「每处裸切分都已登记」重新变成**无人守**');
  // canary：三向（与判定**共用** barePipeSplits44）
  if (barePipeSplits44(`const a = row.split('${PIPE44}');`).length !== 1) {
    fail('㊹ canary 失效：**裸**切分未被检出');
  }
  if (barePipeSplits44(`const a = row.split(/(?<!\\\\)\\${PIPE44}/);`).length !== 0) {
    fail('㊹ canary **过宽**：**转义感知**的切分被当成了裸切分（那会把正确写法判红）');
  }
  if (barePipeSplits44(`const a = row.split(/\\${PIPE44}/);`).length !== 1) {
    fail('㊹ canary 失效：**正则写法**的裸切分未被检出（它与单引号写法等价）');
  }
  console.log(`Release gate: 表格**格数**谓词的 GFM 转义 —— 扫描 ${guards44.length} 个护栏，`
    + `**裸**切分 \`|\` ${found44.size} 处**全部已登记**（登记表 ${BARE_PIPE_SPLIT.size} 条，含陈旧检查）；`
    + '⚠️ **边界**：只认三种字面写法，**不覆盖**「用别的办法算格数」');
}

// ── ㊺ 把 checkout 落到**子目录**的 job：所有「相对工作区根」的 action 输入都必须显式带前缀（2026-10-12，审计 §4.322）──
// 【为什么】`actions/checkout` 的 `with.path:` 会把仓库落到**工作区的一个子目录**里；
//   而**若干 action 的输入默认是「相对工作区根」解析**的 —— 此时它们指向**不存在的文件**。
//   ⚠️ `working-directory:` 对这些步骤**无效** —— 它们是 **JS action**，不是 `run` 步骤。
//   **这正是它容易漏的原因。**
//   ⚠️ 实测（v1.5.34 发版 + 随后的派发验证）—— 同一个 job 上**连撞两次**，而两次**形态相同**：
//     ① `pnpm/action-setup` 的 `package_json_file`（默认 `package.json`）
//        ⇒ `Error: No pnpm version is specified.` ⇒ **整个 job 在第一步就死**；
//     ② 修好后同一个 `with:` 里 `actions/setup-node` 的 `node-version-file: .nvmrc`
//        ⇒ `The specified node version file at: …/Mellow/.nvmrc does not exist`
//        —— ⚠️ **而同一行的 `cache-dependency-path: mellow/pnpm-lock.yaml` 是写对的**
//        ⇒ 「**一个 `with:` 里只写对了一半**」（同族「只锁了一半」的又一形态）。
//   ⚠️ **时间线（逐 run 量准 —— 这是「是不是 flaky」的唯一判据）**：该 job 在
//   **v1.5.27 … v1.5.33（2026-10-05/06）逐次 success**，**首次 failure 是 2026-10-11 的 v1.5.34 标签**
//   ⇒ 与上一次全绿之间只隔一次改动：**2026-10-10 把 \`pnpm/action-setup\` 从 v4 升到 v5**（审计 §4.283）
//   ⇒ 这是**升级 action 引入的确定性回归**，**不是环境抖动**。
//   ⚠️ **我初稿把它写成了「一直被读成 flaky（v1.5.33 一次成功一次失败、v1.5.29 失败）」—— 那是错的**：
//   那两次的失败作业是 **Windows**，**Linux 当时是 success**。⇒ 教训：**结论要比读数更弱，或先把读数量准。**
//   ⚠️ 当时那次升级的护栏**只锁了「运行时版本（node24）」这一维**，**没锁「输入的路径语义」**。
// 【判据】扫全部 `.github/workflows/*.yml`，按 `ACTION_PATH_INPUTS45` 登记表逐个核对
//   **注册过的**（action, input）组合：
//   ① 该输入**已声明** ⇒ 在 `cp !== '.'` 时必须带 `cp/` 前缀；去掉前缀后的路径**必须真实存在**
//      （带通配符的登记项跳过存在性）；登记了 `need` 的还必须**内容匹配**；
//   ② 该输入**未声明**且有**仓库相对的默认值** ⇒ 要求 `cp === '.'`（否则默认值必然指空）。
//   ⚠️ 这条规则**与 action 无关** —— 新增一个「有仓库相对默认值」的 action 时，
//   往登记表加一行即可（而不是再写一条判据）。
// 【边界如实声明】
//   ⚠️ 只解析**行式 YAML**（本仓 workflow 均为 2 空格缩进 + `- ` 步骤）。
//   ⚠️ 只覆盖 `ACTION_PATH_INPUTS45` **登记过的**（action, input）—— **没登记的输入不覆盖**
//     （登记表是本判据的**扫描面**；它不空，且逐项都有 `why`）。
//   ⚠️ **「输入未声明且它没有仓库相对默认值」不在覆盖内** —— 那属于「少写了一个输入」
//     （另一类、更轻的问题：不指空，只是不生效），**不混进本判据**（如实登记，不偷偷放宽）。
{
  /** 登记表：哪些 action 的哪个输入是「相对工作区根」的路径。
   *  `def` = 未声明时的默认值（`null` = 该输入无默认、不声明就没事）；
   *  `glob` = 值可能是通配符 ⇒ 跳过存在性；`need` = 内容必须匹配的正则。 */
  const ACTION_PATH_INPUTS45 = [
    { action: 'pnpm/action-setup', input: 'package_json_file', def: 'package.json',
      need: /"packageManager"/, why: '版本从 `packageManager` 派生；读不到就报 `No pnpm version is specified.`' },
    { action: 'actions/setup-node', input: 'node-version-file', def: null,
      why: '读不到就报 `The specified node version file … does not exist`' },
    { action: 'actions/setup-node', input: 'cache-dependency-path', def: null, glob: true,
      why: '缓存键算不出来 ⇒ 只是慢，但同样是「路径假设」漏写' },
  ];

  const wfDir45 = resolve(root, '.github/workflows');
  const wfFiles45 = existsSync(wfDir45)
    ? readdirSync(wfDir45).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort()
    : [];
  /** 判定与 canary **共用**：从第 `i` 行起的**步骤**行（`- ` 缩进更深的续行）。 */
  const stepLinesAt45 = (jobLines, i) => {
    const dash = jobLines[i].indexOf('-');
    const out = [jobLines[i]];
    for (let j = i + 1; j < jobLines.length; j += 1) {
      const t = jobLines[j];
      if (t.trim() === '') { out.push(t); continue; }
      if (t.search(/\S/) <= dash) break;
      out.push(t);
    }
    return out;
  };
  /** 判定与 canary **共用**：一个 job 段落里 checkout 的 `path:`（无则 `.`）。 */
  const checkoutPath45 = (jobLines) => {
    let p = '.';
    for (let i = 0; i < jobLines.length; i += 1) {
      if (!/uses:\s*actions\/checkout@/.test(jobLines[i])) continue;
      for (const l of stepLinesAt45(jobLines, i)) {
        const m = /^\s*path:\s*(\S+)\s*$/.exec(l);
        if (m !== null) p = m[1].replace(/^\.\//, '').replace(/\/+$/, '');
      }
    }
    return p;
  };
  /** 判定与 canary **共用**：给定 job 行，返回**不合规原因**（字符串）；合规返回 null。 */
  const pathInputVerdict45 = (jobLines) => {
    const cp = checkoutPath45(jobLines);
    for (let i = 0; i < jobLines.length; i += 1) {
      if (!/uses:\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@/.test(jobLines[i])) continue;
      const step = stepLinesAt45(jobLines, i);
      for (const reg of ACTION_PATH_INPUTS45) {
        const uses = new RegExp(`uses:\\s*${reg.action.replace(/[/.]/g, '\\$&')}@`);
        if (!uses.test(jobLines[i])) continue;
        if (reg.action === 'pnpm/action-setup' && step.some((l) => /^\s*version:/.test(l))) continue;
        const line = step.find((l) => new RegExp(`^\\s*${reg.input}:`).test(l));
        if (line === undefined) {
          if (reg.def !== null && cp !== '.') {
            return `${reg.action} 的 \`${reg.input}\` **未声明**，其默认值 \`${reg.def}\` 是`
              + `**相对工作区根**解析的，而本 job 的 checkout 落在 \`${cp}/\` ⇒ **必然指空**（${reg.why}）`;
          }
          continue;
        }
        const declared = line.split(':').slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
        if (cp !== '.' && !declared.startsWith(`${cp}/`)) {
          return `${reg.action} 的 \`${reg.input}: ${declared}\` **不在** checkout 目录 \`${cp}/\` 之内`
            + ' —— 它会解析到工作区里**本仓之外**的路径';
        }
        const repoRel = cp === '.' ? declared : declared.slice(cp.length + 1);
        if (reg.glob === true || /[*?[\]]/.test(repoRel)) continue;      // 通配符 ⇒ 跳过存在性
        const full = resolve(root, repoRel);
        if (!existsSync(full)) {
          return `${reg.action} 的 \`${reg.input}: ${declared}\` 指向**不存在**的文件（${repoRel}）`;
        }
        if (reg.need !== undefined && !reg.need.test(readFileSync(full, 'utf8'))) {
          return `${reg.action} 的 \`${reg.input}: ${declared}\` 内容不满足要求（需 ${String(reg.need)}）`
            + ` —— ${reg.why}`;
        }
      }
    }
    return null;
  };
  const offenders45 = [];
  let checked45 = 0;
  for (const f of wfFiles45) {
    const lines = read(`.github/workflows/${f}`).split('\n');
    // 按 2 空格缩进的 job 头切段（与 ㉞ 同款约定）
    const jobs = [];
    let cur = null;
    for (const l of lines) {
      const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(l);
      if (m !== null) { if (cur !== null) jobs.push(cur); cur = { name: m[1], lines: [] }; continue; }
      if (cur !== null) cur.lines.push(l);
    }
    if (cur !== null) jobs.push(cur);
    for (const job of jobs) {
      for (const l of job.lines) {
        for (const reg of ACTION_PATH_INPUTS45) {
          if (new RegExp(`uses:\\s*${reg.action.replace(/[/.]/g, '\\$&')}@`).test(l)) checked45 += 1;
        }
      }
      const why = pathInputVerdict45(job.lines);
      if (why !== null) offenders45.push(`${f} → job \`${job.name}\`：${why}`);
    }
  }
  if (offenders45.length > 0) {
    fail(`㊺ 这些 job 的 action 输入会**解析到不存在的文件**：${offenders45.slice(0, 4).join('；')}`
      + ' —— 本 job 的 checkout 落在**子目录**，而 action 的输入是**相对「工作区根」**解析的'
      + '（`working-directory:` 对它们**无效** —— 它们是 JS action，不是 `run` 步骤）。'
      + '修法：把该输入写成 `<checkout 路径>/…`（审计 §4.322）');
  }
  // 防空转：[健康度型]（workflow 与步骤数由仓库内容产生 ⇒ 留余量）
  if (wfFiles45.length < 3 || checked45 < 12) {
    fail(`㊺ 只扫到 ${wfFiles45.length} 个 workflow / ${checked45} 处登记过的 action 用法`
      + '（[健康度型] 下限 3 / 12）—— 扫描面萎缩会让本判据**空转**');
  }
  // canary：五向（与判定**共用** pathInputVerdict45 / checkoutPath45 / stepLinesAt45）
  const jobWith45 = (inner) => ['    steps:', ...inner];
  const subCheckout45 = ['      - uses: actions/checkout@v5', '        with:', '          path: sub'];
  if (pathInputVerdict45(jobWith45([...subCheckout45,
    '      - uses: pnpm/action-setup@v5'])) === null) {
    fail('㊺ canary 失效：**checkout 落子目录 + `package_json_file` 未声明**（有仓库相对默认值）未被检出');
  }
  if (pathInputVerdict45(jobWith45([...subCheckout45,
    '      - uses: actions/setup-node@v5', '        with:', '          node-version-file: .nvmrc'])) === null) {
    fail('㊺ canary 失效：**`node-version-file` 没带子目录前缀**未被检出（实测第二次撞的就是它）');
  }
  if (pathInputVerdict45(jobWith45([...subCheckout45,
    '      - uses: actions/setup-node@v5'])) !== null) {
    fail('㊺ canary **过宽**：`node-version-file` **未声明且无默认值**的样本被判为不合规');
  }
  if (pathInputVerdict45(jobWith45([...subCheckout45,
    '      - uses: pnpm/action-setup@v5', '        with:',
    `          package_json_file: sub/${'package.json'}`])) !== null) {
    fail('㊺ canary **过宽**：**显式指对子目录路径**的样本被判为不合规');
  }
  if (pathInputVerdict45(jobWith45([
    '      - uses: actions/checkout@v5', '      - uses: pnpm/action-setup@v5',
  ])) !== null) {
    fail('㊺ canary **过宽**：checkout 在**仓库根**的常规样本被判为不合规');
  }
  if (checkoutPath45(jobWith45(subCheckout45)) !== 'sub') {
    fail('㊺ canary 失效：`path: sub` 未被解析出来（那样判定会退化成「永远认为在仓库根」）');
  }
  console.log(`Release gate: checkout 子目录下的 action 路径输入 —— 扫描 ${wfFiles45.length} 个 workflow / `
    + `${checked45} 处登记过的 action 用法，**会解析到不存在的文件** ${offenders45.length} 处；`
    + `⚠️ **边界**：只覆盖登记表里的 ${ACTION_PATH_INPUTS45.length} 组（action, input）；`
    + '「输入未声明且无仓库相对默认值」不在覆盖内（那是另一类、更轻的问题）');
}

if (errors.length > 0) {
  throw new Error(`Release gate violations:\n  ${errors.join('\n  ')}`);
}

const goNoGo = noGo.length === 0 ? 'GO（全部 P0 已闭环）' : `NO-GO：${noGo.length} 项未闭环`;
// 按阻塞原因归类输出（2026-09-25）：只列状态码会让「三项自身证据已齐备、仅被全局
// ux-gate 策略挡住」这种关键事实淹没在 `MAC 仅单平台` 里（该状态码本身还会误导）。
const byReason = new Map();
for (const item of ledger.items ?? []) {
  if (isClosed(item)) continue;
  const key = item.blockedBy ?? '未声明';
  if (!byReason.has(key)) byReason.set(key, []);
  byReason.get(key).push(item.id);
}
// ⚠️ 「**A3 规则自检**」canary 块**已上移到错误检查点之前**（2026-10-09，审计 §4.175）——
//   它此前位于本检查点**之后** ⇒ **3 条 canary 永不运行**（`errors.push` 只是往数组塞字符串）。
//   ⚠️ 这是本文件**同族第 3 次**：① L1385 注释记过的那次；② §4.174 我的判据 ⑨；
//   ③ 本块（**既有缺陷**，2026-09-30 起一直没生效）⇒ 现由判据 ⑩ 机械守住。

// ── 「闭环」口径必须显式声明（2026-09-25）────────────────────────────────
// 立此节的必要性：本门禁把 `AUTO` 视为**不阻断**，而 master-plan §4.3 定义
// `AUTO` = 「自动化测试通过，**真机体验验收未完成**」；§8 的 V1.0 Exit Gate 又要求
// 「Windows / macOS / Linux 全 PASS-E」。两者口径不同 —— 只输出「6 项未闭环」
// 会被读成「只有 6 项没做完」，实际 PASS-E 为 **0**。
// 更危险的是 §5.7 已记录过一次教训：`P0-SHELL-003` 的 `AUTO` 曾把一个**完全不可用**的
// 功能（浮动工具栏永不显示）当作已闭环 —— 单测只覆盖纯函数，属「有测试但不工作」。
// ⚠️ `totalItems` / `passECount` 与判据 ⑨（README 状态快照）**已上移到错误检查点之前**
//   —— 见本文件上方「错误检查点之前」那段（2026-10-09 审计 §4.174：首版落在检查点**之后**
//   ⇒ `fail()` 只是往数组塞字符串、**永不判定**；注入验证 3/3 全绿才发现）。

const autoWithUxGate = (ledger.items ?? []).filter(
  (i) => i.status === 'AUTO' && (i.requiredEvidence ?? []).includes('ux-gate'),
);
console.log(
  `Release gate: ${guardFiles.length} parity guards wired into both root test and parity chains; `
  + 'PASS-E conclusion reachability checked; CI gates armed (packages/engine unit, desktop build + bundle fingerprint, parity chain, cargo test); '
  + `release packaging gated by pre-build fingerprint verification. Release verdict: ${goNoGo}`
  + (noGo.length > 0 ? `\n  Unclosed: ${noGo.join(', ')}` : '')
  + (byReason.size > 0
    ? `\n  Blocked by: ${[...byReason.entries()].map(([r, ids]) => `${r} → ${ids.join(', ')}`).join(' | ')}`
    : '')
  + `\n  Closure basis: 本门禁的「不阻断」口径 = PASS-E / PASS-B / AUTO（**且 requiredEvidence 不含 ux-gate**）；`
  + `按 ADR-0024 Q1=A3（Accepted 2026-09-30），自身声明需要人工门禁的 AUTO 项不得以 AUTO 收口。`
  + `按 master-plan §4.3，AUTO 的含义是「自动化测试通过、**真机体验验收未完成**」。`
  + `实际 PASS-E = ${passECount}/${totalItems}。`
  + (autoWithUxGate.length > 0
    ? `\n  ℹ️ ${autoWithUxGate.length} 项标 AUTO 且 requiredEvidence 含 ux-gate`
      + `（${autoWithUxGate.map((i) => i.id).join(', ')}）：按 ADR-0024 A3 已计入未闭环（不得以 AUTO 收口）。`
    : '')
  + '\n  ⚠️ §5.7 已记录一次「AUTO 把一个完全不可用的功能当作已闭环」（P0-SHELL-003 浮动工具栏）—— 不要把 AUTO 读作「已完成」。'
  + (noGo.length > 0
    ? (PENDING_ADRS.length > 0
      ? `\n  Pending decisions: ${PENDING_ADRS.map(([p]) => p.replace('docs/adr/', '')).join(', ')}`
        + '（状态 Proposed，裁决前不生效）'
      : '\n  Pending decisions: 无 —— 已裁决为 Accepted：' + DECIDED_ADRS.map(([p]) => p.replace('docs/adr/', '').replace(/\.md$/, '')).join(' / ') + '（见各自 ADR 的「裁决」节）')
    : '')
);
