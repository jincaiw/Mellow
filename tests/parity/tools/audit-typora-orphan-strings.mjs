#!/usr/bin/env node
/**
 * 审计工具（**需本机 Typora ⇒ 不进 CI**）：找出 Typora **自己的残留文案**
 * ——「locale 里有翻译、但代码里没人引用」的字符串。
 *
 * 【为什么需要】（2026-10-06 实测，审计 §4.117）
 * 方案里曾记着「❌ 仍未实现：`插入文件夹链接`（P2）」—— 而实测：
 *   · `Panel.strings` / `locales/*.lproj/Panel.json` **有** `Insert Folder Link = 插入文件夹链接` ✓；
 *   · 但行为真值源 `TypeMark/appsrc/main.js` 与其余资源里 `insertFolderLink` / `folderLink`
 *     **全部 0 命中** ⇒ 它是 **Typora 自身的残留文案**，**不是它的功能**。
 * ⇒ 若不查这一步，就会把 **Typora 的残留文案**当成 **Mellow 的 parity 缺口**，
 *   去实现一个**连 Typora 都没有**的功能（引入**新的、无依据的**差异）。
 *
 * 【用法】
 *   # ① **决定性用法**：查一个具体字符串「Typora 到底有没有在用它」
 *   node tests/parity/tools/audit-typora-orphan-strings.mjs --check "Insert Folder Link"
 *   # ② 列出全部孤立串（**线索清单**，需人工分诊 —— 含原生侧假阳性）
 *   node tests/parity/tools/audit-typora-orphan-strings.mjs --list
 *   # ③ 过滤清单
 *   node tests/parity/tools/audit-typora-orphan-strings.mjs --list --grep Folder
 *
 * 【判据】某字符串「孤立」= 它出现在 **locale 资源**里，但**不出现在任何代码资源**
 *   （`TypeMark/**`，排除 `locales/`）。
 *
 * ⚠️ **范围限制（如实声明，勿当成「Typora 没有这个功能」的证明）**
 *   1. 只做**子串匹配** ⇒ 代码里**动态拼接**的文案会被误判为孤立；
 *   2. 只看**英文原文**（locale JSON 的键）⇒ 其他语言的键可能不同；
 *   3. 不含原生侧（`*.nib` / Swift 二进制）的引用 ⇒ **原生实现的功能会被误判为孤立**。
 *   ⇒ 结论是**线索**（「值得回查」），不是判决。判定「Typora 有没有 X」必须**再查行为真值源**。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const TYPORA = argOf('--typora', '/Applications/Typora.app');
const FILTER = argOf('--grep', null);
const RES = join(TYPORA, 'Contents/Resources');
const LOCALES = join(RES, 'TypeMark/locales');

if (!existsSync(LOCALES)) {
  console.error(`找不到 Typora 的 locale 资源：${LOCALES}\n（本工具需本机安装 Typora；用 --typora <路径> 指定）`);
  process.exit(2);
}

/** 递归收集文件 */
function walk(dir, out = []) {
  let es;
  try { es = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    if (e.isDirectory()) walk(join(dir, e.name), out);
    else out.push(join(dir, e.name));
  }
  return out;
}

// ── ① 代码面索引：**整个 `TypeMark/`（排除 `locales/`）** ──
// ⚠️ 首版只扫 `appsrc` + `page-dist` ⇒ 把 `TypeMark/index.html` 里的文案全判成「孤立」
//    （实测 279/1014 = 27% 的假阳性 —— 「Close sidebar」「Refresh Folder」都在 index.html 里）。
//    ⇒ 扫描面必须覆盖**整个应用资源树**，只排除 `locales/`。
const TM_ROOT = join(RES, 'TypeMark');
const codeFiles = [];
for (const f of walk(TM_ROOT)) {
  if (f.includes('/locales/')) continue;
  if (/\.(js|mjs|json|html|htm|css)$/.test(f)) codeFiles.push(f);
}
if (codeFiles.length === 0) {
  console.error(`代码面一个文件都没找到（扫了 ${TM_ROOT}，排除 locales/）—— 路径布局可能变了，请同步更新本工具`);
  process.exit(2);
}
const CODE = codeFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
console.log(`代码面：${codeFiles.length} 个文件（${relative(TYPORA, TM_ROOT)}/**，排除 locales/），共 ${CODE.length} 字符`);

// ── ② 文案面：取 **en**（或 Base）作为「英文原文」的来源 ──
const EN_DIR = existsSync(join(LOCALES, 'en.lproj')) ? join(LOCALES, 'en.lproj')
  : existsSync(join(LOCALES, 'en-US.lproj')) ? join(LOCALES, 'en-US.lproj')
    : existsSync(join(LOCALES, 'Base.lproj')) ? join(LOCALES, 'Base.lproj')
      : null;
if (EN_DIR === null) {
  console.error(`找不到英文 locale 目录（在 ${LOCALES} 下找 en.lproj / en-US.lproj / Base.lproj）`);
  process.exit(2);
}
const localeFiles = walk(EN_DIR).filter((f) => f.endsWith('.json'));
if (localeFiles.length === 0) {
  console.error(`${EN_DIR} 下没有 .json —— 布局可能变了`);
  process.exit(2);
}

let total = 0;
const orphans = [];
for (const f of localeFiles) {
  let obj;
  try { obj = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  for (const key of Object.keys(obj)) {
    total += 1;
    if (FILTER !== null && !key.includes(FILTER)) continue;
    if (!CODE.includes(key)) orphans.push({ key, file: relative(LOCALES, f) });
  }
}

// ── ③ `--check "<string>"`：**决定性用法** —— 该串在 locale / 代码 里各出现在哪 ──
const CHECK = argOf('--check', null);
if (CHECK !== null) {
  const localeHits = localeFiles.filter((f) => {
    try { return Object.prototype.hasOwnProperty.call(JSON.parse(readFileSync(f, 'utf8')), CHECK); } catch { return false; }
  });
  const codeHits = codeFiles.filter((f) => readFileSync(f, 'utf8').includes(CHECK));
  console.log(`\n=== --check ${JSON.stringify(CHECK)} ===`);
  console.log(`  文案面命中：${localeHits.length} 个文件${localeHits.length ? ' → ' + localeHits.map((f) => relative(LOCALES, f)).slice(0, 3).join(', ') : ''}`);
  console.log(`  代码面命中：${codeHits.length} 个文件${codeHits.length ? ' → ' + codeHits.map((f) => relative(TYPORA, f)).slice(0, 3).join(', ') : ''}`);
  if (localeHits.length === 0) {
    console.log('  ⇒ **文案面都没有** —— 该串不是 Typora 的文案（可能拼写不同，或来自别处）。');
  } else if (codeHits.length === 0) {
    console.log('  ⇒ ⚠️ **文案有、代码无** ⇒ 高度疑似 **Typora 自身的残留文案**（不是它的功能）。');
    console.log('     但**别据此下判决**：先按文件头的范围限制排除「动态拼接 / 原生侧」。');
  } else {
    console.log('  ⇒ ✅ **代码面有引用** ⇒ 该功能在 Typora 里是**真的**（可继续按 parity 处理）。');
  }
  process.exit(0);
}

console.log(`文案面：${localeFiles.length} 个 JSON，共 **${total}** 条英文原文`);
console.log(`\n=== ⚠️ 「locale 有、代码里没人引用」的字符串：**${orphans.length}** 条 ===`);
for (const o of orphans.slice(0, 60)) console.log(`  ${o.key.slice(0, 100)}`);
if (orphans.length > 60) console.log(`  …（另有 ${orphans.length - 60} 条）`);

console.log('\n⚠️ 这是**线索**不是判决（见文件头的范围限制：动态拼接 / 原生侧会被误判）。');
console.log('   任何「Typora 有 X」的 parity 断言，都必须**再查行为真值源**后才能成立。');
process.exit(0);
