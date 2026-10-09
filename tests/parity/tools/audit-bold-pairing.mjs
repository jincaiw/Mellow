#!/usr/bin/env node
/**
 * 加粗配对「**自包含扫描器 ↔ 真解析器**」交叉验证（本机工具，**不进 CI**，**不依赖 Typora**）。
 *
 * 【为什么需要它】`verify-doc-code-refs.mjs` 的判据 ㊵ 要判「文档里写的 `**` 渲染后是否仍是字面 `**`」。
 *   该判据**不能**依赖外部包：`parity-guard` 两个 CI job **有意不跑 `pnpm install`**
 *   （「护栏脚本只依赖 Node 内建模块，30s 内给结论」）—— 实测引入 `markdown-it` 会让那两个 job **直接红**。
 *   ⇒ 护栏自带一个**无依赖**的 CommonMark 行内扫描器（行内码 + flanking + 规则 9 + 配对栈）。
 *
 * ⚠️ **手写量具必须被交叉验证**，否则它自己就是下一个「静默失效」。本工具把真解析器
 *   （仓内 `packages/export` 已依赖的 `markdown-it`）当**参照物**，逐文件比对两者给出的
 *   「字面 `**` 个数」，并在**修复前后两个版本**上各跑一遍（修复前有 87 处真缺陷 ⇒ 检验「抓得住」；
 *   修复后应接近 0 ⇒ 检验「不误报」）。
 *
 * 【用法】`node tests/parity/tools/audit-bold-pairing.mjs [<git-rev>]`
 *   不带参数 = 比对**工作区**；带 rev = 比对该版本（如 `HEAD~1`）。
 *
 * 【退出码】`0` = 在本判据的扫描面上无差异；`1` = 有差异（打印文件与两侧计数）。
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.workbuddy-ai', 'archive', 'dist', 'target', 'CoreEditor']);
// 判据 ㊵ 的扫描面：再排除 `fixtures/`（输入样本）与冻结的已发布 release notes
const BOLD_SKIP_SEG = new Set(['fixtures']);
const BOLD_FROZEN = new Set([
  '.github/release-notes-v1.5.17.md', '.github/release-notes-v1.5.20.md',
  '.github/release-notes-v1.5.21.md', '.github/release-notes-v1.5.23.md',
]);

const md = createRequire(resolve(root, 'packages/export/package.json'))('markdown-it')({ html: true });

/** 参照物：真解析器给出的「渲染后字面 `**`」个数。 */
function refCount(src) {
  let n = 0;
  for (const tok of md.parse(src, {})) {
    if (tok.type !== 'inline' || !tok.children) continue;
    for (const c of tok.children) {
      if (c.type === 'text' && c.content.includes('**')) n += (c.content.match(/\*\*/g) ?? []).length;
    }
  }
  return n;
}

/** 被测物：护栏里的自包含扫描器（**直接读护栏源码求值**，避免两份实现漂移）。 */
const guardSrc = readFileSync(resolve(root, 'tests/parity/verify-doc-code-refs.mjs'), 'utf8');
const scannerSrc = guardSrc.slice(
  guardSrc.indexOf('const boldIsSpace'),
  guardSrc.indexOf('// ── ㊵ '),
);
// eslint-disable-next-line no-new-func
const boldCount = new Function(`${scannerSrc}; return boldCount;`)();

const rev = process.argv[2] ?? null;
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, maxBuffer: 1 << 28 })
  .toString().split('\0').filter(Boolean)
  .filter((f) => f.endsWith('.md') && !f.split('/').some((s) => SKIP_DIRS.has(s) || BOLD_SKIP_SEG.has(s)))
  .filter((f) => !BOLD_FROZEN.has(f));

let mine = 0; let ref = 0; let bad = 0;
for (const rel of files) {
  const src = rev === null
    ? readFileSync(resolve(root, rel), 'utf8')
    : execFileSync('git', ['show', `${rev}:${rel}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  const a = boldCount(src);
  const b = refCount(src);
  mine += a; ref += b;
  if (a !== b) { bad += 1; console.log(`✗ ${rel}  扫描器=${a}  真解析器=${b}`); }
}
console.log(`加粗配对交叉验证（rev=${rev ?? '工作区'}）：${files.length} 份 .md`
  + ` · 扫描器 ${mine} / 真解析器 ${ref} · 不一致 ${bad} 处`);
process.exit(bad === 0 ? 0 : 1);
