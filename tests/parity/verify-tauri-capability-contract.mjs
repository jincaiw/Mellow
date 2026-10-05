/**
 * Tauri capability 契约护栏（capability 权限表 ↔ 前端实际调用的 API，2026-10-06 审计 §4.97）
 *
 * 立此条的原因：`capabilities/default.json` 是**手工列举**的权限白名单，而
 * **没有任何东西保证它覆盖了前端实际调用的 API**。漏授一个权限 = 该 API 在真机上
 * **运行时被拒**（Tauri 2 ACL），而前端普遍写成 `void win?.setTitle(...)`（fire-and-forget）
 * ⇒ **静默失败**：既无报错弹窗、也无日志、测试也看不见（浏览器 dev 走 mock，不走 ACL）。
 *
 * ⚠️ **实测（2026-10-06）—— 4 个写操作未授权**：
 *   | 前端调用 | 需要的权限 | capability 里 | 后果 |
 *   |---|---|---|---|
 *   | `win.setTitle()`（App.tsx ×3：标题栏脏标记 `●` / 字数） | `core:window:allow-set-title` | ❌ 缺 | 窗口标题永不更新 |
 *   | `win.setSize()`（App.tsx 窗口尺寸恢复 + windowService） | `core:window:allow-set-size` | ❌ 缺 | 窗口尺寸不恢复 |
 *   | `win.setPosition()`（App.tsx 窗口位置恢复） | `core:window:allow-set-position` | ❌ 缺 | 窗口位置不恢复 |
 *   | `win.setAlwaysOnTop()`（菜单「保持窗口在最前端」） | `core:window:allow-set-always-on-top` | ❌ 缺 | 菜单项点了没反应 |
 *
 * **旁证（说明这份清单是「人工列举且不完整」）**：清单**授了** `allow-set-fullscreen`，
 * 却漏了上面 4 个写操作 ⇒ 不是「刻意最小化」，而是**列举时没想到**。
 * 而 `docs/security/security-review-2026-08-13.md` 只按**面**审过
 * （「权限面窄：core:default + window + dialog + opener ✅」），**从未与实际调用对账**。
 *
 * ⚠️ **证据等级（如实声明）**：本节的判定是**静态**的 ——
 * 「所需权限未在 capability 中授予」+「调用点可达」。
 * **未在真机观察过失败**（本环境无法运行 Tauri 应用、无法做真机 UX Gate）。
 * 按 Tauri 2 ACL 语义，未授予 = 拒绝；但**未验证**修复后行为正确。
 * ⇒ 因此本护栏**只登记、不擅自放宽 capability**（放宽安全面属策略决定，需裁决）。
 *
 * 判据：
 *   ① `gen/schemas/capabilities.json` 必须与 `capabilities/*.json` **一致**
 *      （防「改了源却没重新生成」—— 否则本护栏读的是过期快照，判据失真）；
 *   ② 前端调用的每个 Tauri window API，其所需权限必须**已授予**，否则必须进
 *      `CAPABILITY_GAP_EXEMPT`（带理由 + 「待裁决」标注）；
 *   ③ 例外表**双向**：一旦授权，登记项必须删除；
 *   ④ 扫描面下限 + canary 三向。
 *
 * 覆盖边界（如实声明）：只覆盖 **`core:window`** 的 API（本仓 `@tauri-apps/api/window` 的全部用法）；
 * `dialog` / `opener` / `updater` / `process` / `fs` 走 `default` 集，未逐 API 展开；
 * 自定义 `#[tauri::command]` 不受 ACL 约束（见 security-review M3）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);

const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');

const CAP_DIR = 'apps/desktop/src-tauri/capabilities';
const MANIFEST = 'apps/desktop/src-tauri/gen/schemas/acl-manifests.json';
const RESOLVED = 'apps/desktop/src-tauri/gen/schemas/capabilities.json';

// ── 已知缺口（**待裁决**，不是「已评估通过」）─────────────────────────────────
// 理由必须逐字写明是「有意为之」还是「待裁决」—— 否则例外表会被读成「已通过」。
const CAPABILITY_GAP_EXEMPT = new Map([
  ['core:window:allow-set-title',
    '⚠️ **已知缺口，待裁决**：`win.setTitle()` 被 App.tsx 三处调用（标题栏脏标记 / 字数），'
    + '未授权 ⇒ 按 ACL 语义窗口标题不会更新。**未在真机验证**。'
    + '放宽 capability 安全面属策略决定 ⇒ 本轮只登记，不改权限表'],
  ['core:window:allow-set-size',
    '⚠️ **已知缺口，待裁决**：`win.setSize()` 用于窗口尺寸恢复，未授权 ⇒ 尺寸不恢复。**未在真机验证**'],
  ['core:window:allow-set-position',
    '⚠️ **已知缺口，待裁决**：`win.setPosition()` 用于窗口位置恢复，未授权 ⇒ 位置不恢复。**未在真机验证**'],
  ['core:window:allow-set-always-on-top',
    '⚠️ **已知缺口，待裁决**：菜单「保持窗口在最前端」调 `setAlwaysOnTop()`，未授权 ⇒ 该菜单项无效。'
    + '**未在真机验证**'],
]);

// 扫描面下限（防扫描面漂移 ⇒ 判据空转）
const MIN_WINDOW_APIS = 10;
const MIN_GRANTED_PERMS = 30;

// ── 读 capability 源（多个 *.json 合并）──────────────────────────────────────
const capDirAbs = resolve(root, CAP_DIR);
if (!existsSync(capDirAbs)) {
  fail(`找不到 ${CAP_DIR} —— 扫描口径失效，本护栏无法判定`);
}
const capFiles = existsSync(capDirAbs)
  ? readdirSync(capDirAbs).filter((f) => f.endsWith('.json')).sort()
  : [];
const declaredPerms = new Set();
for (const f of capFiles) {
  let j;
  try { j = JSON.parse(read(`${CAP_DIR}/${f}`)); }
  catch (e) { fail(`${CAP_DIR}/${f} 不是合法 JSON：${e.message}`); continue; }
  for (const p of j.permissions ?? []) declaredPerms.add(p);
}
if (capFiles.length === 0) fail(`${CAP_DIR} 下没有任何 *.json capability 文件`);

// ── 用 acl-manifests 展开权限集 → 有效权限 ───────────────────────────────────
if (!existsSync(resolve(root, MANIFEST))) {
  fail(`找不到 ${MANIFEST}（Tauri 生成的 ACL 清单，已入库）—— 本护栏无法展开权限集`);
}
let manifest = null;
try { manifest = JSON.parse(read(MANIFEST)); }
catch (e) { fail(`${MANIFEST} 解析失败：${e.message}`); }

/** 展开：`core:window:default` → 其 permissions 列表（并嵌套展开 `core:default`） */
function expandPerms(set) {
  const out = new Set();
  const visit = (id) => {
    if (out.has(id)) return;
    out.add(id);
    // 形态：`core:<plugin>:default`（manifest 的键就是 `core:<plugin>`）或 `core:default`（键是 `core`）
    const m = /^core(?::([a-z-]+))?:default$/.exec(id);
    if (!m) return;
    const key = m[1] ? `core:${m[1]}` : 'core';
    const def = manifest?.[key]?.default_permission;
    if (!def) return;
    for (const p of def.permissions ?? []) visit(p.startsWith('core:') ? p : `core:${m[1] ?? ''}:${p}`);
  };
  for (const p of set) visit(p);
  return out;
}
const granted = expandPerms(declaredPerms);

// ── ① 生成的 ACL 快照必须与 capability 源一致 ────────────────────────────────
if (existsSync(resolve(root, RESOLVED))) {
  let resolved = null;
  try { resolved = JSON.parse(read(RESOLVED)); }
  catch (e) { fail(`${RESOLVED} 解析失败：${e.message}`); }
  if (resolved !== null) {
    const snap = new Set();
    for (const cap of Object.values(resolved)) for (const p of cap.permissions ?? []) snap.add(p);
    const missingInSnap = [...declaredPerms].filter((p) => !snap.has(p)).sort();
    const extraInSnap = [...snap].filter((p) => !declaredPerms.has(p)).sort();
    if (missingInSnap.length > 0 || extraInSnap.length > 0) {
      fail(`${RESOLVED} 与 ${CAP_DIR}/*.json **不一致**（源有快照无：${missingInSnap.join(', ') || '无'}；`
        + `快照有源无：${extraInSnap.join(', ') || '无'}）—— 本护栏读的是生成快照，`
        + '改了 capability 源却没重新生成会让判据失真');
    }
  }
} else {
  fail(`找不到 ${RESOLVED} —— 无法核对生成快照与 capability 源是否一致`);
}

// ── ② 扫前端调用的 window API，映射到所需权限 ────────────────────────────────
const windowPerms = manifest?.['core:window']?.permissions ?? {};
/** 命令名（snake_case）→ 权限标识符 */
const cmdToPerm = new Map();
for (const [permId, meta] of Object.entries(windowPerms)) {
  for (const cmd of meta.commands?.allow ?? []) cmdToPerm.set(cmd, `core:window:${permId}`);
}
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const FE_FILES = ['apps/desktop/src/App.tsx', 'apps/desktop/src/host/windowService.ts'];
const feTexts = new Map();
for (const f of FE_FILES) {
  if (!existsSync(resolve(root, f))) { fail(`扫描面里的 ${f} 不存在 —— 请同步更新本护栏`); continue; }
  feTexts.set(f, read(f));
}

// ⚠️ 不能「凡是 `标识符.方法(` 都算」—— 实测会把**编辑器 host** 的方法误报成 Tauri 命令：
//    `host.setTheme(...)` / `host.destroy()`（`host` 是 editor-core 的宿主适配器）。
// ⇒ 先从 `getCurrentWindow()` **派生接收者**：窗口提供者（含包装它的本地函数）→ 绑定名。
const providers = new Set(['getCurrentWindow']);
for (const [, text] of feTexts) {
  const defRe = /(?:function\s+([A-Za-z_$][\w$]*))|(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\())/g;
  for (const d of text.matchAll(defRe)) {
    const name = d[1] ?? d[2];
    if (!name) continue;
    if (/\bgetCurrentWindow\b/.test(text.slice(d.index, d.index + 800))) providers.add(name);
  }
}
const receivers = new Set();
const recvRe = new RegExp(
  `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?(?:${[...providers].join('|')})\\s*\\(`, 'g');
for (const [, text] of feTexts) for (const m of text.matchAll(recvRe)) receivers.add(m[1]);
if (receivers.size === 0) {
  fail('未能从 `getCurrentWindow()` 派生出任何窗口接收者变量 —— 扫描口径失效，本护栏会空转');
}

const usedApis = new Map(); // method -> Set<file>
const recvUseRe = receivers.size > 0
  ? new RegExp(`(?<![.\\w])(?:${[...receivers].join('|')})\\s*\\??\\.\\s*([a-z][A-Za-z0-9]*)\\s*\\(`, 'g')
  : null;
for (const [f, text] of feTexts) {
  if (recvUseRe === null) break;
  for (const m of text.matchAll(recvUseRe)) {
    const method = m[1];
    if (!cmdToPerm.has(snake(method))) continue;
    if (!usedApis.has(method)) usedApis.set(method, new Set());
    usedApis.get(method).add(f);
  }
}
if (usedApis.size < MIN_WINDOW_APIS) {
  fail(`只解析出 ${usedApis.size} 个 window API 调用（下限 ${MIN_WINDOW_APIS}）—— 扫描面漂移会让本护栏空转`);
}
if (granted.size < MIN_GRANTED_PERMS) {
  fail(`展开后只有 ${granted.size} 个有效权限（下限 ${MIN_GRANTED_PERMS}）—— 权限集展开可能失效`);
}

const neededPerms = new Map(); // perm -> Set<method>
for (const [method, files] of usedApis) {
  const perm = cmdToPerm.get(snake(method));
  if (!neededPerms.has(perm)) neededPerms.set(perm, new Set());
  neededPerms.get(perm).add(`${method} (${[...files].sort().join(', ')})`);
}
const missing = [...neededPerms.keys()].filter((p) => !granted.has(p)).sort();
for (const p of missing) {
  if (!CAPABILITY_GAP_EXEMPT.has(p)) {
    fail(`前端调用的 API 所需权限**未授予**且未登记：${p}`
      + `（← ${[...neededPerms.get(p)].join('；')}）—— 按 Tauri ACL 语义该调用会被拒；`
      + '请补进 capabilities/*.json，或登记进 CAPABILITY_GAP_EXEMPT（带理由）');
  }
}
// ── ③ 例外表双向：一旦授权就必须删掉登记 ────────────────────────────────────
for (const [perm, reason] of CAPABILITY_GAP_EXEMPT) {
  if (granted.has(perm)) {
    fail(`CAPABILITY_GAP_EXEMPT 登记了 ${perm}，但它**已授予** —— 请删除该例外条目`);
  } else if (!neededPerms.has(perm)) {
    fail(`CAPABILITY_GAP_EXEMPT 登记了 ${perm}，但**前端并没有用到需要它的 API** —— 请删除该例外条目`);
  }
  if (typeof reason !== 'string' || reason.trim() === '') fail(`CAPABILITY_GAP_EXEMPT 的 ${perm} 缺理由`);
}

// ── ④ canary：三向 + 共用同一展开/映射逻辑 ─────────────────────────────────
{
  // 正样本：`core:window:default` 必须被展开出 `allow-is-maximized`（default 集里的成员）
  if (!expandPerms(new Set(['core:window:default'])).has('core:window:allow-is-maximized')) {
    errors.push('canary 失效：core:window:default 未被展开（展开逻辑坏了 ⇒ 会把已授予的判成未授予）');
  }
  // 正样本：`core:default` 必须能**嵌套**展开出 window 的 default（否则漏判一大片）
  if (!expandPerms(new Set(['core:default'])).has('core:window:allow-inner-size')) {
    errors.push('canary 失效：core:default 未嵌套展开 core:window:default');
  }
  // 正样本：命令名 → 权限的映射必须成立
  if (cmdToPerm.get('set_title') !== 'core:window:allow-set-title') {
    errors.push('canary 失效：set_title → 权限的映射不正确');
  }
  // 负样本-缺条：写操作**不在** default 里（这是本护栏能成立的前提）
  if (expandPerms(new Set(['core:window:default'])).has('core:window:allow-set-title')) {
    errors.push('canary 失效：allow-set-title 竟然在 default 集里 —— 本护栏的前提（写操作需显式授权）不成立，'
      + '必须重新核实判定');
  }
  // 负样本-放宽：一个**不存在**的权限不得被判为已授予
  if (expandPerms(new Set(['core:window:default'])).has('core:window:allow-__ghost__')) {
    errors.push('canary 失效：不存在的权限被判为已授予（谓词过宽）');
  }
  // camelCase → snake_case 映射
  if (snake('setAlwaysOnTop') !== 'set_always_on_top') {
    errors.push('canary 失效：camelCase → snake_case 映射不正确');
  }
}

if (errors.length > 0) {
  throw new Error(`Tauri capability contract violations:\n  ${errors.join('\n  ')}`);
}

const gapList = [...CAPABILITY_GAP_EXEMPT.keys()].sort();
console.log(`Tauri capability contract: 声明权限 ${declaredPerms.size} 项 → 展开 ${granted.size} 项；`
  + `前端用到 window API ${usedApis.size} 个 / 需要权限 ${neededPerms.size} 个；`
  + `生成快照与源一致 ✅；**未授予且已登记 ${gapList.length} 项**（待裁决）：${gapList.join(', ')}；`
  + 'canary 6 项全绿。');
