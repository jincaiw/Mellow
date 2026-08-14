/**
 * extensions/extensionHost.ts —— desktop 扩展宿主适配（Adapter 层，PRD §113.4）。
 *
 * V1 能力接线：
 * - document：EditorCore（App.tsx 注入 getCore）；
 * - fs：createDesktopFileService（Rust System Core）；
 * - clipboard：navigator.clipboard（read/write text；HTML/Image 未接线）；
 * - notification：Web Notification API；
 * - network：**默认不接线**（默认无需联网原则；扩展声明 network 时运行时抛 not-implemented）；
 * - keychain / process：**V1 一律拒绝**（context 层门卫，宿主不接线）。
 */
import type { ExtensionHost, ExtensionDocumentHost } from '../../../../packages/app-core/src/extensions';
import type { EditorCore } from '../../../../packages/editor-core/src';
import type { ClipboardService, KeychainService, NotificationService, ProcessService } from '../../../../packages/host-api/src';
import { ok, err } from '../../../../packages/host-api/src';
import { createDesktopFileService } from '../host/fileServices';

/** 从 EditorCore 构建 document 能力（核心编辑器为唯一真源，PRD §3） */
export function createExtensionDocumentHost(getCore: () => EditorCore | null): ExtensionDocumentHost {
  // V1：EditorCore 未暴露完整选区 range（仅 hasSelection / getSelectionHead）；
  // getSelection 暂返回 null，待编辑器契约扩展后提供完整选区。
  return {
    getText: () => getCore()?.getText() ?? '',
    getSelection: () => null,
    getCursor: () => getCore()?.getSelectionHead() ?? null,
    insertText: (text, from, to) => {
      const core = getCore();
      if (core === null) return;
      if (from === undefined || to === undefined) {
        const head = core.getSelectionHead() ?? 0;
        core.insertText(text, head, head);
      } else {
        core.insertText(text, from, to);
      }
    },
    replaceSelection: (text) => {
      const core = getCore();
      if (core === null) return;
      const head = core.getSelectionHead() ?? 0;
      core.insertText(text, head, head);
    },
  };
}

/** desktop 扩展宿主（V1） */
export function createDesktopExtensionHost(getCore: () => EditorCore | null): ExtensionHost {
  const clipboard: ClipboardService = {
    readText: async () => {
      try { return ok(await navigator.clipboard.readText()); } catch (e) { return err({ code: 'io', message: String(e) }); }
    },
    writeText: async (text) => {
      try { await navigator.clipboard.writeText(text); return ok(undefined as never); } catch (e) { return err({ code: 'io', message: String(e) }); }
    },
    readHTML: async () => err({ code: 'not-implemented', message: 'V1 未接线' }),
    writeHTML: async () => err({ code: 'not-implemented', message: 'V1 未接线' }),
    readImage: async () => err({ code: 'not-implemented', message: 'V1 未接线' }),
    writeImage: async () => err({ code: 'not-implemented', message: 'V1 未接线' }),
  };

  const notification: NotificationService = {
    show: async (req) => {
      try {
        if (!('Notification' in window)) return ok(undefined as never);
        if (Notification.permission === 'default') await Notification.requestPermission();
        if (Notification.permission === 'granted') new Notification(req.title, { body: req.body });
        return ok(undefined as never);
      } catch (e) {
        return err({ code: 'io', message: String(e) });
      }
    },
  };

  return {
    document: createExtensionDocumentHost(getCore),
    fs: createDesktopFileService(),
    clipboard,
    // V1 一律拒绝（context 门卫抛 not-implemented；此处仅占位以满足类型）
    keychain: undefined as unknown as KeychainService,
    process: undefined as unknown as ProcessService,
    notification,
    // network / AI：默认 Off（PRD §122 + 默认无需联网原则）
    aiEnabled: false,
  };
}
