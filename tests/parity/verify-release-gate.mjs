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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

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
// [覆盖型] 基线 23 —— 阈值必须 == 当前值（skill §2）
if (repoGuardFiles.length < 23) {
  fail(`**仓库里**的 parity 护栏只有 ${repoGuardFiles.length} 条（下限 23 = 2026-10-08 基线）—— `
    + '本条的目的正是「防某人悄悄删掉一条」；数量退化会让它退化成**空真**');
}
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
const PENDING_ADRS = [
  ['docs/adr/ADR-0034-preference-deviations-2026-10-07.md',
    '偏好默认值 5 项偏离 Typora（highlight / sub·sup / mermaid / zoomByMouse）'],
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
      // [覆盖型] 基线 17 —— 阈值必须 == 当前值（skill §2）
      if (rows.length < 17) {
        fail(`待裁决项登记表只有 ${rows.length} 行（下限 17 = 2026-10-09 实测基线）—— `
          + '行被删掉会让登记表退化成空表（**覆盖型下限**：登记表是「不该缩小的集合」，'
          + '故阈值必须 == 当前行数；若确实删过行，请同步下调本阈值并说明）');
      }
      for (const row of rows) {
        const cols = row.split('|').map((c) => c.trim());
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
        const cols = row.split('|').map((c) => c.trim());
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
  const REF_EXT = /\.(md|mjs|cjs|js|ts|tsx|json|yml|yaml|rs|sh)$/;
  //   · **canary 合成编号**：见下方 `CANARY_SYNTHETIC_IDS` —— 它们**刻意不声明**，但**必须仍被引用**
  //     （防「canary 被删了却没人发现」）。⚠️ **不按文件排除** `verify-*.mjs`：那样会把护栏里
  //     **真实的** D 引用（如 `verify-sidebar-contract.mjs` 的 `D-C`/`D-J`）也一起豁免掉。
  // ⚠️ **本文件自己现在也是引用源** ⇒ 本文件里**任何位置**（含注释、举例）都不得写「不存在的编号」字面量
  //   （审计 §4.237：初稿在注释里写了那个不存在的编号，判据当场命中自己）。
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
  //   （本注释**刻意不写出那个编号的字面量** —— 本文件是引用源，写了就会被判据命中，见 §4.237。）
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
    const cells = line.split('|').slice(1, -1);
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
  //   （审计 §4.237 的教训：在引用源里写不存在的编号字面量 ⇒ 判据命中自己）。
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
    if ('| **D-ZZ** | a | b | c | d |'.split('|').slice(1, -1).length !== 5) {
      errors.push('D 表自洽护栏 canary 失效：5 格行未被数出 5 格');
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
  'run: cargo test',                                     // Rust System Core
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
  const BOUND_EXPR = /(?:<=|<|>=|>)\s*(\d+)/;
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
  // ⚠️ 模式**运行时拼接**（本文件自己也在扫描面里 ⇒ 写字面量会被自己命中，§4.237 的教训）
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
  //   （本会话第 6 次「判据命中自己」：§4.156 / §4.157 / §4.237 / §4.240 / §4.168 / 本节）。
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
  // ⚠️ 模式与**示例**都运行时拼接：本文件在扫描面内，且它会在注释/消息里**引用**坏形态（§4.237 的教训）
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
  const unclosedOf = (s) => {
    const m = /未闭环\s*\**\s*(\d+)\s*项/.exec(s);
    return m === null ? null : Number(m[1]);
  };
  const statedPassE = passEOf(readmeSnapshot);
  const statedUnclosed = unclosedOf(readmeSnapshot);
  if (statedPassE !== null && (statedPassE[0] !== passECount || statedPassE[1] !== totalItems)) {
    fail(`README.md 写「PASS-E = ${statedPassE[0]}/${statedPassE[1]}」，而门禁**现算**为 `
      + `${passECount}/${totalItems} —— 这是**无日期的快照**，会被按「当前」读；`
      + '要么同步，要么改为指向门禁输出（`node tests/parity/verify-release-gate.mjs`）');
  }
  if (statedUnclosed !== null && statedUnclosed !== noGo.length) {
    fail(`README.md 写「未闭环 ${statedUnclosed} 项」，而门禁**现算**为 ${noGo.length} 项 —— 同上：快照会漂`);
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
    const throws = [...src.matchAll(/throw new Error\(/g)].map((m) => m.index);
    if (throws.length === 0) continue;
    checked10 += 1;
    const last = throws[throws.length - 1];
    const tail = src.slice(last);
    const hit = TAIL_ASSERT.exec(tail);
    if (hit !== null) {
      offenders10.push(`${f}（抛错点之后第 ${tail.slice(0, hit.index).split('\n').length} 行起）`);
    }
  }
  if (offenders10.length > 0) {
    fail(`这些护栏在**抛错点之后**还有断言（**永不判定**）：${offenders10.join('、')} —— `
      + '`fail()` / `errors.push()` 只是往数组塞字符串，而检查点已经过去；'
      + '把断言**上移到 `if (errors.length > 0)` 之前**（本文件同族已 3 次）');
  }
  // 防空转：必须**真的**检查到了带 throw 的护栏（否则判据已不覆盖任何文件）
  if (checked10 < 3) {
    fail(`只检查到 ${checked10} 个带抛错点的护栏（下限 3）—— 判据范围萎缩会让本判据空转`);
  }
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
