/**
 * jest 环境准备：jsdom 基础 polyfill（参考 editor-engine/test/setup.ts）。
 */

// jsdom 缺省 DOM API
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

Range.prototype.getClientRects = function (): DOMRectList {
  return [] as unknown as DOMRectList;
};

if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function (): void { /* no-op */ } as unknown as typeof Element.prototype.scrollTo;
}

export {};
