/**
 * 桥接注入 —— 消除 CoreEditor 的 WebKit 依赖（构建期注入）。
 *
 * CoreEditor 唯一 OS 耦合：`window.webkit.messageHandlers.bridge.postMessage()`。
 * 本脚本在 bundle 构建期注入，把该调用路由到「宿主桥」（平台无关）：
 *   1. window.__MELLOW_BRIDGE__（宿主显式注册，最优先）
 *   2. window.parent.__TAURI__（Tauri 2，withGlobalTauri）
 *
 * 这样 CoreEditor 在 WebView2 / WKWebView / WebKitGTK / 纯浏览器 / jsdom
 * 中行为一致 —— Safari-only assumption 被消除。
 */

export const BRIDGE_INJECTION = `(function () {
  // 宿主桥解析：__MELLOW_BRIDGE__（invoke(message)）> __TAURI__（invoke(cmd, args)）
  function resolveBridge() {
    if (window.__MELLOW_BRIDGE__ && typeof window.__MELLOW_BRIDGE__.invoke === 'function') {
      return { type: 'mellow', bridge: window.__MELLOW_BRIDGE__ };
    }
    if (window.parent && window.parent.__TAURI__) {
      try { window.__TAURI__ = window.parent.__TAURI__; } catch (e) {}
    }
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
      return { type: 'tauri', bridge: window.__TAURI__.core };
    }
    return null;
  }
  var handler = {
    postMessage: function (message) {
      var resolved = resolveBridge();
      if (!resolved) {
        return Promise.resolve(null); // 无宿主桥：no-op（浏览器 dev / 测试）
      }
      if (resolved.type === 'tauri') {
        return resolved.bridge.invoke('bridge_call', { message: message });
      }
      return resolved.bridge.invoke(message);
    }
  };
  if (!window.webkit) { window.webkit = {}; }
  if (!window.webkit.messageHandlers) { window.webkit.messageHandlers = {}; }
  window.webkit.messageHandlers.bridge = handler;
})();`;

declare global {
  interface Window {
    /** 宿主显式注册的桥（EditorCore.installBridge 设置） */
    __MELLOW_BRIDGE__?: { invoke(message: unknown): Promise<unknown> };
    __TAURI__?: { core?: { invoke(cmd: string, args?: unknown): Promise<unknown> } };
  }
}

/**
 * 在顶层 window 注册宿主桥（iframe 内注入脚本会读取）。
 * 供非 Tauri 宿主（Electron/测试）使用；Tauri 场景无需调用（自动走 __TAURI__）。
 */
export function installBridge(bridge: { invoke(message: unknown): Promise<unknown> }): void {
  (window as Window).__MELLOW_BRIDGE__ = bridge;
}
