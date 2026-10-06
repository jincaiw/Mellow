/**
 * 命令 id 引用完整性护栏（2026-10-06，审计 §4.111）
 *
 * 【为什么需要】`dispatch('<id>')` 在 id **不存在**时**不抛错** ——
 * 它返回 `false` 并在状态栏显示「命令不可用」（`msg.commandUnavailable`）。
 * ⇒ 任何调用方（尤其 **e2e**）会**静默地什么都没做**，而 **e2e 不进 CI ⇒ 无人发现**。
 *
 * 【实测】`tests/e2e/ux-flows-verify.mjs` 里的 `view.sidebar.close` —— **全仓没有该命令**
 * （注册表只有 `view.sidebar.toggle` / `fileTree` / `fileList` / `outline`）⇒ 一处真实的**静默腐化**。
 *
 * 【判据】全仓 `dispatch('<字面量>')` 的 id 必须属于（App 命令定义 ∪ `menuSchema` 的 id）。
 *   · id 集合**故意取宽**（两个文件里所有 `id: '...'`）—— 本判据只需保证「不误报」；
 *     收窄集合会制造假阳性，而假阳性会诱使后来者**加例外表**（那正是护栏退化的入口）。
 *   · 变量 / 模板参数**不判**（静态不可解析 ⇒ 判了就是假阳性）。
 *   · 下限：id 集合 ≥ 200、`dispatch` 调用 ≥ 15 ——
 *     ⚠️ 首版把本判据塞进 `verify-menu-contract.mjs` 时，它在那条护栏的**mutation 沙箱副本**里
 *     扫到 0 处（沙箱不含 `tests/e2e`）⇒ 触发下限 ⇒ **自检失败**。
 *     ⇒ 本判据是**另一份契约**（跨仓的命令 id 引用），故**独立成护栏**，不放进会被沙箱变异的文件。
 *
 * 【范围限制（如实声明）】
 *   · 只覆盖**字面量** `dispatch('<id>')`；`dispatch(变量)` / 模板插值不在覆盖内；
 *   · 不检查「命令是否存在**执行分支**」（那是 `verify-menu-contract.mjs` 的 D/R/F 判据）。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);
// Windows CI 以 CRLF 检出源码：不归一化会让下方锚点断言全部失配（假绿）。
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');

const APP = 'apps/desktop/src/App.tsx';
const SCHEMA = 'packages/commands/src/menuSchema.ts';

/** 已知命令 id 的集合（**故意取宽**：两个文件里所有 `id: '...'`） */
export function knownCommandIdsOf(appSrc, schemaSrc) {
  return new Set([
    ...[...appSrc.matchAll(/\{\s*\n?\s*id:\s*'([^']+)'/g)].map((m) => m[1]),
    ...[...schemaSrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]),
  ]);
}

/** 源码里 `dispatch('<字面量>')` 的 id（变量 / 模板参数**不返回**） */
export function dispatchedIdsOf(src) {
  return [...src.matchAll(/\.dispatch\s*\(\s*'([^']+)'/g)].map((m) => m[1]);
}

// 例外表：刻意为空（修完 §4.111 后 0 处失效）。新增缺口须登记理由。
const DISPATCH_EXEMPT = new Set([]);

const KNOWN = knownCommandIdsOf(read(APP), read(SCHEMA));
if (KNOWN.size < 200) {
  fail(`命令 id 集合只解析出 ${KNOWN.size} 个（下限 200）—— 扫描面漂移会让本护栏空转`);
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', '.git', '.workbuddy-ai', 'CoreEditor', 'public']);
const walk = (dir, out = []) => {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

const SCAN_BASES = ['apps/desktop/src', 'packages', 'tests/e2e', 'tests/parity'];
const SELF = 'tests/parity/verify-command-id-refs.mjs';
let calls = 0;
const dead = [];
for (const base of SCAN_BASES) {
  for (const f of walk(resolve(root, base))) {
    if (!/\.(mjs|ts|tsx)$/.test(f)) continue;
    const rel = relative(root, f).split('\\').join('/');
    if (rel === SELF) continue; // 护栏自身（其 canary 夹具里就有字面量）不算
    for (const id of dispatchedIdsOf(read(rel))) {
      calls += 1;
      if (!KNOWN.has(id) && !DISPATCH_EXEMPT.has(id)) dead.push(`${rel} → ${id}`);
    }
  }
}
if (calls < 15) {
  fail(`只扫到 ${calls} 处 \`dispatch('字面量')\`（下限 15）—— 扫描面漂移会让本护栏空转`
    + '（⚠️ 首版把本判据放进 verify-menu-contract.mjs 时，就是被这条下限抓住的：'
    + '它的 mutation 沙箱副本里 `tests/e2e` 不存在 ⇒ 扫到 0 处）');
}
if (dead.length > 0) {
  fail(`dispatch 了**不存在**的命令 id：${dead.join('; ')} —— `
    + '`dispatch` 对未知 id **不抛错**（返回 false + 状态栏提示「命令不可用」）'
    + '⇒ 调用方会「什么都没做却继续跑」，而 e2e 不进 CI ⇒ **静默腐化**。'
    + '请改用真实存在的命令 id，或在 DISPATCH_EXEMPT 登记理由');
}
for (const id of DISPATCH_EXEMPT) {
  if (KNOWN.has(id)) {
    fail(`DISPATCH_EXEMPT 登记了 ${id}，但该命令**已存在** —— 请删除该例外条目`);
  }
}

// ── canary：合成夹具（谓词与解析器各验一次；不绑现实数据）────────────────────
{
  const K = knownCommandIdsOf("{ id: 'a.b' }, { id: 'c.d' }", "id: 'e.f',");
  if (!K.has('a.b') || !K.has('c.d') || !K.has('e.f')) {
    errors.push('canary 失效：命令 id 集合解析器漏掉了某些形态');
  }
  if (dispatchedIdsOf("x.dispatch('p.q'); y.dispatch('r.s');").join(',') !== 'p.q,r.s') {
    errors.push('canary 失效：`dispatch` 字面量解析器不正确');
  }
  // 负样本-放宽：变量 / 模板参数**不得**被判成字面量（否则会制造假阳性）
  if (dispatchedIdsOf('x.dispatch(variable); y.dispatch(`tpl`); z.dispatch("dq");').length !== 0) {
    errors.push('canary 失效：变量 / 模板 / 双引号参数被判成了字面量（会制造假阳性）');
  }
  // 负样本-放宽：`dispatch` 前缀不得误匹配（如 `xxxdispatch(`）
  if (dispatchedIdsOf("xxxdispatch('nope')").length !== 0) {
    errors.push('canary 失效：非 `.dispatch(` 的调用被误判');
  }
}

if (errors.length > 0) {
  throw new Error(`Command id reference violations:\n  ${errors.join('\n  ')}`);
}

console.log(`Command id refs: ${KNOWN.size} 个已知命令 id；`
  + `扫到 ${calls} 处 \`dispatch('<字面量>')\`，**全部存在**`
  + `（例外表 ${DISPATCH_EXEMPT.size} 项，刻意为空）；canary 4 项全绿。`
  + '（范围限制：只覆盖字面量；`dispatch(变量)` / 模板插值不在覆盖内）');
