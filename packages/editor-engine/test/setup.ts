/**
 * jest 环境准备：
 * - 提供 window.require（引擎运行时解析 CM6 模块，与测试直接 import 的实例一致）
 * - CM6 在 jsdom 需要的基础 polyfill
 */

// window.require mock：引擎内部通过 window.require('@codemirror/view') 获取模块
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeRequire = require;

(window as unknown as { require?: (id: string) => unknown }).require = (id: string) => nodeRequire(id);

// CM6 在 jsdom 需要的 DOM polyfill（参考 CoreEditor test/utils/setup.ts）
if (typeof (window as unknown as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe(): void { /* no-op */ }
    unobserve(): void { /* no-op */ }
    disconnect(): void { /* no-op */ }
  }
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverMock;
}

if (typeof (window as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame === 'undefined') {
  (window as unknown as { requestAnimationFrame: (cb: () => void) => number }).requestAnimationFrame = (cb: () => void) => {
    return setTimeout(cb, 16) as unknown as number;
  };
}

// jsdom 缺 getClientRects（CM 文本测量用）
Range.prototype.getClientRects = function (): DOMRectList {
  return [] as unknown as DOMRectList;
};

// jsdom 缺 scrollTo
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function (): void { /* no-op */ } as unknown as typeof Element.prototype.scrollTo;
}

export {};
