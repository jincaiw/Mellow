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
  // ⚠️ 2026-11-07（原生实测，审计 §4.356）：在**真实 WKWebView** 里 messageHandlers 是
  // WebKit 的原生包装对象：它**跨访问稳定**（identity 相同），但 **JS 侧新增的自有属性会被
  // WebKit 按原生 handler 注册表清扫**（注册表里没有名为 bridge 的原生 handler ⇒ 赋值在
  // 解析期存活、约 1–2.5s 后消失）。MarkEdit 内核每次调用都重新解析
  // window.webkit?.messageHandlers?.bridge?.postMessage ⇒ 属性被扫掉后**整条链静默短路**
  // （可选链短路连 .then 都不执行）⇒ notifyViewDidUpdate 等全部核心通知**无声死亡**
  // （dirty 恒 false → ● 不显示 → 关闭确认门不触发 → 脏窗口直接销毁 = 数据丢失）。
  // 修法：把 handler 装到 messageHandlers 的**原型**上（属性查找落到原型链，不受清扫影响；
  // 原生 handler 若存在则仍是自有属性、优先遮蔽原型 ⇒ 语义不变）。
  // 判据护栏：原型为 Object.prototype 时**不装**（jsdom/浏览器 dev 的合成对象场景 ⇒ 避免
  // 污染全局 Object.prototype），退回旧的自有属性赋值（那些环境里无人清扫，旧行为正确）。
  var mh = window.webkit.messageHandlers;
  var proto = Object.getPrototypeOf(mh);
  if (proto && proto !== Object.prototype) {
    Object.defineProperty(proto, 'bridge', {
      get: function () { return handler; },
      configurable: true,
    });
  } else {
    mh.bridge = handler;
  }
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
