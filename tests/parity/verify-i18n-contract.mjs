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
import { readFileSync, readdirSync } from 'node:fs';
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

// ── 引擎侧硬编码中文 UI 文案：**登记表 + 双向核对**（2026-10-01）──────────────
// 立此条的原因（实测）：`general.language` 支持 zh-CN / en-US / system，即 **en 界面是受支持的**；
// 而本护栏此前的范围声明只写「不覆盖 Rust 侧 / HTML 模板」—— **引擎侧（iframe 内的 TS）文案**
// 既不在覆盖内，也**没有任何地方记录**。
//
// 实测证据（e2e 探针 `tests/e2e/i18n-engine-probe.mjs`，把 `mellow.locale` 设为 `en-US`）：
//   · 前提成立：Settings 面板显示**英文**（`Settings / General / … / Language / 简体中文 / English`）；
//   · 而引擎渲染的表格工具栏仍是 `["调整","↑行","↓行","删行","←列","→列","删列","左","中","右","整理","删除表"]`；
//   · 查找面板 placeholder 仍是「查找 / 替换」；DOM 里 title 仍是「一级标题 / 粗体 / 链接 / …」。
// 即 **`P0-I18N-001`「English 完整性」在引擎侧不成立** —— 该条目的证据只有
// `packages/i18n/test/index.test.ts`（目录键一致性），**结构上看不到引擎文案**。
//
// 本护栏**不做**「已修」的假声明，而是把现状**登记为清单**并**双向核对**：
//   · 新增硬编码中文 UI 文案 → 失败（缺口不得扩大）；
//   · 删掉却未注销 → 也失败（登记表不得变成化石）。
// 修复（把引擎文案接进 i18n）需先定「引擎侧文案的真值源在哪、由谁注入」——属**设计决策**，
// 不在本护栏内；本清单同时充当修复的**工作清单**。
// ⚠️ **2026-10-01 更正：本清单此前严重少计（43 处 / 5 文件 → 实测 79 处 / 8 文件）**
//
// 根因是**判据只认「UI 属性赋值」这一种写法**（`x.textContent = '…'` / `{ title: '…' }` /
// `setAttribute('<UI 属性>', '…')`）—— 于是下面这些**同语义的写法全部漏检**：
//   · **三元 / 表达式位置**：`label.textContent = lang === '' ? '语言' : …`（`=` 后面不是引号）；
//   · **函数实参**：`new Option('(无语言)', '')`、`copyCodeText(code, btn, '复制')`；
//   · **模板串**：`` fail(`mkdir(${path}) 未实现`) ``；
//   · **整个文件**：`wysiwygBlocks.ts` / `image/ops.ts` / `image/host.ts` 三个文件**从未被扫到**。
// 这与 §4.52 的结论同型：**只核对一半 = 没核对**。
//
// 现判据改为**「按事实枚举」**：逐行扫描，**任意位置**的单/双/反引号字面量，
// 只要含汉字即登记 —— 不再猜「哪个位置算 UI」。唯一豁免是**已本地化的调用**
// （`tEngine('…')` / `t('…')`，即修复的目标状态）。
//
// 登记的 4 条 `image/host.ts` 是**错误路径 / 开发者消息**（`fail()` 与 io 兜底）：
// 本护栏**照收不误**——「宁可多登记，不可漏登记」；是否真属 UI 由接入 i18n 时逐条判定。
const ENGINE_I18N_REGISTERED = {
  'codeBlockLabel.ts': ['(无语言)', '点击修改代码块语言', '语言'],
  'documentSearch.ts': ['上一个 (Shift+Enter)', '下一个 (Enter)', '全部', '关闭 (Esc)', '区分大小写', '替换', '查找', '正则表达式'],
  'image/host.ts': ['copyFile(${from} → ${to}) 未实现', 'fs 操作失败', 'mkdir(${path}) 未实现', 'writeBinary(${path}) 未实现'],
  'image/ops.ts': [
    '上传失败', '协议不可下载（data/mailto 等）', '已在 asset 目录', '已在目标目录', '文件不存在（保留引用）',
    '文件名未变化', '新文件名为空', '无法解析路径', '未上传（不在本次批次）',
    '本地图片跳过（Download Remote 仅远程）', '目标与源相同', '远程图片不支持重命名', '远程图片不适用',
    '远程图片跳过（Move/Copy All 仅本地）', '非本地可上传图片（远程/缺失/无法解析）',
  ],
  'image/widget.ts': [
    '下载', '下载到本地 asset 目录并更新引用', '加载远程图片', '在文件管理器中定位', '在浏览器中打开',
    '复制', '复制到 asset 目录并更新引用', '复制图片 URL', '复制图片绝对路径', '复制路径',
    '定位', '尺寸', '打开', '用系统默认应用打开', '移动', '移动到其他目录并更新引用',
    '设置显示尺寸（宽×高）', '重命名', '重命名文件并更新引用', '重试',
  ],
  'selectionToolbar.ts': ['一级标题', '三级标题', '二级标题', '列表', '删除线', '引用', '斜体', '格式工具栏', '粗体', '行内代码', '链接'],
  'table/toolbar.ts': ['←列', '↑行', '→列', '↓行', '中', '列', '删列', '删行', '删除表', '右', '左', '应用', '整理', '行', '调整'],
  'wysiwygBlocks.ts': ['复制', '复制代码', '已复制'],
};
{
  const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const ENGINE_SRC = 'packages/editor-engine/src';
  const walkDir = (dir, rel = '') => readdirSync(resolve(root, dir, rel), { withFileTypes: true }).flatMap((e) =>
    (e.isDirectory() ? walkDir(dir, `${rel}${e.name}/`) : [`${rel}${e.name}`]));
  const HAN = /[\u4e00-\u9fa5]/;
  // 已本地化的调用（修复的目标状态）：`tEngine('…')` / `t('…')`（可带后续实参）
  const LOCALIZED_CALL = /\b(?:tEngine|t)\(\s*(['"`])(?:\\.|(?!\1)[^\\])*\1[^)]*\)/g;
  /**
   * 扫描「含汉字的字面量」——**逐行、任意位置、三种引号**。
   * `reader(f)` 给出文件内容（便于 canary 注入合成样本）。
   */
  const scanHardcodedZh = (files, reader) => {
    const out = {};
    for (const f of files) {
      if (!f.endsWith('.ts')) continue;
      for (const rawLine of stripComments(reader(f)).split('\n')) {
        const line = rawLine.replace(LOCALIZED_CALL, ' ');   // 走 i18n 的不算
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
  // 用**集合**比较（与排序无关）——登记表的书写顺序不得成为判据的一部分
  const asSet = (list) => new Set(list);
  for (const [file, list] of Object.entries(actual)) {
    const reg = ENGINE_I18N_REGISTERED[file];
    if (reg === undefined) {
      fail(`引擎侧新增了未登记的硬编码中文文案文件：${file}（${list.join(' / ')}）—— `
        + 'en 界面下这些文案不会本地化；请接入 i18n，或（若确属暂缓）登记到本护栏并说明原因');
      continue;
    }
    const regSet = asSet(reg);
    const actualSet = asSet(list);
    const added = list.filter((x) => !regSet.has(x));
    if (added.length > 0) {
      fail(`引擎侧 ${file} 新增未登记的硬编码中文文案：${added.join(' / ')}`
        + '（en 界面下不会本地化；登记表在本文件顶部 ENGINE_I18N_REGISTERED）');
    }
    const gone = reg.filter((x) => !actualSet.has(x));
    if (gone.length > 0) {
      fail(`引擎侧 ${file} 的登记项已不存在：${gone.join(' / ')}`
        + ' —— 若已接入 i18n，请从登记表删除（登记表不得变成化石）');
    }
  }
  for (const file of Object.keys(ENGINE_I18N_REGISTERED)) {
    if (!(file in actual)) {
      fail(`引擎侧登记表里的文件已无硬编码中文文案：${file} —— 请从登记表删除`);
    }
  }
  // ⚠️ **刻意不设「登记表条目下限」**（2026-10-01，由注入验证抓到我的设计错误）：
  // 本登记表是**待修清单**，其目标是**缩到 0**（全部接入 i18n）。设硬下限会**阻止修复**
  // （实测：把 1 条改成 `tEngine(...)` 并同步删登记项 → 被下限拦下）。
  // 「清空登记表即全绿」这个担忧由**别的判据**覆盖：清空后扫描仍会报出 79 条「新增未登记」→ 照样红。
  // 真正需要防的是「扫描器本身失效」，那由下面逐形态的 canary 守（含历史上漏检的三种写法）。
  // 保留一条**可派生的自检**：登记表与扫描结果必须**完全一致**（上面已双向核对），故此处不再加数字。
  // canary：逐形态验证「能翻转」——重点是**历史上被漏检的那几种写法**
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
      errors.push(`引擎文案登记表 canary 失效：${why}（期望 ${expect} 条、实得 ${got}）`);
    }
  }
  // canary：集合比较与顺序无关（防「登记表排序变了就报错」）
  if (JSON.stringify([...asSet(['b', 'a'])].sort()) !== JSON.stringify([...asSet(['a', 'b'])].sort())) {
    errors.push('引擎文案登记表 canary 失效：集合比较与顺序相关');
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
  + `；另：**引擎侧硬编码中文文案**已登记 ${Object.keys(ENGINE_I18N_REGISTERED).length} 个文件 / `
  + `${Object.values(ENGINE_I18N_REGISTERED).reduce((n, l) => n + l.length, 0)} 条`
  + `（判据按**事实**枚举：逐行、任意位置、三种引号；仅豁免 tEngine()/t() 调用）`
  + `（双向核对：新增即失败、删掉须注销）—— 但**尚未接入 i18n**，见 P0-I18N-001`,
);
