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
 * ⚠️ **范围（2026-10-07，审计 §4.123）**：本工具的完备性比对范围 = `DEFAULT_OPTIONS`（84 键），
 * **不是**「Typora 的全部偏好」。偏好面板 UI（`page-dist/static/js/Preferences.*.js`）去重后
 * 暴露 **91** 个 `keyName`，其中约 **47** 个**不在** `DEFAULT_OPTIONS` 里
 * （`theme` / `userLanguage` / `zoomLevel` / `actionWhenDropFolder` / `pandocPath` …）
 * ⇒ **那一面本工具不覆盖**，其默认值需另找来源；本工具会把「面板有、矩阵无」的部分**打印出来**。
 * 面板也是**用户可见语义**（`label` / `hint` / `reverse`）的唯一来源 —— 本工具据此做
 * 「`reverse: !0` 的键必须带 `polarity: 'inverted'`」的检查（漏标会让「照着键名判语义」重演）。
 *
 * ── 用法 ──────────────────────────────────────────────────────────────────
 *   node tests/parity/tools/audit-typora-preferences.mjs            # 审计（❌ 时非零退出）
 *   node tests/parity/tools/audit-typora-preferences.mjs --write    # 把新键补进矩阵（status: TODO）
 *
 * 环境变量 `TYPORA_APPSRC` 可覆盖 TypeMark/appsrc 路径（默认取 /Applications/Typora.app）。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
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
 * 定位 Typora 的**偏好面板 UI** 脚本（`page-dist/static/js/Preferences.*.js`）。
 *
 * ⚠️ 这是**与 `DEFAULT_OPTIONS` 不同的另一个面**（2026-10-07，审计 §4.123）：
 * · `DEFAULT_OPTIONS`（frame.js）＝ **默认值**表，矩阵声明的范围就是它（84 键）；
 * · 面板 UI ＝ **用户可见语义**（`label` / `hint` / `reverse`）。
 * 两者**键集合不同**（面板去重后 91 个 `keyName`，其中约 47 个不在 `DEFAULT_OPTIONS` 里）——
 * 故本工具**只**在「面板与 DEFAULT_OPTIONS 的交集」上做检查，并把范围外的那部分**打印出来**。
 */
function panelJsPath() {
  const base = process.env.TYPORA_APPSRC
    ?? '/Applications/Typora.app/Contents/Resources/TypeMark/appsrc';
  const dir = resolve(base, '..', 'page-dist/static/js');
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).find((name) => /^Preferences\./.test(name));
  return found === undefined ? null : resolve(dir, found);
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

// ── 面板的**反向语义**键（`reverse: !0`）必须带 `polarity: 'inverted'`（2026-10-07，审计 §4.123）──
// 立此条的原因（实测）：`noLegacyMath` 被**照着键名**读成「不做 legacy 数学解析」并判为 `differs`，
// 而它在 Typora 偏好面板里的 **label 是**「`LaTeX Math Delimiter \( \) \[ \]`」且带 `reverse: !0`
// ⇒ **用户可见语义与键名相反**、默认是**启用**。而 Mellow **已支持**这四个定界符 ⇒ 该判定是错的。
// ⇒ 把「这个键的 UI 语义是反的」变成**机器可读**：凡面板标了 `reverse: !0` 的键，
//    矩阵条目**必须**带 `polarity: 'inverted'`（它正是「UI 默认 = 存储值取反」的写法，
//    也是默认值比对里 `!e.default` 那一支的依据）。
{
  const panelPath = panelJsPath();
  if (panelPath === null) {
    console.log('\nℹ️ 未找到 Typora 偏好面板 JS（Preferences.*.js）⇒ 跳过「反向语义键」检查');
  } else {
    const panel = readFileSync(panelPath, 'utf8');
    const reversed = [...new Set([...panel.matchAll(/\{[^{}]*keyName:\s*"([A-Za-z0-9_]+)"[^{}]*\}/g)]
      .filter((m) => /reverse:\s*!0/.test(m[0]))
      .map((m) => m[1]))].sort();
    // 面板用 snake_case、DEFAULT_OPTIONS 多用 camelCase ⇒ 归一化后比对
    const norm = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const byNorm = new Map(entries.map((e) => [norm(e.typora), e]));
    const missing = [];
    let checked = 0;
    for (const key of reversed) {
      const e = byNorm.get(norm(key));
      if (e === undefined) continue; // 面板有、DEFAULT_OPTIONS 无 ⇒ 在矩阵声明范围之外（见下）
      checked += 1;
      if (e.polarity !== 'inverted') missing.push(`${key}（矩阵键名 ${e.typora}）`);
    }
    if (checked === 0) {
      errors.push('「反向语义键」检查**空转**：面板里的 reverse 键一个都没匹配到矩阵条目 —— '
        + '归一化或解析可能已失效，请修判据而不是放任它恒真');
    }
    if (missing.length > 0) {
      errors.push(`面板标了 reverse:!0（UI 语义与键名**相反**）但矩阵未标 polarity:'inverted'（${missing.length}）：`
        + `${missing.join(', ')} —— 缺这个标记时，「照着键名判语义」的错误会再次发生（noLegacyMath 就是这么错的）`);
    }
    const outOfScope = reversed.filter((k) => byNorm.get(norm(k)) === undefined);
    console.log(`\n偏好面板 reverse:!0 键：${reversed.length} 个（已检查 ${checked} 个在矩阵内）`);
    if (outOfScope.length > 0) {
      console.log(`ℹ️ 其中 ${outOfScope.length} 个**不在**矩阵声明范围（DEFAULT_OPTIONS）内，故未检查：`
        + `${outOfScope.join(', ')}`);
    }
    // canary：谓词必须能区分（拼接构造，不依赖真实数据）
    const revOf = (src) => [...src.matchAll(/\{[^{}]*keyName:\s*"([A-Za-z0-9_]+)"[^{}]*\}/g)]
      .filter((m) => /reverse:\s*!0/.test(m[0])).map((m) => m[1]);
    if (!revOf('{keyName:"x",reverse:!0}').includes('x')) {
      errors.push('反向语义键 canary 失效：reverse:!0 未被识别');
    }
    if (revOf('{keyName:"y",reverse:!1}').length !== 0) {
      errors.push('反向语义键 canary 过宽：reverse:!1 被当成了反向键');
    }
    if (norm('noLegacyMath') !== 'no_legacy_math' || norm('no_legacy_math') !== 'no_legacy_math') {
      errors.push('反向语义键 canary 失效：命名归一化不能把 camelCase 与 snake_case 归一');
    }
  }
}

// ── 「面板独有键」登记表必须与面板**双向**一致（2026-10-07，审计 §4.126）──────────
// 立此条的原因：偏好矩阵的范围是 `DEFAULT_OPTIONS`（84 键），而面板 UI 另有约 47 个
// **不在**该范围的 keyName ⇒ 那一面此前**没有任何登记处**。§4.124 在那一面取样一次
// 就找到了一个**默认行为缺口**（拖入文件/文件夹整组未实现）⇒ 它是真会藏东西的地方。
// 判据：`typora-panel-only-keys.json` 的 key 集合必须**双向**等于「面板 keyName − 矩阵键（归一化）」；
// 状态合法；引用的 Mellow 设置 id 必须真实存在；note 非空。
// ⚠️ **`unverified` 是存量欠债、会被打印计数**，不得读作「已确认无差异」。
{
  const REG_PATH = resolve(root, 'tests/parity/fixtures/typora-panel-only-keys.json');
  const VALID = new Set(['equivalent', 'gap', 'not-applicable', 'unverified']);
  const norm = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  let reg = null;
  try { reg = JSON.parse(readFileSync(REG_PATH, 'utf8')); } catch {
    errors.push(`面板独有键登记表缺失或不是合法 JSON：tests/parity/fixtures/typora-panel-only-keys.json`);
  }
  const panelPathForReg = panelJsPath();
  if (reg !== null && panelPathForReg !== null) {
    const panel = readFileSync(panelPathForReg, 'utf8');
    const panelKeys = [...new Set([...panel.matchAll(/keyName:\s*"([A-Za-z0-9_]+)"/g)].map((x) => x[1]))];
    const matrixKeys = new Set(entries.map((e) => norm(e.typora)));
    const only = panelKeys.filter((k) => !matrixKeys.has(norm(k)));
    const regKeys = (reg.entries ?? []).map((e) => e.key);
    const missing = only.filter((k) => !regKeys.includes(k));
    const extra = regKeys.filter((k) => !only.includes(k));
    if (only.length < 40) {
      errors.push(`面板独有键只有 ${only.length} 个（下限 40）—— 面板解析或矩阵范围漂移，本判据会空转`);
    }
    if (missing.length > 0) {
      errors.push(`面板独有键未登记（${missing.length}）：${missing.join(', ')} —— `
        + '那一面是**真会藏缺口**的地方（§4.124 在那里找到过整组默认行为未实现）');
    }
    if (extra.length > 0) {
      errors.push(`登记表有但面板已无（${extra.length}）：${extra.join(', ')} —— 可能改版或拼错`);
    }
    const badStatus = [];
    const badIds = [];
    const knownIds = new Set([...settingsSource.matchAll(/id: '([^']+)'/g)].map((m) => m[1]));
    for (const e of reg.entries ?? []) {
      if (!VALID.has(e.status)) badStatus.push(`${e.key}(status=${e.status})`);
      if (typeof e.note !== 'string' || e.note.trim() === '') badStatus.push(`${e.key}(note 为空)`);
      for (const id of e.mellow ?? []) if (!knownIds.has(id)) badIds.push(`${e.key}→${id}`);
    }
    if (badStatus.length > 0) errors.push(`面板独有键登记表元数据不合法（${badStatus.length}）：${badStatus.join(', ')}`);
    if (badIds.length > 0) {
      errors.push(`面板独有键登记表引用了**不存在**的 Mellow 设置 id（${badIds.length}）：${badIds.join(', ')}`);
    }
    // 存量欠债**可见**（不判失败，但必须打印计数与清单）
    const unverified = (reg.entries ?? []).filter((e) => e.status === 'unverified');
    console.log(`\n面板独有键：${regKeys.length} 个 —— `
      + ['equivalent', 'gap', 'not-applicable', 'unverified']
        .map((s) => `${s} ${(reg.entries ?? []).filter((e) => e.status === s).length}`).join(' / '));
    if (unverified.length > 0) {
      console.log(`⚠️ 尚未核实 ${unverified.length} 项（**存量欠债**，不得读作「已确认无差异」）：`
        + `${unverified.map((e) => e.key).join(', ')}`);
    }
    const gaps = (reg.entries ?? []).filter((e) => e.status === 'gap');
    if (gaps.length > 0) {
      console.log(`❌ 真实缺口 ${gaps.length} 项：${gaps.map((e) => e.key).join(', ')}`);
    }
    // canary：双向判据必须能区分（拼接构造，不依赖真实数据）
    const diffOf = (a, b) => a.filter((x) => !b.includes(x));
    if (diffOf(['a', 'b'], ['a', 'b']).length !== 0 || diffOf(['a', 'c'], ['a']).join(',') !== 'c') {
      errors.push('面板独有键双向判据 canary 失效：集合差集不能区分正/负样本');
    }
    if (!VALID.has('equivalent') || VALID.has('nope')) {
      errors.push('面板独有键状态集合 canary 失效');
    }
  }
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
const gaps = entries.filter((e) => e.status === 'gap');
const differs = gaps.filter((e) => e.behavior === 'differs');
const unverified = gaps.filter((e) => e.behavior !== 'differs' && e.behavior !== 'matches-default' && e.behavior !== 'n/a');
if (differs.length > 0) {
  console.log(`\n⚠️ gap 中【行为与 Typora 默认不同】${differs.length} 项（未必是缺陷，但需登记理由；优先级高于纯「选项缺失」）：`);
  for (const e of differs) console.log(`  · ${e.typora} — ${e.behaviorNote ?? '(无说明)'}`);
}
if (unverified.length > 0) {
  console.log(`\n未核实行为（工作清单，${unverified.length} 项）：${unverified.map((e) => e.typora).join(', ')}`);
}
console.log('\n✅ 偏好项审计通过：Typora 每个偏好键都已在矩阵中登记（implemented / gap / not-applicable）');
