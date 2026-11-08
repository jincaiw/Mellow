/**
 * 文本替换（Text Replacement，Typora「替换」子菜单第 6 项）—— G7-MENU-05 余项。
 *
 * 一手证据（Typora 1.14.9，本机只读核查，审计 §4.360「六」16）：
 * - `window/frame.js` 的 `handleUserReplacement`：仅 `File.isMac` 生效；桥
 *   `word.getTextReplacement` 取 macOS **系统文本替换词典**（一次性缓存），
 *   在 `+input` 单字符输入后，读**隐藏 textarea** 尾部，找「键入串以某词条
 *   （phrase）结尾」的项 → 用 `replaceRange` 换成其 value。词典由
 *   「系统设置 → 键盘 → 文本替换」管理，Typora **不自带词条表**。
 * - `main.js` / 原生二进制含 `isAutomaticTextReplacementEnabled` /
 *   `toggleAutomaticTextReplacement:` / `userReplacementsDictionary` ——
 *   开关 = AppKit 的 `NSTextView` 同名能力（「文本替换」勾选项）。
 * - **Typora 的偏差**：其实现只判 `File.isMac`，**不检查**该 AppKit 开关 →
 *   在系统设置里关掉「文本替换」后 Typora 仍会替换。Mellow 修复之
 *   （enabled = macOS && 开关开 && 词典非空），差异登记 panel-keys。
 *
 * Mellow 装配（与智能标点同型）：
 * - 宿主读系统词典 + 开关 → `setTextReplacement(entries)` / `setTextReplacementEnabled`
 *   注入 iframe（`__MELLOW_TEXT_REPLACEMENT__`）；引擎**不**直接访问宿主能力。
 * - 触发时机对齐 Typora：仅**单字符、非合成、无选区、非代码/URL 上下文**输入，
 *   且替换段**不得越过行首**；单事务替换并定位光标（Undo = 一步回退到键入后）。
 * - 词典为空 / 未启用 ⇒ 恒 no-op；非 macOS 恒 no-op（`setTextReplacement` 由宿主
 *   只在可用时调用，引擎再兜一层空表）。
 */
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isProtectedPunctuationContext } from './smartPunctuation';
import { isComposing } from './composition';

export interface TextReplacementEntry {
  /** 触发词（Typora: phrase） */
  phrase: string;
  /** 替换文本（Typora: value） */
  value: string;
}

let replacements: ReadonlyArray<TextReplacementEntry> = [];
let replacementEnabled = false;

export interface TextReplacementApi {
  set(entries: TextReplacementEntry[]): void;
  get(): TextReplacementEntry[];
  setEnabled(v: boolean): void;
  getEnabled(): boolean;
}

/** 挂到 iframe window，宿主（EditorCore）经 contentWindow 调用 */
export function installTextReplacementApi(): void {
  (window as unknown as { __MELLOW_TEXT_REPLACEMENT__?: TextReplacementApi }).__MELLOW_TEXT_REPLACEMENT__ = {
    set: setTextReplacementEntries,
    get: getTextReplacementEntries,
    setEnabled: setTextReplacementEnabled,
    getEnabled: isTextReplacementEnabled,
  };
}

export function setTextReplacementEntries(entries: ReadonlyArray<TextReplacementEntry>): void {
  replacements = entries.filter((e) => e.phrase.length > 0);
}

export function getTextReplacementEntries(): TextReplacementEntry[] {
  return [...replacements];
}

export function setTextReplacementEnabled(enabled: boolean): void {
  replacementEnabled = enabled;
}

export function isTextReplacementEnabled(): boolean {
  return replacementEnabled;
}

/**
 * 纯匹配函数：给定「行首 → 光标（**不含**本次键入字符）」前缀与词典，返回命中的词条。
 * 触发时机与 Typora 逐行对齐：`n = textarea.value 去掉最后键入字符`，
 * `find(e => n.endsWith(e))` —— 即 phrase 必须**已经打完**，由**再键入一个字符**
 * 触发替换（键入字符本身保留）。例：打 `(c)` 后按空格 → `© `。
 * - 多词条命中同一后缀时取**最长 phrase**（Typora 用 `find` 取第一个、依赖
 *   系统词典返回序；取最长是确定性更强的等价规则，差异登记 panel-keys）。
 * - `phrase.length > maxBack` 时不替换：替换段不得越过行首（Typora 的隐藏
 *   textarea 值天然就是当前行，跨行不可能命中；Mellow 用行首硬界复现）。
 */
export function matchTextReplacement(
  prefix: string,
  entries: ReadonlyArray<TextReplacementEntry>,
  maxBack: number,
): TextReplacementEntry | null {
  let best: TextReplacementEntry | null = null;
  for (const e of entries) {
    if (e.phrase.length > maxBack) continue;
    if (!prefix.endsWith(e.phrase)) continue;
    if (!best || e.phrase.length > best.phrase.length) best = e;
  }
  return best;
}

/** 引擎扩展：install() 装配（开关在 handler 内判定，无需 reconfigure） */
export function buildTextReplacementExtension(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (!replacementEnabled || replacements.length === 0) return false;
    // 仅单字符用户输入（Typora：`1==t.length && "+input"==t[0].origin`）
    if (text.length !== 1 || from !== to) return false;
    // IME 合成中不接管（引擎 composition 真值，与 smartPunctuation 同一判定；
    // jsdom/WebKit 下 view.composing 不保证反映 document 级合成事件）。
    if (isComposing()) return false;
    const state = view.state;
    // 与智能标点同一保护面：代码 / URL / 链接目标 / HTML 源码内不替换
    // （词典项如 `yours`→`you're` 落到 URL 或代码里同样是破坏文档）。
    if (isProtectedPunctuationContext(state, from)) return false;
    const line = state.doc.lineAt(from);
    const prefix = line.text.slice(0, from - line.from);
    const hit = matchTextReplacement(prefix, replacements, from - line.from);
    if (!hit) return false;
    // 单事务：phrase 区间换成 value + 正常落下触发字符（Typora 的 replaceRange
    // 不改 textarea，键入字符随后照常插入文档 —— 两效果在此合成一个 undo 单位）。
    view.dispatch({
      changes: { from: from - hit.phrase.length, to: from, insert: hit.value + text },
      selection: { anchor: from - hit.phrase.length + hit.value.length + 1 },
    });
    return true;
  });
}
