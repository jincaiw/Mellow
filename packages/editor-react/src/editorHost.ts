/**
 * Editor Host：管理 CoreEditor 生命周期（打开/取文本/编辑状态）。
 *
 * CoreEditor 以独立 iframe（editor bundle）运行，与 React shell 隔离；
 * 宿主通过 iframe.contentWindow.webModules 直接调用编辑器（同上下文 JS）。
 *
 * 平台约束：本模块零系统能力依赖（不 import host-api / Tauri）。
 * editor-core 的 OS 耦合（webkit.messageHandlers.bridge）由构建期注入消除。
 */

import type { EditorConfig, CoreWebModule, WebModules } from './types';

export const EDITOR_BUNDLE_URL = '/editor/index.html';

export class EditorHost {
  private iframe: HTMLIFrameElement | null = null;
  private readyPromise: Promise<void> | null = null;

  /** 创建 iframe 并加载 editor bundle */
  mount(container: HTMLElement): void {
    if (this.iframe) return;

    const iframe = document.createElement('iframe');
    iframe.className = 'mellow-editor-frame';
    iframe.title = 'Mellow Editor';
    iframe.src = EDITOR_BUNDLE_URL;
    container.appendChild(iframe);
    this.iframe = iframe;

    this.readyPromise = new Promise<void>((resolve) => {
      iframe.addEventListener('load', () => resolve(), { once: true });
    });
  }

  /** 等待编辑器就绪 */
  async ready(): Promise<void> {
    if (!this.readyPromise) {
      throw new Error('EditorHost.mount() must be called first');
    }
    await this.readyPromise;
    await this.waitForModules();
  }

  get core(): CoreWebModule {
    const modules = this.modules();
    if (!modules?.core) {
      throw new Error('CoreEditor core module is not ready');
    }
    return modules.core;
  }

  /** 打开文档（对应 WebBridgeCore.resetEditor） */
  async open(text: string, documentChanged = true): Promise<boolean> {
    return this.core.resetEditor({ text, documentChanged });
  }

  /** 获取当前全文（对应 WebBridgeCore.getEditorText） */
  getText(): string {
    return this.core.getEditorText();
  }

  /** 获取编辑状态（焦点/选区） */
  getState(): { hasFocus: boolean; hasSelection: boolean } {
    return this.core.getEditorState();
  }

  /** 聚焦编辑器（iframe 聚焦才能接收键盘） */
  focus(): void {
    this.iframe?.contentWindow?.focus();
  }

  destroy(): void {
    this.iframe?.remove();
    this.iframe = null;
    this.readyPromise = null;
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
}

export type { EditorConfig };
