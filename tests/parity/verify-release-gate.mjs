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
  if (item.status === 'NOT_TESTED' || item.status === 'BLOCKED' || item.status === 'ABSENT' || item.status === 'IMPL') {
    noGo.push(`${item.id}(${item.status})`);
  } else if (['MAC', 'WIN', 'LINUX'].includes(item.status)) {
    // 仅单一平台证据：三平台未闭环，同样不得作为发布结论
    noGo.push(`${item.id}(${item.status} 仅单平台)`);
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
console.log(
  `Release gate: ${guardFiles.length} parity guards wired into both root test and parity chains; `
  + 'PASS-E conclusion reachability checked; CI gates armed (packages/engine unit, desktop build + bundle fingerprint, parity chain, cargo test); '
  + `release packaging gated by pre-build fingerprint verification. Release verdict: ${goNoGo}`
  + (noGo.length > 0 ? `\n  Unclosed: ${noGo.join(', ')}` : '')
);
