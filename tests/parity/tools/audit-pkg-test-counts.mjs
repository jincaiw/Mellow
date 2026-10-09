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
const declared = new Map();
for (const m of row.matchAll(PAIR_RE)) declared.set(m[1], Number(m[2]));
const declaredTotal = Number(TOTAL_RE.exec(row)?.[1] ?? NaN);
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
