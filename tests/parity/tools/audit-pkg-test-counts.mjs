#!/usr/bin/env node
/**
 * 各包用例数「**快照 ↔ 实跑**」对账（本机工具，**不进 CI**，**不依赖 Typora**）。
 *
 * 【为什么需要它】`tests/qualification/README.md` 的「**各包规模**」行是**包用例数的单一真值源**
 *   （CI 侧由 `verify-release-gate.mjs` 锁定「**文件内自洽**」：各处内联数字 + 合计都必须与该行一致）。
 *   但该行**自身与现实是否一致**需要**实跑** —— 该文件自己把这条写成
 *   「⚠️ **仍未覆盖**：本行自身与现实是否一致（需实跑）—— 这条边界如实声明」。
 *   该行**已两次过期**（2026-10-01 首次刷新、2026-10-08 再次：`editor-engine 1277 → 1318` 等），
 *   而**过期没有任何信号** —— 这条工具把「需实跑」变成**一条命令**。
 *
 * ⚠️ 2026-10-10（审计 §4.244）**再加一半**：真值源行里还有「（另有 vendored CoreEditor **N**）」——
 *   它**不在 `packages/*` 的 jest 里**，要单独跑；实测该数在**活文档 5 处**被复述（写 185，实跑 **200**）。
 *   ⇒ 本工具一并跑 `packages/editor-core/CoreEditor` 的 jest 并对账。
 *
 * 【它做什么】逐个包跑该包自己的 jest（`packages/<p>/node_modules/.bin/jest`；
 *   `extension-api` 无本地二进制 ⇒ 按 `package.json` 的 `test` 脚本用 `../settings/…`），
 *   解析 `Tests:  N passed, N total`，与真值源行**逐项 + 合计**对账。
 *
 * 【退出码】`0` = 全部一致；`1` = 有不一致（或解析失败）。
 *   ⚠️ **不自动改 README**：不一致时打印「应改成什么」，由**人**决定（避免把实跑结果机械写回）。
 *
 * 【用法】`node tests/parity/tools/audit-pkg-test-counts.mjs`
 *   `--only <pkg,pkg>` 只跑指定包（调试用；此时**不做**合计判定）。
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const README = 'tests/qualification/README.md';
/** 真值源行：`各包规模（jest，**YYYY-MM-DD …**）：pkg **N** / pkg **N** / …` */
const ROW_RE = /^各包规模[^\n]*$/m;
const PAIR_RE = /([a-z][a-z0-9-]*)\s*\*\*(\d+)\*\*/g;
const TOTAL_RE = /合计\s*(\d+)/;

const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 && process.argv[onlyArg + 1] !== undefined
  ? new Set(process.argv[onlyArg + 1].split(',').map((s) => s.trim()).filter(Boolean))
  : null;

const row = ROW_RE.exec(readFileSync(resolve(root, README), 'utf8').replace(/\r\n/g, '\n'))?.[0];
if (row === undefined) {
  console.error(`✗ ${README} 找不到「各包规模」行 —— 真值源缺失（本工具无从对账）`);
  process.exit(1);
}
// ⚠️ 解析包之前，先把「（**另有 vendored CoreEditor N**…）」那段括注**删掉** ——
//   它也匹配 `名字 **N**` 形态（实测：不删会把 `CoreEditor` 当成**第 13 个包** ⇒ 去 `packages/CoreEditor` 跑 jest）。
//   ⚠️ 也**不能**按「另有 vendored」截断 —— 它在**中间**，截断会丢掉它之后的 5 个包（实测：只剩 7 个）。
const rowPkgs = row.replace(/（另有 vendored[^）]*）/g, '');
const declared = new Map();
for (const m of rowPkgs.matchAll(PAIR_RE)) declared.set(m[1], Number(m[2]));
const declaredTotal = Number(TOTAL_RE.exec(row)?.[1] ?? NaN);
/** 真值源行里的 vendored 数：`（另有 vendored CoreEditor **N**）` */
const declaredVendored = Number(/另有 vendored CoreEditor \*\*(\d+)\*\*/.exec(row)?.[1] ?? NaN);
if (declared.size === 0) {
  console.error('✗ 真值源行里一个「包 **N**」都没解析出来 —— 解析漂移');
  process.exit(1);
}

/** 跑一个包的 jest 并取回「passed 数」。返回 `{passed, failed, unparsed}`。
 *  ⚠️ **必须同时看 stdout 与 stderr**：jest 的汇总行（`Tests:  N passed, N total`）写在 **stderr** ——
 *    实测：只用 `execFileSync`（只返回 stdout）会**12 个包全部解析失败**（而数字其实都在）。
 *  ⚠️ `failed`（用例失败）与 `unparsed`（解析不到汇总行）必须**分开报**：
 *    前者是「测试红了」，后者是「工具坏了」—— 混在一起会把「用例失败」读成「数字不符」。 */
function runPkg(pkg) {
  const dir = resolve(root, 'packages', pkg);
  // `extension-api` 无本地 jest 二进制（其 package.json 的 test 脚本就写 `../settings/…`）
  const bin = pkg === 'extension-api'
    ? '../settings/node_modules/.bin/jest'
    : './node_modules/.bin/jest';
  const r = spawnSync(bin, pkg === 'extension-api' ? ['--rootDir', '.'] : [], {
    cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const m = /^Tests:\s+(\d+) passed,\s+(\d+) total$/m.exec(out);
  if (m === null) {
    console.error(`  ✗ ${pkg} 的输出里找不到「Tests:  N passed, N total」这一行`
      + `（exit=${r.status}；stderr 末行：${(r.stderr ?? '').trim().split('\n').slice(-1)[0]?.slice(0, 120) ?? ''}）`);
    return { passed: null, failed: false, unparsed: true };
  }
  const passed = Number(m[1]);
  const total = Number(m[2]);
  if (passed !== total || r.status !== 0) {
    console.error(`  ⚠️ ${pkg} 的 jest **非 0 退出**（exit=${r.status}）：${passed} passed / ${total} total`);
    return { passed, failed: true, unparsed: false };
  }
  return { passed, failed: false, unparsed: false };
}

const pkgs = [...declared.keys()].filter((p) => ONLY === null || ONLY.has(p));
console.log(`真值源：${README} 的「各包规模」行（${declared.size} 个包 / 合计 ${declaredTotal}）`);
console.log(`实跑 ${pkgs.length} 个包 …\n`);

let bad = 0;
let sum = 0;
let anyFail = false;
let anyUnparsed = false;
for (const p of pkgs) {
  const { passed, failed, unparsed } = runPkg(p);
  const want = declared.get(p);
  if (failed) anyFail = true;
  if (unparsed) anyUnparsed = true;
  if (passed === null) { bad += 1; continue; }
  sum += passed;
  const ok = passed === want;
  if (!ok) bad += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${p.padEnd(18)} 实跑 ${String(passed).padStart(5)}  ·  声明 ${String(want).padStart(5)}`
    + (ok ? '' : `   ← **应改为 ${passed}**`));
}

// ── vendored CoreEditor（**不在 `packages/*` 的 jest 里**，单独跑）────────────────────
// ⚠️ 实测（2026-10-10）：该数在**活文档 5 处**被复述（`qualification/README.md` ×2 ·
//   `editor-core/README.md` ×2 · `editor-core/CONTRACT.md` · `architecture/migration.md`），
//   而**实跑是 200**（复述写 185）—— 与「各包规模」同一类「快照无人对账」。
if (ONLY === null && Number.isFinite(declaredVendored)) {
  const ceDir = resolve(root, 'packages/editor-core/CoreEditor');
  const bin = './node_modules/.bin/jest';
  const r = spawnSync(bin, [], { cwd: ceDir, encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const m = /^Tests:\s+(\d+) passed,\s+(\d+) total$/m.exec(out);
  if (m === null) {
    console.error(`  ✗ vendored CoreEditor 的输出里找不到「Tests:  N passed, N total」（exit=${r.status}）`);
    bad += 1;
    anyUnparsed = true;
  } else {
    const got = Number(m[1]);
    const ok = got === declaredVendored;
    if (!ok) bad += 1;
    if (Number(m[1]) !== Number(m[2]) || r.status !== 0) { anyFail = true; }
    console.log(`  ${ok ? '✓' : '✗'} ${'vendored CoreEditor'.padEnd(18)} 实跑 ${String(got).padStart(5)}  ·  声明 ${String(declaredVendored).padStart(5)}`
      + (ok ? '' : `   ← **应改为 ${got}**（活文档另有 4 处复述，见文件头）`));
  }
}

if (ONLY === null) {
  const okTotal = sum === declaredTotal;
  if (!okTotal) bad += 1;
  console.log(`\n  ${okTotal ? '✓' : '✗'} ${'合计'.padEnd(17)} 实跑 ${String(sum).padStart(5)}  ·  声明 ${String(declaredTotal).padStart(5)}`
    + (okTotal ? '' : `   ← **应改为 ${sum}**`));
}

if (anyUnparsed) console.error('\n⚠️ 有包的汇总行**解析不到** —— 那是**工具**的问题（不是数字不符），先修工具。');
if (anyFail) console.error('\n⚠️ 有包的 jest **非 0 退出**（有用例失败）—— 用例数可能仍然对得上，但「全绿」不成立。');
if (bad > 0) {
  console.error(`\n✗ ${bad} 处与真值源不一致 ⇒ 请**同时**更新「各包规模」行，\n  以及 verify-release-gate.mjs 锁定的各处内联数字。`);
  process.exit(1);
}
console.log('\n✓ 各包用例数与真值源**逐项 + 合计**一致。');
