/**
 * Typora 偏好项审计（需本机 Typora，**不进 CI** —— 与 audit-typora-menu-labels.mjs 同类）。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────────
 * 此前是「凭手感挑一项 Typora 偏好来对标」—— 这种方式**永远发现不了没人想到的键**。
 * 本工具把「Typora 有哪些偏好、Mellow 各自是什么状态」变成一张**机器可校验的矩阵**，
 * 缺项会直接报错，而不是靠人回忆。
 *
 * ── 真值源 ────────────────────────────────────────────────────────────────
 * `TypeMark/appsrc/window/frame.js` 的 `DEFAULT_OPTIONS`（含默认值）。
 * 注意 `frame.js` 是**偏好面板**脚本，与 `main.js` 是两个文件；
 * `Panel.strings` 只有 UI 文案、无键名与默认值，只查它会漏或猜。
 * 另注意 `DEFAULT_OPTIONS.keys` 是**嵌套对象**（查找表），不是偏好项 → 已排除。
 *
 * ── 用法 ──────────────────────────────────────────────────────────────────
 *   node tests/parity/tools/audit-typora-preferences.mjs            # 审计（❌ 时非零退出）
 *   node tests/parity/tools/audit-typora-preferences.mjs --write    # 把新键补进矩阵（status: TODO）
 *
 * 环境变量 `TYPORA_APPSRC` 可覆盖 TypeMark/appsrc 路径（默认取 /Applications/Typora.app）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const MATRIX_PATH = resolve(root, 'tests/parity/fixtures/typora-preferences-matrix.json');
const SETTINGS_PATH = resolve(root, 'packages/settings/src/index.ts');

/** 定位 Typora 的 window/frame.js */
function frameJsPath() {
  const base = process.env.TYPORA_APPSRC
    ?? '/Applications/Typora.app/Contents/Resources/TypeMark/appsrc';
  return resolve(base, 'window/frame.js');
}

/**
 * 从 frame.js 提取 DEFAULT_OPTIONS 的顶层键与默认值。
 * 只取**顶层**（跟踪括号/引号），并排除嵌套对象 `keys`（查找表，非偏好项）。
 */
function extractDefaults(source) {
  const at = source.indexOf('DEFAULT_OPTIONS');
  if (at < 0) throw new Error('frame.js 中未找到 DEFAULT_OPTIONS');
  const start = source.indexOf('{', at);
  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error('DEFAULT_OPTIONS 括号未配对');
  const body = source.slice(start + 1, end);

  const result = new Map();
  let d = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if ('{[('.includes(c)) { d += 1; i += 1; continue; }
    if ('}])'.includes(c)) { d -= 1; i += 1; continue; }
    if (c === '"' || c === "'") {
      const q = c; i += 1;
      while (i < body.length && body[i] !== q) { if (body[i] === '\\') i += 1; i += 1; }
      i += 1; continue;
    }
    if (d === 0 && /[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < body.length && /[\w$]/.test(body[j])) j += 1;
      const name = body.slice(i, j);
      let k = j;
      while (k < body.length && /\s/.test(body[k])) k += 1;
      if (body[k] === ':') {
        // 取值：读到顶层逗号或结尾
        let v = k + 1;
        let vd = 0;
        let vs = v;
        while (v < body.length) {
          const ch = body[v];
          if ('{[('.includes(ch)) vd += 1;
          else if ('}])'.includes(ch)) { if (vd === 0) break; vd -= 1; }
          else if (ch === ',' && vd === 0) break;
          else if (ch === '"' || ch === "'") {
            const q = ch; v += 1;
            while (v < body.length && body[v] !== q) { if (body[v] === '\\') v += 1; v += 1; }
          }
          v += 1;
        }
        const raw = body.slice(vs, v).trim();
        const value = raw === '!0' ? true
          : raw === '!1' ? false
            : raw === 'null' ? null
              : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw)
                : raw.replace(/^["']|["']$/g, '');
        if (name !== 'keys') result.set(name, value);
        i = v + 1; continue;
      }
      i = j; continue;
    }
    i += 1;
  }
  return result;
}

const source = readFileSync(frameJsPath(), 'utf8');
const defaults = extractDefaults(source);

if (!existsSync(MATRIX_PATH)) {
  throw new Error(`矩阵文件不存在：${MATRIX_PATH}（先运行 --write 生成草稿）`);
}
const matrix = JSON.parse(readFileSync(MATRIX_PATH, 'utf8'));
const entries = matrix.entries ?? [];
const byKey = new Map(entries.map((e) => [e.typora, e]));

if (process.argv.includes('--write')) {
  const missing = [...defaults.keys()].filter((k) => !byKey.has(k));
  for (const key of missing) {
    entries.push({ typora: key, default: defaults.get(key), status: 'TODO', mellow: [], note: '' });
  }
  entries.sort((a, b) => a.typora.localeCompare(b.typora));
  writeFileSync(MATRIX_PATH, `${JSON.stringify({ ...matrix, entries }, null, 2)}\n`);
  console.log(`已补入 ${missing.length} 个新键（status: TODO），矩阵共 ${entries.length} 项`);
  process.exit(0);
}

// ── 默认值比对（Typora 默认 vs Mellow 默认）──────────────────────────────
//
// 为什么需要：**「选项缺失」与「行为偏离默认值」是两类不同的问题**，后者用户直接能感知
// （例如 Typora 默认不渲染 `==高亮==`，Mellow 默认渲染 → 同一份文档显示不同）。
//
// 映射语义不可直接比值的条目用 `comparable: false` 显式排除（反向语义用 `polarity: 'inverted'`）。
// **凡默认值确实不同者，必须带 `deviation: { kind, reason }`** —— 把「登记而非擅改」机械化。
function mellowDefaults() {
  const src = readFileSync(SETTINGS_PATH, 'utf8').replace(/\r\n/g, '\n');
  const out = new Map();
  const re = /\{ id: '([^']+)'[^}]*?defaultValue: ([^,}]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) out.set(m[1], m[2].trim());
  return out;
}

function normalize(v) {
  if (typeof v === 'string') return v.replace(/^["']|["']$/g, '');
  return v;
}

const mellowDef = mellowDefaults();
const deviations = [];
const unregisteredDeviations = [];
for (const e of entries) {
  if (e.status !== 'implemented' || e.comparable === false) continue;
  for (const id of e.mellow ?? []) {
    const raw = mellowDef.get(id);
    if (raw === undefined) continue;
    const mine = normalize(raw === 'true' ? true : raw === 'false' ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw);
    const theirs = e.polarity === 'inverted' ? !e.default : e.default;
    if (mine !== theirs) {
      const label = `${e.typora}（Typora ${JSON.stringify(e.default)} / Mellow ${id}=${JSON.stringify(mine)}）`;
      if (e.deviation?.reason) deviations.push(`${label} — ${e.deviation.kind}: ${e.deviation.reason}`);
      else unregisteredDeviations.push(label);
    }
  }
}

// ── 审计 ────────────────────────────────────────────────────────────────
const errors = [];
const settingsSource = readFileSync(SETTINGS_PATH, 'utf8').replace(/\r\n/g, '\n');
const knownSettingIds = new Set([...settingsSource.matchAll(/id: '([^']+)'/g)].map((m) => m[1]));

const VALID_STATUS = new Set(['implemented', 'gap', 'not-applicable']);
const unregistered = [...defaults.keys()].filter((k) => !byKey.has(k));
const stale = entries.filter((e) => !defaults.has(e.typora)).map((e) => e.typora);
const todo = entries.filter((e) => !VALID_STATUS.has(e.status)).map((e) => e.typora);
const badIds = [];
for (const e of entries) {
  if (e.status !== 'implemented') continue;
  for (const id of e.mellow ?? []) {
    if (!knownSettingIds.has(id)) badIds.push(`${e.typora} → ${id}`);
  }
}

const count = (s) => entries.filter((e) => e.status === s).length;
console.log(`Typora DEFAULT_OPTIONS：${defaults.size} 项（已排除嵌套 keys）`);
console.log(`矩阵：${entries.length} 项 —— implemented ${count('implemented')} / gap ${count('gap')} / not-applicable ${count('not-applicable')} / TODO ${todo.length}`);

if (unregisteredDeviations.length > 0) {
  errors.push(`默认值偏离 Typora 但未登记 deviation（${unregisteredDeviations.length}）：${unregisteredDeviations.join(' / ')}`);
}

if (unregistered.length > 0) {
  errors.push(`Typora 有但矩阵未登记（${unregistered.length}）：${unregistered.join(', ')}`);
}
if (stale.length > 0) {
  errors.push(`矩阵有但 Typora 已无（可能改版或拼错，${stale.length}）：${stale.join(', ')}`);
}
if (todo.length > 0) {
  errors.push(`矩阵中仍是 TODO（${todo.length}）：${todo.join(', ')}`);
}
if (badIds.length > 0) {
  errors.push(`implemented 条目引用了不存在的 Mellow 设置 id（${badIds.length}）：${badIds.join(', ')}`);
}

if (errors.length > 0) {
  console.error('\n❌ 偏好项审计未通过：');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (deviations.length > 0) {
  console.log(`\n已登记默认值偏离 ${deviations.length} 项：`);
  for (const d of deviations) console.log(`  · ${d}`);
}
console.log('\n✅ 偏好项审计通过：Typora 每个偏好键都已在矩阵中登记（implemented / gap / not-applicable）');
