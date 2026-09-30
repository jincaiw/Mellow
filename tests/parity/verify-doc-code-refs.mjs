/**
 * 文档代码引用护栏（2026-09-30）。
 *
 * 问题：权威文档（施工计划 / ADR / spec）里用「**`符号`（`文件:行号`）**」的形式
 * 指向代码，作为结论的依据。**行号会随重构漂移**，而「行号还在文件范围内」这件事
 * **掩盖了**漂移 —— 读者按图索骥会看到**无关代码**，进而可能得出「该结论无据」的错误判断。
 *
 * 实测三处（均在本轮修正）：
 *   - `insertLocalImage`（`App.tsx:1530-1536`）→ 该行现在是 `setCommandPaletteRecent(...)`，
 *     函数实际在 1721；
 *   - `image.uploadAll/downloadRemote/moveAll/copyAll`（`menuSchema.ts:328-333`）→ 实际在 365-370；
 *   - 非 macOS 页面设置的 `platformMac` 守卫（`window.rs:108-128`）→ 实际在 `App.tsx:4880-4883`
 *     （Rust 侧只有 `window.rs:134-153` 返回 `Err`）。
 *
 * 本护栏只认**紧邻形态**（符号紧跟括号内的路径:行号），避免把周围散文里的
 * 反引号符号误当成被引符号；并要求**符号出现在被引行范围（±2 行）内**。
 *
 * 为什么不做成「行号越界检查」：越界检查查不出这三处 —— 行号都还在范围内。
 * **行号有效 ≠ 引用有效。**
 *
 * ⚠️ **本护栏的范围限制（如实声明，不要当成「文档引用已全部核对」）**：
 * 只覆盖**紧邻形态**「`符号`（`文件:行号`）」；文档里其它写法
 * （如「见 `文件:行号` 的 `符号`」、散文里提到行号、表格里的裸行号）**不在覆盖内**。
 * 实测 41 份权威文档中仅 3 处属该形态 —— 覆盖率低是**形态罕见**，不是文档干净。
 * 另：同名文件不唯一时（如 `index.ts` 有 20 个）**无法判定**，会计入汇总里的
 * 「未判定」数（可见，不静默）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);

const SKIP_DIRS = new Set(['node_modules', '.git', '.workbuddy-ai', 'archive', 'dist', 'target', 'CoreEditor']);
const CODE_EXTS = ['ts', 'tsx', 'mjs', 'cjs', 'rs', 'css', 'json', 'yml', 'yaml'];
const CODE_EXT = `(?:${CODE_EXTS.join('|')})`;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ⚠️ 扩展名过滤必须显式列举，**不要**从正则字符串上 slice ——
// 实测踩到：`CODE_EXT.slice(4, -1)` 把 `(?:ts|…` 切成 `s|tsx|…`，
// 于是 **`.ts` 整类被静默漏掉**（`menuSchema.ts` 因此从未被判定，
// 而护栏输出看起来「全绿」）。这正是「解析器漏成员必须响亮失败」那条。
const codeFiles = walk(root).filter((f) => CODE_EXTS.includes(f.split('.').pop()));
const byBase = new Map();
for (const f of codeFiles) {
  const b = basename(f);
  byBase.set(b, byBase.has(b) ? null : f); // null = 同名不唯一，无法判定
}
function resolveTarget(file) {
  const direct = resolve(root, file);
  if (existsSync(direct)) return { path: direct };
  const byName = byBase.get(basename(file));
  if (byName === undefined) return { notFound: true };
  if (byName === null) return { ambiguous: true };
  return { path: byName };
}

/** 权威文档：施工计划 / ADR / specs —— 这里的引用会直接驱动施工与裁决 */
const DOC_GLOBS = ['docs/plans', 'docs/adr', 'docs/specs'];
const docs = DOC_GLOBS.flatMap((d) => walk(resolve(root, d)))
  .filter((f) => f.endsWith('.md'))
  .sort();

const PAIR = new RegExp(
  '`?([A-Za-z_$][\\w$]*(?:[./][\\w$]+)*)`?\\s*[（(]\\s*`?([\\w./@-]+\\.' + CODE_EXT + ')[:：](\\d+)(?:\\s*[-–]\\s*(\\d+))?`?\\s*[）)]',
  'g',
);

let judged = 0;
let ambiguous = 0;
for (const doc of docs) {
  const rel = relative(root, doc);
  const src = readFileSync(doc, 'utf8').replace(/\r\n/g, '\n');
  for (const m of src.matchAll(PAIR)) {
    const [, rawSymbol, file, fromStr, toStr] = m;
    // 反引号里可能是 `a/b/c` 这类并列写法 —— 拆开，任一命中即算对得上
    const tokens = rawSymbol.split(/[./]/).filter((t) => t.length >= 3);
    if (tokens.length === 0) continue; // 单/双字母噪声太大，不判定
    const target = resolveTarget(file);
    if (target.notFound) {
      fail(`${rel}：引用「${rawSymbol}」指向的文件在仓库内找不到：${file}`
        + '（文档写错，或护栏的扩展名/路径解析需更新 —— 不要静默跳过）');
      continue;
    }
    if (target.ambiguous) { ambiguous += 1; continue; } // 同名不唯一，无法判定（在汇总里可见）
    const lines = readFileSync(target.path, 'utf8').split('\n');
    const from = Number(fromStr);
    const to = toStr ? Number(toStr) : from;
    if (from > lines.length) {
      fail(`${rel}：引用 ${file}:${from} 越界（该文件共 ${lines.length} 行）`);
      continue;
    }
    const lo = Math.max(1, from - 2);
    const hi = Math.min(lines.length, to + 2);
    const windowText = lines.slice(lo - 1, hi).join('\n');
    judged += 1;
    const hit = tokens.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(windowText));
    if (!hit) {
      // 提示（**不改判定强度**）：本仓库的更正惯例是「只追加更正块」，而更正块**必然要引用
      // 旧的错误引用**（如「原写 `App.tsx:1721-1739`」）—— 那**看起来**正是本护栏要抓的形态。
      // 2026-09-30 实测：我自己的变更记录就是这么把 CI 打红的。此时正确的处置**不是改行号**，
      // 而是把符号与 `文件:行号` 改成**非紧邻**写法（中间加字），使它不匹配本护栏的形态。
      const docLineNo = src.slice(0, m.index).split('\n').length;
      const docLine = src.split('\n')[docLineNo - 1] ?? '';
      const looksLikeQuote = /原写|原文|更正|漂移|引用有误|写成|已改为|改为\*\*符号引用\*\*/.test(docLine);
      fail(
        `${rel}：引用「${rawSymbol}」（${file}:${from}${to !== from ? `-${to}` : ''}）`
        + ` 在被引行范围内找不到该符号（该行现为：${(lines[from - 1] ?? '').trim().slice(0, 60)}）`
        + ' —— 行号有效 ≠ 引用有效，请更正行号或符号名'
        + (looksLikeQuote
          ? '\n    ⚠️ 该行含「原写 / 更正 / 漂移」等标记 → 像是**在描述一次修正**（引用旧引用）。'
            + '此时请把「`符号`（`文件:行号`）」改成**非紧邻**写法（例：原写 `文件:行号`，中间加字），'
            + '使它不匹配本护栏的紧邻形态 —— **不要**去改行号（那个行号本来就该是错的）。'
          : ''),
      );
    }
  }
}

// ── canary：自检判据（样本拼接构造，避免护栏检出自己）──────────────────────
{
  const GOOD = '`insertLocalImage`（`App.tsx:1721-1739`）';
  const BAD = '`insertLocalImage`（`App.tsx:1530-1536`）';
  const parse = (s) => [...s.matchAll(PAIR)].map((x) => ({ sym: x[1], file: x[2], from: Number(x[3]) }));
  const good = parse(GOOD);
  const bad = parse(BAD);
  if (good.length !== 1 || good[0].sym !== 'insertLocalImage' || good[0].from !== 1721) {
    fail('文档代码引用护栏 canary 失效：正样本未被正确解析');
  }
  if (bad.length !== 1 || bad[0].from !== 1530) {
    fail('文档代码引用护栏 canary 失效：负样本未被正确解析');
  }
  // 判据本身必须能区分正/负（用真实文件内容验证一次）
  const appTarget = resolveTarget('apps/desktop/src/App.tsx');
  const appPath = appTarget.path ?? null;
  if (appPath === null) {
    fail('文档代码引用护栏 canary 失效：找不到 apps/desktop/src/App.tsx');
  } else {
    const appLines = readFileSync(appPath, 'utf8').split('\n');
    const inRange = (a, b) => appLines.slice(a - 1, b).join('\n').includes('insertLocalImage');
    // ⚠️ **不要在这里硬编码行号**：2026-09-30 实测 —— App.tsx 的一次正常改动把该符号
    // 从 1721 挪到 1743，本 canary 立刻**误报「判据失效」**（而判据其实好好的）。
    // 这恰是本护栏要防的那种脆弱性，不该出现在它自己的 canary 里。
    // 改为**从文件现算**：正样本 = 符号所在行附近；负样本 = 文件第 1 行（`/**`，恒不含该符号）。
    const symLine = appLines.findIndex((l) => l.includes('insertLocalImage')) + 1;
    if (symLine <= 0) {
      fail('文档代码引用护栏 canary 失效：真实文件中找不到 insertLocalImage（判据无从校验）');
    } else if (!inRange(symLine, symLine + 18) || inRange(1, 1)) {
      fail('文档代码引用护栏 canary 失效：正/负样本在真实文件中未呈现预期差异');
    }
  }
}

if (errors.length > 0) {
  console.error('Doc code-reference guard failed:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(
  `Doc code refs: ${judged} 处「符号（文件:行号）」引用全部仍指向该符号`
  + `（扫描 ${docs.length} 份权威文档；另有 ${ambiguous} 处因同名文件不唯一未判定；行号越界会单独报错）`,
);
