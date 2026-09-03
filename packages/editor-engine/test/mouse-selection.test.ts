/**
 * P4.5 鼠标单击/双击/三击/拖拽选择矩阵（Typora parity V4）。
 *
 * jsdom 无布局几何，CM 鼠标路径中唯一的几何依赖是
 * `view.posAtCoords` / `view.posAndSideAtCoords`（dist 8485/8496 行）。
 * 其余路径全部真实驱动：mousedown 派发到 view.contentDOM，
 * mousemove/mouseup 由 MouseSelection 构造器绑到 document 级监听
 * （dist 4737-4739 行），detail/buttons/shiftKey 按真实事件语义传入。
 *
 * 坐标约定：stub 把 x 线性映射为文档位置（每字符 10px，y 垂直分割行），
 * 即 mousedown(x) === 点击文档 pos = x / 10。
 */

import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import {
  buildSelectionToolbarExtension,
  installFormatApi,
  setSelectionToolbarEnabled,
} from '../src/selectionToolbar';
import { resetCompositionState } from '../src/composition';
import { sleep } from './utils/editor';

interface Coords {
  x: number;
  y: number;
}

/** 把 (x, y) 映射为文档 pos 的函数签名 */
type PosMap = (x: number, y: number) => number;

function makeView(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      history(),
      install(false), // 测试环境自行管理 composition 状态（不含 history，显式加）
    ],
  });
  view.focus();
  return view;
}

/**
 * 实例属性覆盖 posAtCoords / posAndSideAtCoords（dist 8485-8499 行签名）。
 * posAndSideAtCoords 返回 { pos, assoc, inside, bidi }；assoc 取 1（右倾向）。
 */
function stubMousePos(view: EditorView, map: PosMap): void {
  const v = view as unknown as Record<string, unknown>;
  v.posAtCoords = (coords: Coords): number | undefined => map(coords.x, coords.y);
  v.posAndSideAtCoords = (coords: Coords): { pos: number; assoc: number; inside: number; bidi: unknown } => ({
    pos: map(coords.x, coords.y),
    assoc: 1,
    inside: -1,
    bidi: undefined,
  });
}

/** 单字符 10px 的水平映射（单行文档用） */
const linearMap: PosMap = (x) => Math.max(0, Math.round(x / 10));

/** 事件坐标属性在 jsdom 中用 defineProperty 兜底（detail/buttons 非 init 可写属性） */
function withProps(event: MouseEvent, props: Record<string, number>): MouseEvent {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(event, key, { value, configurable: true });
  }
  return event;
}

function mouseDown(view: EditorView, x: number, y: number, detail: number, init: MouseEventInit = {}): void {
  const event = withProps(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
      ...init,
    }),
    { detail },
  );
  view.contentDOM.dispatchEvent(event);
}

function mouseMove(x: number, y: number, buttons = 1, init: MouseEventInit = {}): void {
  const event = withProps(
    new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y, ...init }),
    { buttons },
  );
  document.dispatchEvent(event);
}

function mouseUp(x: number, y: number, buttons = 1, init: MouseEventInit = {}): void {
  const event = withProps(
    new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y, ...init }),
    { buttons },
  );
  document.dispatchEvent(event);
}

function mainSel(view: EditorView): { from: number; to: number; head: number; anchor: number } {
  const main = view.state.selection.main;
  return { from: main.from, to: main.to, head: main.head, anchor: main.anchor };
}

function cleanBody(): void {
  document.body.innerHTML = '';
}

describe('P4.5 鼠标选择矩阵 — CM 基础路径', () => {
  beforeEach(() => {
    cleanBody();
  });

  afterEach(() => {
    cleanBody();
  });

  test('单击：caret 立即落到点击位置（mousedown 即 select，dragging=false）', () => {
    const view = makeView('foo bar baz');
    stubMousePos(view, linearMap);
    // pos 4 = 'bar' 起始（x=40）
    mouseDown(view, 40, 0, 1);
    const sel = mainSel(view);
    expect(sel.from).toBe(4);
    expect(sel.to).toBe(4);
    expect(sel.head).toBe(4);
    // 鼠标选择不改文档
    expect(view.state.doc.toString()).toBe('foo bar baz');
    view.destroy();
  });

  test('双击：选中点击处的词（groupAt）', () => {
    const view = makeView('foo bar baz');
    stubMousePos(view, linearMap);
    // pos 5 = 'bar' 中间（x=50）
    mouseDown(view, 50, 0, 2);
    const sel = mainSel(view);
    expect(sel.from).toBe(4);
    expect(sel.to).toBe(7);
    view.destroy();
  });

  test('三击：选中整行且含行尾换行符（非末行 to++）', () => {
    const view = makeView('foo bar\nsecond line');
    stubMousePos(view, linearMap);
    // pos 3 = 第一行 'foo' 中间（x=30）
    mouseDown(view, 30, 0, 3);
    const sel = mainSel(view);
    // 第一行 0..7，to == line.to 且 7 < doc.length(16) → to++ = 8（含换行）
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(8);
    view.destroy();
  });

  test('三击末行：不含尾换行（to == doc.length 时不再 to++）', () => {
    const view = makeView('foo bar\nsecond line');
    stubMousePos(view, linearMap);
    // 第二行 pos 8 + 3 = 11（x=110）
    mouseDown(view, 110, 0, 3);
    const sel = mainSel(view);
    expect(sel.from).toBe(8);
    expect(sel.to).toBe(19);
    view.destroy();
  });

  test('拖拽：mousedown 起点 → document mousemove 扩展选区 → mouseup 收尾', () => {
    const view = makeView('foo bar baz');
    stubMousePos(view, linearMap);
    mouseDown(view, 0, 0, 1); // 起点 pos 0
    expect(mainSel(view).to).toBe(0);
    mouseMove(70, 0, 1); // 拖到 pos 7
    const sel = mainSel(view);
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(7);
    mouseUp(70, 0, 1);
    expect(mainSel(view).to).toBe(7);
    view.destroy();
  });

  test('拖拽反向：从右往左 anchor 在右（head < anchor）', () => {
    const view = makeView('foo bar baz');
    stubMousePos(view, linearMap);
    mouseDown(view, 70, 0, 1); // 起点 pos 7
    mouseMove(0, 0, 1);
    mouseUp(0, 0, 1);
    const sel = mainSel(view);
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(7);
    expect(sel.anchor).toBe(7);
    expect(sel.head).toBe(0);
    view.destroy();
  });

  test('mousemove 无按键（buttons=0）：终止拖拽，选区保持不变', () => {
    const view = makeView('foo bar baz');
    stubMousePos(view, linearMap);
    mouseDown(view, 0, 0, 1);
    mouseMove(70, 0, 1);
    expect(mainSel(view).to).toBe(7);
    // buttons=0 → MouseSelection.move destroy（dist 4753-4755 行）
    mouseMove(100, 0, 0);
    mouseUp(100, 0);
    expect(mainSel(view).to).toBe(7);
    view.destroy();
  });

  test('Shift+单击：从既有选区 anchor 扩展（extend）', () => {
    const view = makeView('foo bar baz');
    stubMousePos(view, linearMap);
    view.dispatch({ selection: EditorSelection.range(0, 3) });
    mouseDown(view, 70, 0, 1, { shiftKey: true });
    mouseUp(70, 0, 1, { shiftKey: true });
    const sel = mainSel(view);
    // 选区 0..3 向 pos 7 扩展 → 0..7，anchor 保持 0
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(7);
    expect(sel.anchor).toBe(0);
    expect(sel.head).toBe(7);
    view.destroy();
  });

  test('双击 CJK：按 charCategory 聚类选词', () => {
    const view = makeView('你好世界 hello');
    stubMousePos(view, linearMap);
    // pos 1 = '好'（x=10）
    mouseDown(view, 10, 0, 2);
    const sel = mainSel(view);
    // CM 默认 categorizer：CJK 非 \w 归为 Other，连续同类聚类扩展
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(4);
    view.destroy();
  });

  test('双击标点：标点聚类独立于词（foo.bar）', () => {
    const view = makeView('foo.bar');
    stubMousePos(view, linearMap);
    // pos 3 = '.'（x=30）
    mouseDown(view, 30, 0, 2);
    const sel = mainSel(view);
    expect(sel.from).toBe(3);
    expect(sel.to).toBe(4);
    view.destroy();
  });

  test('点击现有选区内：mousedown+mouseup 后 collapse 到点击位', () => {
    const view = makeView('foo bar baz');
    stubMousePos(view, linearMap);
    view.dispatch({ selection: EditorSelection.range(4, 7) });
    // 点击选区内 pos 5（x=50）
    mouseDown(view, 50, 0, 1);
    mouseUp(50, 0, 1);
    const sel = mainSel(view);
    expect(sel.from).toBe(5);
    expect(sel.to).toBe(5);
    view.destroy();
  });

  test('鼠标选择不破坏 undo 分组：select.pointer 不参与 isolate（与 P4.3 交互）', () => {
    const view = makeView('foo bar baz');
    stubMousePos(view, linearMap);
    // 编辑：插入 XYZ（userEvent=input.type，进入原生聚合组）
    view.dispatch({
      changes: { from: 11, insert: 'XYZ' },
      selection: EditorSelection.cursor(14),
      userEvent: 'input.type',
    });
    expect(view.state.doc.toString()).toBe('foo bar bazXYZ');
    // 鼠标单击移走 caret（select.pointer，不改文档）
    mouseDown(view, 20, 0, 1);
    mouseUp(20, 0, 1);
    expect(mainSel(view).head).toBe(2);
    // undo 一次撤掉插入且不产生多余空组
    undo(view);
    expect(view.state.doc.toString()).toBe('foo bar baz');
    view.destroy();
  });
});

describe('P4.5 鼠标选择矩阵 — Mellow 集成（selectionToolbar）', () => {
  beforeEach(() => {
    resetCompositionState();
    setSelectionToolbarEnabled(true);
    cleanBody();
  });

  afterEach(() => {
    cleanBody();
  });

  test('双击选词触发 selectionToolbar 显示；单击空白处隐藏', async () => {
    installFormatApi();
    // 不用 install(false)：install 内置 buildSelectionToolbarExtension()（index.ts:235），
    // 会产生第二个 .mellow-selection-toolbar 且 jsdom 下默认 getAnchor 不可用（恒隐藏）。
    // 与 selectionToolbar.test.ts 同构：markdown + 单一显式 toolbar 扩展。
    const view = new EditorView({
      doc: 'foo bar baz',
      parent: document.body,
      extensions: [
        markdown({ base: markdownLanguage }),
        buildSelectionToolbarExtension({ getAnchor: () => ({ top: 200, left: 40 }) }),
      ],
    });
    view.focus();
    stubMousePos(view, linearMap);

    mouseDown(view, 50, 0, 2); // 双击 'bar' → 4..7
    expect(mainSel(view).to).toBe(7);
    await sleep(30);
    const el = document.querySelector<HTMLDivElement>('.mellow-selection-toolbar');
    expect(el).not.toBeNull();
    expect(el?.style.display).not.toBe('none');

    // 单击 caret 位 → 选区清空 → 工具栏隐藏
    mouseDown(view, 100, 0, 1);
    mouseUp(100, 0, 1);
    await sleep(30);
    expect(document.querySelector<HTMLDivElement>('.mellow-selection-toolbar')?.style.display).toBe('none');
    view.destroy();
  });
});
