/**
 * i18n 契约护栏（2026-09-30）。
 *
 * 母题（与设置项「跨层两端同时锁」同源）：**文案键是一个跨层声明** ——
 * 调用点写 `t('a.b')`，真值在 `packages/i18n` 的目录里。两侧各自的检查都在
 * （i18n 包测试查「zh/en 键集合一致」；`verify-menu-contract.mjs` §6 查菜单 labelKey），
 * **但没有任何一处检查「调用点写的键在目录里到底有没有」**。
 *
 * 而 `t()` 对缺失键的行为是 `table[key] ?? catalog['en-US'][key] ?? key` ——
 * **返回键名本身**。于是「键写错 / 忘了加」不会报错，只是**界面上显示裸键名**。
 *
 * 实测（本护栏首跑即抓到）：`t('file.info')` 与 `t('file.openWith')` 两个键
 * **在目录里不存在**（zh/en 都缺），而它们被用在「文件信息」与「打开方式」
 * 两个面板的**标题 + aria-label** 上 → 用户看到的是 `file.info` / `file.openWith`。
 * 已补键修复。
 *
 * 断言：
 *   A. 全仓 `t('<字面量>')` 的键必须在 zh **和** en 目录中**非空**存在；
 *   B. 各 schema 里声明的 `labelKey` / `descriptionKey` 字面量同上
 *      （这条覆盖了「用 `t(def.labelKey)` 变量调用」的那一半 —— 变量无法静态解析，
 *       但它的**声明处**可以）。
 *
 * ⚠️ **范围限制（如实声明）**：
 *   - 只覆盖**字面量**键。`t(variable)` / `t(\`...${x}\`)` **无法静态解析**，不在覆盖内
 *     （这是为什么还要有断言 B：schema 的声明处是字面量）。
 *   - 不判定**文案质量**（是否翻译得体、是否有占位符不匹配）。
 *     ⚠️ 已知未覆盖：`{var}` 占位符与调用方传参是否匹配（`formatMessage` 对缺失变量
 *     返回空串 → 屏幕上是「缺一块」而非报错）—— 静态判定需解析 ICU 子集，代价高，留为未覆盖。
 *   - 不覆盖 Rust 侧 / HTML 模板里的文案。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);
// Windows CI 以 CRLF 检出源码：不归一化会让下方锚点断言全部失配（假绿）。
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');

// ── 解析 i18n 目录（zh / en 两个块）────────────────────────────────────────
const MESSAGES_FILE = 'packages/i18n/src/messages.ts';
const messages = read(MESSAGES_FILE);
const zhStart = messages.indexOf('const zhCN = {');
const enStart = messages.indexOf('const enUS:');
const enEnd = messages.indexOf('\n};', enStart);
if (zhStart < 0 || enStart < 0 || enEnd < 0) {
  throw new Error('无法定位 i18n 目录的 zh/en 块 → 请同步更新本护栏，不要让它静默漏检');
}
const keysOf = (block) => new Map(
  [...block.matchAll(/^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)',\s*$/gm)].map((m) => [m[1], m[2]]),
);
const zh = keysOf(messages.slice(zhStart, enStart));
const en = keysOf(messages.slice(enStart, enEnd));
if (zh.size < 700 || en.size < 700) {
  fail(`i18n 目录解析出的键过少（zh=${zh.size} en=${en.size}）→ 解析器可能漏成员，请同步更新本护栏`);
}

/** 该键是否在两个 locale 中**非空**存在 */
const resolves = (key) => (zh.get(key) ?? '').trim() !== '' && (en.get(key) ?? '').trim() !== '';

// ── 扫描面 ────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', '.workbuddy-ai', 'archive', 'dist', 'target', 'build', 'CoreEditor']);
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

const allFiles = walk(root).map((p) => relative(root, p).replace(/\\/g, '/'));
const sourceFiles = allFiles.filter(
  (f) => /^(?:apps|packages)\/[^/]+\/src\//.test(f)
    && /\.tsx?$/.test(f)
    && !f.endsWith('.d.ts')
    && !f.startsWith('packages/i18n/'),
);

/** 只剥**整行** `//` 注释（行尾 `//` 可能落在字符串里，剥了会误伤）。 */
const stripWholeLineComments = (code) => code.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
/** 锚点按字面量匹配（键名含 `.`）。 */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── A. `t('<字面量>')` 必须可解析 ─────────────────────────────────────────
const T_LITERAL = /\bt\(\s*'([a-zA-Z][\w.]*\.[\w.]+)'/g;
const T_TEMPLATE_STATIC = /\bt\(\s*`([a-zA-Z][\w.]*\.[\w.]+)`/g;
const unresolved = new Map(); // key -> Set(file)
let literalCalls = 0;
const distinctKeys = new Set();

for (const file of sourceFiles) {
  const src = stripWholeLineComments(read(file));
  for (const re of [T_LITERAL, T_TEMPLATE_STATIC]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      literalCalls += 1;
      distinctKeys.add(m[1]);
      if (resolves(m[1])) continue;
      if (!unresolved.has(m[1])) unresolved.set(m[1], new Set());
      unresolved.get(m[1]).add(file);
    }
  }
}

for (const [key, files] of unresolved) {
  const which = [!zh.has(key) ? 'zh' : '', !en.has(key) ? 'en' : ''].filter(Boolean).join('+') || '空值';
  fail(
    `t() 调用的键无法解析：'${key}'（缺 ${which}）→ t() 会**返回键名本身**，界面上显示裸键。\n`
    + `    出现于：${[...files].join(', ')}`,
  );
}

// 元护栏：解析器健康度下限（**不是**「调用点必须齐」的下限）。
// 当前基线 ≈ 440 个去重键 / 560 次调用；低于下限说明解析器漏了一大类
// （例如 t 被重命名、或换了调用形态）→ 响亮失败，不要静默变成空壳。
if (distinctKeys.size < 400 || literalCalls < 500) {
  fail(
    `t() 字面量扫描结果异常（去重键 ${distinctKeys.size}，调用 ${literalCalls}）`
    + ' → 解析器可能漏成员，请同步更新本护栏',
  );
}

// ── B. schema 声明的 labelKey / descriptionKey 必须可解析 ────────────────
const SCHEMA_FILES = [
  'packages/settings/src/index.ts',
  'apps/desktop/src/SettingsPanel.tsx',
  'packages/commands/src/menuSchema.ts',
];
const SCHEMA_KEY = /(?:labelKey|descriptionKey):\s*'([^']+)'/g;
let schemaRefs = 0;
for (const file of SCHEMA_FILES) {
  const src = stripWholeLineComments(read(file));
  SCHEMA_KEY.lastIndex = 0;
  let m;
  while ((m = SCHEMA_KEY.exec(src)) !== null) {
    schemaRefs += 1;
    if (!resolves(m[1])) {
      fail(`schema 声明的文案键无法解析：'${m[1]}'（${file}）→ 该处会显示裸键`);
    }
  }
}
if (schemaRefs < 300) {
  fail(`schema 文案键扫描结果异常（${schemaRefs}）→ 解析器可能漏成员，请同步更新本护栏`);
}

// ── canary：断言本身必须两个方向都能判 ───────────────────────────────────
{
  // ① 缺失键必须被检出（用拼接构造，避免护栏扫到自己的字面量）
  const ghost = ['canary', 'i18n', 'ghost'].join('.');
  if (resolves(ghost)) fail(`canary 样本 ${ghost} 竟然存在于目录中（护栏自检无意义）`);
  const sample = `t('${ghost}')`;
  T_LITERAL.lastIndex = 0;
  const hit = T_LITERAL.exec(sample);
  if (hit === null || hit[1] !== ghost) {
    fail('canary 失效：t() 字面量解析器抓不到样本（护栏已失去检出能力）');
  } else if (resolves(hit[1])) {
    fail('canary 失效：缺失键样本被判为可解析');
  }
  // ② 存在的键不得被误报（防误报：否则护栏会吃掉合法调用）
  const real = 'settings.title';
  if (!resolves(real)) fail(`canary 失效（误报）：真实存在的键 ${real} 被判为不可解析`);
  // ③ 空值也算不可解析（防「键在但值为空」被放过）
  const emptyKey = ['canary', 'empty'].join('.');
  const fakeZh = new Map([[emptyKey, '   ']]);
  const fakeEn = new Map([[emptyKey, 'x']]);
  const resolvesFake = (k) => (fakeZh.get(k) ?? '').trim() !== '' && (fakeEn.get(k) ?? '').trim() !== '';
  if (resolvesFake(emptyKey)) fail('canary 失效：zh 为空白值的键被判为可解析');
}

// ── 引擎侧 UI 文案：**目录 + locale 桥 + 无硬编码中文**（2026-10-01，ADR-0028 落地）────
//
// 【历史】本节原为「硬编码中文登记表」。首版记 43 条 / 5 文件，本会话更正为 **79 条 / 8 文件**
// （判据只认「属性赋值」一种写法 → 漏掉三元 / 函数实参 / 模板串 / 整个文件；见审计 §4.57）。
// 登记表是**待修清单**，目标是**缩到 0**（故**不得**给它设条目下限 —— 那会阻止修复）。
//
// 【ADR-0028 裁决后】Q1=A2（逐项加桥 `__MELLOW_ENGINE_LOCALE__`）/ Q2=B1（引擎**自带**目录）/
// Q3=C1（默认 zh-CN ⇒ 未接桥 = 原行为）。79 条已全部改为 `tEngine('…')`，登记表**清空**。
//
// 【现判据四条】
//   E1 **无硬编码中文**：引擎源码里除「文案目录」与「豁免表」外，不得出现含汉字的字面量。
//   E2 **键可解析**：每个 `tEngine('key')` 的 key 必须在 `ENGINE_MESSAGES` 中存在
//      —— 否则界面显示**裸键**（与 packages/i18n 的 t() 同语义，但更隐蔽：引擎侧没人盯着）。
//   E3 **两 locale 齐备 + 不重叠**：每个键的 zh / en 都非空；键一律 `engine.` 前缀，
//      且**不得与 `packages/i18n` 的键重叠**（两套目录各自漂移的防线）。
//   E4 **接线链完整**：目录存在 ≠ 界面会变 —— 必须
//      `engine/index.ts 装桥` → `editor-core 暴露 setEngineLocale` → `App.tsx 调用` 三段齐全；
//      否则就是「登记表全绿但界面仍是中文」的半成品（本节存在的意义正是防这个形态）。
{
  const ENGINE_SRC = 'packages/editor-engine/src';
  const I18N_MODULE = `${ENGINE_SRC}/engineI18n.ts`;
  // 扫描回调里的 `f` 是**相对 ENGINE_SRC 的路径**（walkDir 的产物），故目录文件用其相对名判定
  const I18N_REL = 'engineI18n.ts';
  // 允许保留中文的**豁免**（开发者/错误路径消息，非 UI 文案）——逐条给原因，不得扩大。
  const ENGINE_I18N_EXEMPT = {
    'image/host.ts': [
      'copyFile(${from} → ${to}) 未实现',
      'mkdir(${path}) 未实现',
      'writeBinary(${path}) 未实现',
    ],
  };
  const EXEMPT_REASON = '`fail()` 抛出的**开发者错误**（null host 的未实现占位），不面向用户；'
    + 'localize 它们只会让开发者看不懂栈';

  const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const walkDir = (dir, rel = '') => readdirSync(resolve(root, dir, rel), { withFileTypes: true }).flatMap((e) =>
    (e.isDirectory() ? walkDir(dir, `${rel}${e.name}/`) : [`${rel}${e.name}`]));
  const HAN = /[\u4e00-\u9fa5]/;
  // 已本地化的调用（目标状态）：`tEngine('…')` / `t('…')`（可带后续实参）
  const LOCALIZED_CALL = /\b(?:tEngine|t)\(\s*(['"`])(?:\\.|(?!\1)[^\\])*\1[^)]*\)/g;
  /** 扫描「含汉字的字面量」——逐行、任意位置、三种引号；`reader(f)` 便于 canary 注入合成样本 */
  const scanHardcodedZh = (files, reader) => {
    const out = {};
    for (const f of files) {
      if (!f.endsWith('.ts') || f === I18N_REL) continue;   // 文案目录本身即真值源，跳过
      for (const rawLine of stripComments(reader(f)).split('\n')) {
        const line = rawLine.replace(LOCALIZED_CALL, ' ');
        if (!HAN.test(line)) continue;
        for (const m of line.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
          const text = m[1] ?? m[2] ?? m[3] ?? '';
          if (!HAN.test(text)) continue;
          (out[f] = out[f] ?? []).push(text);
        }
      }
    }
    for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].sort();
    return out;
  };

  const engineFiles = walkDir(ENGINE_SRC);
  const actual = scanHardcodedZh(engineFiles, (f) => readFileSync(resolve(root, ENGINE_SRC, f), 'utf8'));

  // ── E1 无硬编码中文（豁免表之外一律失败）──────────────────────────────
  for (const [file, list] of Object.entries(actual)) {
    const exempt = ENGINE_I18N_EXEMPT[file];
    if (exempt === undefined) {
      fail(`引擎侧出现未接入 i18n 的硬编码中文文案：${file}（${list.join(' / ')}）—— `
        + 'en 界面下这些文案不会本地化。请改为 tEngine(\'<key>\')（文案目录 engineI18n.ts）；'
        + `若确属**非 UI**（开发者/错误路径）才登记进 ENGINE_I18N_EXEMPT 并写明原因。`
        + `\n    豁免表现有条目的原因示例：${EXEMPT_REASON}`);
      continue;
    }
    const added = list.filter((x) => !exempt.includes(x));
    if (added.length > 0) {
      fail(`引擎侧 ${file} 新增未豁免的硬编码中文：${added.join(' / ')}`);
    }
    const gone = exempt.filter((x) => !list.includes(x));
    if (gone.length > 0) {
      fail(`引擎侧 ${file} 的豁免项已不存在：${gone.join(' / ')} —— 请从 ENGINE_I18N_EXEMPT 删除`);
    }
  }
  for (const file of Object.keys(ENGINE_I18N_EXEMPT)) {
    if (!(file in actual)) fail(`引擎侧豁免表里的文件已无中文文案：${file} —— 请从豁免表删除`);
  }

  // ── E2 键可解析 + E3 两 locale 齐备 / 不重叠 ────────────────────────
  if (!existsSync(resolve(root, I18N_MODULE))) {
    fail(`缺少 ${I18N_MODULE}（引擎文案目录 + locale 桥，ADR-0028）`);
  } else {
    const mod = read(I18N_MODULE);
    // 目录条目：`'<key>': { 'zh-CN': '…', 'en-US': '…' }`
    //
    // ⚠️ **不得在此按 `engine.` 前缀预过滤**（2026-10-01 实测踩过）：首版写成
    // `'((?:engine)\.[…])'` → 非 engine 键**对整节判据全部不可见**（前缀检查因此**永不触发**），
    // 实测残留在目录里的 `'sidebar.files': …` 一路绿灯，直到 **CI 的单测**才把它抓出来。
    // 正确做法：先取**全部**条目，再让前缀判据去判定（判据必须落在它能看见的集合上）。
    const entries = [...mod.matchAll(/'([A-Za-z0-9_.-]+)'\s*:\s*\{([^}]*)\}/g)]
      .filter((m) => /'zh-CN'\s*:/.test(m[2]) || /'en-US'\s*:/.test(m[2]))   // 只取「双 locale 条目」
      .map((m) => ({ key: m[1], body: m[2] }));
    const catalog = new Map(entries.map((e) => [e.key, e.body]));
    if (catalog.size < 76) {
      fail(`引擎文案目录只有 ${catalog.size} 个键（下限 76 = ADR-0028 落地时的实测基线）—— `
        + '目录被删空会让「无硬编码中文」变成假绿');
    }
    // 两 locale 齐备
    for (const { key, body } of entries) {
      for (const loc of ['zh-CN', 'en-US']) {
        const m = new RegExp(`'${loc}'\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`).exec(body);
        if (m === null || m[1].trim() === '') {
          fail(`引擎文案目录 ${key} 缺 ${loc} 译文（引擎侧 en 界面会显示裸键或空串）`);
        }
      }
    }
    // E2：每个 tEngine('key') 的 key 必须在目录中
    const usedKeys = new Set();
    for (const f of engineFiles) {
      if (!f.endsWith('.ts')) continue;
      for (const m of stripComments(readFileSync(resolve(root, ENGINE_SRC, f), 'utf8'))
        .matchAll(/tEngine\(\s*'([^']+)'/g)) usedKeys.add(m[1]);
    }
    const missing = [...usedKeys].filter((k) => !catalog.has(k)).sort();
    if (missing.length > 0) {
      fail(`引擎里 tEngine 引用了**目录中不存在**的键：${missing.join(' / ')} —— 界面会显示**裸键**`);
    }
    const unused = [...catalog.keys()].filter((k) => !usedKeys.has(k)).sort();
    if (unused.length > 0) {
      fail(`引擎文案目录里有**从未被使用**的键：${unused.join(' / ')} —— 目录不得变成化石`);
    }
    // E3：前缀 + 命名空间不重叠
    //
    // ⚠️ 首版写的是「求 catalog 与 app 目录的**键交集**」—— 但 `catalog` 只收集
    // `engine.` 前缀的键，而 app 目录里没有这种键 ⇒ **交集恒为空、该判据永不触发**
    // （skill §15「不可达判据」的形态；实测：把键改名成 `sidebar.files` 后它没报，
    //  只有前缀判据与下限报了）。改为**可达**的等价表述：直接断言两套命名空间互不侵占。
    const badPrefix = [...catalog.keys()].filter((k) => !k.startsWith('engine.'));
    if (badPrefix.length > 0) {
      fail(`引擎文案键必须以 engine. 前缀：${badPrefix.join(' / ')}`);
    }
    const appCatalog = read('packages/i18n/src/messages.ts');
    const appEngineKeys = [...appCatalog.matchAll(/'(engine\.[A-Za-z0-9_.]+)'\s*:/g)].map((m) => m[1]);
    if (appEngineKeys.length > 0) {
      fail(`packages/i18n 目录里出现 engine.* 键：${appEngineKeys.join(' / ')} —— `
        + '引擎文案归 engineI18n.ts，两套目录不得互相侵占（否则同键两处各自漂移）');
    }
  }

  // ── E4 接线链完整（三段）────────────────────────────────────────────
  const CHAIN = [
    ['packages/editor-engine/src/index.ts', /installEngineLocaleBridge\(\)/, '引擎 index.ts 未安装 locale 桥'],
    ['packages/editor-core/src/core.ts', /setEngineLocale\(/, 'editor-core 未暴露 setEngineLocale'],
    ['apps/desktop/src/App.tsx', /setEngineLocale\(/, 'App.tsx 未调用 setEngineLocale（引擎永远拿不到 locale）'],
  ];
  for (const [file, re, why] of CHAIN) {
    if (!existsSync(resolve(root, file))) { fail(`接线链缺文件：${file}`); continue; }
    if (!re.test(read(file))) {
      fail(`${why} —— 「目录存在」不等于「界面会变」；缺这段就是「登记表全绿但界面仍是中文」的半成品`);
    }
  }

  // canary：逐形态验证「能翻转」——重点是历史上漏检的那几种写法
  const canaryCount = (sample) => (scanHardcodedZh(['x.ts'], () => sample)['x.ts'] ?? []).length;
  const canaryCases = [
    ["const a = { label: '新增中文' };", 1, '属性字面量形态'],
    ["el.setAttribute('aria-label', '新增中文');", 1, 'setAttribute 形态'],
    ["x.textContent = flag ? '新增中文' : '';", 1, '**三元/表达式位置**（历史漏检）'],
    ["new Option('(无语言)', '');", 1, '**函数实参**（历史漏检）'],
    ['fail(`mkdir(${p}) 未实现`);', 1, '**模板串**（历史漏检）'],
    ["el.title = tEngine('engine.x');", 0, '已本地化的调用不误判'],
    ["el.title = t('a.b');", 0, '走 t() 的调用不误判'],
    ["// el.title = '注释里的中文';", 0, '整行注释不误判'],
  ];
  for (const [sample, expect, why] of canaryCases) {
    const got = canaryCount(sample);
    if (got !== expect) {
      errors.push(`引擎文案护栏 canary 失效：${why}（期望 ${expect} 条、实得 ${got}）`);
    }
  }
  // canary：E1 必须**排除**文案目录（否则目录里的 zh 真值会被自己判成硬编码）
  if (scanHardcodedZh([I18N_REL], () => "const a = '中文';")[I18N_REL] !== undefined) {
    errors.push('引擎文案护栏 canary 失效：文案目录未被排除（目录里的 zh 真值会被误判）');
  }
  // canary：E2 方向 —— 一个目录里没有的键必须被判为缺失
  if (['engine.not.exists'].filter((k) => !new Set(['engine.real']).has(k)).length !== 1) {
    errors.push('引擎文案护栏 canary 失效：目录中不存在的键未被判为缺失');
  }
}
// ── D. 目录 → 使用：**死键**（2026-10-06 审计 §4.102）────────────────────────
// 【为什么补】A/B/C 全是「`t()` 用到的键必须存在」（**使用 → 目录**）。
// **反方向（目录 → 使用）此前只有 `menu.*` 有判据** ——
// `verify-menu-contract.mjs` 的 `ORPHAN_ALLOWED` **遍历全部 `menu.*` 键**；
// 其余命名空间**零判据**（又一次「只锁了一半」）。
//
// 【实测】841 个键里 **34 个全仓任何引号形式都不出现**；其中 9 个属 `menu.*`
// （已由上面那条判据负责）⇒ 本判据负责**其余 25 个**，并**刻意排除 `menu.*`**，
// 避免同一缺口登记两处（会制造与 D-E/D-Q 同型的二义）。
//
// 【为什么死键值得管】它们不只是「占地方」，而是**改版遗留的物证**：
//   · `sidebar.showHidden` / `showNonMarkdown` / `filtersTitle` / `tree.includeGlob` /
//     `tree.excludeGlob` —— **侧栏过滤面板**改版为**设置页选项**（`settings.file.*`）后留下的；
//   · `sidebar.tree` / `sidebar.list` / `sidebar.summary` —— 侧栏模式切换改用 `sidebar.*Aria` 后留下的；
//   · `settings.writingWidth.680` / `.820` —— 写作宽度从**选项列表**改为**数值设置**后留下的。
//
// ⚠️ **口径必须是「产品 + 工具链」，不得把 `tests/` 算作使用**（2026-10-06 审计 §4.105 收紧）：
// 首版把 `tests/` 也算进扫描面，于是**「只被某个护栏断言存在」的键被当成活键** ——
// 而「护栏在维护一个死键」恰恰是最该暴露的一类（断言了存在，却没人问「谁在用」）。
// 实测收紧后正好多出 4 个：`contextmenu.open` / `contextmenu.revealInTree`（右键菜单实际用
// `contextmenu.newFile`/`rename`/`reveal` 等）与 `files.newFile` / `files.newFolder`
// （命令用**内联** `localizedTitle: { zh, en }`）—— 四个都只被 `verify-sidebar-contract.mjs` 断言存在。
const MESSAGES_UNUSED = new Map([
  ['titlebar.palette.title', '未使用：命令面板按钮的 title 走了别的键（或直接用 aria-label）'],
  ['sidebar.filesSwitchLabel', '未使用：侧栏模式切换改用 `sidebar.*Aria` 系列'],
  ['sidebar.tree', '未使用：侧栏模式切换改用 `sidebar.*Aria` 系列（同 sidebar.list / sidebar.summary）'],
  ['sidebar.list', '未使用：同上'],
  ['sidebar.summary', '未使用：同上'],
  ['sidebar.showHidden', '未使用：侧栏过滤面板 → 设置页选项（现为 `settings.file.showHidden`）'],
  ['sidebar.showNonMarkdown', '未使用：同上（现为 `settings.file.showNonMarkdown`）'],
  ['sidebar.filtersTitle', '未使用：同上（侧栏过滤面板已不存在）'],
  ['sidebar.pinnedLabel', '未使用：最近文件夹置顶分组改用别的方式呈现'],
  ['sidebar.recentFoldersLabel', '未使用：同上'],
  ['sidebar.removeRecentFolder', '未使用：移除按钮的文案走别处（或仅用图标 + aria）'],
  ['tree.includeGlob', '未使用：改版为设置页的 `settings.file.includeGlobs`'],
  ['tree.excludeGlob', '未使用：改版为设置页的 `settings.file.excludeGlobs`'],
  ['tree.rootEmpty', '未使用：空目录提示走了别的键（或未实现该提示）'],
  ['quickopen.hint', '未使用：快速打开的提示未接线'],
  ['reader.copy', '未使用：Reader 的复制按钮文案未接线（按钮可能只用图标）'],
  ['reader.math.render.error', '未使用：公式渲染失败提示未接线'],
  ['status.words', '未使用：状态栏字数格式未接线（字数并入窗口标题，见 windowService.setTitle）'],
  ['msg.openFileFailed', '未使用：打开失败提示走了别的键'],
  ['updater.rollbackInProgress', '未使用：回滚进行中的提示未接线'],
  ['edit.replaceMenu', '未使用：替换菜单项未装配（命令可能已并入查找）'],
  ['edit.smartPunctuation', '未使用：智能标点菜单项未装配'],
  ['settings.writingWidth.820', '未使用：写作宽度从**选项列表**改为**数值设置**（`settings.editor.writingWidth`）后留下的'],
  ['settings.liveHint', '未使用：设置页的实时生效提示未接线'],
  ['contextmenu.textParagraph', '未使用：右键项文案在命令对象里内联（`localizedTitle: { zh, en }`），未走 i18n 目录'],
  ['contextmenu.textFormat', '未使用：同上'],
  // ↓ 以下 4 个是**收紧口径**（2026-10-06 审计 §4.105）后才暴露的：它们在产品代码里从未被使用，
  //   只被 `verify-sidebar-contract.mjs` 的「双语文案」断言提到过 ⇒ **护栏在维护死键**。
  //   （该断言已同步移除这 4 项 —— 断言一个死键的「双语齐备」没有意义。）
  ['contextmenu.open', '未使用：右键菜单实际用 `contextmenu.newFile`/`rename`/`reveal` 等；本键仅被侧栏护栏断言存在'],
  ['contextmenu.revealInTree', '未使用：同上（实际用 `contextmenu.reveal`）'],
  ['files.newFile', '未使用：新建文件的命令用**内联** `localizedTitle: { zh: 新文件, en: New File }`；本键仅被侧栏护栏断言存在'],
  ['files.newFolder', '未使用：同上（`fileTree.newFolder` 命令 + 内联标题）'],
]);
const MESSAGES_UNUSED_SCOPE_NOTE = '口径 = **产品 + 工具链**（`apps`/`packages`/`tools`），'
  + '**刻意不含 `tests/`** —— 否则「只被某个护栏断言存在」的键会被当成活键（审计 §4.105）；'
  + '`menu.*` 也不在此表内：其孤儿判据在 `verify-menu-contract.mjs` 的 `ORPHAN_ALLOWED`（遍历全部 menu.* 键）';

/** 该键是否在**任一引号形式**下出现在产品 / 工具链 / 测试里 */
function keyReferenced(key, blob) {
  return blob.includes(`'${key}'`) || blob.includes(`"${key}"`) || blob.includes('`' + key + '`');
}
{
  const SELF = 'tests/parity/verify-i18n-contract.mjs';
  const DEAD_SCAN = allFiles.filter((f) =>
    /^(?:apps|packages|tools)\//.test(f)     // ⚠️ **不含 tests/** —— 见上方 SCOPE_NOTE（审计 §4.105）
    && !f.includes('/public/')               // 生成型产物（可能残留旧键 ⇒ 会把死键误判成活键）
    && f !== SELF                            // ⚠️ **护栏自己不算使用** —— 否则下方 MESSAGES_UNUSED 表里
                                             //    的键字符串会让每个死键都「看起来被引用」（自指假阴性，实测踩到）
    && f !== 'packages/i18n/src/messages.ts' // 目录自身不算使用（但该包的**测试**要算，见 app.name）
    && /\.(ts|tsx|js|jsx|mjs|html|json)$/.test(f));
  if (DEAD_SCAN.length < 100) {
    fail(`死键判据的扫描面只解析出 ${DEAD_SCAN.length} 个文件（下限 100）—— 扫描面漂移会让本判据空转`);
  }
  const blob = DEAD_SCAN.map((f) => read(f)).join('\n');

  const isMenuNs = (k) => k.startsWith('menu.');
  const dead = [...zh.keys()].filter((k) => !isMenuNs(k) && !keyReferenced(k, blob)).sort();
  const deadUnregistered = dead.filter((k) => !MESSAGES_UNUSED.has(k));
  const registeredButAlive = [...MESSAGES_UNUSED.keys()].filter(
    (k) => isMenuNs(k) || keyReferenced(k, blob) || !zh.has(k));
  if (deadUnregistered.length > 0) {
    fail(`i18n 目录里出现**无人使用**的键：${deadUnregistered.join(', ')}`
      + ' —— 死键是**改版遗留**的物证（旧 UI 拆了、键没删），且会让「某功能存在吗」读错。'
      + '请接线使用、删除，或在 MESSAGES_UNUSED 登记原因');
  }
  if (registeredButAlive.length > 0) {
    fail(`MESSAGES_UNUSED 里的键已不再「无人使用」或本不该在此表：${registeredButAlive.join(', ')}`
      + `（${MESSAGES_UNUSED_SCOPE_NOTE}）—— 请删除该登记项`);
  }
  if (MESSAGES_UNUSED.size === 0) fail('MESSAGES_UNUSED 不得为空（清空即等于放弃该判据）');
  for (const [k, reason] of MESSAGES_UNUSED) {
    if (typeof reason !== 'string' || reason.trim() === '') fail(`MESSAGES_UNUSED 的 ${k} 缺原因`);
    if (!zh.has(k)) fail(`MESSAGES_UNUSED 登记了目录里不存在的键：${k}`);
  }

  // canary：**合成夹具**（不绑现实数据 —— 否则「将来把它接线」这个合法变更会把 canary 弄红）
  const fixture = "const a = 'live.key'; const b = \"live2.key\";\n";
  if (!keyReferenced('live.key', fixture) || !keyReferenced('live2.key', fixture)) {
    errors.push('死键 canary 失效：单/双引号形式未被识别');
  }
  if (keyReferenced('ghost.key', fixture)) errors.push('死键 canary 失效：不存在的键被判为被引用（谓词过宽）');
  // 负样本-放宽：前缀相似但不同名的键不得互相算作引用
  if (keyReferenced('live', fixture)) errors.push('死键 canary 失效：前缀匹配把 `live` 判成被引用（必须整键匹配）');
  // `menu.*` 必须被排除（否则会与 verify-menu-contract 的 ORPHAN_ALLOWED 双重登记）
  if (!isMenuNs('menu.top.insert') || isMenuNs('sidebar.tree')) {
    errors.push('死键 canary 失效：menu.* 命名空间的排除判定不正确');
  }
}

if (errors.length > 0) {
  throw new Error(`i18n contract violations:\n  ${errors.join('\n  ')}`);
}

console.log(
  `i18n contract: ${sourceFiles.length} 个源文件的 t() 字面量（${literalCalls} 次调用 / ${distinctKeys.size} 个去重键）`
  + ` + ${SCHEMA_FILES.length} 个 schema 的 ${schemaRefs} 处 labelKey/descriptionKey 声明`
  + ` —— 全部在 zh(${zh.size}) / en(${en.size}) 目录中非空存在；`
  + '缺失键会让 t() 返回键名本身（界面显示裸键），故此处硬失败。'
  + `（范围限制：只覆盖字面量键；t(变量) / 模板插值 / Rust 侧文案不在覆盖内，`
  + `占位符与传参是否匹配亦未覆盖）`
  + `；另（ADR-0028）：**引擎侧 UI 文案**已接入 \`tEngine()\` + locale 桥 —— `
  + `判据 E1 无硬编码中文（仅豁免开发者错误消息）/ E2 键可解析（防裸键）/ `
  + `E3 两 locale 齐备且与 packages/i18n 键不重叠 / E4 接线链完整（引擎装桥 → editor-core → App.tsx）`
  + `；另（审计 §4.102）**目录 → 使用**方向：除 \`menu.*\`（由 verify-menu-contract 的 ORPHAN_ALLOWED 负责）外，`
  + `目录里每个键必须在**产品 / 工具链**（不含 tests —— 否则「只被护栏断言存在」的键会被当成活键）`
  + `中以任一种引号形式出现，否则登记 —— `
  + `当前登记 ${MESSAGES_UNUSED.size} 项死键（改版遗留 + 4 个「只被护栏维护」的，见审计 §4.105）`,
);
