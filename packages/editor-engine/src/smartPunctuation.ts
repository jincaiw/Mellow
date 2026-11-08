/**
 * Smart Punctuation（Typora parity master-plan R2-1：智能标点）。
 *
 * 行为（对齐 Typora「偏好设置 → 通用 → 智能标点」）：
 * - smart quotes：输入 `"` / `'` 按上下文转为成对弯引号（“ ” / ‘ ’）
 * - smart dash：行内第二个 `-` → en dash `–`，再输入 `-` → em dash `—`；`...` → `…`
 *   `twoHyphensToEm` 开启时第二键即为 em dash；渲染档将 `--` / `---` 都显示为 em dash。
 *   （避开 hr `---` 与表格 delimiter 行；代码、显式转义的省略号保留源码）
 *
 * 开关经 iframe `__MELLOW_SMART_PUNCTUATION__` 注入（默认关闭，与 Typora 默认一致）；
 * IME composition 期间 CodeMirror 不触发 inputHandler，天然安全（composition guard 不受影响）。
 *
 * **智能引号 / 智能破折号是两个独立开关**（G7-MENU-05，Typora `smartQuote` /
 * `smartDash` 同构）：输入期与渲染期两条路径都分别过滤，任一开启即互不牵连。
 * 历史组合 API `setSmartPunctuation` / `isSmartPunctuationEnabled` 保留兼容语义：
 * set 同时设置两者，get 返回「任一开启」。
 *
 * EditorView 经 window.require 延迟解析（引擎约定：iframe 内不能有裸 ESM 导入
 * @codemirror/* —— 浏览器静态 ESM 无法解析 bare specifier，2026-08-22 j17 排查发现
 * 此处裸导入导致整个 engine 模块图加载失败 → 白屏级故障）。
 */

import { isComposing } from './composition';
import { isSourceMode } from './mode';

/**
 * 模块级开关（宿主注入；默认关闭）。
 *
 * 拆成**两个独立开关**（G7-MENU-05）：Typora 的 `smartQuote` / `smartDash` 是
 * 两个独立偏好，Edit → Substitutions 里分别勾选。Mellow 原先把二者绑在单一
 * `smartPunctuationEnabled` 上 ⇒ 只能全开/全关。
 */
let smartQuotesEnabled = false;
let smartDashesEnabled = false;
let twoHyphensToEm = false;

/** Typora 默认 false：-- → en dash；开启后 -- → em dash。 */
export function setTwoHyphensToEm(enabled: boolean): void {
  if (twoHyphensToEm === enabled) return;
  twoHyphensToEm = enabled;
  bumpRenderVersion();
}

export function isTwoHyphensToEm(): boolean {
  return twoHyphensToEm;
}

/**
 * **兼容 API**（旧宿主仍可调用；旧组合设置键由 Settings Store 迁移）：
 * `set` 同时设置智能引号与智能破折号；`get` 在**任一**开启时返回 true。
 *
 * 语义选择理由：调用方只可能想表达「智能标点这一族开/关」；两个独立开关
 * 另有 `setSmartQuotes` / `setSmartDashes`。`get` 取「或」而非「与」——
 * 否则只开智能引号的用户会被旧 API 报告为「关闭」，与其实际行为不符。
 */
export function setSmartPunctuation(enabled: boolean): void {
  const changed = smartQuotesEnabled !== enabled || smartDashesEnabled !== enabled;
  smartQuotesEnabled = enabled;
  smartDashesEnabled = enabled;
  if (changed) bumpRenderVersion();
}

export function isSmartPunctuationEnabled(): boolean {
  return smartQuotesEnabled || smartDashesEnabled;
}

/** 智能引号独立开关（Typora `smartQuote`） */
export function setSmartQuotes(enabled: boolean): void {
  if (smartQuotesEnabled === enabled) return;
  smartQuotesEnabled = enabled;
  bumpRenderVersion();
}

export function isSmartQuotesEnabled(): boolean {
  return smartQuotesEnabled;
}

/** 智能破折号独立开关（Typora `smartDash`） */
export function setSmartDashes(enabled: boolean): void {
  if (smartDashesEnabled === enabled) return;
  smartDashesEnabled = enabled;
  bumpRenderVersion();
}

export function isSmartDashesEnabled(): boolean {
  return smartDashesEnabled;
}

/**
 * **转换时机**开关（Typora `convertSmartOnRender`，2026-10-08 审计 §4.150）。
 *
 * - `false`（**默认**）= **输入时**转换：与 Typora 的 `"Convert on Input"` 档一致（现状）。
 * - `true` = **渲染时**转换：**输入与落盘保持 ASCII**，只在**显示**上呈现弯引号 / em dash
 *   （Typora 的 `"Convert on Rendering"` 档，对 git 友好）。
 *
 * ⚠️ 与 Typora 同构：**两个档都要求功能开关本身为开**（Typora 侧是 `smartQuote` / `smartDash`，
 *   二者默认 `false` ⇒ 默认不转换；Mellow 侧是 `smartQuotesEnabled` / `smartDashesEnabled`，
 *   两者各自独立判定）。
 *   渲染期档开启时，**输入期改写必须停用** —— Typora 的输入分支写作
 *   `File.option.smartQuote && !File.option.convertSmartOnRender && …`（`!` 是同一语义）。
 */
let smartPunctuationOnRender = false;

export function setSmartPunctuationOnRender(enabled: boolean): void {
  if (smartPunctuationOnRender === enabled) return;
  smartPunctuationOnRender = enabled;
  bumpRenderVersion();
}

export function isSmartPunctuationOnRender(): boolean {
  return smartPunctuationOnRender;
}

/** 宿主 → iframe 智能标点通道（R2-1；`setOnRender` 于 2026-10-08 审计 §4.150 增补；
 *  独立引号/破折号开关于 G7-MENU-05 增补，`setQuotes`/`setDashes` 与 Typora
 *  Edit → Substitutions → Smart Quotes / Smart Dashes 两项对应） */
export interface SmartPunctuationApi {
  set(v: boolean): void;
  get(): boolean;
  setOnRender(v: boolean): void;
  getOnRender(): boolean;
  setQuotes(v: boolean): void;
  getQuotes(): boolean;
  setDashes(v: boolean): void;
  getDashes(): boolean;
  setTwoHyphensToEm(v: boolean): void;
  getTwoHyphensToEm(): boolean;
}

/** 挂到 iframe window，宿主（EditorCore）经 contentWindow 调用 */
export function installSmartPunctuationApi(): void {
  installCompositionRefresh();
  (window as unknown as { __MELLOW_SMART_PUNCTUATION__?: SmartPunctuationApi }).__MELLOW_SMART_PUNCTUATION__ = {
    set: setSmartPunctuation,
    get: isSmartPunctuationEnabled,
    setOnRender: setSmartPunctuationOnRender,
    getOnRender: isSmartPunctuationOnRender,
    setQuotes: setSmartQuotes,
    getQuotes: isSmartQuotesEnabled,
    setDashes: setSmartDashes,
    getDashes: isSmartDashesEnabled,
    setTwoHyphensToEm,
    getTwoHyphensToEm: isTwoHyphensToEm,
  };
}

// ─────────────── 渲染期装饰刷新（开关运行期变更需立即重绘） ───────────────
//
// 渲染期插件原先只在 docChanged / viewportChanged / selectionSet 时重算：
// 宿主在**无输入**的情况下切换「智能引号 / 智能破折号」时，装饰会停留在旧状态
// 直到下一次按键。这里沿用 `codeLineNumbers.ts` 的既有约定：
// version 计数器 + 活跃 view 注册表 + 空 effect 事务触发 update。

let renderVersion = 0;
const activeRenderViews = new Set<import('@codemirror/view').EditorView>();
let compositionRefreshInstalled = false;

/** 渲染期装饰的版本号（开关变更时 +1；ViewPlugin 据此重建） */
export function smartPunctuationRenderVersion(): number {
  return renderVersion;
}

/** 开关变更后主动唤醒所有已挂载的渲染插件（无输入也立即刷新） */
function bumpRenderVersion(): void {
  renderVersion += 1;
  for (const view of activeRenderViews) {
    view.dispatch({ effects: [] });
  }
}

/**
 * 合成期间开关变更只记版本、不重建装饰（spec §6 Composition Guard）——
 * 合成结束必须补一次刷新，否则「合成中切开关」会一直停在旧显示。
 */
function installCompositionRefresh(): void {
  if (compositionRefreshInstalled || typeof document === 'undefined') return;
  compositionRefreshInstalled = true;
  // 用微任务延后：`compositionend` 的监听器注册顺序不保证（本模块可能先于
  // `installCompositionTracking` 注册），同步派发会读到仍是 true 的 composing 标志。
  // 微任务在事件派发全部同步监听器跑完后执行 ⇒ 状态已复位。
  document.addEventListener('compositionend', () => {
    queueMicrotask(() => {
      for (const view of activeRenderViews) {
        view.dispatch({ effects: [] });
      }
    });
  });
}

/** 词首判定：前字符为空/行首/开括号/空白/常见开引号 → 输出左引号 */
function isWordStart(prev: string): boolean {
  if (prev === '') return true;
  return /[\s([{‘“（《〈【]/.test(prev);
}

/** 语法树节点的最小结构形状（避免顶层裸导入 @lezer/common） */
interface SyntaxNodeLike {
  name: string;
  parent: SyntaxNodeLike | null;
}

interface LanguageModuleLike {
  syntaxTree(state: import('@codemirror/state').EditorState): {
    resolveInner(pos: number, side: number): SyntaxNodeLike;
  };
}

let languageModule: LanguageModuleLike | null = null;

/** 延迟解析 @codemirror/language（同 EditorView：iframe 内不能裸导入 CM6 模块） */
function resolveLanguage(): LanguageModuleLike {
  if (languageModule === null) {
    languageModule = (window as unknown as { require: (id: string) => LanguageModuleLike })
      .require('@codemirror/language');
  }
  return languageModule;
}

/**
 * 代码上下文节点名（spec §11 行内代码 / §16 代码围栏）：其内**不得**应用智能标点。
 */
const CODE_CONTEXT_NODES: ReadonlySet<string> = new Set([
  'InlineCode', 'FencedCode', 'CodeBlock', 'CodeText', 'CodeInfo', 'CodeMark',
]);

/**
 * `pos` 是否处于**代码上下文**内（spec §11「inline code … no autocorrect」/ §16「code text always source」）。
 *
 * **为什么必须显式判定**：本 inputHandler 是全局的、没有代码感知。开启智能标点后，
 * 在 `` `code` `` 或代码围栏内键入 `"` 会被改写成弯引号 —— 那是对**代码文本**的静默改写，
 * 违反 spec §2「Markdown Text 唯一真源」与 §16。此前的用例
 * （`format-code-fence.test.ts`「code 内编辑保留源码（无 smart punctuation 改写）」）
 * 用**程序化 `dispatch`**，而 inputHandler 只对**用户输入**触发 → 该断言恒真、覆盖为零
 *（2026-10-01 审计 §4.35）。
 *
 * **判定方式**：走语法树父链（O(树深)，**不是**全文扫描，故大文档下按键代价可忽略）。
 * `resolveInner(pos, -1)` 偏好「在 pos 处结束的节点」，因此 `pos` 落在代码节点
 * **闭区间**内即判定为代码上下文（含紧邻右边界 —— 偏保守：宁可少转一个弯引号，
 * 也不改写代码）。
 */
export function isInsideCodeContext(
  state: import('@codemirror/state').EditorState,
  pos: number,
): boolean {
  let node: SyntaxNodeLike | null = resolveLanguage().syntaxTree(state).resolveInner(pos, -1);
  while (node !== null) {
    if (CODE_CONTEXT_NODES.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

/** 与 Typora shouldTriggerReplace 同型：代码、链接目标、图片路径与 HTML 源码不做智能替换。 */
export function isProtectedPunctuationContext(
  state: import('@codemirror/state').EditorState,
  pos: number,
): boolean {
  if (isInsideCodeContext(state, pos)) return true;
  let node: SyntaxNodeLike | null = resolveLanguage().syntaxTree(state).resolveInner(pos, -1);
  while (node !== null) {
    if (node.name === 'URL' || node.name === 'Autolink' || node.name === 'HTMLTag'
      || node.name === 'HTMLBlock' || node.name === 'ProcessingInstruction' || node.name === 'CommentBlock') return true;
    node = node.parent;
  }
  const line = state.doc.lineAt(pos);
  const prefix = line.text.slice(0, pos - line.from);
  // 尚未闭合的目标没有 URL 节点；输入中也必须保留原始路径。
  return /\]\([^\s)]*$/.test(prefix)
    || /(?:https?:\/\/|www\.)\S*$/i.test(prefix)
    || prefix.lastIndexOf('<') > prefix.lastIndexOf('>');
}

/** 弯引号转换：`"` → “/”，`'` → ‘/’；其他字符原样返回 */
export function smartQuoteFor(input: string, prev: string): string {
  const opening = isWordStart(prev);
  if (input === '"') return opening ? '“' : '”';
  if (input === "'") return opening ? '‘' : '’';
  return input;
}

/** 奇数个反斜杠表示转义；输入 / 渲染两条路径均保留显式转义的省略号。 */
function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

/** 表格 delimiter 行判定（含 `|` 的分隔行，如 `| --- | :-: |`） */
function isTableDelimiterLine(line: string): boolean {
  return line.includes('|');
}

/**
 * 历史兼容判定（保留公开导出）：光标前文本以 `--` 结尾且输入空格时是否替换为 `—`。
 * 当前输入 / 渲染路径采用第二 / 第三个连字符规则，不再调用本函数。
 * 安全约束：
 * - `--` 不在行首（避开 hr `---` 输入中途）
 * - `--` 前一字符不是 `-`（避免三连击中途替换）
 * - 所在行不是表格 delimiter 行（`| --- |` 内不替换）
 */
export function shouldEmDash(lineBefore: string): boolean {
  if (!lineBefore.endsWith('--')) return false;
  const dashStart = lineBefore.length - 2;
  if (dashStart === 0) return false; // 行首 `--` → hr 输入中途，不替换
  if (lineBefore[dashStart - 1] === '-') return false; // `---` 中途
  if (isTableDelimiterLine(lineBefore)) return false;
  return true;
}

/** 不改写行首结构、表格分隔行、显式转义和 HTML 标记。 */
function canConvertDash(line: string, start: number): boolean {
  const prefix = line.slice(0, start);
  return prefix.replace(/[-–—]/g, '').trim().length > 0
    && !isTableDelimiterLine(line)
    && !isEscaped(line, start)
    && prefix.lastIndexOf('<') <= prefix.lastIndexOf('>');
}

/**
 * inputHandler：拦截直引号、第二 / 第三个连字符与第三个句点。
 * 返回 true = 已处理（CodeMirror 不再插入原字符）。
 * view 类型用结构化形状（避免顶层裸导入 @codemirror/view，见文件头注释）。
 */
function handleSmartPunctuation(view: {
  state: import('@codemirror/state').EditorState;
  dispatch: (spec: import('@codemirror/state').TransactionSpec) => void;
}, from: number, to: number, text: string): boolean {
  // 两个独立开关任一开启即可进入（下面按字符再各自过滤）——
  // 不能在这里用「二者皆关」之外的判断，否则只开其一的功能会被整段跳过。
  if (!smartQuotesEnabled && !smartDashesEnabled) return false;
  // 渲染期档（Typora `convertSmartOnRender`）开启时**不在输入期改写** ——
  // 与 Typora 的输入分支 `… && !File.option.convertSmartOnRender && …` 同语义。
  if (smartPunctuationOnRender) return false;
  // spec §11 / §16：代码上下文（行内代码 / 代码围栏）内**不得**改写 ——
  // 否则代码里的 `"` 会被换成弯引号（静默改写代码文本）。见 isInsideCodeContext。
  if (isProtectedPunctuationContext(view.state, from)) return false;
  if (smartQuotesEnabled && (text === '"' || text === "'")) {
    const prev = from > 0 ? view.state.doc.sliceString(from - 1, from) : '';
    view.dispatch({
      changes: { from, to, insert: smartQuoteFor(text, prev) },
      selection: { anchor: from + 1 },
    });
    return true;
  }
  // Typora 1.14.9 的 smartDash 同时负责第三个句点触发省略号。
  if (smartDashesEnabled && text === '.' && from === to) {
    const line = view.state.doc.lineAt(from);
    const lineBefore = line.text.slice(0, from - line.from);
    if (lineBefore.endsWith('..') && !isEscaped(lineBefore, lineBefore.length - 2)) {
      view.dispatch({
        changes: { from: from - 2, to, insert: '…' },
        selection: { anchor: from - 1 },
      });
      return true;
    }
  }
  if (smartDashesEnabled && text === '-' && from === to) {
    const line = view.state.doc.lineAt(from);
    const lineBefore = line.text.slice(0, from - line.from);
    const match = /(--|–|-)$/.exec(lineBefore);
    if (match && canConvertDash(lineBefore, match.index)) {
      const insert = match[0] === '-' && !twoHyphensToEm ? '–' : '—';
      const anchor = from - match[0].length + 1;
      view.dispatch({
        changes: { from: from - match[0].length, to, insert },
        selection: { anchor },
      });
      return true;
    }
  }
  return false;
}

/** 引擎扩展：install() 装配（inputHandler 开关在 handler 内判定，无需 reconfigure） */
export function buildSmartPunctuationExtension() {
  // 引擎约定：经 window.require 解析（install 时 MarkEdit 已注册模块表）
  const { EditorView } = (window as unknown as { require: (id: string) => typeof import('@codemirror/view') }).require('@codemirror/view');
  return EditorView.inputHandler.of(handleSmartPunctuation);
}

// ───────────────────── 渲染期转换（Typora `convertSmartOnRender`） ─────────────────────
/**
 * **渲染期**智能标点（Typora 的 `"Convert on Rendering"` 档，2026-10-08 审计 §4.150）。
 *
 * 语义：**文档文本保持 ASCII**（输入什么就是什么、落盘也是 ASCII），只在**显示**上把
 * `"` / `'` / `--` / `---` / `...` 呈现为弯引号 / en dash / em dash / 省略号 —— 与 Typora 的 `[md-inline='pants']`
 * （`data-text` 存 ASCII、渲染显示弯引号）同构。
 *
 * 四条约束（**复用输入期那套规则**，保证两档的转换结果一致）：
 *  ① **跳过代码上下文** —— 复用 `isInsideCodeContext`（spec §11 / §16）；
 *  ② **光标所在行揭示源码** —— 与 Live Preview 的 marker reveal 同精神（编辑处看到真文本）；
 *  ③ **Source Mode 不装饰** —— 按 view 读取模式，源码视图呈现全部原始标点（spec §5）；
 *  ④ **绝不改写文档** —— 只用 `Decoration.replace`（Mellow 已有 12 处同类用法，
 *     master-plan 的「从不 replace 文本」指的是**不改写文档文本**）。
 *
 * ⚠️ **刻意不注册进 `widget-state-matrix.test.ts` 的家族表**：那 16 态契约描述的是
 * **块级 / 节点级 widget**（caret 进入 → 显示源码、复制剥语法、删除边界…）；
 * 本项是**行内单字符替换**、没有节点语义 ⇒ 套那 16 态会把语义不同的东西混进同一张表。
 */
export function buildSmartPunctuationRenderExtension(): import('@codemirror/state').Extension {
  // 与 `buildSmartPunctuationExtension` 同约定：运行时经 window.require 取模块，
  // **类型**用 `typeof import(...)`（纯类型、会被擦除 ⇒ 不引入裸 ESM 导入）。
  const { ViewPlugin, Decoration, WidgetType } = (window as unknown as {
    require: (id: string) => typeof import('@codemirror/view');
  }).require('@codemirror/view');

  class SmartPantsWidget extends WidgetType {
    constructor(private readonly ch: string) { super(); }
    eq(other: import('@codemirror/view').WidgetType): boolean { return (other as SmartPantsWidget).ch === this.ch; }
    toDOM(): HTMLElement {
      const span = document.createElement('span');
      span.className = 'cm-smart-pants';
      span.textContent = this.ch;
      return span;
    }
  }

  const compute = (view: import('@codemirror/view').EditorView): import('@codemirror/state').RangeSet<import('@codemirror/view').Decoration> => {
    // 两个独立开关分别过滤（G7-MENU-05）：只开引号则不装饰 `--`，反之亦然。
    const quotes = smartQuotesEnabled;
    const dashes = smartDashesEnabled;
    if ((!quotes && !dashes) || !smartPunctuationOnRender || isSourceMode(view)) return Decoration.none;
    const { doc, selection } = view.state;
    const cursorLine = doc.lineAt(selection.main.head).number;
    const ranges = view.visibleRanges;
    const deco: import('@codemirror/state').Range<import('@codemirror/view').Decoration>[] = [];
    for (const r of ranges) {
      const first = doc.lineAt(r.from).number;
      const last = doc.lineAt(r.to).number;
      for (let n = first; n <= last; n += 1) {
        const line = doc.line(n);
        // ② 光标所在行**揭示源码**（编辑处显示真文本）
        if (n === cursorLine) continue;
        const text = line.text;
        for (let i = 0; i < text.length; i += 1) {
          const ch = text[i];
          if (quotes && (ch === '"' || ch === "'")) {
            const prev = i > 0
              ? text[i - 1]
              : (line.from > 0 ? doc.sliceString(line.from - 1, line.from) : '');
            const mapped = smartQuoteFor(ch, prev);
            // ① 跳过代码上下文
            if (mapped !== ch && !isProtectedPunctuationContext(view.state, line.from + i)) {
              deco.push(Decoration.replace({ widget: new SmartPantsWidget(mapped) }).range(line.from + i, line.from + i + 1));
            }
            continue;
          }
          if (dashes && text.startsWith('...', i) && !isEscaped(text, i)
            && !isProtectedPunctuationContext(view.state, line.from + i)) {
            deco.push(Decoration.replace({ widget: new SmartPantsWidget('…') }).range(line.from + i, line.from + i + 3));
            i += 2;
            continue;
          }
          if (dashes && ch === '-' && text[i + 1] === '-'
            && canConvertDash(text, i) && !isProtectedPunctuationContext(view.state, line.from + i)) {
            const length = text[i + 2] === '-' && text[i + 3] !== '-' ? 3 : 2;
            const mapped = length === 3 || twoHyphensToEm ? '—' : '–';
            deco.push(Decoration.replace({ widget: new SmartPantsWidget(mapped) }).range(line.from + i, line.from + i + length));
            i += length - 1;
          }
        }
      }
    }
    return Decoration.set(deco, true);
  };

  return ViewPlugin.fromClass(
    class SmartPunctuationRenderPlugin {
      decorations: import('@codemirror/state').RangeSet<import('@codemirror/view').Decoration>;
      /** 开关版本：宿主在无输入的情况下切换开关时据此重建（见 bumpRenderVersion） */
      private watchedVersion = smartPunctuationRenderVersion();

      constructor(readonly view: import('@codemirror/view').EditorView) {
        activeRenderViews.add(view);
        this.decorations = compute(view);
      }

      update(u: import('@codemirror/view').ViewUpdate): void {
        const versionChanged = smartPunctuationRenderVersion() !== this.watchedVersion;
        if (u.docChanged || u.viewportChanged || u.selectionSet || versionChanged) {
          // Composition Guard（spec §6）：合成期间只映射位置、不重建装饰；
          // 版本号留待合成结束后重算，避免 IME 输入中丢失待刷新状态。
          if (isComposing(u.view)) {
            this.decorations = this.decorations.map(u.changes);
            return;
          }
          if (versionChanged) this.watchedVersion = smartPunctuationRenderVersion();
          this.decorations = compute(u.view);
        } else {
          this.decorations = this.decorations.map(u.changes);
        }
      }

      destroy(): void {
        activeRenderViews.delete(this.view);
      }
    },
    { decorations: (v: { decorations: import('@codemirror/state').RangeSet<import('@codemirror/view').Decoration> }) => v.decorations },
  );
}
