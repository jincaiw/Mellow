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
/**
 * canary 计数 —— **从代码派生，不手写**（2026-10-09，审计 §4.172）。
 * ⚠️ 立此条的原因：收口行原**手写**「canary 29 项」。同型先在 `verify-package-conventions.mjs`
 * 上被修过一次（手写「5 项」而实际 4 条），并在 `verify-tauri-capability-contract.mjs` 上
 * 实测到**已经漂了 1**（手写 13 而实际 12）⇒ **手写的计数必然漂移**，且此前**没有系统化**。
 * ⇒ 每条 canary 断言都经本函数上报，收口行打印 `canaryCount`。
 */
let canaryCount = 0;
const canary = (ok, message) => { canaryCount += 1; if (!ok) errors.push(message); };

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

// ── 实参字段契约（2026-10-06 审计 §4.101）────────────────────────────────────
// 【为什么补】上面只锁了**命令名**；命令**内部**的字段名同样是一条跨层契约，
// 而它此前**没有任何判据**（同 §4.97/§4.98 的「只锁了一半」）。
//
// 【Tauri 的真实规则（读宏源码确定，不要凭印象）】
//   `tauri-macros/src/command/wrapper.rs`：`WrapperAttributes` 的默认值是
//   **`argument_case: ArgumentCase::Camel`**（:51），且 `key = key.to_lower_camel_case()`（:505-507）。
//   即 **实参键 = `to_lower_camel_case(形参标识符)`**。
//   ⚠️ 因为用的是 `heck` 的 lowerCamelCase，**下划线切出的空段会被丢掉** ——
//   `_search_id` → `searchId`（**不是** `_searchId`）。曾据此差点误判一个不存在的缺陷。
//
// 【为什么危险】缺键时：**目标类型不是 `Option` 才报错**（`tauri/src/ipc/command.rs:110-112`）。
//   ⇒ 对 `Option<T>` 形参，**键名写错 = 静默取 `None`**，没有任何报错。
//   实测即抓到：`save_document(default_name: Option<String>)` 而前端传 `default_name`
//   ⇒ 键应为 `defaultName` ⇒ **「另存为」永远建议 `untitled.md`**，而不是按 Typora parity
//   从文档首行/首个标题推导（v1.5.31 修复）。
/** Tauri 的实参键变换：形参标识符 → lowerCamelCase（下划线空段丢弃） */
export function toArgKey(param) {
  return param.split('_').filter(Boolean)
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');
}

/** Rust 侧：命令 → 形参（名 → 是否 `Option`）；注入型参数（State/AppHandle/窗口）不计 */
export function parseCommandParams(rsText) {
  const out = new Map();
  const lines = rsText.split('\n');
  const INJECTED_NAME = new Set(['app', 'app_handle', 'window', 'webview_window', 'webview', 'state']);
  const INJECTED_TYPE = /\b(State|AppHandle|WebviewWindow|Window|Webview|Channel|Resource)\b/;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    if (!lines[i].includes('#[tauri::command]')) continue;
    let name = null, start = -1;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const m = lines[j].match(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (m) { name = m[1]; start = j; break; }
    }
    if (!name) continue;
    // 只取括号**内部**（首版把 `pub fn name` 也吞进来 ⇒ 第一个形参永远解析不到）
    let depth = 0, text = '', done = false, started = false;
    for (let j = start; j < lines.length && !done; j++) {
      for (const ch of lines[j]) {
        if (!started) { if (ch === '(') { started = true; depth = 1; } continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) { done = true; break; } }
        text += ch;
      }
      if (!done) text += '\n';
    }
    // 顶层逗号切分（对 `<>` `()` `[]` 深度感知 —— 泛型里的逗号不算分隔符）
    const segs = [];
    { let d2 = 0, cur = '';
      for (const ch of text) {
        if ('<(['.includes(ch)) d2++;
        else if ('>)]'.includes(ch)) d2--;
        if (ch === ',' && d2 === 0) { segs.push(cur); cur = ''; continue; }
        cur += ch;
      }
      if (cur.trim()) segs.push(cur);
    }
    const params = new Map();
    for (const seg of segs) {
      const m = seg.match(/^\s*(?:mut\s+)?([a-z_][a-z0-9_]*)\s*:\s*([\s\S]+)$/);
      if (!m) continue;
      const pname = m[1];
      if (INJECTED_NAME.has(pname.replace(/^_/, ''))) continue;
      if (INJECTED_TYPE.test(m[2])) continue;
      params.set(pname, { optional: /Option\s*</.test(m[2]) });
    }
    out.set(name, params);
  }
  return out;
}

/** 前端侧：`invoke('cmd', { … })` 的**顶层**字段名（支持简写属性；跳过 spread） */
export function parseInvokeArgs(text) {
  const out = [];
  const RE = /(?<![.\w])invoke\s*(?:<[^()]*>)?\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*,\s*\{/g;
  for (const m of text.matchAll(RE)) {
    if (inComment(text, m.index)) continue;
    let depth = 0, obj = '';
    for (let k = m.index + m[0].length - 1; k < text.length; k++) {
      const ch = text[k];
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      obj += ch;
      if (depth === 0) break;
    }
    // ⚠️ 必须先丢掉**整行注释** —— 实测踩过：给某个键上方加了一段注释后，
    //    该键与注释落在同一个「顶层逗号段」里，键名正则匹配不到 ⇒ **该键根本没被提取**
    //    ⇒ 判据对这个键是空的（注入验证当场暴露：把键改回 snake_case 竟然不报）。
    obj = obj.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
    const segs = [];
    let d = 0, cur = '';
    for (let k = 1; k < obj.length - 1; k++) {
      const ch = obj[k];
      if ('{(['.includes(ch)) d++;
      else if ('})]'.includes(ch)) d--;
      if (ch === ',' && d === 0) { segs.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) segs.push(cur);
    const keys = [];
    for (const seg of segs) {
      const s = seg.trim();
      if (!s || s.startsWith('...')) continue; // spread：静态判不了，跳过
      const kv = s.match(/^([A-Za-z_$][\w$]*)\s*:/);
      const sh = s.match(/^([A-Za-z_$][\w$]*)$/);
      if (kv) keys.push(kv[1]); else if (sh) keys.push(sh[1]);
    }
    out.push({ cmd: m[1], keys });
  }
  return out;
}

// ── 事件名契约（2026-10-06 审计 §4.104）──────────────────────────────────────
// 【为什么补】命令名（①–⑤）与实参字段（⑤）都锁了，**事件名**同样是一条 Rust↔JS 边界：
// Rust `emit`/`emit_to` 与前端 `listen` 若只在一端改名 ⇒ **静默死通道**
// （前端一直等一个永不发生的事件，或 Rust 发的事件无人接收）。
//
// 【口径坑（本次实测踩到）】`emit_to` 的**第一个实参是窗口 label，可能是字符串字面量**：
//   `app.emit_to("main", "mellow://open-file", req)` ——
// 首版用「抓调用里第一个字符串」⇒ 把 **label `main` 当成事件名**，并**漏掉真正的事件**
// ⇒ 误报「前端在听但 Rust 不 emit: mellow://open-file」。
// ⇒ 必须**按参数位**取：`.emit(ev, payload)` 取 args[0]；`.emit_to(label, ev, payload)` 取 args[1]。
/** Rust 侧：`.emit(...)` / `.emit_to(...)` 的**事件名**（按参数位；label 可为字面量或标识符） */
export function parseEmittedEvents(rsText) {
  const out = new Set();
  for (const m of rsText.matchAll(/\.emit(_to)?\s*\(/g)) {
    // 平衡扫描取实参文本
    let depth = 0, text = '', started = false;
    for (let i = m.index + m[0].length - 1; i < rsText.length; i++) {
      const c = rsText[i];
      if (!started) { if (c === '(') { started = true; depth = 1; } continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) break; }
      text += c;
    }
    // 顶层逗号切分
    const args = [];
    let d = 0, cur = '';
    for (const c of text) {
      if ('([{'.includes(c)) d++;
      else if ('})]'.includes(c)) d--;
      if (c === ',' && d === 0) { args.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) args.push(cur.trim());
    const ev = m[1] === '_to' ? args[1] : args[0];
    const lit = ev === undefined ? null : /^"([^"]+)"$/.exec(ev);
    if (lit) out.add(lit[1]);
  }
  return out;
}

/** 前端侧：`listen('<name>')` 的事件名 */
export function parseListenedEvents(tsText) {
  const out = new Set();
  for (const m of tsText.matchAll(/(?<![.\w])listen\s*(?:<[^()]*>)?\s*\(\s*['"]([^'"]+)['"]/g)) {
    if (inComment(tsText, m.index)) continue;
    out.add(m[1]);
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

// ── ⑤ 实参字段契约：前端 `invoke(cmd, {…})` 的键 ↔ Rust 形参（按 Tauri 的真实键变换）──
// 判据：**键必须等于 `toArgKey(形参)`**；必填形参（非 `Option`）必须被传。
const ARG_FIELD_EXEMPT = new Map([]); // 刻意为空（现状 0 不匹配）；新增缺口须登记理由

const cmdParams = new Map();
for (const f of walkRs(RUST_SRC)) {
  for (const [cmd, params] of parseCommandParams(read(relative(root, f).split('\\').join('/')))) {
    cmdParams.set(cmd, params);
  }
}
if (cmdParams.size < MIN_DECLARED) {
  fail(`只解析出 ${cmdParams.size} 个命令的形参（下限 ${MIN_DECLARED}）—— 扫描面漂移会让本判据空转`);
}
const argCalls = [];
for (const f of walkFe(resolve(root, 'apps/desktop/src'))) {
  const rel = relative(root, f).split('\\').join('/');
  for (const c of parseInvokeArgs(read(rel))) argCalls.push({ ...c, file: rel });
}
for (const f of walkFe(resolve(root, 'apps/desktop/scripts'))) {
  const rel = relative(root, f).split('\\').join('/');
  for (const c of parseInvokeArgs(read(rel))) argCalls.push({ ...c, file: rel });
}
if (argCalls.length < 30) {
  fail(`只解析出 ${argCalls.length} 处带参 invoke（下限 30）—— 扫描面漂移会让本判据空转`);
}
for (const c of argCalls) {
  const params = cmdParams.get(c.cmd);
  if (params === undefined) continue; // 命令名本身由 ② 负责
  const byKey = new Map([...params.keys()].map((p) => [toArgKey(p), p]));
  const unknown = c.keys.filter((k) => !byKey.has(k));
  const missing = [...params.entries()].filter(([p, v]) => !v.optional && !c.keys.includes(toArgKey(p)))
    .map(([p]) => p);
  for (const bad of [...unknown.map((k) => `key:${k}`), ...missing.map((p) => `param:${p}`)]) {
    if (ARG_FIELD_EXEMPT.has(`${c.cmd}.${bad}`)) continue;
    if (bad.startsWith('key:')) {
      fail(`${c.cmd}（← ${c.file}）前端传了 Rust **没有**的实参键 \`${bad.slice(4)}\``
        + `（Rust 形参：${[...params.keys()].join(', ') || '(无)'}；Tauri 期望的键：`
        + `${[...byKey.keys()].join(', ') || '(无)'}）—— 键名不匹配时 **Option 形参会静默取 None**`
        + '（`tauri/src/ipc/command.rs`：只有非 optional 才报错）');
    } else {
      fail(`${c.cmd}（← ${c.file}）前端**未传** Rust 必填形参 \`${bad.slice(6)}\``
        + `（期望的键：\`${toArgKey(bad.slice(6))}\`）`);
    }
  }
}
for (const [key, reason] of ARG_FIELD_EXEMPT) {
  if (typeof reason !== 'string' || reason.trim() === '') fail(`ARG_FIELD_EXEMPT 的 ${key} 缺理由`);
  const [cmd, spec] = key.split('.');
  const params = cmdParams.get(cmd);
  if (params === undefined) { fail(`ARG_FIELD_EXEMPT 登记了不存在的命令：${cmd}`); continue; }
  const stillBad = spec.startsWith('key:')
    ? argCalls.some((c) => c.cmd === cmd && c.keys.includes(spec.slice(4)))
    : argCalls.some((c) => c.cmd === cmd && !c.keys.includes(toArgKey(spec.slice(6))));
  if (!stillBad) fail(`ARG_FIELD_EXEMPT 登记了 ${key}，但该缺口已不存在 —— 请删除该例外条目`);
}

// ── ⑤b 承载**用户设置**的 `Option<T>` 形参：必须在**每一处调用**都传 ──────────────
// 【为什么单独立一条】⑤ 只保证两件事：① 传了的键名与 `toArgKey(形参)` 一致；
//   ② **必填**形参被传了。而 `Option<T>` **不传是合法的** —— Tauri 只在「非 optional」才报错
//   （`tauri/src/ipc/command.rs:110-112`）⇒ 漏传一处**静默取 `None`**，没有任何信号。
//   当这个 `Option` 承载的是**用户设置**时，「不传」≠「用默认值」，而是
//   **「忽略用户刚设的值」**：设置页里改得好好的，实际被丢掉，且不报错。
// 【实测（审计 §4.127）】`export.pandocPath` 经 3 个命令 × 6 处调用传下去；
//   漏掉任意一处 ⇒ 用户填的 pandoc 绝对路径**在该入口被静默忽略**，
//   而其余入口仍正常 ⇒ 表现为「有时生效有时不生效」，是最难查的一类。
// 【扫描面】与 ⑤ 一致（`apps/desktop/src` + `apps/desktop/scripts`）。
//   实测 2026-10-07：`packages/` 下**真实 invoke 0 处**（仅有 2 处文档注释里的示例文本，
//   已被 `inComment()` 排除）⇒ 该目录暂不在扫描面内不影响本判据；若将来把 invoke 下移到包内，
//   需同时扩 ⑤ 与 ⑤b（否则两处一起变空）。
const OPTION_ARG_REQUIRED_AT_CALLSITE = new Map([
  ['pandoc_available.pandoc_path', '承载设置 `export.pandocPath`（审计 §4.127）：漏传 ⇒ 用户填的路径被静默忽略'],
  ['pandoc_export.pandoc_path', '同上（导出入口）'],
  ['pandoc_import.pandoc_path', '同上（导入入口）'],
  // 2026-10-07（审计 §4.132）：`default_dir` 承载「Typora `exportFolder` 的 **Auto** 语义 = 当前文件所在目录」。
  // 漏传 ⇒ 该入口的保存对话框退回**系统默认目录**（Typora 用户会在别处找导出件）—— 静默、且只在真机上看得出来。
  ['pick_save_path.default_dir', '承载「导出默认目录」（Typora `exportFolder` 的 Auto 语义）：漏传 ⇒ 该入口退回系统默认目录'],
]);
const ARG_SCAN_DIRS = ['apps/desktop/src', 'apps/desktop/scripts'];

for (const [key, reason] of OPTION_ARG_REQUIRED_AT_CALLSITE) {
  const dot = key.indexOf('.');
  const cmd = key.slice(0, dot);
  const param = key.slice(dot + 1);
  if (typeof reason !== 'string' || reason.trim() === '') {
    fail(`OPTION_ARG_REQUIRED_AT_CALLSITE 的 ${key} 缺理由`);
    continue;
  }
  const params = cmdParams.get(cmd);
  if (params === undefined) {
    fail(`OPTION_ARG_REQUIRED_AT_CALLSITE 登记了不存在的命令：${cmd}`);
    continue;
  }
  if (!params.has(param)) {
    fail(`OPTION_ARG_REQUIRED_AT_CALLSITE 的 ${key}：${cmd} 没有形参 \`${param}\` —— 登记已过期`);
    continue;
  }
  if (!params.get(param).optional) {
    fail(`OPTION_ARG_REQUIRED_AT_CALLSITE 的 ${key}：\`${param}\` **不是 \`Option\`**`
      + ' —— 那已被 ⑤ 的必填判据覆盖，不该登记在这里（登记了会让人以为 ⑤ 不管它）');
    continue;
  }
  const keyName = toArgKey(param);
  const calls = argCalls.filter((c) => c.cmd === cmd);
  if (calls.length === 0) {
    fail(`OPTION_ARG_REQUIRED_AT_CALLSITE 的 ${key}：${cmd} **没有任何带实参调用** —— 判据空转`);
    continue;
  }
  for (const c of calls) {
    if (c.keys.includes(keyName)) continue;
    fail(`${cmd}（← ${c.file}）**未传** \`${keyName}\`：该形参是 \`Option\`（漏传不报错），`
      + `但承载用户设置 —— 不传 = **静默忽略用户设置**。理由：${reason}`);
  }
  // 空转补充：若某处把**整个实参对象**都去掉了，⑤/⑤b 都看不到它（它不在 argCalls 里）
  //   ⇒ 另用一条**窄**正则（只锚定本表里的命令）确认「该命令的每次 invoke 都带实参对象」。
  //   ⚠️ 这不是「另写一份 ⑤ 的谓词」：⑤ 判的是**键名与必填**，这里判的是**有没有实参对象**。
  const bareRe = new RegExp(`(?<![.\\w])invoke\\s*(?:<[^()]*>)?\\s*\\(\\s*['"]${cmd}['"]\\s*\\)`, 'g');
  for (const dir of ARG_SCAN_DIRS) {
    for (const f of walkFe(resolve(root, dir))) {
      const rel = relative(root, f).split('\\').join('/');
      const src = read(rel);
      for (const m of src.matchAll(bareRe)) {
        if (inComment(src, m.index)) continue;
        fail(`${cmd}（← ${rel}:${src.slice(0, m.index).split('\n').length}）以**无实参**形式调用 —— `
          + `\`${keyName}\` 必然缺失。${reason}`);
      }
    }
  }
}
// canary：三向（正样本命中真实表 / 负样本-放宽能被 ⑤ 的解析器看见 / 空表）
{
  const probe = parseCommandParams(
    '#[tauri::command]\npub fn zeta_cmd(a: String, b: Option<String>) -> R { x }\n',
  ).get('zeta_cmd');
  canary(Boolean(probe) && probe.get('b')?.optional === true && probe.get('a')?.optional === false,
    '⑤b canary 失效：`Option<T>` 形参未被判为 optional —— 整条判据会失去靶子');
  // 负样本-放宽：`Option` 参数**漏传**必须能被本判据的谓词识别
  const sample = parseInvokeArgs("await invoke('zeta_cmd', { a });\n")[0];
  canary(Boolean(sample) && sample.cmd === 'zeta_cmd' && !sample.keys.includes('b'),
    '⑤b canary 失效：漏传 `b` 的调用样本未被解析成「缺 b」');
  canary(OPTION_ARG_REQUIRED_AT_CALLSITE.size > 0,
    '⑤b canary 失效：登记表为空 —— 判据会空转');
  // 负样本-空表方向：表里每一项都必须能在真实 `cmdParams` 里找到，否则登记是化石
  // ⚠️ 用**集合式**断言（而不是在循环里逐条 push）：让「canary 计数」保持**稳定**
  //    —— 逐条计数会让收口行的数字随登记表大小变化，失去「护栏健康度」的读数价值。
  const fossils = [...OPTION_ARG_REQUIRED_AT_CALLSITE.keys()].filter((k) => {
    const [c, p] = [k.slice(0, k.indexOf('.')), k.slice(k.indexOf('.') + 1)];
    return !cmdParams.get(c)?.has(p);
  });
  canary(fossils.length === 0, `⑤b canary 失效：登记项 ${fossils.join(', ')} 在真实 Rust 形参里找不到（化石条目）`);
}

// ── ⑥ 事件名契约：Rust emit ⇄ 前端 listen（双向）──────────────────────────────
const EVENT_EXEMPT = new Map([]); // 刻意为空（现状 7:7 双向一致）

const emittedEvents = new Set();
for (const f of walkRs(RUST_SRC)) {
  for (const e of parseEmittedEvents(read(relative(root, f).split('\\').join('/')))) emittedEvents.add(e);
}
const listenedEvents = new Set();
for (const f of walkFe(resolve(root, 'apps/desktop/src'))) {
  const rel = relative(root, f).split('\\').join('/');
  for (const e of parseListenedEvents(read(rel))) listenedEvents.add(e);
}
if (emittedEvents.size < 5 || listenedEvents.size < 5) {
  fail(`事件扫描面过窄（Rust emit=${emittedEvents.size} / 前端 listen=${listenedEvents.size}，下限各 5）`
    + ' —— 扫描面漂移会让本判据空转');
}
for (const e of [...listenedEvents].filter((x) => !emittedEvents.has(x)).sort()) {
  if (EVENT_EXEMPT.has(`listen:${e}`)) continue;
  fail(`前端在 \`listen('${e}')\`，但 Rust **从不 emit 该事件** —— 静默死通道`
    + '（前端会一直等一个永不发生的事件）。请改一端，或登记进 EVENT_EXEMPT');
}
for (const e of [...emittedEvents].filter((x) => !listenedEvents.has(x)).sort()) {
  if (EVENT_EXEMPT.has(`emit:${e}`)) continue;
  fail(`Rust emit 了 \`${e}\`，但前端**从不 listen** —— 事件无人接收`
    + '（除非由插件/原生侧消费）。请改一端，或登记进 EVENT_EXEMPT');
}
for (const [key, reason] of EVENT_EXEMPT) {
  if (typeof reason !== 'string' || reason.trim() === '') fail(`EVENT_EXEMPT 的 ${key} 缺理由`);
  const idx = key.indexOf(':');
  const kind = key.slice(0, idx);
  const ev = key.slice(idx + 1);
  if (kind !== 'listen' && kind !== 'emit') {
    fail(`EVENT_EXEMPT 的 ${key} 前缀非法（只允许 \`listen:\` / \`emit:\`）`);
    continue;
  }
  // ⚠️ 双向：缺口必须**仍然存在**。首版只查了「后半条件」⇒ `emit:不存在的键` 被误判为「仍在」
  //    （实测：注入 `emit:ghost.event` 时护栏仍绿）。两个条件都要查。
  const still = kind === 'listen'
    ? (listenedEvents.has(ev) && !emittedEvents.has(ev))   // 前端在听、Rust 不 emit
    : (emittedEvents.has(ev) && !listenedEvents.has(ev));  // Rust emit、前端不听
  if (!still) fail(`EVENT_EXEMPT 登记了 ${key}，但该缺口已不存在 —— 请删除该例外条目`);
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
  canary(Dp.has('alpha_cmd'), 'canary 失效：正样本 #[tauri::command] 未被解析');
  canary((Rp ?? []).includes('alpha_cmd'), 'canary 失效：正样本 generate_handler 未被解析');
  canary(Fp.has('alpha_cmd'), 'canary 失效：正样本 invoke（含嵌套泛型）未被解析');

  // 负样本-缺条：声明了但没注册 ⇒ D∖R 必须非空
  const rsNeg = '#[tauri::command]\npub fn beta_cmd() {}\n';
  const Dn = parseDeclared(rsNeg);
  const dNotR = [...Dn.keys()].filter((x) => !new Set(Rp ?? []).has(x));
  canary(dNotR.length === 1 && dNotR[0] === 'beta_cmd',
    'canary 失效：负样本「声明未注册」未被判定为 D∖R');

  // 负样本-放宽：调一个不存在的命令 ⇒ F∖R 必须非空
  const Fn = parseInvoked("await invoke('ghost_cmd');\n");
  const fNotR = [...Fn].filter((x) => !new Set(Rp ?? []).has(x));
  canary(fNotR.length === 1 && fNotR[0] === 'ghost_cmd',
    'canary 失效：负样本「调用未注册命令」未被判定为 F∖R');

  // 负样本-注释：注释里的 invoke 必须**不**被算作调用（否则会把已修好的问题报成缺陷）
  canary(parseInvoked("// invoke('ghost_cmd')\n * invoke('ghost_cmd')\n").size === 0,
    'canary 失效：注释行里的 invoke 被误算为真实调用');
  // 负样本-成员调用：bridge.invoke / imageHost.invoke 是 bridge 协议，**不**是 Tauri 命令
  canary(parseInvoked("bridge.invoke('copyFile', { x });\nimageHost.invoke('writeBinary');\n").size === 0,
    'canary 失效：成员调用（bridge.invoke / imageHost.invoke）被误算为 Tauri 命令');
  // 正样本-成员调用：真 Tauri 全局桥必须被认出来
  canary(parseInvoked("window.__TAURI__.core.invoke('bridge_call', { message });\n").has('bridge_call'),
    'canary 失效：__TAURI__.core.invoke 未被认作 Tauri 调用');
  // 包装器：显式清单里的名字必须被当作 invoke 同义词
  canary(parseInvoked("await callSpellcheck<boolean>('spellcheck_available');\n").has('spellcheck_available'),
    'canary 失效：包装器清单未生效（callSpellcheck 的参数未被算作命令）');
  // 找不到 generate_handler 必须返回 null（而不是空数组 ⇒ 静默把 R 变空 ⇒ 全部误报）
  canary(parseRegistered('pub fn run() {}\n') === null,
    'canary 失效：缺少 generate_handler 时 parseRegistered 未返回 null');
  // ── 实参字段契约（⑤）的 canary：**用合成夹具**（不绑现实数据）──
  const eq = (got, want, what) => canary(got === want,
    `实参键 canary 失效：${what} 期望 ${JSON.stringify(want)}、实得 ${JSON.stringify(got)}`);
  eq(toArgKey('path'), 'path', 'toArgKey(path)');
  eq(toArgKey('default_name'), 'defaultName', 'toArgKey(default_name)');
  // ⚠️ 这条是「防我自己的假阳性」：heck 的 lowerCamelCase 会丢掉下划线空段
  eq(toArgKey('_search_id'), 'searchId', 'toArgKey(_search_id)（前导下划线必须被丢掉）');
  eq(toArgKey('target_path'), 'targetPath', 'toArgKey(target_path)');

  const rsSample = '#[tauri::command]\n'
    + 'pub async fn f(a: String, b: Option<String>, state: tauri::State<X>, window: tauri::WebviewWindow) -> R {\n';
  const p = parseCommandParams(rsSample).get('f');
  canary(Boolean(p) && p.size === 2 && p.get('a') && p.get('a').optional === false && p.get('b').optional === true,
    `canary 失效：parseCommandParams 结果不对（得到 ${JSON.stringify(p && [...p])}）`);
  // 负样本-放宽：注入型参数（State / WebviewWindow）不得被算作实参
  canary(!(p && (p.has('state') || p.has('window'))), 'canary 失效：注入型参数被算作实参');
  // 首版踩过：不剥 `pub fn f` 前缀 ⇒ 第一个形参永远解析不到
  canary(Boolean(p) && p.has('a'), 'canary 失效：第一个形参未被解析（形参文本必须只取括号内部）');

  const keys1 = parseInvokeArgs("await invoke('f', { a, b: 1, c: x.y });\n")[0]?.keys;
  eq((keys1 ?? []).join(','), 'a,b,c', 'parseInvokeArgs 简写 + 具名键');
  const keys2 = parseInvokeArgs("await invoke('f', { ...rest, a });\n")[0]?.keys;
  eq((keys2 ?? []).join(','), 'a', 'parseInvokeArgs 必须跳过 spread');
  // 负样本-放宽：大小写必须敏感（`A` 不是 `a`）
  const keys3 = parseInvokeArgs("await invoke('f', { A });\n")[0]?.keys;
  eq((keys3 ?? []).join(','), 'A', 'parseInvokeArgs 大小写敏感');

  // ── 事件名（⑥）的 canary：**含我踩过的那个口径坑** ──
  const ev1 = parseEmittedEvents('let _ = app.emit("a://x", p);\n');
  eq([...ev1].join(','), 'a://x', 'parseEmittedEvents(.emit)');
  // ⚠️ 这条是「防我自己的假阳性」：`emit_to` 的第一个实参是 **label**（可能是字符串字面量），
  //    不得被当成事件名；真正的事件在第二个位置。
  const ev2 = parseEmittedEvents('let _ = app.emit_to("main", "a://y", req);\n');
  eq([...ev2].join(','), 'a://y', 'parseEmittedEvents(.emit_to) 必须取第二个实参（label 可能是字面量）');
  const ev3 = parseEmittedEvents('let _ = app_handle.emit_to(&label, "a://z", ());\n');
  eq([...ev3].join(','), 'a://z', 'parseEmittedEvents(.emit_to) 标识符 label 也要跳过');
  // 负样本-放宽：只 emit 不 listen / 只 listen 不 emit 必须能被判出（用合成集合直接验谓词）
  const A = new Set(['only.emit']); const B = new Set(['only.listen']);
  canary([...B].filter((x) => !A.has(x)).length === 1, '事件契约 canary 失效：只 listen 不 emit 未被判出');
  canary([...A].filter((x) => !B.has(x)).length === 1, '事件契约 canary 失效：只 emit 不 listen 未被判出');
  const ev4 = parseListenedEvents("import('@tauri-apps/api/event').then(({ listen }) => listen('a://q', () => {}));\n");
  eq([...ev4].join(','), 'a://q', 'parseListenedEvents');
  // 注释里的 listen 不得被算作监听
  eq([...parseListenedEvents("// listen('a://ghost', () => {})\n")].join(','), '', 'parseListenedEvents 必须跳过注释行');
}

if (errors.length > 0) {
  throw new Error(`Tauri command contract violations:\n  ${errors.join('\n  ')}`);
}

console.log(`Tauri command contract: 声明 D=${D.size} / 注册 R=${R.size} / 前端调用 F=${F.size}；`
  + 'D∖R = ∅（无不可达命令）、F∖R = ∅（无调用不存在命令）、R∖D = ∅、R∖F = ∅（无死注册）；'
  + `**实参字段契约**：${argCalls.length} 处带参 invoke 全部与 Rust 形参匹配`
  + `（按 Tauri 的真实键变换 to_lower_camel_case；例外表 ${ARG_FIELD_EXEMPT.size} 项，刻意为空）；`
  + `**事件名契约**：Rust emit ${emittedEvents.size} 个 ⇄ 前端 listen ${listenedEvents.size} 个，双向一致`
  + `（例外表 ${EVENT_EXEMPT.size} 项，刻意为空）；`
  + `包装器清单 ${INVOKE_WRAPPERS.length} 项已双向自检；canary ${canaryCount} 项`
  + '（含注释行 / 成员调用 bridge.invoke / __TAURI__ 全局桥 / 嵌套泛型 / 包装器 / 缺 generate_handler /'
  + ' 实参键变换含前导下划线 / 注入型参数 / spread / 大小写敏感 / emit_to 的 label 位置 / 事件双向）全绿。');
