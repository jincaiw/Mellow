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
if (guardFiles.length < 13) {
  fail(`parity 护栏数量异常（${guardFiles.length}），V7-W5 基线为 13，W8 起 14`);
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
  const isClosed = item.status === 'PASS-E' || item.status === 'PASS-B' || item.status === 'AUTO';
  if (!isClosed) {
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
  }
}
// canary：自检「未闭环项必须声明阻塞原因」这条规则本身（样本拼接构造）
{
  const SAMPLE_BAD = { id: 'P0-X', status: 'BLOCKED' };
  const SAMPLE_GOOD = { id: 'P0-X', status: 'BLOCKED', blockedBy: 'reason' };
  const closedOk = (it) => it.status === 'PASS-E' || it.status === 'PASS-B' || it.status === 'AUTO';
  if (closedOk(SAMPLE_BAD) || typeof SAMPLE_BAD.blockedBy === 'string') {
    fail('阻塞原因门禁 canary 失效：缺 blockedBy 的样本未被判为不合规');
  }
  if (!closedOk(SAMPLE_GOOD) && (typeof SAMPLE_GOOD.blockedBy !== 'string' || SAMPLE_GOOD.blockedBy === '')) {
    fail('阻塞原因门禁 canary 失效：带 blockedBy 的样本被判为不合规');
  }
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

if (errors.length > 0) {
  throw new Error(`Release gate violations:\n  ${errors.join('\n  ')}`);
}

const goNoGo = noGo.length === 0 ? 'GO（全部 P0 已闭环）' : `NO-GO：${noGo.length} 项未闭环`;
// 按阻塞原因归类输出（2026-09-25）：只列状态码会让「三项自身证据已齐备、仅被全局
// ux-gate 策略挡住」这种关键事实淹没在 `MAC 仅单平台` 里（该状态码本身还会误导）。
const byReason = new Map();
for (const item of ledger.items ?? []) {
  const closed = item.status === 'PASS-E' || item.status === 'PASS-B' || item.status === 'AUTO';
  if (closed) continue;
  const key = item.blockedBy ?? '未声明';
  if (!byReason.has(key)) byReason.set(key, []);
  byReason.get(key).push(item.id);
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
  + `\n  Closure basis: 本门禁的「不阻断」口径 = PASS-E / PASS-B / AUTO；`
  + `按 master-plan §4.3，AUTO 的含义是「自动化测试通过、**真机体验验收未完成**」。`
  + `实际 PASS-E = ${passECount}/${totalItems}。`
  + (autoWithUxGate.length > 0
    ? `\n  ⚠️ ${autoWithUxGate.length} 项标 AUTO 但 requiredEvidence 含 ux-gate`
      + `（${autoWithUxGate.map((i) => i.id).join(', ')}）：按 §8 的 V1.0 Exit Gate（三平台全 PASS-E）它们尚未闭环。`
    : '')
  + '\n  ⚠️ §5.7 已记录一次「AUTO 把一个完全不可用的功能当作已闭环」（P0-SHELL-003 浮动工具栏）—— 不要把 AUTO 读作「已完成」。'
);
