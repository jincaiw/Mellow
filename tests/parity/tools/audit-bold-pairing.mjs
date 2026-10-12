#!/usr/bin/env node
/**
 * 加粗配对「**自包含扫描器 ↔ 真解析器**」交叉验证（**2026-10-12 起进 CI**，**不依赖 Typora**）。
 *
 * 【为什么需要它】`verify-doc-code-refs.mjs` 的判据 ㊵ 要判「文档里写的 `**` 渲染后是否仍是字面 `**`」。
 *   该判据**不能**依赖外部包：`parity-guard` 两个 CI job **有意不跑 `pnpm install`**
 *   （「护栏脚本只依赖 Node 内建模块，30s 内给结论」）—— 实测引入 `markdown-it` 会让那两个 job **直接红**。
 *   ⇒ 护栏自带一个**无依赖**的 CommonMark 行内扫描器（行内码 + flanking + 规则 9 + 配对栈）。
 *
 * ⚠️ **扫描面（`BOLD_FROZEN` / `BOLD_SKIP_SEG`）同样从护栏源码派生**（2026-10-12，审计 §4.332）：
 *   此前**只派生谓词、复制了面** ⇒ 护栏改面时会**静默地比另一个集合**（**假信心**）。
 *
 * ⚠️ **手写量具必须被交叉验证**，否则它自己就是下一个「静默失效」。本工具把真解析器
 *   （仓内 `packages/export` 已依赖的 `markdown-it`）当**参照物**，逐文件比对两者给出的
 *   「字面 `**` 个数」，并在**修复前后两个版本**上各跑一遍（修复前有 87 处真缺陷 ⇒ 检验「抓得住」；
 *   修复后应接近 0 ⇒ 检验「不误报」）。
 *
 * 【用法】`node tests/parity/tools/audit-bold-pairing.mjs [<git-rev>]`
 *   不带参数 = 比对**工作区**；带 rev = 比对该版本。
 *   ⚠️ 2026-10-11（审计 §4.293）：**rev 要写固定提交，不要写 `HEAD~1` 这类相对引用** ——
 *     它会**随提交漂移**（原注释就举了 `HEAD~1`，而它早已指向别的提交）。
 *   ⚠️ 该 rev 里**不存在**的文件（后来才加的）会**跳过并报出跳过数** ——
 *     首版直接 `execFileSync` ⇒ 对旧 rev **抛错崩掉**（实测 `3fdfe20^`）。
 *
 * 【退出码】`0` = 在本判据的扫描面上无差异；`1` = 有差异（打印文件与两侧计数）。
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.workbuddy-ai', 'archive', 'dist', 'target', 'CoreEditor']);

/** 判据 ㊵ 的护栏源码（**谓词与面都从这里派生**）。 */
const guardSrc = readFileSync(resolve(root, 'tests/parity/verify-doc-code-refs.mjs'), 'utf8');

// ⚠️ **扫描面必须从护栏源码**派生**（2026-10-12，审计 §4.332）**：
//   本工具此前**只派生谓词**（`scannerSrc`），而把**面**（`BOLD_FROZEN` / `BOLD_SKIP_SEG`）**复制**了一份
//   ⇒ 护栏改了面（增删冻结项 / 排除段）时，本工具会**静默地比另一个集合**
//   （**假信心**：「不一致 0 处」说的是**另一个集合**）。
//   ⚠️ **派生失败 ⇒ 响亮失败（exit 2）** —— 绝不用一个**猜出来的面**去比对。
const FACE = (() => {
  const i = guardSrc.indexOf('const BOLD_FROZEN = new Map([');
  const j = guardSrc.indexOf('const BOLD_SKIP_SEG = new Set([');
  if (i < 0 || j < 0 || j < i) return null;
  const frozen = [...guardSrc.slice(i, j).matchAll(/\['([^']+)'/g)].map((m) => m[1]);
  const skip = [...guardSrc.slice(j, guardSrc.indexOf('\n', j)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return { frozen, skip };
})();
if (FACE === null || FACE.frozen.length === 0 || FACE.skip.length === 0) {
  console.error('✗ 无法从 `tests/parity/verify-doc-code-refs.mjs` 派生扫描面'
    + '（`BOLD_FROZEN` / `BOLD_SKIP_SEG`）—— 本工具**拒绝**用一个**猜出来的面**去比对'
    + '（那会是**假信心**）。请检查护栏里那两个常量的写法（审计 §4.332）。');
  process.exit(2);
}
const BOLD_SKIP_SEG = new Set(FACE.skip);
const BOLD_FROZEN = new Set(FACE.frozen);

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

/** 被测物：护栏里的自包含扫描器（**谓词**同样从护栏源码派生 —— 见上）。 */
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

let mine = 0; let ref = 0; let bad = 0; let skipped = 0;
for (const rel of files) {
  let src;
  if (rev === null) {
    src = readFileSync(resolve(root, rel), 'utf8');
  } else {
    try {
      // ⚠️ **必须把 git 的 stderr 也吞掉**（`stdio` 第 3 位 = 'ignore'）——
      //   否则每跳过一个文件，终端就会多一行 `fatal: path … exists on disk, but not in '<rev>'`，
      //   看起来像工具坏了（实测）。
      src = execFileSync('git', ['show', `${rev}:${rel}`],
        { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      // ⚠️ 2026-10-11（审计 §4.293）：**该 rev 里不存在这个文件**（它是后来才加的）。
      //   首版直接 `execFileSync` ⇒ **抛错崩掉** ⇒ 实测对 `3fdfe20^` 这类旧 rev **完全不可用**
      //   （而 README 却写着「用法：`[<git-rev>]`」）⇒ 现**跳过并计数**，
      //   让读者知道「这次比较覆盖了多少份」—— 否则「跳过」会被读成「通过」。
      skipped += 1;
      continue;
    }
  }
  const a = boldCount(src);
  const b = refCount(src);
  mine += a; ref += b;
  if (a !== b) { bad += 1; console.log(`✗ ${rel}  扫描器=${a}  真解析器=${b}`); }
}
console.log(`加粗配对交叉验证（rev=${rev ?? '工作区'}）：面 = ${FACE.frozen.length} 个冻结项 + 跳过段 [${FACE.skip.join(',')}] · ${files.length - skipped} 份 .md`
  + (skipped > 0 ? `（**跳过 ${skipped} 份**：该 rev 里不存在）` : '')
  + ` · 扫描器 ${mine} / 真解析器 ${ref} · 不一致 ${bad} 处`);
process.exit(bad === 0 ? 0 : 1);
