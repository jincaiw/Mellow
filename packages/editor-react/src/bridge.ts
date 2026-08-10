/**
 * 桥接注入脚本（构建期注入 editor bundle，见 apps/desktop/scripts/build-editor-bundle.mjs）。
 *
 * CoreEditor 对宿主唯一的 OS 依赖是 `window.webkit.messageHandlers.bridge`。
 * Mellow 不修改 CoreEditor 源码，而是在 bundle 构建期注入本脚本：
 *   1. 把顶层 `window.__TAURI__` 传入 iframe（Tauri 2 只注入顶层窗口）；
 *   2. mock `window.webkit.messageHandlers.bridge.postMessage` → Tauri invoke('bridge_call')。
 */

export const BRIDGE_INJECTION = `(function () {
  if (window.parent && window.parent.__TAURI__) {
    try { window.__TAURI__ = window.parent.__TAURI__; } catch (e) {}
  }
  var handler = {
    postMessage: function (message) {
      if (!window.__TAURI__ || !window.__TAURI__.core) {
        return Promise.resolve(null);
      }
      return window.__TAURI__.core.invoke('bridge_call', { message: message });
    }
  };
  if (!window.webkit) { window.webkit = {}; }
  if (!window.webkit.messageHandlers) { window.webkit.messageHandlers = {}; }
  window.webkit.messageHandlers.bridge = handler;
})();`;

/** CoreEditor 的 webModules 是否就绪（iframe 加载完成且 core 模块存在） */
export function isCoreEditorReady(contentWindow: Window | null): boolean {
  if (!contentWindow) return false;
  const modules = (contentWindow as Window & { webModules?: unknown }).webModules;
  return typeof modules === 'object' && modules !== null;
}
