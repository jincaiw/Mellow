/**
 * `setAllowMagnification`（**Mellow 增补**，2026-09-30；上游 CoreEditor 没有）——
 * 把 Typora「双指缩放」（`allowMagnification`）接到**主编辑器**。
 *
 * 为什么单独立测：手势实现（`@quicklook/zoom.ts` 的 `enablePinchZoom`）上游只用于
 * Quick Look（一次性只读预览），**装上监听器就撤不掉**也无所谓；做成用户可切换的设置后，
 * 「关不掉」会给出一个**假控件**（关了但没生效）。故本测断言的是**开关两个方向**：
 * 开 → 手势生效；关 → 手势失效**且**内联 zoom 复位。
 */
import { describe, expect, test, beforeEach } from '@jest/globals';
import { setAllowMagnification } from '../src/modules/config';
import { Config } from '../src/config';

window.config = {
  theme: 'github-light',
  typewriterMode: false,
  focusMode: false,
  readOnlyMode: false,
  showLineNumbers: false,
  showActiveLineIndicator: false,
  lineWrapping: false,
  autoCharacterPairs: false,
  lineHeight: 1.5,
  fontSize: 14,
  fontFace: { family: 'monospace' },
  invisiblesBehavior: 'never',
  indentBehavior: 'never',
} as Config;

function setUpTarget(): HTMLElement {
  const scroller = document.createElement('div');
  scroller.className = 'cm-scroller';
  const inner = document.createElement('div');
  inner.className = 'cm-content';
  scroller.appendChild(inner);
  document.body.appendChild(scroller);
  return inner;
}

function dispatchGesture(type: string, props: { scale?: number; clientX?: number; clientY?: number } = {}): void {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { scale: 1, clientX: 0, clientY: 0, ...props });
  document.dispatchEvent(event);
}

/** 走一遍完整手势（start → change），返回 change 后内联 zoom 的值 */
function pinch(scale: number): string {
  dispatchGesture('gesturestart', { scale: 1 });
  dispatchGesture('gesturechange', { scale });
  dispatchGesture('gestureend');
  return document.querySelector<HTMLElement>('.cm-content')?.style.zoom ?? '';
}

/**
 * 读内联 zoom。
 * ⚠️ jsdom 里**从未被赋值**的 `style.zoom` 读回 `undefined`（而 TS 类型是 `string`），
 * 故此处经 cast 归一为 `''` —— 直接写 `style.zoom ?? ''` 会被 eslint 判为
 * `no-unnecessary-condition`（类型上不可能为 null/undefined）。
 */
const inlineZoom = (el: HTMLElement): string =>
  (el.style as unknown as { zoom?: string }).zoom ?? '';

describe('setAllowMagnification（Typora「双指缩放」接到主编辑器）', () => {
  beforeEach(() => {
    setAllowMagnification(false); // 复位（防上一条用例的监听器泄漏）
    document.body.innerHTML = '';
  });

  test('默认关：手势不改动 zoom', () => {
    const inner = setUpTarget();
    setAllowMagnification(false);
    expect(window.config.allowMagnification).toBe(false);
    expect(pinch(2)).toBe('');
    expect(inlineZoom(inner)).toBe('');
  });

  test('开启后手势生效，且 config 标志同步', () => {
    const inner = setUpTarget();
    setAllowMagnification(true);
    expect(window.config.allowMagnification).toBe(true);
    expect(Number(pinch(2))).toBe(2);
    expect(inner.style.zoom).not.toBe('');
  });

  test('★ 关闭后手势失效**且内联 zoom 复位**（disposer 真的撤掉了监听器）', () => {
    const inner = setUpTarget();
    setAllowMagnification(true);
    expect(Number(pinch(2))).toBe(2);
    expect(inner.style.zoom).not.toBe('');

    setAllowMagnification(false);
    expect(window.config.allowMagnification).toBe(false);
    // ① 复位：清空内联 zoom（回落 CSS 定义值）
    expect(inner.style.zoom).toBe('');
    // ② 再捏合不再生效
    expect(pinch(2)).toBe('');
  });

  test('幂等：连续开启两次，关一次即完全失效（不叠加监听器）', () => {
    const inner = setUpTarget();
    setAllowMagnification(true);
    setAllowMagnification(true);
    setAllowMagnification(false);
    expect(pinch(2)).toBe('');
    expect(inlineZoom(inner)).toBe('');
  });
});
