/**
 * Host Adapter 的桥接层（ADR-0007：Editor/UI 不直接依赖 Tauri/OS API）。
 *
 * CoreEditor 对宿主唯一的硬依赖是 `window.webkit.messageHandlers.bridge.postMessage()`。
 * Mellow 不修改 CoreEditor 源码，而是在 editor bundle 构建期注入本脚本：
 *   1. 把顶层 `window.__TAURI__` 传入 iframe（Tauri 2 只注入顶层窗口）；
 *   2. mock `window.webkit.messageHandlers.bridge.postMessage` → Tauri invoke('bridge_call')。
 *
 * 该脚本在构建期由 scripts/build-editor-bundle.mjs 注入 editor bundle。
 */

export const BRIDGE_INJECTION = `(function () {
  // Tauri 2 (withGlobalTauri) 只在顶层 window 注入 __TAURI__；iframe 需要显式引用。
  if (window.parent && window.parent.__TAURI__) {
    try { window.__TAURI__ = window.parent.__TAURI__; } catch (e) { /* cross-origin */ }
  }

  // Mock CoreEditor 依赖的 WebKit 消息通道。
  var handler = {
    postMessage: function (message) {
      if (!window.__TAURI__ || !window.__TAURI__.core) {
        return Promise.resolve(null); // 浏览器开发模式：no-op
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
