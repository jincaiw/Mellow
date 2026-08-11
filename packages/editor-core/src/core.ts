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
  CoreWebModule,
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

  /** 等待编辑器就绪（webModules.core 可用） */
  async ready(): Promise<void> {
    if (!this.readyPromise) {
      throw new Error('EditorCore.mount() must be called before ready()');
    }
    await this.readyPromise;
    await this.waitForModules();
    this.emit({ type: 'ready' });
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

  /** 打开文档（resetEditor） */
  async open(text: string, selectionRange?: SelectionRange, documentChanged = true): Promise<boolean> {
    return this.core.resetEditor({ text, selectionRange, documentChanged });
  }

  /** 获取全文（唯一真源始终是 Markdown 文本） */
  getText(): string {
    return this.core.getEditorText();
  }

  /** 编辑状态（焦点/选区） */
  getState(): { hasFocus: boolean; hasSelection: boolean } {
    return this.core.getEditorState();
  }

  /** 插入文本 */
  insertText(text: string, from: number, to: number): void {
    this.core.insertText({ text, from, to });
  }

  /** 替换文本（整文档/选区） */
  replaceText(text: string, granularity: ReplaceGranularity): void {
    this.core.replaceText({ text, granularity });
  }

  /** 聚焦编辑器 */
  focus(): void {
    this.iframe?.contentWindow?.focus();
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

  get core(): CoreWebModule {
    const modules = this.modules();
    if (!modules?.core) {
      throw new Error('CoreEditor core module is not ready');
    }
    return modules.core;
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
