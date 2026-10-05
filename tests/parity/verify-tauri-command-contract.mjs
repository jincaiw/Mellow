/**
 * Tauri 命令契约护栏（Rust ↔ 前端 跨层，2026-10-06 审计 §4.96）
 *
 * 立此条的原因：本项目的「跨层字段必须两端同时锁」已覆盖三处（菜单 `dispatchCommand`、
 * 设置 `applyCommand`↔`applySetting`、文案 `t()`↔i18n），但**最硬的一层边界没有护栏** ——
 * 前端 `invoke('name')` ↔ Rust `#[tauri::command]` ↔ `generate_handler![…]` 注册表。
 * 三者任一错位都**不会在编译期报错**，只在**运行时 reject**：
 *   · 声明了但未注册 ⇒ 命令不可达（`invoke` 必失败）；
 *   · 前端在调未注册/已删除的命令 ⇒ 运行时 reject。
 *
 * ⚠️ **这类事故在本仓真实发生过**（不是假想）：`apps/desktop/src/App.tsx:4849` 的注释记录了
 * 旧机制 `invoke('set_spellcheck_state')`「**必然失败**」——该命令已被架构移除。
 * 当时是**靠人读代码**发现的；本护栏把这条边界变成机器判据。
 *
 * 判据（全部为「必须为空」）：
 *   ① D∖R —— 声明但未注册（命令不可达）；
 *   ② F∖R —— 前端在调未注册的命令（运行时 reject）；
 *   ③ R∖D —— 注册了但找不到声明（理论上编译期即报，留作扫描面自检）。
 * 另有扫描面下限（D/R/F 各自的下限）—— 防止「扫描面漂移 ⇒ 判据空转」。
 *
 * ⚠️ **口径**（每条都由一次「荒谬结果」暴露，详见审计 §4.96）：
 *   · 必须**排除成员调用**：`bridge.invoke({…})` / `imageHost.invoke(…)` 是 **bridge 协议 / host 对象**，
 *     不是 Tauri 命令 —— 不排除会把 bridge 的 `copyFile` / `writeBinary` 误报成「调用了未注册命令」；
 *     但 `window.__TAURI__.core.invoke('bridge_call', …)` 是**真** Tauri 调用，必须保留。
 *   · 泛型参数可能**嵌套**：`invoke<Array<{ path: string }>>('read_dir', …)` —— 用 `<[^>]*>` 会在
 *     第一个 `>` 处收尾 ⇒ 漏检 ⇒ 用 `<[^()]*>`（类型参数里不会出现 `(`）。
 *   · 包装器**不能自动发现**：按「函数体后 N 字符里出现 `invoke(`」判会命中 `fail` / `doc` / `onChange`
 *     等无关函数（实测 40 个）⇒ 用**显式清单** `INVOKE_WRAPPERS`，并**双向自检**（清单项必须真转发到 invoke）。
 *   · **必须先排除注释行**：`packages/editor-engine/src/image/host.ts` 的文档注释里有
 *     `invoke('fs', …)`，`App.tsx` 的注释里有 `invoke('set_spellcheck_state')` ——
 *     不排除会把「已经修好的问题」重新报成缺陷。
 *   · ⚠️ **不要用块注释正则剥注释**：以「斜杠星号 … 星号斜杠」为界的非贪婪匹配在 TSX 上不安全
 *     （JSX 的注释包裹写法、以及正则字面量里的斜杠星号，都会让匹配**跨越大段代码** ——
 *     实测 App.tsx 351734 → 297769 字符，把真实调用 `invoke('set_menu_spec', …)` 一起删掉）
 *     ⇒ 改用**按行前缀**判定（见 `inComment`）。
 *
 * 范围外（如实声明）：命令的**参数/返回类型**一致性不做静态校验（需 Rust 侧类型信息）；
 * 本护栏只锁**命令名**这一层的可达性。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);

const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');

// ── 显式包装器清单（转发到 Tauri invoke 的本地函数）─────────────────────────
// 只放**确证**转发到 invoke 的函数；双向自检见下（清单项必须真含非成员 invoke 调用）。
const INVOKE_WRAPPERS = ['callSpellcheck'];

// 扫描面下限（防止扫描面漂移 ⇒ 判据空转；2026-10-06 实测 D=R=59、F=58）
const MIN_DECLARED = 50;
const MIN_REGISTERED = 50;
const MIN_INVOKED = 45;

// ── 纯解析函数（同时供真实扫描与 canary 使用，避免 canary 另写一份正则）──

/** 该位置是否落在注释行上（按行前缀判定，不用块注释正则 —— 见文件头说明） */
function inComment(text, idx) {
  const lineStart = text.lastIndexOf('\n', idx - 1) + 1;
  const lineEnd = text.indexOf('\n', idx);
  const end = lineEnd === -1 ? text.length : lineEnd;
  const prefix = text.slice(lineStart, idx);
  const trimmed = text.slice(lineStart, end).trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  const ci = prefix.indexOf('//');
  return ci !== -1 && prefix[ci - 1] !== ':';
}

/** D：`#[tauri::command]` 声明的函数名 → { file?, line } */
export function parseDeclared(rsText, file = '') {
  const out = new Map();
  const lines = rsText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    if (!lines[i].includes('#[tauri::command]')) continue;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const m = lines[j].match(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/);
      if (m) { out.set(m[1], { file, line: j + 1 }); break; }
    }
  }
  return out;
}

/** R：`generate_handler![…]` 里注册的命令名（取 `::` 之后的末段）；找不到返回 null */
export function parseRegistered(libText) {
  const gh = libText.match(/generate_handler!\s*\[([\s\S]*?)\]/);
  if (!gh) return null;
  return gh[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('//'))
    .map((s) => s.split('::').pop());
}

/** F：前端 `invoke('name')` / `__TAURI__…invoke('name')` / 显式包装器调用的命令名 */
export function parseInvoked(text, wrappers = INVOKE_WRAPPERS) {
  const out = new Set();
  const patterns = [
    // 非成员 invoke（`bridge.invoke` / `imageHost.invoke` 排除在外）；泛型用 `<[^()]*>` 以容纳嵌套
    /(?<![.\w])invoke\s*(?:<[^()]*>)?\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g,
    // 真 Tauri 全局桥：`window.__TAURI__.core.invoke('bridge_call', …)`
    /__TAURI__[A-Za-z0-9_.]*?\binvoke\s*(?:<[^()]*>)?\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g,
  ];
  for (const w of wrappers) {
    patterns.push(new RegExp(
      `(?<![.\\w])${w}\\s*(?:<[^()]*>)?\\s*\\(\\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]`, 'g'));
  }
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      if (inComment(text, m.index)) continue;
      out.add(m[1]);
    }
  }
  return out;
}

// ── 真实扫描 ────────────────────────────────────────────────────────────────
const RUST_SRC = resolve(root, 'apps/desktop/src-tauri/src');
const RS_SKIP = new Set(['target', 'node_modules']);
function* walkRs(dir) {
  for (const e of readdirSync(dir)) {
    const full = resolve(dir, e);
    if (statSync(full).isDirectory()) { if (!RS_SKIP.has(e)) yield* walkRs(full); }
    else if (e.endsWith('.rs')) yield full;
  }
}

const declared = new Map();
for (const f of walkRs(RUST_SRC)) {
  const rel = relative(root, f).split('\\').join('/');
  for (const [name, meta] of parseDeclared(read(rel), rel)) declared.set(name, meta);
}

const libRs = read('apps/desktop/src-tauri/src/lib.rs');
const registeredList = parseRegistered(libRs);
if (registeredList === null) {
  fail('lib.rs 里找不到 `generate_handler![…]` —— 扫描口径失效，本护栏无法判定');
}

const FE_ROOTS = ['apps/desktop/src', 'apps/desktop/scripts', 'packages'];
const FE_SKIP_DIR = new Set(['node_modules', 'dist', 'target', '.git']);
const FE_SKIP_FILE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/;
function* walkFe(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const full = resolve(dir, e);
    if (statSync(full).isDirectory()) { if (!FE_SKIP_DIR.has(e)) yield* walkFe(full); }
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e) && !FE_SKIP_FILE.test(e)) yield full;
  }
}

const invoked = new Map(); // name -> Set<file>
for (const base of FE_ROOTS) {
  const abs = resolve(root, base);
  if (!existsSync(abs)) continue;
  for (const f of walkFe(abs)) {
    const rel = relative(root, f).split('\\').join('/');
    for (const name of parseInvoked(read(rel))) {
      if (!invoked.has(name)) invoked.set(name, new Set());
      invoked.get(name).add(rel);
    }
  }
}

const R = new Set(registeredList ?? []);
const D = new Set(declared.keys());
const F = new Set(invoked.keys());

// ── ① D∖R：声明了但未注册（命令不可达）────────────────────────────────────
for (const name of [...D].filter((x) => !R.has(x)).sort()) {
  const meta = declared.get(name);
  fail(`Rust 声明了 \`#[tauri::command]\` 但**未注册**进 generate_handler：${name}`
    + `（@ ${meta.file}:${meta.line}）—— 前端调用该命令必然失败`);
}

// ── ② F∖R：前端在调未注册的命令（运行时 reject）────────────────────────────
for (const name of [...F].filter((x) => !R.has(x)).sort()) {
  fail(`前端调用了**未注册**的 Tauri 命令：${name}`
    + `（← ${[...invoked.get(name)].sort().join(', ')}）—— 运行时 reject`);
}

// ── ③ R∖D：注册了但找不到声明 ─────────────────────────────────────────────
for (const name of [...R].filter((x) => !D.has(x)).sort()) {
  fail(`generate_handler 注册了找不到声明的命令：${name}（Rust 侧应编译期报错，请检查扫描面）`);
}

// ── 扫描面下限 ──────────────────────────────────────────────────────────────
if (D.size < MIN_DECLARED) fail(`只解析出 ${D.size} 个 #[tauri::command]（下限 ${MIN_DECLARED}）—— 扫描面漂移会让本护栏空转`);
if (R.size < MIN_REGISTERED) fail(`只解析出 ${R.size} 个注册命令（下限 ${MIN_REGISTERED}）—— 扫描面漂移会让本护栏空转`);
if (F.size < MIN_INVOKED) fail(`只解析出 ${F.size} 个前端 invoke 命令（下限 ${MIN_INVOKED}）—— 扫描面漂移会让本护栏空转`);

// ── ④ R∖F：注册了但前端**一个字面量调用都没有** ⇒ 必须显式登记理由 ────────────
// 立此条的原因：它同时是**扫描面收窄的 canary** ——
// 若前端解析器悄悄漏掉一类调用（例如去掉 `__TAURI__.core.invoke` 这条形态，
// 则 `bridge_call` 会从 F 里消失），R∖F 立刻非空 ⇒ 护栏变红，
// 而**单靠 F 的下限（≥45）抓不到**这种「少了一类形态」的漂移。
// 2026-10-06 实测 R∖F = ∅ ⇒ 下表**刻意为空**；将来若真有「注册但前端不调用」的命令，
// 必须在此登记**逐字写明**是「有意为之」还是「待裁决」，不得静默通过。
const R_NOT_FRONTEND_INVOKED = new Map([]);
for (const name of [...R].filter((x) => !F.has(x)).sort()) {
  if (!R_NOT_FRONTEND_INVOKED.has(name)) {
    fail(`命令已注册但前端**没有任何字面量调用**：${name}`
      + ' —— 要么是死注册，要么是前端调用形态没被本护栏解析（扫描面缺口）。'
      + '若确属有意（如仅由 Rust 内部或动态派发调用），请登记进 R_NOT_FRONTEND_INVOKED 并写明理由');
  }
}
for (const [name, reason] of R_NOT_FRONTEND_INVOKED) {
  if (!R.has(name)) {
    fail(`R_NOT_FRONTEND_INVOKED 登记了 ${name}，但该命令未注册 —— 请删除该例外条目`);
  } else if (F.has(name)) {
    fail(`R_NOT_FRONTEND_INVOKED 登记了 ${name}，但前端**确实在调用它** —— 请删除该例外条目`);
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    fail(`R_NOT_FRONTEND_INVOKED 的 ${name} 缺理由`);
  }
}

// ── 包装器清单双向自检（防化石 / 防清单里混进不转发 invoke 的函数）──────────
{
  const allFe = [...walkFe(resolve(root, 'apps/desktop/src'))]
    .map((f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).join('\n');
  for (const w of INVOKE_WRAPPERS) {
    const defRe = new RegExp(`(?:function\\s+${w}\\b)|(?:(?:const|let|var)\\s+${w}\\s*=)`);
    if (!defRe.test(allFe)) {
      fail(`INVOKE_WRAPPERS 里的 ${w} 找不到定义 —— 清单已过期（化石），请更新或删除该条目`);
      continue;
    }
    const at = allFe.search(defRe);
    const body = allFe.slice(at, at + 1500);
    if (!/(?<![.\w])invoke\s*(?:<[^()]*>)?\s*\(/.test(body)) {
      fail(`INVOKE_WRAPPERS 里的 ${w} 并未转发到非成员 invoke( —— 该条目不应存在`);
    }
  }
}

// ── canary：三向（正样本 / 负样本-缺条 / 负样本-放宽）+ 共用同一解析函数 ──────
// 判据用**同一个** parseDeclared / parseRegistered / parseInvoked，
// 不另写一份正则（另写一份 ⇒ 放宽谓词时 canary 仍用旧的那份 ⇒ 什么都不报）。
{
  const rsPos = '#[tauri::command]\npub async fn alpha_cmd(app: AppHandle) -> Result<(), String> { Ok(()) }\n';
  const libPos = 'tauri::generate_handler![\n  alpha_cmd,\n]\n';
  const tsPos = "await invoke<Array<{ a: string }>>('alpha_cmd', { x });\n";
  const Dp = parseDeclared(rsPos);
  const Rp = parseRegistered(libPos);
  const Fp = parseInvoked(tsPos);
  if (!Dp.has('alpha_cmd')) errors.push('canary 失效：正样本 #[tauri::command] 未被解析');
  if (!(Rp ?? []).includes('alpha_cmd')) errors.push('canary 失效：正样本 generate_handler 未被解析');
  if (!Fp.has('alpha_cmd')) errors.push('canary 失效：正样本 invoke（含嵌套泛型）未被解析');

  // 负样本-缺条：声明了但没注册 ⇒ D∖R 必须非空
  const rsNeg = '#[tauri::command]\npub fn beta_cmd() {}\n';
  const Dn = parseDeclared(rsNeg);
  const dNotR = [...Dn.keys()].filter((x) => !new Set(Rp ?? []).has(x));
  if (dNotR.length !== 1 || dNotR[0] !== 'beta_cmd') {
    errors.push('canary 失效：负样本「声明未注册」未被判定为 D∖R');
  }

  // 负样本-放宽：调一个不存在的命令 ⇒ F∖R 必须非空
  const Fn = parseInvoked("await invoke('ghost_cmd');\n");
  const fNotR = [...Fn].filter((x) => !new Set(Rp ?? []).has(x));
  if (fNotR.length !== 1 || fNotR[0] !== 'ghost_cmd') {
    errors.push('canary 失效：负样本「调用未注册命令」未被判定为 F∖R');
  }

  // 负样本-注释：注释里的 invoke 必须**不**被算作调用（否则会把已修好的问题报成缺陷）
  if (parseInvoked("// invoke('ghost_cmd')\n * invoke('ghost_cmd')\n").size !== 0) {
    errors.push('canary 失效：注释行里的 invoke 被误算为真实调用');
  }
  // 负样本-成员调用：bridge.invoke / imageHost.invoke 是 bridge 协议，**不**是 Tauri 命令
  if (parseInvoked("bridge.invoke('copyFile', { x });\nimageHost.invoke('writeBinary');\n").size !== 0) {
    errors.push('canary 失效：成员调用（bridge.invoke / imageHost.invoke）被误算为 Tauri 命令');
  }
  // 正样本-成员调用：真 Tauri 全局桥必须被认出来
  if (!parseInvoked("window.__TAURI__.core.invoke('bridge_call', { message });\n").has('bridge_call')) {
    errors.push('canary 失效：__TAURI__.core.invoke 未被认作 Tauri 调用');
  }
  // 包装器：显式清单里的名字必须被当作 invoke 同义词
  if (!parseInvoked("await callSpellcheck<boolean>('spellcheck_available');\n").has('spellcheck_available')) {
    errors.push('canary 失效：包装器清单未生效（callSpellcheck 的参数未被算作命令）');
  }
  // 找不到 generate_handler 必须返回 null（而不是空数组 ⇒ 静默把 R 变空 ⇒ 全部误报）
  if (parseRegistered('pub fn run() {}\n') !== null) {
    errors.push('canary 失效：缺少 generate_handler 时 parseRegistered 未返回 null');
  }
}

if (errors.length > 0) {
  throw new Error(`Tauri command contract violations:\n  ${errors.join('\n  ')}`);
}

console.log(`Tauri command contract: 声明 D=${D.size} / 注册 R=${R.size} / 前端调用 F=${F.size}；`
  + 'D∖R = ∅（无不可达命令）、F∖R = ∅（无调用不存在命令）、R∖D = ∅、R∖F = ∅（无死注册）；'
  + `包装器清单 ${INVOKE_WRAPPERS.length} 项已双向自检；canary 10 项`
  + '（含注释行 / 成员调用 bridge.invoke / __TAURI__ 全局桥 / 嵌套泛型 / 包装器 / 缺 generate_handler）全绿。');
