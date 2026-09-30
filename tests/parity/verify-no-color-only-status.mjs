/**
 * 「状态不得仅靠颜色表达」护栏（2026-09-30）。
 *
 * 依据：`docs/specs/desktop-ui-design-spec.md` §19 Accessibility 第 6 条
 * **`no color-only status`**。该条此前**无人守**（审计 §4.19）：全仓搜
 * `color-only|仅颜色|颜色.*唯一|color alone` 命中 0，无障碍审计文档的 6 项基准
 * 与 spec §19 的 6 条是**两处独立维护的清单**，差集（正是这一条）永远不会被发现。
 *
 * 本护栏把该条变成**机器可核对**的三件事：
 *
 * ① **语义状态色使用点清单锁**：扫出所有「用语义状态色（danger/warning/success）
 *    表达状态」的位置（`styles.css` 的规则选择器 + 内联 `var(--mellow-…)` 的样式键），
 *    断言集合**恰好等于**下面的 REGISTRY。新增一处未登记 → 失败（逼登记）。
 *    登记了但源码里已消失 → 也失败（防登记表退化成化石）。
 * ② **每个使用点必须声明非颜色线索，且该线索可核实**：`nonColor: 'text'` 要求
 *    指向「渲染可读文本」的具体锚点；`nonColor: 'pattern'` 要求指向「非颜色的
 *    形态差异」（如 wavy 下划线）。锚点必须真的在文件里 —— 删掉文本 / 删掉形态
 *    → 失败。**只登记不核实 = 纸面门禁**，故锚点必须是可断言的字符串。
 * ③ **`status` 状态的两端配对**：`StatusBar` 的 `.status` 元素靠 `className` 里的
 *    `status` 值换色，语义全靠 `statusText`；故 ① 元素必须渲染文本，
 *    ② 宿主每次 `setStatus('<非idle>')` 必须紧接着 `setStatusText(...)`。
 *
 * ⚠️ **范围限制（如实声明，不要读成「无障碍已达标」）**：
 *   - 本护栏只覆盖**语义状态色**这条路径。用非语义色（如 `--mellow-accent`）或
 *     纯 CSS 渐变/背景图表达状态的元素**不在覆盖内**。
 *   - 扫描面：**全部 `.css`** ＋ `apps/〈pkg〉/src` 与 `packages/〈pkg〉/src` 下的 `.ts/.tsx`。
 *     （注：本行避免写出「星号 + 斜杠」的字面组合 —— 它会**提前终止上面的块注释**。）
 *     **vendored 的 `packages/editor-core/CoreEditor` 的 TS/TSX 不在内**
 *     （实测其源码 0 处引用 `--mellow-*` 语义色；若将来引入，本护栏会漏 —— 需同步扩面）。
 *   - 「有无文本」是**静态可判定**的代理指标，**不等于** WCAG 1.4.1 合规：
 *     对比度、色盲可辨识度、屏幕阅读器语义（`role`/`aria-label`）**均不判定**。
 *   - spec §19 其余 5 条（keyboard complete / focus visible / 200% zoom /
 *     reduced motion / screen reader baseline）**不在此护栏**。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const errors = [];
const fail = (message) => errors.push(message);
// Windows CI 以 CRLF 检出源码：不归一化会让下方锚点断言全部失配（假绿）。
const read = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');

// ── 登记表 ────────────────────────────────────────────────────────────────
// surface —— CSS 选择器（原样，与 styles.css 中一致）或 `<文件>#<样式键常量>`
// file    —— 该使用点所在的样式文件
// nonColor—— 'text'（渲染可读文本）| 'pattern'（非颜色的形态差异）
// evidence—— [文件, 锚点]；锚点必须原样出现在该文件中
const REGISTRY = [
  {
    surface: '.status.error',
    file: 'apps/desktop/src/styles.css',
    nonColor: 'text',
    evidence: ['packages/desktop-ui/src/StatusBar.tsx', '{statusText}'],
    note: '状态栏状态文本；换色只是附加，语义由 statusText 承载',
  },
  {
    surface: '.search-regex-invalid',
    file: 'apps/desktop/src/styles.css',
    nonColor: 'text',
    evidence: ['apps/desktop/src/App.tsx', "{t('search.regexInvalid')}"],
    note: '搜索框「正则非法」就地提示，且带 role="alert"',
  },
  {
    surface: '.recovery-bar',
    file: 'apps/desktop/src/styles.css',
    nonColor: 'text',
    evidence: ['apps/desktop/src/App.tsx', "{t('recovery.title'"],
    note: '崩溃恢复横幅标题',
  },
  {
    surface: '.recovery-item',
    file: 'apps/desktop/src/styles.css',
    nonColor: 'text',
    evidence: ['apps/desktop/src/App.tsx', "{t('recovery.revision'"],
    note: '恢复项：路径 + 修订号',
  },
  {
    surface: '.recovery-item button',
    file: 'apps/desktop/src/styles.css',
    nonColor: 'text',
    evidence: ['apps/desktop/src/App.tsx', "{t('recovery.recover')}"],
    note: '恢复项按钮（按钮文案即文本）',
  },
  {
    surface: '.conflict-bar',
    file: 'apps/desktop/src/styles.css',
    nonColor: 'text',
    evidence: ['apps/desktop/src/App.tsx', "{t('conflict.title'"],
    note: '外部变更冲突横幅标题',
  },
  {
    surface: '.conflict-bar button',
    file: 'apps/desktop/src/styles.css',
    nonColor: 'text',
    evidence: ['apps/desktop/src/App.tsx', "{t('conflict.keepLocal')}"],
    note: '冲突项按钮（按钮文案即文本）',
  },
  {
    surface: '.update-bar-error',
    file: 'apps/desktop/src/styles.css',
    nonColor: 'text',
    evidence: ['apps/desktop/src/App.tsx', "{t('updater.checkFailed')}"],
    note: '自动更新「检查失败」态；文案随 phase 切换',
  },
  {
    surface: '.rollback-bar',
    file: 'apps/desktop/src/styles.css',
    nonColor: 'text',
    evidence: ['apps/desktop/src/App.tsx', "{t('updater.rollbackPrompt'"],
    note: '回滚提示横幅',
  },
  {
    surface: 'packages/editor-engine/src/mdLink.ts#LINK_BROKEN_CLASS',
    file: 'packages/editor-engine/src/mdLink.ts',
    nonColor: 'pattern',
    evidence: ['packages/editor-engine/src/mdLink.ts', "textDecoration: 'underline wavy'"],
    note: '断链指示：暗红之外必须有非颜色的形态差异（wavy），否则色盲用户不可辨（2026-09-30 修复）',
  },
];

// ── 扫描面 ────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', '.workbuddy-ai', 'archive', 'dist', 'target', 'build']);
const SEMANTIC_VAR = /--mellow-(?:danger|warning|success)[\w-]*/g;
// 变量**定义**处（主题包）不算「使用点」——那里只是给变量赋值，不表达任何界面状态。
const DEFINITION_ONLY = ['packages/themes/src/index.ts'];

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
const cssFiles = allFiles.filter((f) => f.endsWith('.css'));
const srcFiles = allFiles.filter(
  (f) => /^(?:apps|packages)\/[^/]+\/src\//.test(f) && /\.tsx?$/.test(f),
);

/** 剥注释：先剥 `/* … *​/`（含跨行），否则注释里的示例会被当成真使用点。 */
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
/** 只剥**整行** `//` 注释：行尾 `//` 可能落在字符串里，剥了会误伤锚点。 */
const stripLineComments = (s) => s.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
/**
 * 文本锚点必须落在**真正的 JSX 表达式容器**里，而不是属性值 / 普通字符串：
 *   ① 锚点以 `{` 开头（表达式容器的起始）；
 *   ② 该 `{` 的前一个非空白字符**不是** `=` / `"` / `'`（否则是 `attr="{…}"` 这类属性值）。
 * 只查「后面有个 `}`」是不够的 —— 那在属性值里同样成立。
 * 抽成函数是为了让 canary 能**直接测它两个方向**。
 */
function textAnchorProblem(body, anchor) {
  const at = body.indexOf(anchor);
  if (at < 0) return `锚点在文件中不存在（${anchor}）`;
  if (!anchor.startsWith('{')) return `锚点不以 '{' 开头（${anchor}）→ 无法证明是 JSX 表达式`;
  const prev = body.slice(0, at).replace(/\s+$/, '').slice(-1);
  if (prev === '=' || prev === '"' || prev === "'") {
    return `锚点落在属性值里（前一个字符是 ${prev}）→ 无法证明渲染了文本`;
  }
  return null;
}

/**
 * 花括号深度感知的 CSS 规则切分。
 * 不用 `/([^{}]+)\{([^{}]*)\}/` —— 那种写法在 `@media { … }` 嵌套下会把内层规则
 * 并进外层 body，报出的选择器是 `@media …`（错的选择器比漏报更难查）。
 */
function cssRules(css) {
  const rules = [];
  const stack = [];
  let preludeStart = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      stack.push({ selector: css.slice(preludeStart, i).trim().replace(/\s+/g, ' '), bodyStart: i + 1 });
      preludeStart = i + 1;
    } else if (c === '}') {
      const frame = stack.pop();
      if (frame !== undefined) rules.push({ selector: frame.selector, body: css.slice(frame.bodyStart, i) });
      preludeStart = i + 1;
    } else if (c === ';' && stack.length === 0) {
      preludeStart = i + 1; // `@import …;` 之类的语句不是规则
    }
  }
  return rules;
}

/**
 * 定位内联语义色所属的样式键常量（CM 主题里写作 ``[`.${CONST}`]: { … }``）。
 *
 * ⚠️ **不能只看「最近的 `${CONST}`」**：若它**之后**已经出现过 `}`，说明那条规则已经闭合，
 * 这个用法不属于它。实测（2026-09-30 注入验证 M8）：把 `[`.${LINK_BROKEN_CLASS}`]:`
 * 换成字面量键后，护栏把该用法**错误归属**到上一条规则的 `${LINK_CLASS}` ——
 * 而 `LINK_CLASS` 是已登记的，于是**新用法被静默吞掉**（正是「护栏看不见我」）。
 * 故：`${CONST}` 之后若还有 `}`，一律**响亮失败**（宁可要求同步护栏，也不要错误归属）。
 *
 * ⚠️ 边界要按 token 的**结束位置**算：`${CONST}` **自身就含一个 `}`**，
 * 用起始位置比较会把「占位符自己的右花括号」当成规则闭合 —— 首跑即误报。
 *
 * 返回 `{ key }` 或 `{ problem }`；抽成函数是为了让 canary 能**直接测边界两个方向**。
 */
function inlineKeyOf(src, index) {
  const before = src.slice(Math.max(0, index - 2000), index);
  const key = [...before.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/g)].pop();
  if (key === undefined) return { problem: '未找到样式键常量' };
  const keyEnd = key.index + key[0].length;
  if (before.lastIndexOf('}') > keyEnd) {
    return { problem: '最近的样式键常量之后已出现右花括号，该用法不在那条规则内' };
  }
  return { key: key[1] };
}

// ── ① 收集实际使用点 ──────────────────────────────────────────────────────
const discovered = new Set();

for (const file of cssFiles) {
  const css = stripCssComments(read(file));
  for (const rule of cssRules(css)) {
    if (rule.selector.startsWith('@')) continue; // at-rule 的 body 含内层规则，内层会单独上报
    if (SEMANTIC_VAR.test(rule.body)) discovered.add(rule.selector);
    SEMANTIC_VAR.lastIndex = 0;
  }
}

for (const file of srcFiles) {
  if (DEFINITION_ONLY.includes(file)) continue;
  const src = stripLineComments(read(file));
  SEMANTIC_VAR.lastIndex = 0;
  let m;
  while ((m = SEMANTIC_VAR.exec(src)) !== null) {
    const found = inlineKeyOf(src, m.index);
    if (found.problem !== undefined) {
      fail(
        `${file} 内联语义色无法确定所属样式键（${m[0]}）：${found.problem}`
        + ' → 请同步更新本护栏，不要让它错误归属或静默漏检',
      );
      continue;
    }
    discovered.add(`${file}#${found.key}`);
  }
}

// ── ② 双向核对登记表 ──────────────────────────────────────────────────────
const registered = new Set(REGISTRY.map((e) => e.surface));
for (const surface of discovered) {
  if (!registered.has(surface)) {
    fail(
      `发现未登记的「语义状态色使用点」：${surface}\n`
      + '    → 请在 verify-no-color-only-status.mjs 的 REGISTRY 登记它，并声明非颜色线索'
      + '（text 或 pattern）+ 可核实的锚点。spec §19 要求状态不得仅靠颜色表达。',
    );
  }
}
for (const surface of registered) {
  if (!discovered.has(surface)) {
    fail(`REGISTRY 登记的 ${surface} 在源码中已不存在 → 请删除该登记（防止登记表退化成化石）`);
  }
}

// ── ③ 每条登记的非颜色线索必须可核实 ─────────────────────────────────────
for (const entry of REGISTRY) {
  const [file, anchor] = entry.evidence;
  if (!existsSync(resolve(root, file))) {
    fail(`${entry.surface} 的证据文件不存在：${file}`);
    continue;
  }
  const body = stripLineComments(read(file));
  if (!body.includes(anchor)) {
    fail(
      `${entry.surface} 声明的非颜色线索（${entry.nonColor}）在 ${file} 中已找不到锚点 ${JSON.stringify(anchor)}\n`
      + '    → 该状态现在可能只剩颜色可辨（spec §19 违规），或锚点已漂移；两种情况都必须处理。',
    );
  }
  // 锚点**允许是前缀**（如 `{t('recovery.title'`）—— 这样 i18n 参数变动不会让登记漂移。
  // 但必须证明它落在真正的 JSX 表达式容器里（见 textAnchorProblem）。
  if (entry.nonColor === 'text') {
    const problem = textAnchorProblem(body, anchor);
    if (problem !== null) fail(`${entry.surface} 声明 nonColor='text' 但 ${problem}`);
  }
}

// ── ④ status 状态的两端配对 ───────────────────────────────────────────────
// 前端：StatusBar 的 .status 元素必须渲染 statusText（否则只剩颜色）。
{
  const p = 'packages/desktop-ui/src/StatusBar.tsx';
  const src = read(p);
  const el = src.match(/className=\{`status \$\{status\}`\}[^>]*>\{([^}]*)\}/);
  if (el === null) {
    fail(`${p} 中找不到 .status 元素（选择器或结构已变）→ 请同步更新本护栏，不要让它静默漏检`);
  } else if (el[1].trim() !== 'statusText') {
    fail(`${p} 的 .status 元素渲染的不是 statusText（而是 ${JSON.stringify(el[1])}）→ 状态语义可能只剩颜色`);
  }
}
// 宿主：每次 setStatus('<非 idle>') 必须紧接着 setStatusText(...)
{
  const p = 'apps/desktop/src/App.tsx';
  const lines = read(p).split('\n');
  let checked = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/setStatus\('(?!idle')/);
    if (m === null) continue;
    checked += 1;
    const next = lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
    if (!/^\s*setStatusText\(/.test(next)) {
      fail(
        `${p}:${i + 1} 的 ${lines[i].trim()} 未紧接 setStatusText(...)\n`
        + '    → 状态文本不变时，状态变化将只剩颜色可辨（spec §19 违规）。',
      );
    }
  }
  if (checked === 0) {
    fail(`${p} 中未找到任何 setStatus('<非 idle>') 调用点 → 断言已失效，请同步更新本护栏`);
  }
}

// ── ⑤ canary：自检每条断言真的会失败 ─────────────────────────────────────
// 样本一律用**拼接**构造，避免护栏把自己的字面量当成真使用点。
{
  const V = '--mellow-' + 'danger'; // 拼接，防护栏扫到自己
  const sampleCss = `.x-broken-canary { color: var(${V}); }`;
  const found = cssRules(stripCssComments(sampleCss)).filter((r) => new RegExp(V).test(r.body));
  if (found.length !== 1 || found[0].selector !== '.x-broken-canary') {
    fail('CSS 规则切分 canary 失效：未能在样本中定位到使用点（护栏已失去检出能力）');
  }
  if (registered.has('.x-broken-canary')) {
    fail('canary 样本与登记表撞名（护栏自检无意义）');
  }
}
{
  // 嵌套 @media：内层规则必须报出内层选择器，而不是 `@media …`
  const V = '--mellow-' + 'warning';
  const nested = `@media (max-width: 600px) { .nested-canary { background: var(${V}-bg); } }`;
  const rules = cssRules(stripCssComments(nested));
  const inner = rules.find((r) => r.selector === '.nested-canary');
  if (inner === undefined) {
    fail('嵌套 @media canary 失效：内层选择器未被单独上报（会报成 @media → 错的选择器比漏报更难查）');
  }
}
{
  // 注释里的使用点不得被计入
  const V = '--mellow-' + 'success';
  const commented = `/* .commented-canary { color: var(${V}); } */\n.ok { color: #000; }`;
  const found = cssRules(stripCssComments(commented)).filter((r) => new RegExp(V).test(r.body));
  if (found.length !== 0) {
    fail('注释剥离 canary 失效：注释里的使用点被当成了真使用点');
  }
}
{
  // 配对断言本身必须能失败：构造「setStatus 后不跟 setStatusText」的样本
  const lines = ["setStatus('error');", 'doSomethingElse();'];
  const i = 0;
  const next = lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
  if (/^\s*setStatusText\(/.test(next)) {
    fail('配对断言 canary 失效：明显不配对的样本被判为配对');
  }
}
{
  // 归属键边界：`${CONST}` **自身含一个 `}`**，故边界必须按 token 结束位置算。
  // 两个方向都要验：规则内 → 取到正确键；规则已闭合 → 响亮失败（不得错误归属）。
  const V = '--mellow-' + 'danger';
  const insideRule = '[`.${CANARY_A}`]: {\n  color: `var(' + V + ')`,\n}';
  const afterClosedRule = '[`.${CANARY_B}`]: {\n  color: `#000`,\n},\n[literalKey]: {\n  color: `var(' + V + ')`,\n}';
  const a = inlineKeyOf(insideRule, insideRule.indexOf(V));
  const b = inlineKeyOf(afterClosedRule, afterClosedRule.indexOf(V));
  if (a.key !== 'CANARY_A') {
    fail(`归属键 canary 失效：规则内的用法未取到正确样式键（得到 ${JSON.stringify(a)}）`);
  }
  if (b.problem === undefined) {
    fail(`归属键 canary 失效：规则已闭合的用法仍被错误归属（得到 ${JSON.stringify(b)}）`);
  }
}
{
  // 前缀形态 + JSX 容器判定必须**两个方向**都对：
  // ① 容器内的前缀锚点 → 过；② 属性值里的锚点 → 挂；③ 锚点不存在 → 挂。
  const anchor = "{t('canary.key'";
  const inContainer = `…<span>{t('canary.key', { n: 1 })}</span>…`;
  const inAttrValue = `…<div title="{t('canary.key', { n: 1 })}">…`;
  const absent = '…<span>no anchor here</span>…';
  if (textAnchorProblem(inContainer, anchor) !== null) {
    fail('JSX 容器 canary 失效：容器内的前缀锚点被判为不合法');
  }
  if (textAnchorProblem(inAttrValue, anchor) === null) {
    fail('JSX 容器 canary 失效：属性值里的锚点被判为合法（「渲染了文本」将无依据）');
  }
  if (textAnchorProblem(absent, anchor) === null) {
    fail('JSX 容器 canary 失效：不存在的锚点被判为合法');
  }
}
{
  // 证据锚点断言本身必须能失败（否则「锚点可核实」是句空话）
  const body = "textDecoration: 'underline'";
  if (body.includes("textDecoration: 'underline wavy'")) {
    fail('证据锚点 canary 失效：缺失锚点的样本被判为命中');
  }
}

if (errors.length > 0) {
  throw new Error(`Color-only status violations:\n  ${errors.join('\n  ')}`);
}

console.log(
  `状态-颜色独立性护栏：${REGISTRY.length} 个语义状态色使用点已登记且非颜色线索可核实`
  + `（扫描 ${cssFiles.length} 个 CSS + ${srcFiles.length} 个 TS/TSX；`
  + `text ${REGISTRY.filter((e) => e.nonColor === 'text').length} / `
  + `pattern ${REGISTRY.filter((e) => e.nonColor === 'pattern').length}）。`,
);
