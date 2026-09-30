export interface PinchZoomBridge {
  pinchZoomTarget?: () => PinchZoomTarget | null;
}

export interface PinchZoomTarget {
  scroller: HTMLElement;
  inner: HTMLElement;
}

/**
 * Disable the native magnification (which makes content scrollable), instead
 * using a re-layout strategy that makes the content size fit into the container.
 *
 * Installs `bridge.pinchZoomTarget`, an overridable resolver defaulting to the
 * source editor, and reads it per gesture so extensions can redirect the zoom.
 *
 * @returns **disposer** —— 移除三个手势监听器并把内联 `zoom` 复位到 CSS 定义值。
 *
 * ⚠️ 2026-09-30（Mellow）：原先本函数**没有返回值**，即「装上监听器就撤不掉」。
 * 当它只被 Quick Look（一次性只读预览）使用时无所谓；但一旦做成**用户可切换的设置**
 * （Typora `allowMagnification`），没有 disposer 就只能「只能开、关不掉」——
 * 那会给出一个「关了但没生效」的控件，正是本项目反复记录的那类缺陷。
 * 故补 disposer，使开关两个方向都真实生效。
 */
export function enablePinchZoom(bridge: PinchZoomBridge): () => void {
  bridge.pinchZoomTarget = () => {
    const scroller = document.querySelector<HTMLElement>('.cm-scroller');
    const inner = scroller?.querySelector<HTMLElement>('.cm-content') ?? null;
    return scroller !== null && inner !== null ? { scroller, inner } : null;
  };

  let target: PinchZoomTarget | null = null;
  /** 最后一次参与手势的内容元素 —— disposer 需要它来复位内联 zoom */
  let lastInner: HTMLElement | null = null;
  let minValue = MIN_ZOOM_LEVEL;
  let initialValue = 1.0;
  let contentX = 0.0;
  let contentY = 0.0;

  // Resting zoom per element, captured before we ever write an inline zoom.
  const restingZooms = new WeakMap<HTMLElement, number>();

  const onGestureStart = (event: Event) => {
    target = bridge.pinchZoomTarget?.() ?? null;
    if (target === null) {
      return;
    }

    const gesture = event as GestureEvent;
    gesture.preventDefault();

    const { scroller, inner } = target;
    lastInner = inner;
    let resting = restingZooms.get(inner);
    if (resting === undefined) {
      resting = Number(getComputedStyle(inner).zoom) || 1.0;
      restingZooms.set(inner, resting);
    }

    initialValue = Number(inner.style.zoom) || resting;
    minValue = Math.min(MIN_ZOOM_LEVEL, resting);

    const rect = scroller.getBoundingClientRect();
    contentX = (scroller.scrollLeft + gesture.clientX - rect.left) / initialValue;
    contentY = (scroller.scrollTop + gesture.clientY - rect.top) / initialValue;
  };

  const onGestureChange = (event: Event) => {
    if (target === null) {
      return;
    }

    const gesture = event as GestureEvent;
    gesture.preventDefault();

    const { scroller, inner } = target;
    lastInner = inner;
    const newValue = Math.max(minValue, Math.min(MAX_ZOOM_LEVEL, initialValue * gesture.scale));
    inner.style.zoom = String(newValue);

    const rect = scroller.getBoundingClientRect();
    scroller.scrollLeft = contentX * newValue - (gesture.clientX - rect.left);
    scroller.scrollTop = contentY * newValue - (gesture.clientY - rect.top);
  };

  const onGestureEnd = (event: Event) => {
    if (target === null) {
      return;
    }

    event.preventDefault();
    target = null;
  };

  document.addEventListener('gesturestart', onGestureStart, { passive: false });
  document.addEventListener('gesturechange', onGestureChange, { passive: false });
  document.addEventListener('gestureend', onGestureEnd, { passive: false });

  return () => {
    document.removeEventListener('gesturestart', onGestureStart);
    document.removeEventListener('gesturechange', onGestureChange);
    document.removeEventListener('gestureend', onGestureEnd);
    // 复位：内联 zoom 清空后回落到 CSS 定义值（= 捕获到的 resting）。
    // 只复位「参与过手势」的元素，避免误动从未被缩放的节点。
    if (lastInner !== null) {
      lastInner.style.zoom = '';
    }
    target = null;
    lastInner = null;
  };
}

interface GestureEvent extends Event {
  scale: number;
  clientX: number;
  clientY: number;
}

const MIN_ZOOM_LEVEL = 1.0;
const MAX_ZOOM_LEVEL = 2.5;
