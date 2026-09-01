/**
 * EditorCore —— 平台无关的编辑器核心封装。
 *
 * 职责：
 * - 挂载/加载 CoreEditor bundle（iframe，标准 Web API，无引擎假设）；
 * - 暴露公开 API：open / getText / getState / insertText / replaceText；
 * - 事件：ready / viewUpdate（dirty 等）；
 * - 宿主桥接适配（BridgeAdapter 可选注入，默认使用 bundle 内注入的桥）。
 *
 * 平台约束：
 * - 本模块零 OS API、零 Tauri/WebKit 引用；
 * - CoreEditor 的 webkit 耦合由构建期注入消除（见 bundle.ts / bridge-injection）。
 */

import type {
  EditorConfig,
  EditorEvent,
  EditorEventListener,
  WebModules,
  SelectionRange,
  ReplaceGranularity,
  BridgeAdapter,
  TextChange,
} from './contract';

export const EDITOR_BUNDLE_URL = '/editor/index.html';

export interface EditorCoreOptions {
  /** 编辑器 bundle URL（默认 /editor/index.html） */
  bundleUrl?: string;
  /** 宿主桥接（可选；默认使用 bundle 内注入的桥） */
  bridge?: BridgeAdapter;
  /** 初始事件监听 */
  onEvent?: EditorEventListener;
}

export class EditorCore {
  private iframe: HTMLIFrameElement | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyEmitted = false;
  private listeners = new Set<EditorEventListener>();
  private readonly bundleUrl: string;

  constructor(options: EditorCoreOptions = {}) {
    this.bundleUrl = options.bundleUrl ?? EDITOR_BUNDLE_URL;
    if (options.onEvent) {
      this.listeners.add(options.onEvent);
    }
  }

  /** 创建 iframe 并加载 editor bundle（容器由宿主提供） */
  mount(container: HTMLElement): void {
    if (this.iframe) return;

    const iframe = document.createElement('iframe');
    iframe.className = 'mellow-editor-frame';
    iframe.title = 'Mellow Editor';
    iframe.src = this.bundleUrl;
    container.appendChild(iframe);
    this.iframe = iframe;

    this.readyPromise = new Promise<void>((resolve) => {
      iframe.addEventListener('load', () => resolve(), { once: true });
    });
  }

  /** 等待编辑器就绪（webModules.core 可用）；幂等可重入（重复调用不重复 emit）。
   *  mount() 由宿主 idle 调度延迟执行，本方法可在 mount 前安全调用（等待挂载）。 */
  async ready(): Promise<void> {
    // mount() 未执行：轮询等待（宿主 idle 挂载通常 <1s；15s 上限防御）
    const mountDeadline = Date.now() + 15_000;
    while (this.readyPromise === null) {
      if (Date.now() > mountDeadline) {
        throw new Error('EditorCore.mount() was not called within 15s');
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    await this.readyPromise;
    await this.waitForModules();
    if (!this.readyEmitted) {
      this.readyEmitted = true;
      this.emit({ type: 'ready' });
    }
  }

  /**
   * 等待 iframe 动态样式 CSSOM 建立（WKURLSchemeHandler 竞态防护）。
   *
   * 背景（2026-08-22 j17 排查）：tauri:// 自定义协议下，CoreEditor 注入的动态
   * `<style>` 的 CSSOM 建立存在 pending 窗口；若大文档管线（分块 IPC 读取 +
   * 10MB 字符串拼接 + dispatch）恰在该窗口长时间占用主线程，WebKit 会永久
   * 丢弃未完成的 CSSOM（sheet === null，且此后新插入的 style 也不再获得
   * CSSOM）→ .cm-scroller 布局塌陷 → 大文档白屏（不可恢复，只能重启）。
   * 样式建立正常时本等待几乎瞬时完成；超时（默认 2s）则放行不阻塞。
   */
  async waitForStylesReady(timeoutMs = 2000): Promise<void> {
    const doc = this.iframe?.contentDocument;
    const win = this.iframe?.contentWindow;
    if (!doc || !win) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // 注意：NodeList 展开需要 DOM.Iterable lib（本包 lib 仅 DOM），用 forEach 规避
      const styles = doc.querySelectorAll('style');
      if (styles.length > 0) {
        let allReady = true;
        styles.forEach((s) => { if ((s as HTMLStyleElement).sheet === null) allReady = false; });
        if (allReady) return;
      }
      // 强制同步 style recalc（WebKit 动态样式 CSSOM 建立 hook 在 recalc 中，
      // 单纯 setTimeout 等待不驱动渲染管线 → pending CSSOM 永不建立）
      void win.getComputedStyle(doc.documentElement).color;
      // rAF 让步（驱动渲染帧）；窗口不可见时 rAF 不触发，setTimeout 兜底
      await new Promise((r) => {
        let settled = false;
        const fin = () => { if (!settled) { settled = true; r(null); } };
        win.requestAnimationFrame(fin);
        setTimeout(fin, 100);
      });
    }
  }

  /**
   * 编辑器是否就绪（iframe 已挂载且 webModules.core 可用）。
   * 宿主可在任何时点安全轮询；未就绪期间其他 API 返回安全默认值（见各方法注释）。
   */
  isReady(): boolean {
    return this.modules()?.core !== undefined;
  }

  /** 订阅编辑器事件；返回取消订阅函数 */
  onEvent(listener: EditorEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 宿主装配层调用：把宿主侧事件转发给监听器 */
  emitExternalEvent(event: EditorEvent): void {
    this.emit(event);
  }

  /** 打开文档（resetEditor）；未就绪时返回 false（调用方可稍后重试）
   *
   * lineBreak：文档行尾（'\n' | '\r\n' | '\r'）。必须在 resetEditor 前设置 ——
   * CoreEditor 的 getLineBreak 对「无换行文档」且无 defaultLineBreak 时会回落到
   * CRLF（LFs/CRLFs/CRs 计数全 0 → `CRLFs === usedMost` 命中），导致保存时
   * Source Fidelity 破坏（LF 文档保存成 CRLF）。传入行尾后：
   * - '\n' → getLineBreak 返回 undefined（CodeMirror LF 归一化）
   * - '\r\n'/'\r' → 显式 lineSeparator 保持
   */
  async open(text: string, selectionRange?: SelectionRange, documentChanged = true, lineBreak?: string): Promise<boolean> {
    const modules = this.modules();
    const core = modules?.core;
    if (!core) return false;
    if (lineBreak !== undefined) {
      modules?.config?.setDefaultLineBreak?.({ lineBreak });
    }
    // Large File Mode（PRD §109）：必须在 resetEditor 之前降级 —— dispatch 大内容时
    // 引擎扫描扩展需已处于视口裁剪模式（否则全文扫描在 dispatch 同步阶段执行；
    // 2026-08-22 j17 排查：10MB 未预降级时单次 dispatch 92s）。所有 open 路径
    // （applyTab/auto reload/冲突解决/快照恢复）均经此收口。
    // 阈值与 editor-engine/src/largeFile.ts 同步维护（包间不引依赖，故内联）。
    let lines = 1;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) lines++;
    }
    // jsdom（单测环境）无全局 TextEncoder：退化为 UTF-8 最坏近似（×3，宁早降级）；
    // 生产 WebView / Node 均有 TextEncoder，走精确字节数。
    const bytes = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(text).length
      : text.length * 3;
    const large = bytes > 5 * 1024 * 1024 || lines > 50_000;
    this.setLargeFileMode(large);
    // 大文档：dispatch 前确保 iframe 样式 CSSOM 已建立（WKURLSchemeHandler 下
    // 长时间占用主线程会永久丢弃 pending CSSOM → 白屏，见 waitForStylesReady）
    if (large) {
      await this.waitForStylesReady();
    }
    return core.resetEditor({ text, selectionRange, documentChanged });
  }

  /** 获取全文（唯一真源始终是 Markdown 文本）；未就绪时返回 '' */
  getText(): string {
    // 启动竞态防线：webModules 就绪但 EditorView 未创建时（window.editor 仍为
    // 宿主 <div id="editor"> 命名元素引用），iframe 内 getEditorText 会抛错
    try {
      return this.modules()?.core?.getEditorText() ?? '';
    } catch {
      return '';
    }
  }

  /** 编辑状态（焦点/选区）；未就绪时返回全 false */
  getState(): { hasFocus: boolean; hasSelection: boolean } {
    // 同 getText：EditorView 未创建窗口期访问 window.editor.state.selection
    // 抛 TypeError（App.tsx commandContext 启动期即调用，2026-08-23 报错）
    try {
      return this.modules()?.core?.getEditorState() ?? { hasFocus: false, hasSelection: false };
    } catch {
      return { hasFocus: false, hasSelection: false };
    }
  }

  /** 插入文本；未就绪时 no-op */
  insertText(text: string, from: number, to: number): void {
    try {
      this.modules()?.core?.insertText({ text, from, to });
    } catch {
      // 未就绪 no-op
    }
  }

  /** 替换文本（整文档/选区）；未就绪时 no-op */
  replaceText(text: string, granularity: ReplaceGranularity): void {
    try {
      this.modules()?.core?.replaceText({ text, granularity });
    } catch {
      // 未就绪 no-op
    }
  }

  /** 聚焦编辑器 */
  focus(): void {
    const win = this.iframe?.contentWindow as (Window & { editor?: { focus?: () => void } }) | null;
    // iframe window 成为 first responder 并不足以让 CodeMirror 的 contenteditable
    // 接收文本，尤其是大文件 reset 后。必须再聚焦真实 EditorView；否则 macOS
    // System Events/硬件键盘可能落到桌面壳，表现为已渲染但不可直接输入。
    win?.focus();
    win?.editor?.focus?.();
  }

  /** 设置编辑器内容区主题（CoreEditor webModules.config.setTheme） */
  setTheme(name: string): void {
    const win = this.iframe?.contentWindow as (Window & { webModules?: { config?: { setTheme?: (p: { name: string }) => void } } }) | null;
    win?.webModules?.config?.setTheme?.({ name });
  }

  /** 编辑器 config live apply（CoreEditor webModules.config.<method>；Settings live apply where safe） */
  setEditorConfig(method: 'setFontSize' | 'setFontFace' | 'setShowLineNumbers' | 'setLineWrapping', params: { fontSize?: number; family?: string; enabled?: boolean }): void {
    const win = this.iframe?.contentWindow as (Window & { webModules?: { config?: Record<string, (p: unknown) => void> } }) | null;
    if (method === 'setFontFace') {
      // CoreEditor setFontFace 参数：{ fontFace: { family } }（WebFontFace 契约）
      win?.webModules?.config?.setFontFace?.({ fontFace: { family: params.family } });
      return;
    }
    win?.webModules?.config?.[method]?.(params);
  }

  /** 当前主光标 offset（Outline 高亮使用；engine bridge 不可用时返回 null） */
  getSelectionHead(): number | null {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_OUTLINE_API__?: { getSelectionHead?: () => number | null } }) | null;
    const head = win?.__MELLOW_OUTLINE_API__?.getSelectionHead?.();
    return typeof head === 'number' ? head : null;
  }

  /** 跳转到文档 offset（Outline click jump；失败时返回 false） */
  jumpToOffset(offset: number): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_OUTLINE_API__?: { jumpToOffset?: (offset: number) => boolean } }) | null;
    const jump = win?.__MELLOW_OUTLINE_API__?.jumpToOffset;
    return typeof jump === 'function' ? jump(offset) : false;
  }

  /** Floating Selection Toolbar：默认启用，可开关。 */
  setSelectionToolbarEnabled(on: boolean): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_TOOLBAR__?: { setEnabled?: (on: boolean) => void } }) | null;
    win?.__MELLOW_SELECTION_TOOLBAR__?.setEnabled?.(on);
  }

  getSelectionToolbarEnabled(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_TOOLBAR__?: { getEnabled?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_TOOLBAR__?.getEnabled?.() ?? true;
  }

  /** Typewriter Mode：caret 保持 viewport 中部附近（F9）。 */
  setTypewriterMode(on: boolean): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_TYPEWRITER_MODE__?: { setEnabled?: (on: boolean) => void } }) | null;
    win?.__MELLOW_TYPEWRITER_MODE__?.setEnabled?.(on);
  }

  getTypewriterMode(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_TYPEWRITER_MODE__?: { getEnabled?: () => boolean } }) | null;
    return win?.__MELLOW_TYPEWRITER_MODE__?.getEnabled?.() ?? false;
  }

  /** Focus Mode：仅切换视觉权重，不改变文档/selection。 */
  setFocusMode(mode: 'off' | 'line' | 'paragraph'): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_FOCUS_MODE__?: { setMode?: (mode: 'off' | 'line' | 'paragraph') => void } }) | null;
    win?.__MELLOW_FOCUS_MODE__?.setMode?.(mode);
  }

  getFocusMode(): 'off' | 'line' | 'paragraph' {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_FOCUS_MODE__?: { getMode?: () => 'off' | 'line' | 'paragraph' } }) | null;
    return win?.__MELLOW_FOCUS_MODE__?.getMode?.() ?? 'off';
  }

  /** Large File Mode（PRD §109）：触发阈值由宿主计算（字节数/行数），经 iframe API 切换。 */
  setLargeFileMode(active: boolean): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_LARGE_FILE__?: { set?: (v: boolean) => void } }) | null;
    win?.__MELLOW_LARGE_FILE__?.set?.(active);
  }

  /** 当前是否处于 Large File Mode（iframe 内引擎状态） */
  isLargeFileMode(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_LARGE_FILE__?: { isActive?: () => boolean } }) | null;
    return win?.__MELLOW_LARGE_FILE__?.isActive?.() ?? false;
  }

  /** 拼写检查用户偏好（D1-1）：effective = 偏好 && !大文件模式（引擎侧裁决） */
  setSpellcheckEnabled(on: boolean): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SPELLCHECK__?: { set?: (v: boolean) => void } }) | null;
    win?.__MELLOW_SPELLCHECK__?.set?.(on);
  }

  isSpellcheckEnabled(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SPELLCHECK__?: { get?: () => boolean } }) | null;
    return win?.__MELLOW_SPELLCHECK__?.get?.() ?? true;
  }

  /** 智能标点开关（master-plan R2-1；默认关闭，Typora parity） */
  setSmartPunctuationEnabled(on: boolean): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SMART_PUNCTUATION__?: { set?: (v: boolean) => void } }) | null;
    win?.__MELLOW_SMART_PUNCTUATION__?.set?.(on);
  }

  isSmartPunctuationEnabled(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SMART_PUNCTUATION__?: { get?: () => boolean } }) | null;
    return win?.__MELLOW_SMART_PUNCTUATION__?.get?.() ?? false;
  }

  /** 代码块行号开关（Typora 偏好→Markdown；默认关闭） */
  setCodeLineNumbersEnabled(on: boolean): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_CODE_LINE_NUMBERS__?: { set?: (v: boolean) => void } }) | null;
    win?.__MELLOW_CODE_LINE_NUMBERS__?.set?.(on);
  }

  isCodeLineNumbersEnabled(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_CODE_LINE_NUMBERS__?: { get?: () => boolean } }) | null;
    return win?.__MELLOW_CODE_LINE_NUMBERS__?.get?.() ?? false;
  }

  /** 安装宿主 KaTeX 渲染通道（master-plan R3-2：编辑器内公式排版 + mhchem \ce/\pu）。
   *  render 异步返回渲染 HTML；null = 渲染失败（引擎回退源码显示）。 */
  installKatexRenderer(render: (tex: string, displayMode: boolean) => Promise<string | null>): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_KATEX_RENDER__?: (tex: string, display: boolean) => Promise<string | null> }) | null;
    if (win !== null) win.__MELLOW_KATEX_RENDER__ = render;
  }

  /** 选中当前行（整行已选中则扩展下一行；D1-4 ⌘L）；false = 编辑器未就绪 */
  selectLine(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { selectLine?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.selectLine?.() ?? false;
  }

  /** 选中当前段落（空行界定；D1-4 ⌥⌘P）；false = 编辑器未就绪 */
  selectParagraph(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { selectParagraph?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.selectParagraph?.() ?? false;
  }

  // ── D3 选择/删除范围/移行（Typora 编辑菜单 parity；false = 编辑器未就绪） ──

  /** 选中当前词（⌘D） */
  selectWord(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { selectWord?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.selectWord?.() ?? false;
  }

  /** 选中当前格式文本（⌘E；无标记退化为当前词） */
  selectFormatSpan(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { selectFormatSpan?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.selectFormatSpan?.() ?? false;
  }

  gotoDocStart(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { gotoDocStart?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.gotoDocStart?.() ?? false;
  }

  gotoDocEnd(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { gotoDocEnd?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.gotoDocEnd?.() ?? false;
  }

  /** 跳转到所选内容（⌘J scrollIntoView） */
  gotoSelection(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { gotoSelection?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.gotoSelection?.() ?? false;
  }

  gotoLineStart(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { gotoLineStart?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.gotoLineStart?.() ?? false;
  }

  gotoLineEnd(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { gotoLineEnd?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.gotoLineEnd?.() ?? false;
  }

  /** 删除当前词（⇧⌘D） */
  deleteWord(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { deleteWord?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.deleteWord?.() ?? false;
  }

  /** 删除当前格式文本（⌥⇧⌘E） */
  deleteFormatSpan(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { deleteFormatSpan?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.deleteFormatSpan?.() ?? false;
  }

  /** 删除块（⌥⇧⌘P；空行界定的段落） */
  deleteParagraph(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { deleteParagraph?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.deleteParagraph?.() ?? false;
  }

  /** 上移该行（⌥↑）；首行 no-op */
  moveLineUp(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { moveLineUp?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.moveLineUp?.() ?? false;
  }

  /** 下移该行（⌥↓）；末行 no-op */
  moveLineDown(): boolean {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { moveLineDown?: () => boolean } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.moveLineDown?.() ?? false;
  }

  /** 光标处图片 src（「拷贝图片」）；null = 无图片/未就绪 */
  imageSourceAtCursor(): string | null {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { imageSourceAtCursor?: () => string | null } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.imageSourceAtCursor?.() ?? null;
  }

  /** 光标处行内链接 url（D4「打开链接/复制链接地址」）；null = 无链接/未就绪 */
  linkUrlAtCursor(): string | null {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { linkUrlAtCursor?: () => string | null } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.linkUrlAtCursor?.() ?? null;
  }

  /** 光标处代码块内容（D4「复制代码块内容」）；null = 无代码块/未就绪 */
  codeBlockSourceAtCursor(): string | null {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_SELECTION_COMMANDS__?: { codeBlockSourceAtCursor?: () => string | null } }) | null;
    return win?.__MELLOW_SELECTION_COMMANDS__?.codeBlockSourceAtCursor?.() ?? null;
  }

  /** 设置当前文档路径（Image Workflow 相对路径解析，engine 读 window.__MELLOW_DOC_PATH__） */
  setDocumentPath(path: string | null): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_DOC_PATH__?: string | null }) | null;
    if (win) {
      win.__MELLOW_DOC_PATH__ = path;
    }
  }

  /**
   * 单事务应用文本替换（引擎 Image API 通道；spec image-workflow §6/§11）。
   * 全部替换一次 dispatch → 一次 Undo 可撤销。
   * @returns false = 引擎未注册 / 编辑器未就绪
   */
  patchChanges(changes: TextChange[]): boolean {
    if (changes.length === 0) {
      return false;
    }
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_ENGINE_API__?: { applyChanges?: (c: TextChange[]) => boolean } }) | null;
    const apply = win?.__MELLOW_ENGINE_API__?.applyChanges;
    return typeof apply === 'function' ? apply(changes) : false;
  }

  /** 强制图片重新解析（文档路径/asset 目录变化后；引擎 Image API） */
  refreshImages(): void {
    const win = this.iframe?.contentWindow as (Window & { __MELLOW_ENGINE_API__?: { refreshImages?: () => void } }) | null;
    win?.__MELLOW_ENGINE_API__?.refreshImages?.();
  }

  /** 销毁 */
  destroy(): void {
    this.iframe?.remove();
    this.iframe = null;
    this.readyPromise = null;
    this.listeners.clear();
  }

  private modules(): WebModules | null {
    const win = this.iframe?.contentWindow;
    return (win as (Window & { webModules?: WebModules }) | null)?.webModules ?? null;
  }

  private async waitForModules(): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (this.modules()?.core) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('CoreEditor webModules did not become ready within 15s');
  }

  private emit(event: EditorEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('[editor-core] event listener failed', error);
      }
    }
  }
}

export type { EditorConfig };
