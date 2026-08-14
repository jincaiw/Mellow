/**
 * extensions/context.ts —— 按权限构建扩展上下文（运行时门卫）。
 * 每个门面方法在调用时校验权限（非类型承诺）：未声明 → permission-denied；
 * 高危权限（process/keychain）→ not-implemented（V1 一律拒绝）。
 */
import {
  ExtensionManifest,
  ExtensionContext,
  ExtensionDocumentApi,
  ExtensionWorkspaceApi,
  ExtensionNetworkApi,
  ExtensionClipboardApi,
  ExtensionProcessApi,
  ExtensionKeychainApi,
  ExtensionNotificationApi,
  ExtensionAiApi,
  ExtensionContributions,
  ExtensionPermission,
  permissionDenied,
  notImplemented,
} from '../../../extension-api/src';
import { hasPermission, isRestricted } from '../../../extension-api/src/permissions';
import type { ExtensionHost } from './host';

export interface BuildContextOptions {
  contributions: ExtensionContributions;
}

/** 构建受限上下文（每方法运行时门卫） */
export function buildExtensionContext(
  manifest: ExtensionManifest,
  host: ExtensionHost,
  options: BuildContextOptions,
): ExtensionContext {
  const perms = manifest.permissions;

  const document: ExtensionDocumentApi = {
    getText: () => {
      requirePermission(perms, 'document.read');
      return host.document.getText();
    },
    getSelection: () => {
      requirePermission(perms, 'document.read');
      return host.document.getSelection();
    },
    getCursor: () => {
      requirePermission(perms, 'document.read');
      return host.document.getCursor();
    },
    insertText: (text, from, to) => {
      requirePermission(perms, 'document.write');
      host.document.insertText(text, from, to);
    },
    replaceSelection: (text) => {
      requirePermission(perms, 'document.write');
      host.document.replaceSelection(text);
    },
  };

  const workspace: ExtensionWorkspaceApi = {
    listFiles: async (dir) => {
      requirePermission(perms, 'workspace.read');
      const r = await host.fs.readDir(dir);
      return r.ok
        ? r.value.map((e) => ({ path: e.path, name: e.name, isDirectory: e.isDirectory }))
        : Promise.reject(r.error.message);
    },
    readFile: async (path) => {
      requirePermission(perms, 'workspace.read');
      const r = await host.fs.readText(path);
      if (!r.ok) {
        if (r.error.code === 'not-found') return null;
        return Promise.reject(r.error.message);
      }
      return r.value;
    },
    writeFile: async (path, content) => {
      requirePermission(perms, 'workspace.write');
      const r = await host.fs.writeText(path, content);
      if (!r.ok) return Promise.reject(r.error.message);
    },
    mkdir: async (path) => {
      requirePermission(perms, 'workspace.write');
      const r = await host.fs.mkdir(path);
      if (!r.ok) return Promise.reject(r.error.message);
    },
    delete: async (path) => {
      requirePermission(perms, 'workspace.write');
      // FileService.delete = 回收站语义（PRD §57），非永久删除
      const r = await host.fs.delete(path);
      if (!r.ok) return Promise.reject(r.error.message);
    },
  };

  const network: ExtensionNetworkApi = {
    fetch: async (url, init) => {
      requirePermission(perms, 'network');
      if (host.fetch === undefined) throw notImplemented('network');
      return host.fetch(url, init);
    },
  };

  const clipboard: ExtensionClipboardApi = {
    readText: async () => {
      requirePermission(perms, 'clipboard');
      const r = await host.clipboard.readText();
      if (!r.ok) return Promise.reject(r.error.message);
      return r.value;
    },
    writeText: async (text) => {
      requirePermission(perms, 'clipboard');
      const r = await host.clipboard.writeText(text);
      if (!r.ok) return Promise.reject(r.error.message);
    },
  };

  const processApi: ExtensionProcessApi = {
    exec: async () => {
      // 高危权限：V1 一律拒绝（契约就绪，待显式授权流程）
      throw notImplemented('process');
    },
  };

  const keychain: ExtensionKeychainApi = {
    get: async () => { throw notImplemented('keychain'); },
    set: async () => { throw notImplemented('keychain'); },
    delete: async () => { throw notImplemented('keychain'); },
  };

  const notification: ExtensionNotificationApi = {
    show: async (opts) => {
      requirePermission(perms, 'notification');
      const r = await host.notification.show({ title: opts.title, body: opts.body ?? '' });
      if (!r.ok) return Promise.reject(r.error.message);
    },
  };

  const ai: ExtensionAiApi | null = host.aiEnabled ? {
    complete: async (prompt, doc) => {
      // AI 默认 Off：仅宿主启用 AI 且扩展声明 ai 贡献点时可达
      requirePermission(perms, 'network');
      if (host.fetch === undefined) throw notImplemented('network');
      const r = await host.fetch('mellow://ai', { method: 'POST', body: JSON.stringify({ prompt, doc }) });
      return r.text();
    },
  } : null;

  return { manifest, document, workspace, network, clipboard, process: processApi, keychain, notification, ai, contributions: options.contributions };
}

function requirePermission(perms: ExtensionPermission[], permission: ExtensionPermission): void {
  if (!hasPermission(perms, permission)) throw permissionDenied(permission);
  if (isRestricted(permission)) throw notImplemented(permission);
}
