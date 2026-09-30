import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { enablePinchZoom, PinchZoomBridge } from '../src/@quicklook/zoom';

// jsdom has no GestureEvent and does no layout: getBoundingClientRect() is all
// zeros, getComputedStyle().zoom is undefined, but style.zoom and scrollLeft/Top
// round-trip. Tests rely on the zero rect to keep the anchoring math simple.

interface GestureProps {
  scale: number;
  clientX: number;
  clientY: number;
}

function dispatchGesture(type: string, props: Partial<GestureProps> = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { scale: 1, clientX: 0, clientY: 0, ...props });
  document.dispatchEvent(event);
  return event;
}

function setUpTarget(restingZoom?: string) {
  const scroller = document.createElement('div');
  scroller.className = 'cm-scroller';

  const inner = document.createElement('div');
  inner.className = 'cm-content';

  scroller.appendChild(inner);
  document.body.appendChild(scroller);

  if (restingZoom !== undefined) {
    jest.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      return { zoom: restingZoom } as unknown as CSSStyleDeclaration;
    });
  }

  return { scroller, inner };
}

describe('Pinch-zoom test suite', () => {
  // enablePinchZoom adds permanent document listeners; capture and remove them
  // after each test so suites don't leak handlers into one another.
  const listeners: Array<[string, EventListener]> = [];

  beforeEach(() => {
    listeners.length = 0;
    const original = document.addEventListener.bind(document);
    jest.spyOn(document, 'addEventListener').mockImplementation((type, callback, options) => {
      listeners.push([type, callback as EventListener]);
      original(type, callback as EventListener, options);
    });
  });

  afterEach(() => {
    listeners.forEach(([type, callback]) => document.removeEventListener(type, callback));
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  test('installs a default resolver targeting the source editor', () => {
    const { scroller, inner } = setUpTarget();
    const bridge: PinchZoomBridge = {};
    enablePinchZoom(bridge);
    expect(bridge.pinchZoomTarget?.()).toEqual({ scroller, inner });
  });

  test('default resolver returns null when the editor is absent', () => {
    const bridge: PinchZoomBridge = {};
    enablePinchZoom(bridge);
    expect(bridge.pinchZoomTarget?.()).toBeNull();
  });

  test('clamps zoom-in to the maximum level', () => {
    const { inner } = setUpTarget();
    enablePinchZoom({});

    dispatchGesture('gesturestart');
    dispatchGesture('gesturechange', { scale: 100 });
    expect(Number(inner.style.zoom)).toBe(2.5);
  });

  test('clamps zoom-out to the minimum level (1.0 by default)', () => {
    const { inner } = setUpTarget();
    enablePinchZoom({});

    dispatchGesture('gesturestart');
    dispatchGesture('gesturechange', { scale: 0.01 });
    expect(Number(inner.style.zoom)).toBe(1.0);
  });

  test('honors a sub-1.0 resting zoom as the floor', () => {
    const { inner } = setUpTarget('0.9');
    enablePinchZoom({});

    dispatchGesture('gesturestart');
    dispatchGesture('gesturechange', { scale: 0.01 });
    expect(Number(inner.style.zoom)).toBe(0.9);
  });

  test('can return to the resting zoom after zooming to the maximum', () => {
    const { inner } = setUpTarget('0.9');
    enablePinchZoom({});

    // Zoom all the way in, leaving an inline zoom of 2.5.
    dispatchGesture('gesturestart');
    dispatchGesture('gesturechange', { scale: 100 });
    dispatchGesture('gestureend');
    expect(Number(inner.style.zoom)).toBe(2.5);

    // A fresh gesture must still floor at the 0.9 resting value, not 1.0,
    // even though the live computed zoom is now polluted by the inline 2.5.
    dispatchGesture('gesturestart');
    dispatchGesture('gesturechange', { scale: 0.01 });
    expect(Number(inner.style.zoom)).toBe(0.9);
  });

  test('preserves the scroll anchor under the pinch midpoint', () => {
    const { scroller, inner } = setUpTarget();
    scroller.scrollLeft = 200;
    scroller.scrollTop = 100;
    enablePinchZoom({});

    dispatchGesture('gesturestart', { clientX: 40, clientY: 50 });
    dispatchGesture('gesturechange', { scale: 2, clientX: 40, clientY: 50 });

    // contentX = (200 + 40) / 1 = 240, newValue = 2 -> 240 * 2 - 40 = 440.
    // contentY = (100 + 50) / 1 = 150, newValue = 2 -> 150 * 2 - 50 = 250.
    expect(Number(inner.style.zoom)).toBe(2);
    expect(scroller.scrollLeft).toBe(440);
    expect(scroller.scrollTop).toBe(250);
  });

  test('ignores gesturechange and gestureend without an active gesture', () => {
    const { inner } = setUpTarget();
    enablePinchZoom({});

    const zoomBefore = inner.style.zoom;
    dispatchGesture('gesturechange', { scale: 2 });
    expect(inner.style.zoom).toBe(zoomBefore);
    expect(() => dispatchGesture('gestureend')).not.toThrow();
  });

  test('stops applying zoom after the gesture ends', () => {
    const { inner } = setUpTarget();
    enablePinchZoom({});

    dispatchGesture('gesturestart');
    dispatchGesture('gesturechange', { scale: 2 });
    dispatchGesture('gestureend');

    const zoomAfterEnd = inner.style.zoom;
    dispatchGesture('gesturechange', { scale: 100 });
    expect(inner.style.zoom).toBe(zoomAfterEnd);
  });

  test('redirects zoom to an overridden resolver target', () => {
    setUpTarget();
    const overrideScroller = document.createElement('div');
    const overrideInner = document.createElement('div');
    overrideScroller.appendChild(overrideInner);
    document.body.appendChild(overrideScroller);

    const bridge: PinchZoomBridge = {};
    enablePinchZoom(bridge);
    bridge.pinchZoomTarget = () => ({ scroller: overrideScroller, inner: overrideInner });

    dispatchGesture('gesturestart');
    dispatchGesture('gesturechange', { scale: 100 });
    expect(Number(overrideInner.style.zoom)).toBe(2.5);
  });

  // 2026-09-30（Mellow）：本函数此前**没有返回值**（装上监听器就撤不掉），
  // 只能「开」不能「关」。做成了用户可切换的设置（Typora allowMagnification）后，
  // 没有 disposer 就会给出「关了但没生效」的假控件 —— 故补测两个方向。
  test('disposer 移除手势监听器并把内联 zoom 复位（关得掉）', () => {
    const { inner } = setUpTarget();
    const dispose = enablePinchZoom({});
    expect(typeof dispose).toBe('function');

    dispatchGesture('gesturestart', { scale: 1 });
    dispatchGesture('gesturechange', { scale: 2 });
    expect(inner.style.zoom).not.toBe(''); // 手势确实改过 zoom（前提，防空壳）

    dispose();
    // ① 内联 zoom 复位到 CSS 定义值
    expect(inner.style.zoom).toBe('');
    // ② 监听器已移除：再派发手势不再改动 zoom
    inner.style.zoom = '1.4';
    dispatchGesture('gesturestart', { scale: 1 });
    dispatchGesture('gesturechange', { scale: 2 });
    expect(inner.style.zoom).toBe('1.4');
  });

  test('disposer 幂等：重复调用不抛错', () => {
    setUpTarget();
    const dispose = enablePinchZoom({});
    dispose();
    expect(() => dispose()).not.toThrow();
  });
});
