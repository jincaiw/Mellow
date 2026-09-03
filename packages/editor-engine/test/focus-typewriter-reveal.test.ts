/**
 * P4.9 Focus / Typewriter 与 marker reveal 联合测试（Typora parity V4）。
 *
 * 三插件共存语义（focusMode.ts / typewriterMode.ts / plugin.ts 已核实）：
 * - reveal（MARKER_CLASS，mark decoration）与 Focus dim（FOCUS_DIM_CLASS，
 *   line decoration）是独立 Decoration 通道，互不覆盖；
 * - Typewriter 只写 scrollDOM.scrollTop（rAF 调度），不触碰 selection/doc；
 * - 三者均受 composition 守卫（isComposing）：reveal 冻结重算、typewriter 不滚动。
 */

import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { buildFocusModeExtension, FOCUS_DIM_CLASS, setFocusMode } from '../src/focusMode';
import { buildTypewriterModeExtension, setTypewriterMode } from '../src/typewriterMode';
import { installCompositionTracking, resetCompositionState } from '../src/composition';
import { moveCaret, markerTexts, insertAt, setUpEditor, sleep } from './harness';

/**
 * 基准文档（5 行）：
 *   line1 '# Head'          0..6
 *   line2 '**bold** line'   7..20（bold 节点 7..15）
 *   line3 ''                20..21
 *   line4 'plain para'      21..31
 *   line5 'last'            31..35
 */
const DOC = '# Head\n**bold** line\n\nplain para\nlast';

describe('P4.9 Focus × marker reveal', () => {
  beforeEach(() => {
    resetCompositionState();
    setFocusMode('off');
    setTypewriterMode(false);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    setFocusMode('off');
    setTypewriterMode(false);
    document.body.innerHTML = '';
  });

  function dimTexts(view: EditorView): string[] {
    return Array.from(view.dom.querySelectorAll(`.${FOCUS_DIM_CLASS}`)).map((el) => el.textContent ?? '');
  }

  test('line 模式：非焦点行 dim 与 marker 隐藏并存且互不干扰', async () => {
    const view = setUpEditor(DOC);
    moveCaret(view, 25); // 'plain para' 行（line4，无 marker 节点）
    await sleep();
    setFocusMode('line');
    await sleep(20);

    // reveal 正常：heading 与 bold marker 隐藏
    const texts = markerTexts(view);
    expect(texts).toContain('# ');
    expect(texts.filter((t) => t === '**').length).toBe(2);
    // focus dim：line4 之外 4 行 dim
    const dim = dimTexts(view);
    expect(dim.length).toBe(4);
    expect(dim.join('\n')).not.toContain('plain para');
    // doc / selection 不变
    expect(view.state.doc.toString()).toBe(DOC);
    expect(view.state.selection.main.head).toBe(25);
    view.destroy();
  });

  test('paragraph 模式：caret 在 bold 内 → 本段 source 不 dim，他段 dim 且 rendered', async () => {
    const view = setUpEditor(DOC);
    moveCaret(view, 10); // bold 内容内（line2）
    await sleep();
    setFocusMode('paragraph');
    await sleep(20);

    // caret 在 bold 节点内 → bold source（无 '**' 隐藏项）；heading 节点不含 caret → rendered
    const texts = markerTexts(view);
    expect(texts).toContain('# ');
    expect(texts.filter((t) => t === '**').length).toBe(0);
    // dim：段落2（line2）之外全部 dim；line2 不 dim
    const dim = dimTexts(view);
    expect(dim.join('\n')).not.toContain('**bold** line');
    expect(dim.join('\n')).toContain('plain para');
    expect(dim.join('\n')).toContain('last');
    view.destroy();
  });

  test('Focus 模式切换 off→line→off：reveal 状态与 doc 不变', async () => {
    const view = setUpEditor(DOC);
    moveCaret(view, 25);
    await sleep();
    const before = markerTexts(view);

    setFocusMode('line');
    await sleep(20);
    setFocusMode('off');
    await sleep(20);

    expect(markerTexts(view)).toEqual(before);
    expect(view.dom.querySelectorAll(`.${FOCUS_DIM_CLASS}`).length).toBe(0);
    expect(view.state.doc.toString()).toBe(DOC);
    view.destroy();
  });

  test('caret 跨行移动：dim 行集合与 marker reveal 同步更新', async () => {
    const view = setUpEditor(DOC);
    moveCaret(view, 10); // bold 行内
    await sleep();
    setFocusMode('line');
    await sleep(20);
    // 初态：bold source（无 '**' 隐藏），line2 不 dim
    expect(markerTexts(view).filter((t) => t === '**').length).toBe(0);
    expect(dimTexts(view).join('\n')).not.toContain('**bold** line');

    // 移到 plain 行：bold rendered（'**'×2 隐藏），line2 变 dim，line4 退出 dim
    moveCaret(view, 25);
    await sleep(20);
    expect(markerTexts(view).filter((t) => t === '**').length).toBe(2);
    const dim = dimTexts(view);
    expect(dim.join('\n')).not.toContain('plain para');
    expect(dim.join('\n')).toContain('**bold** line');
    view.destroy();
  });
});

describe('P4.9 Typewriter × marker reveal', () => {
  beforeEach(() => {
    resetCompositionState();
    setFocusMode('off');
    setTypewriterMode(false);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    setFocusMode('off');
    setTypewriterMode(false);
    document.body.innerHTML = '';
  });

  function setUpTypewriter(
    doc: string,
    getCaretTop?: (view: EditorView, head: number) => number,
  ): EditorView {
    const view = new EditorView({
      doc,
      parent: document.body,
      extensions: [
        markdown({ base: markdownLanguage }),
        install(false),
        buildTypewriterModeExtension({
          getCaretTop: getCaretTop ?? (() => 500),
        }),
      ],
    });
    // jsdom 无布局：注入伪 viewport（与 typewriterMode.test.ts 同款）
    Object.defineProperty(view.scrollDOM, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(view.scrollDOM, 'clientHeight', { value: 400, configurable: true });
    view.focus();
    return view;
  }

  test('输入触发居中滚动（scrollTop=300）且 reveal 正常更新', async () => {
    const view = setUpTypewriter('# Head\n\nplain');
    setTypewriterMode(true);
    moveCaret(view, view.state.doc.length); // 'plain' 末尾（doc.length=13）
    await sleep(30);
    // getCaretTop=500 → scrollTop = 500 - 400×0.5 = 300
    expect(view.scrollDOM.scrollTop).toBe(300);
    // caret 在 'plain' 内（无节点）→ heading rendered
    expect(markerTexts(view)).toContain('# ');
    // doc / selection 不因滚动改变
    expect(view.state.doc.toString()).toBe('# Head\n\nplain');
    expect(view.state.selection.main.head).toBe(13);
    view.destroy();
  });

  test('滚动触发 viewportChanged 重算 → reveal 随 caret 正确切换', async () => {
    const view = setUpTypewriter('# Head\n\nplain');
    setTypewriterMode(true);
    moveCaret(view, view.state.doc.length); // 'plain' 内 → heading rendered
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(300);
    expect(markerTexts(view)).toEqual(['# ']);
    // 移动 caret 进 heading → 居中仍触发，reveal 重算为 source
    moveCaret(view, 2);
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(300);
    expect(markerTexts(view)).toEqual([]);
    // 回到 'plain' → rendered 恢复
    moveCaret(view, view.state.doc.length);
    await sleep(30);
    expect(markerTexts(view)).toEqual(['# ']);
    view.destroy();
  });

  test('拖选不居中 + 选区使命中节点 source（联合断言）', async () => {
    const view = setUpTypewriter('# Head\n\n**b** tail');
    setTypewriterMode(true);
    // 选区覆盖 bold 节点 → 不居中
    view.dispatch({ selection: EditorSelection.range(9, 12) });
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(0);
    // 选区与节点相交 → source（无 '**' 隐藏）；heading rendered
    expect(markerTexts(view).filter((t) => t === '**').length).toBe(0);
    expect(markerTexts(view)).toContain('# ');
    // 收回 caret → 居中触发
    moveCaret(view, 14);
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(300);
    view.destroy();
  });

  test('IME composition：typewriter 不居中且 reveal 冻结', async () => {
    installCompositionTracking();
    // caret 在 pos 2 时目标 scrollTop 为 600（800-200），其余为 300 → 冻结可观察
    const view = setUpTypewriter('# Head\n\nplain', (_v, head) => (head === 2 ? 800 : 500));
    setTypewriterMode(true);
    // 先在 'plain' 末尾建立状态：heading rendered（'# ' 隐藏），已居中 300
    moveCaret(view, view.state.doc.length);
    await sleep(30);
    expect(markerTexts(view)).toEqual(['# ']);
    expect(view.scrollDOM.scrollTop).toBe(300);

    document.dispatchEvent(new CompositionEvent('compositionstart'));
    // composition 中移动 caret 进 heading：若未冻结会滚到 600 且 reveal 变 source
    moveCaret(view, 2);
    await sleep(30);
    expect(view.scrollDOM.scrollTop).toBe(300); // 冻结：未重滚
    expect(markerTexts(view)).toEqual(['# ']); // 冻结：未变为 source

    // composition 结束 → 恢复重算（真实场景由合成文本提交的 docChanged 触发；
    // 测试以 selection 派发等价驱动）：caret 回 'plain' → heading rendered 恢复
    document.dispatchEvent(new CompositionEvent('compositionend'));
    moveCaret(view, view.state.doc.length);
    await sleep(30);
    expect(markerTexts(view)).toEqual(['# ']);
    expect(view.scrollDOM.scrollTop).toBe(300); // compositionend 本身不触发滚动
    view.destroy();
  });
});

describe('P4.9 三插件联合（Focus + Typewriter + reveal）', () => {
  beforeEach(() => {
    resetCompositionState();
    setFocusMode('off');
    setTypewriterMode(false);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    setFocusMode('off');
    setTypewriterMode(false);
    document.body.innerHTML = '';
  });

  test('同时开启：输入后居中 + 当前段不 dim + reveal source 三者并存', async () => {
    const view = new EditorView({
      doc: DOC,
      parent: document.body,
      extensions: [
        markdown({ base: markdownLanguage }),
        install(false),
        buildFocusModeExtension(),
        buildTypewriterModeExtension({ getCaretTop: () => 500 }),
      ],
    });
    Object.defineProperty(view.scrollDOM, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(view.scrollDOM, 'clientHeight', { value: 400, configurable: true });
    view.focus();

    setFocusMode('paragraph');
    setTypewriterMode(true);
    // 在 line4 'plain para' 行尾输入（22..32，docChanged → typewriter 居中）
    insertAt(view, 32, 'X');
    await sleep(30);

    // typewriter：居中
    expect(view.scrollDOM.scrollTop).toBe(300);
    // focus paragraph：line2（含 X 段落之外）dim，line4 不 dim（整行文本断言）
    const dim = Array.from(view.dom.querySelectorAll(`.${FOCUS_DIM_CLASS}`)).map((el) => el.textContent ?? '');
    expect(dim.join('\n')).toContain('**bold** line');
    expect(dim.join('\n')).not.toContain('plain paraX');
    // reveal：caret 在 'plain paraX'（无 marker 节点）→ heading/bold rendered
    const texts = markerTexts(view);
    expect(texts).toContain('# ');
    expect(texts.filter((t) => t === '**').length).toBe(2);
    // doc 保真
    expect(view.state.doc.toString()).toBe('# Head\n**bold** line\n\nplain paraX\nlast');
    view.destroy();
  });
});
