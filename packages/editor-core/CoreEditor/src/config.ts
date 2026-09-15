import { RuntimeInfo } from 'markedit-api';
import { Compartment } from '@codemirror/state';
import { WebFontFace } from './@types/WebFontFace';

/**
 * @shouldExport true
 * @overrideModuleName EditorHost
 */
export enum Host {
  mainApp = 'mainApp',
  quicklook = 'quicklook',
}

/**
 * @shouldExport true
 * @overrideModuleName EditorLocalizable
 */
export interface Localizable {
  // CodeMirror
  controlCharacter: string;
  foldedLines: string;
  unfoldedLines: string;
  foldedCode: string;
  unfold: string;
  foldLine: string;
  unfoldLine: string;
  // Others
  previewButtonTitle: string;
  cmdClickToFollow: string;
  cmdClickToToggleTodo: string;
}

/**
 * @shouldExport true
 * @overrideModuleName EditorInvisiblesBehavior
 */
export enum InvisiblesBehavior {
  never = 'never',
  selection = 'selection',
  trailing = 'trailing',
  always = 'always',
}

/**
 * @shouldExport true
 * @overrideModuleName EditorIndentBehavior
 */
export enum IndentBehavior {
  never = 'never',
  paragraph = 'paragraph',
  line = 'line',
}

/**
 * @shouldExport true
 * @overrideModuleName EditorConfig
 */
export interface Config {
  host: Host;
  text: string;
  theme: string; // MarkEdit-theming relies on this, add a fallback if renaming becomes necessary
  fontFace: WebFontFace;
  fontSize: number;
  showLineNumbers: boolean;
  showActiveLineIndicator: boolean;
  invisiblesBehavior: InvisiblesBehavior;
  readOnlyMode: boolean;
  typewriterMode: boolean;
  focusMode: boolean;
  lineWrapping: boolean;
  lineHeight: number;
  contentMaxWidth?: number | null; // Mellow：正文写作限宽（px；null = 全宽，Typora parity 视觉）
  suggestWhileTyping: boolean;
  standardDirectories: { [key: string]: string };
  runtimeInfo?: RuntimeInfo;
  defaultLineBreak?: string;
  tabKeyBehavior?: CodeGen_Int;
  indentUnit?: string;
  localizable?: Localizable;
  // Runtime config from settings.json, not dynamically changeable
  autoCharacterPairs: boolean;
  /** Markdown 字符辅助（Typora `autoPairExtendSymbol`，默认 false）。 */
  autoMarkdownSyntaxPairs?: boolean;
  /**
   * 默认代码块语言（Typora `defaultCodeLang`，默认空串 = 不自动添加）。
   *
   * 生效通道对应 Typora 的 `defaultCodeLangOption` 位掩码的 **Code 位**（值 1，即 Typora 默认）：
   * 只在**输入 Markdown 反引号**展开代码块时套用；经菜单插入代码块不套用
   * （Typora 的 Menu 位为 2，默认未启用 —— Mellow 未实装该位，见方案 G7-EDIT-16）。
   */
  defaultCodeLang?: string;
  /** 首行缩进（V7-W6，G7-EDIT-15），默认 false。 */
  firstLineIndent?: boolean;
  indentBehavior: IndentBehavior;
  undoGroupingInterval?: number;
  headerFontSizeDiffs?: number[];
  visibleWhitespaceCharacter?: string;
  visibleLineBreakCharacter?: string;
  searchNormalizers?: { [key: string]: string };
}

/**
 * Dynamic configurations that can be reconfigured.
 */
export interface Dynamics {
  theme: Compartment;
  readOnly?: Compartment;
  gutters?: Compartment;
  invisibles?: Compartment;
  activeLine?: Compartment;
  selectedLines?: Compartment;
  lineWrapping?: Compartment;
  lineEndings?: Compartment;
  indentUnit?: Compartment;
  selectionHighlight?: Compartment;
  extensionConfigurator?: Compartment;
  markdownConfigurator?: Compartment;
  /** 自动配对（V7-W6，G7-EDIT-12）：`autoCharacterPairs` 的运行时重配通道。 */
  autoPair?: Compartment;
  /** 首行缩进（V7-W6，G7-EDIT-15）：Paragraph decoration 的运行时重配通道。 */
  firstLineIndent?: Compartment;
}

export type { WebFontFace };
