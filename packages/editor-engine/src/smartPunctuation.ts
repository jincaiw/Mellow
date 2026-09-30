/**
 * Smart Punctuation（Typora parity master-plan R2-1：智能标点）。
 *
 * 行为（对齐 Typora「偏好设置 → 通用 → 智能标点」）：
 * - smart quotes：输入 `"` / `'` 按上下文转为成对弯引号（“ ” / ‘ ’）
 * - smart dash：行内输入 `--` 后接空格 → 替换为 em-dash `—`
 *   （避开 hr `---` 与表格 delimiter 行，保 Markdown 语法安全）
 *
 * 开关经 iframe `__MELLOW_SMART_PUNCTUATION__` 注入（默认关闭，与 Typora 默认一致）；
 * IME composition 期间 CodeMirror 不触发 inputHandler，天然安全（composition guard 不受影响）。
 *
 * EditorView 经 window.require 延迟解析（引擎约定：iframe 内不能有裸 ESM 导入
 * @codemirror/* —— 浏览器静态 ESM 无法解析 bare specifier，2026-08-22 j17 排查发现
 * 此处裸导入导致整个 engine 模块图加载失败 → 白屏级故障）。
 */

/** 模块级开关（宿主注入；默认关闭） */
let smartPunctuationEnabled = false;

export function setSmartPunctuation(enabled: boolean): void {
  smartPunctuationEnabled = enabled;
}

export function isSmartPunctuationEnabled(): boolean {
  return smartPunctuationEnabled;
}

/** 宿主 → iframe 智能标点通道（R2-1） */
export interface SmartPunctuationApi {
  set(v: boolean): void;
  get(): boolean;
}

/** 挂到 iframe window，宿主（EditorCore）经 contentWindow 调用 */
export function installSmartPunctuationApi(): void {
  (window as unknown as { __MELLOW_SMART_PUNCTUATION__?: SmartPunctuationApi }).__MELLOW_SMART_PUNCTUATION__ = {
    set: setSmartPunctuation,
    get: isSmartPunctuationEnabled,
  };
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

/** 弯引号转换：`"` → “/”，`'` → ‘/’；其他字符原样返回 */
export function smartQuoteFor(input: string, prev: string): string {
  const opening = isWordStart(prev);
  if (input === '"') return opening ? '“' : '”';
  if (input === "'") return opening ? '‘' : '’';
  return input;
}

/** 表格 delimiter 行判定（含 `|` 的分隔行，如 `| --- | :-: |`） */
function isTableDelimiterLine(line: string): boolean {
  return line.includes('|');
}

/**
 * smart dash 判定：光标前文本以 `--` 结尾且输入空格时是否替换为 `—`。
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

/**
 * inputHandler：拦截直引号与 `--␠` 序列。
 * 返回 true = 已处理（CodeMirror 不再插入原字符）。
 * view 类型用结构化形状（避免顶层裸导入 @codemirror/view，见文件头注释）。
 */
function handleSmartPunctuation(view: {
  state: import('@codemirror/state').EditorState;
  dispatch: (spec: import('@codemirror/state').TransactionSpec) => void;
}, from: number, to: number, text: string): boolean {
  if (!smartPunctuationEnabled) return false;
  // spec §11 / §16：代码上下文（行内代码 / 代码围栏）内**不得**改写 ——
  // 否则代码里的 `"` 会被换成弯引号（静默改写代码文本）。见 isInsideCodeContext。
  if (isInsideCodeContext(view.state, from)) return false;
  if (text === '"' || text === "'") {
    const prev = from > 0 ? view.state.doc.sliceString(from - 1, from) : '';
    view.dispatch({
      changes: { from, to, insert: smartQuoteFor(text, prev) },
      selection: { anchor: from + 1 },
    });
    return true;
  }
  if (text === ' ' && from === to) {
    const line = view.state.doc.lineAt(from);
    const lineBefore = line.text.slice(0, from - line.from);
    if (shouldEmDash(lineBefore)) {
      view.dispatch({
        changes: { from: from - 2, to, insert: '— ' },
        selection: { anchor: from + 1 },
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
