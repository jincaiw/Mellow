/**
 * 桥接注入 —— 消除 CoreEditor 的 WebKit 依赖（构建期注入）。
 *
 * CoreEditor 唯一 OS 耦合：`window.webkit.messageHandlers.bridge.postMessage()`。
 * 本脚本在 bundle 构建期注入，把该调用路由到「宿主桥」（平台无关契约）：
 *
 *   window.__MELLOW_BRIDGE__ = { invoke(message): Promise<unknown> }
 *
 * 契约约定（editor-core 不认识任何具体运行时 —— Tauri/Electron/测试 都是同一契约）：
 * - Tauri：desktop Adapter 层把 __MELLOW_BRIDGE__ 接到 Tauri 全局桥（invoke('bridge_call')）
 *   （见 apps/desktop/scripts/build-editor-bundle.mjs 的 tauri-bridge adapter）；
 * - Electron/测试：宿主直接注册 __MELLOW_BRIDGE__（installBridge）。
 *
 * 无宿主桥时 no-op（浏览器 dev / 无 native 环境），CoreEditor 内部防御式处理。
 */

export const BRIDGE_INJECTION = `(function () {
  var handler = {
    postMessage: function (message) {
      var bridge = window.__MELLOW_BRIDGE__;
      if (!bridge || typeof bridge.invoke !== 'function') {
        return Promise.resolve(null); // 无宿主桥：no-op（浏览器 dev / 测试）
      }
      return bridge.invoke(message);
    }
  };
  if (!window.webkit) { window.webkit = {}; }
  if (!window.webkit.messageHandlers) { window.webkit.messageHandlers = {}; }
  window.webkit.messageHandlers.bridge = handler;
})();`;

declare global {
  interface Window {
    /** 宿主桥（平台无关契约）：Web→宿主 消息路由 */
    __MELLOW_BRIDGE__?: { invoke(message: unknown): Promise<unknown> };
  }
}

/**
 * 在顶层 window 注册宿主桥（iframe 内注入脚本会读取）。
 * 供非 Tauri 宿主（Electron/测试/浏览器 dev）使用；Tauri 场景由 desktop Adapter 注入。
 */
export function installBridge(bridge: { invoke(message: unknown): Promise<unknown> }): void {
  (window as Window).__MELLOW_BRIDGE__ = bridge;
}
