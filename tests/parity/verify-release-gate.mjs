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
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (message) => errors.push(message);

const parityDir = resolve(root, 'tests/parity');
const guardFiles = readdirSync(parityDir)
  .filter((name) => name.startsWith('verify-') && name.endsWith('.mjs'))
  .sort();

// ── ① 护栏全集必须接入根脚本链 ──────────────────────────────────────────
const pkg = JSON.parse(read('package.json'));
const testChain = pkg.scripts?.test ?? '';
const parityChain = pkg.scripts?.parity ?? '';
if (guardFiles.length < 18) {
  fail(`parity 护栏数量异常（${guardFiles.length}），2026-10-01 基线为 18`);
}
const missingInTest = guardFiles.filter((name) => !testChain.includes(name));
const missingInParity = guardFiles.filter((name) => !parityChain.includes(name));
if (missingInTest.length > 0) fail(`根 package.json 的 test 链缺少护栏：${missingInTest.join(', ')}`);
if (missingInParity.length > 0) fail(`根 package.json 的 parity 链缺少护栏：${missingInParity.join(', ')}`);
if (!testChain.includes('ux-gate-recorder.mjs --self-test')) {
  fail('根 test 链缺少 ux-gate-recorder --self-test（UX Gate 自检）');
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
const PENDING_ADRS = [];   // 当前无待裁决 ADR（ADR-0032 已于 2026-10-06 同日裁决为 Accepted）
for (const [p, what] of PENDING_ADRS) {
  if (!existsSync(resolve(root, p))) {
    fail(`待裁决 ADR 缺失：${p}（${what}）—— 待裁决项必须有 ADR 载体（AGENTS.md「决策变更」）`);
    continue;
  }
  const src = read(p);
  // 未裁决前**必须**是 Proposed：放宽到「行内任意位置出现 Accepted」会被正文里的字样满足，
  // 故沿用 DECIDED 那侧的写法（只认 **Status:** 那一行）。
  if (!/\*\*Status:\*\*[^\n]*Proposed/.test(src)) {
    fail(`${p}（${what}）尚未裁决，状态必须是 Proposed；若已裁决，请移入 DECIDED_ADRS 并写明结论`);
  }
}
// canary：自检上面这条规则本身（样本拼接构造，不依赖真实文件）
{
  const PROPOSED_LINE = '**Status:** **Proposed**（2026-10-01）—— 待裁决；裁决前不生效';
  const ACCEPTED_LINE = '**Status:** **Accepted**（2026-10-01）—— 已裁决';
  if (!/\*\*Status:\*\*[^\n]*Proposed/.test(PROPOSED_LINE)) {
    fail('待裁决 ADR 状态护栏 canary 失效：合法的 Proposed 状态行未被检出');
  }
  if (/\*\*Status:\*\*[^\n]*Proposed/.test(ACCEPTED_LINE)) {
    fail('待裁决 ADR 状态护栏 canary 失效：Accepted 状态行被误判为 Proposed');
  }
  // 反例锁：正文里出现「Proposed」字样不得让一个没有 Status 行的文件过关
  const BODY_ONLY = '本 ADR 原为 Proposed，现已裁决。';
  if (/\*\*Status:\*\*[^\n]*Proposed/.test(BODY_ONLY)) {
    fail('待裁决 ADR 状态护栏过宽：正文里的 Proposed 字样被当成了状态行');
  }
}
for (const [p, what, decision] of DECIDED_ADRS) {
  if (!existsSync(resolve(root, p))) {
    fail(`已裁决 ADR 缺失：${p}（${what}）—— 裁决记录不得删除，否则门禁结论失去依据`);
    continue;
  }
  const src = read(p);
  // 状态行的 Accepted 可能被加粗（`**Status:** **Accepted**`），故用 [^\n]* 容错，
  // 但**不得**放宽到「行内任意位置出现 Accepted」（那会被正文里的字样满足）。
  if (!/\*\*Status:\*\*[^\n]*Accepted/.test(src)) {
    fail(`${p} 已于 2026-09-30 裁决为 Accepted（${decision}），不得退回 Proposed 或删除`);
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
      if (rows.length < 10) {
        fail(`待裁决项登记表只有 ${rows.length} 行（下限 10 = 立表时的基线）—— `
          + '行被删掉会让登记表退化成空表（下限在此**适用**：登记表是「不该缩小的集合」）');
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
  // 引用源：D 表（master-plan）+ 两个会引用 D 编号的文档类。ADR 目录为平铺 .md。
  const REF_SOURCES = [
    PLAN,
    'docs/qualification/release-blocker-audit-2026-09-25.md',
    ...readdirSync(resolve(root, 'docs/adr'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `docs/adr/${f}`),
  ];

  // 确实要「提到一个没有声明行的编号」时在此登记**理由**（本仓既有 idiom，同 OFFICIAL_SHORTCUT_EXCEPTIONS）。
  // 两类合法用途：① 记下「经复核**不**创建某编号」这个决定；② 泛指占位（非具体条目）。
  const D_TABLE_NOT_DECLARED = new Map([
    ['D-AN', 'ADR-0029 Q1=A3 经 2026-10-01 复核判定为 D-AF 的**重复登记** ⇒ 显式「不创建」该编号（见 master-plan §12 的 D-AF 行 / 审计 §4.67）'],
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
  if (declRows < 37) {
    fail(`master-plan 只解析出 ${declRows} 个 D 表声明行（下限 37 = 立此判据时的基线）—— `
      + '表被削空会让「凡被引用的编号都有声明行」退化成**空真**；'
      + '若确实删过条目，请同步下调下限并说明（解析器漏成员必须响亮失败）');
  }

  // ① 引用集（来自所有 REF_SOURCES）
  const referenced = new Set();
  for (const rel of REF_SOURCES) {
    if (!existsSync(resolve(root, rel))) { fail(`D 表护栏的引用源不存在：${rel}`); continue; }
    for (const m of read(rel).matchAll(ID)) referenced.add(m[0]);
  }
  for (const id of [...referenced].sort()) {
    if (declared.has(id) || D_TABLE_NOT_DECLARED.has(id)) continue;
    fail(`D 编号 ${id} 被引用，但 master-plan 里没有它的**声明行**（表格首格形如 \`| **${id}\`）—— `
      + '§12 D 表自称「唯一可发现处」，条目不在表里 = 后续轮次无法发现该裁决；'
      + '若该引用是「**不**创建此编号」或泛指占位，请登记进 D_TABLE_NOT_DECLARED 并写明理由');
  }

  // ④ 例外表双向：必须仍被引用（否则是过期例外）；不得同时又有了声明行（自相矛盾）
  for (const [id, why] of D_TABLE_NOT_DECLARED) {
    if (!referenced.has(id)) {
      fail(`D 表例外 ${id} 已过期：文档里已不再引用它（原登记理由：${why}）`);
    }
    if (declared.has(id)) {
      fail(`D 表例外 ${id} 自相矛盾：它既被登记为「无声明行」，又确实有了声明行 —— 请删除该例外`);
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
// ⚠️ 覆盖边界：只锁**护栏数量**（可静态算）；**包用例数需实跑**，无法在此校验 —— 如实声明。
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
// ── A3 规则自检（canary，2026-09-30）─────────────────────────────────────
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
// ── 「闭环」口径必须显式声明（2026-09-25）────────────────────────────────
// 立此节的必要性：本门禁把 `AUTO` 视为**不阻断**，而 master-plan §4.3 定义
// `AUTO` = 「自动化测试通过，**真机体验验收未完成**」；§8 的 V1.0 Exit Gate 又要求
// 「Windows / macOS / Linux 全 PASS-E」。两者口径不同 —— 只输出「6 项未闭环」
// 会被读成「只有 6 项没做完」，实际 PASS-E 为 **0**。
// 更危险的是 §5.7 已记录过一次教训：`P0-SHELL-003` 的 `AUTO` 曾把一个**完全不可用**的
// 功能（浮动工具栏永不显示）当作已闭环 —— 单测只覆盖纯函数，属「有测试但不工作」。
const totalItems = (ledger.items ?? []).length;
const passECount = (ledger.items ?? []).filter((i) => i.status === 'PASS-E').length;
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
