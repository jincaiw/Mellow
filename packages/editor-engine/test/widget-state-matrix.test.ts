/**
 * C5（G4-EDIT-01 收口）—— widget 型节点的 15 状态矩阵（marker 家族见 state-matrix.test.ts）。
 *
 * 15 状态与 state-matrix 相同：idle / caret-before / caret-inside / caret-after /
 * selection-partial / selection-full / mouse-click / IME / undo / redo / copy / paste /
 * delete-start / delete-end / source-live-roundtrip。
 *
 * widget 家族（显隐契约不走 markerTexts，走 replace/mark widget 探针）：
 *   MathBlock（严格内 reveal）/ Mermaid（严格内）/ Image（含边界，inclusive）/
 *   Wikilink（mark 定界符，inclusive）/ TOC / YAML / GitHubAlerts / FootnoteRef
 *   （以上严格内）/ TaskCheckbox（常驻，无 caret 驱动）。
 *
 * 各家族 caret 语义（源码证据）：
 *   - math.ts caretInside: head > from && head < to（严格）
 *   - mermaid.ts caretInside: 同上（严格）
 *   - toc/yaml/githubAlerts/footnote inside(): pos > from && pos < to（严格）
 *   - image/widget.ts: node.from <= head && node.to >= anchor → 隐藏（含边界）
 *   - wikilink.ts: head >= from && head <= to → 定界符隐藏（含边界）
 */

import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, setSourceMode, resetModeState } from '../src/index';
import { resetCompositionState } from '../src/composition';
import { setUpEditor, moveCaret, selectRange, sleep, startComposition, endComposition } from './harness';

function widgetCount(view: EditorView, selector: string): number {
  return view.dom.querySelectorAll(selector).length;
}

class FakeClipboardData {
  readonly values = new Map<string, string>();
  setData(type: string, value: string): void { this.values.set(type, value); }
  getData(type: string): string { return this.values.get(type) ?? ''; }
}

function fireCopy(view: EditorView): FakeClipboardData {
  const data = new FakeClipboardData();
  const event = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  view.contentDOM.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  return data;
}

function firePaste(view: EditorView, text: string): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  view.contentDOM.dispatchEvent(event);
}

interface WidgetFamilyCfg {
  label: string;
  doc: string;
  nodeText: string;
  insideOffset: number;
  /** 渲染态元素计数探针 */
  count: (v: EditorView) => number;
  /** idle（节点外）= rendered */
  rendered: (v: EditorView) => boolean;
  /** touch（head 严格/含边界在节点内）= source（widget 消失 / 定界符隐藏） */
  sourced: (v: EditorView) => boolean;
  /** 边界（head = from/to）是否显示源码：wikilink/image true；严格内家族 false */
  boundaryReveals: boolean;
  copyExpect: string;
  /** 常驻 widget（task checkbox）：无 caret 驱动，恒 rendered */
  alwaysRendered?: boolean;
  /** 删除末字符后节点仍有效（task：'- [ ] tas' 仍是任务项） */
  deleteEndKeepsNode?: boolean;
  /** 删除首字符后剩余文本仍可解析出同族 widget（math：$$ 块删一个 $ 的解析歧义） */
  deleteStartWidgetMayRemain?: boolean;
  /** 源码模式下引擎显式隐藏 widget（image/widget.ts:313、taskCheckbox.ts:88、wikilink.ts:102） */
  sourceModeHides?: boolean;
}

async function makeView(cfg: WidgetFamilyCfg, kind: 'plain' | 'history' | 'composition'): Promise<EditorView> {
  let view: EditorView;
  if (kind === 'history') {
    view = new EditorView({
      doc: cfg.doc, parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
  } else if (kind === 'composition') {
    view = new EditorView({
      doc: cfg.doc, parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
  } else {
    view = setUpEditor(cfg.doc);
  }
  view.focus();
  return view;
}

function runWidgetStateMatrix(cfg: WidgetFamilyCfg): void {
  const start = cfg.doc.indexOf(cfg.nodeText);
  const end = start + cfg.nodeText.length;
  const inside = start + cfg.insideOffset;
  const outside = cfg.doc.length;

  describe(`${cfg.label} — widget 15 状态矩阵`, () => {
    test('idle — 节点外 → rendered（widget 在场）', async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        moveCaret(view, outside);
        await sleep();
        expect(cfg.rendered(view)).toBe(true);
      } finally { view.destroy(); }
    });

    test('caret-before — ' + (cfg.boundaryReveals ? '边界含入 → source' : '边界不含入 → rendered'), async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        moveCaret(view, start);
        await sleep();
        expect(cfg.boundaryReveals || cfg.alwaysRendered === true ? cfg.sourced(view) || cfg.alwaysRendered === true : cfg.rendered(view)).toBe(true);
      } finally { view.destroy(); }
    });

    test('caret-inside — head 节点内 → source', async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        moveCaret(view, inside);
        await sleep();
        expect(cfg.sourced(view)).toBe(true);
      } finally { view.destroy(); }
    });

    test('caret-after — ' + (cfg.boundaryReveals ? '边界含入 → source' : '边界不含入 → rendered'), async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        moveCaret(view, end);
        await sleep();
        expect(cfg.boundaryReveals || cfg.alwaysRendered === true ? cfg.sourced(view) || cfg.alwaysRendered === true : cfg.rendered(view)).toBe(true);
      } finally { view.destroy(); }
    });

    test('selection-partial — head 在节点内 → source', async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        selectRange(view, start + 1, start + 2);
        await sleep();
        expect(cfg.sourced(view)).toBe(true);
      } finally { view.destroy(); }
    });

    test('selection-full — 覆盖整节点，head=末边界 → ' + (cfg.boundaryReveals ? 'source' : 'rendered'), async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        selectRange(view, start, end);
        await sleep();
        if (cfg.alwaysRendered === true) {
          expect(cfg.rendered(view)).toBe(true);
        } else if (cfg.boundaryReveals) {
          expect(cfg.sourced(view)).toBe(true);
        } else {
          expect(cfg.rendered(view)).toBe(true);
        }
      } finally { view.destroy(); }
    });

    test('mouse-click — jsdom 代理（caret 落点）→ source', async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        view.contentDOM.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        moveCaret(view, inside);
        await sleep();
        expect(cfg.alwaysRendered === true ? cfg.rendered(view) : cfg.sourced(view)).toBe(true);
      } finally { view.destroy(); }
    });

    test('IME — composition 冻结不崩，恢复后按 caret 语义重算', async () => {
      const view = await makeView(cfg, 'composition');
      try {
        await sleep();
        moveCaret(view, outside);
        await sleep();
        expect(cfg.rendered(view)).toBe(true);
        startComposition();
        try {
          moveCaret(view, inside);
          await sleep();
          // 冻结期：widget 不得被销毁重建（不崩即可；重算语义由恢复后断言）
        } finally {
          endComposition();
        }
        moveCaret(view, inside);
        await sleep();
        expect(cfg.alwaysRendered === true ? cfg.rendered(view) : cfg.sourced(view)).toBe(true);
      } finally {
        view.destroy();
        resetCompositionState();
      }
    });

    test('undo / redo — doc 精确，插入后 source 语义 / 撤销后恢复 rendered', async () => {
      const view = await makeView(cfg, 'history');
      try {
        await sleep();
        moveCaret(view, inside);
        await sleep();
        view.dispatch({ changes: { from: inside, insert: 'X' }, selection: { anchor: inside + 1 } });
        await sleep();
        expect(view.state.doc.toString()).toBe(`${cfg.doc.slice(0, inside)}X${cfg.doc.slice(inside)}`);
        expect(cfg.alwaysRendered === true ? cfg.rendered(view) : cfg.sourced(view)).toBe(true);

        undo(view);
        await sleep();
        moveCaret(view, outside);
        await sleep();
        expect(view.state.doc.toString()).toBe(cfg.doc);
        expect(cfg.rendered(view)).toBe(true);

        redo(view);
        await sleep();
        moveCaret(view, inside);
        await sleep();
        expect(view.state.doc.toString()).toBe(`${cfg.doc.slice(0, inside)}X${cfg.doc.slice(inside)}`);
        expect(cfg.alwaysRendered === true ? cfg.rendered(view) : cfg.sourced(view)).toBe(true);
      } finally { view.destroy(); }
    });

    test('copy — 非破坏：doc 不变、plain 含节点文本', async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        selectRange(view, start, end);
        const docBefore = view.state.doc.toString();
        const selBefore = view.state.selection.main;
        const data = fireCopy(view);
        expect(data.getData('text/plain')).toContain(cfg.copyExpect);
        expect(view.state.doc.toString()).toBe(docBefore);
        expect(view.state.selection.main.anchor).toBe(selBefore.anchor);
        expect(view.state.selection.main.head).toBe(selBefore.head);
      } finally { view.destroy(); }
    });

    test('paste — 最小插入精确，节点仍按 caret 语义呈现', async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        moveCaret(view, inside);
        await sleep();
        firePaste(view, 'Z');
        await sleep();
        expect(view.state.doc.toString()).toBe(`${cfg.doc.slice(0, inside)}Z${cfg.doc.slice(inside)}`);
        expect(cfg.alwaysRendered === true ? cfg.rendered(view) : cfg.sourced(view)).toBe(true);
      } finally { view.destroy(); }
    });

    test('delete-start — 删首字符 → 节点失效落 source（widget 消失）', async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        moveCaret(view, inside);
        await sleep();
        view.dispatch({ changes: { from: start, to: start + 1, insert: '' } });
        await sleep();
        expect(view.state.doc.toString()).toBe(cfg.doc.slice(0, start) + cfg.doc.slice(start + 1));
        // 解析歧义（math：$$ 块删一个 $ 后剩余文本仍命中块语法）→ widget 可能保留
        if (cfg.deleteStartWidgetMayRemain === true) {
          expect(cfg.rendered(view)).toBe(true);
        } else {
          expect(cfg.rendered(view)).toBe(false);
        }
      } finally { view.destroy(); }
    });

    test('delete-end — 删末字符 → ' + (cfg.deleteEndKeepsNode === true ? '节点仍有效（widget 保留）' : '节点失效落 source'), async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        moveCaret(view, inside);
        await sleep();
        view.dispatch({ changes: { from: end - 1, to: end, insert: '' } });
        await sleep();
        expect(view.state.doc.toString()).toBe(cfg.doc.slice(0, end - 1) + cfg.doc.slice(end));
        if (cfg.deleteEndKeepsNode === true) {
          // 节点仍有效；caret 若停留在节点内则按 source 语义隐藏，移出后 widget 恢复
          // （删了 1 字符，outside 已超出新文档末尾 → 按当前 doc 长度取位）
          moveCaret(view, view.state.doc.length);
          await sleep();
          expect(cfg.rendered(view)).toBe(true);
        } else {
          expect(cfg.rendered(view)).toBe(false);
        }
      } finally { view.destroy(); }
    });

    test('source-live-roundtrip — 两模式切换后 widget 语义一致', async () => {
      const view = await makeView(cfg, 'plain');
      try {
        await sleep();
        moveCaret(view, outside);
        await sleep();
        expect(cfg.rendered(view)).toBe(true);

        setSourceMode(true);
        view.dispatch({ selection: view.state.selection });
        await sleep();
        // image/task/wikilink 在源码模式下引擎显式隐藏 widget（isSourceMode 门控）
        if (cfg.sourceModeHides === true) {
          expect(cfg.rendered(view)).toBe(false);
        } else {
          expect(cfg.rendered(view)).toBe(true);
        }

        setSourceMode(false);
        view.dispatch({ selection: view.state.selection });
        await sleep();
        expect(cfg.rendered(view)).toBe(true);
      } finally { view.destroy(); }
    });
  });
}

beforeEach(() => {
  resetModeState();
});

// ─────────────────────────── 家族注册 ───────────────────────────

runWidgetStateMatrix({
  label: 'MathBlock（$$…$$，严格内 reveal）',
  doc: 'plain\n\n$$\nX^2\n$$\n\nplain',
  nodeText: '$$\nX^2\n$$',
  insideOffset: 3,
  count: (v) => widgetCount(v, '.mellow-math-block'),
  rendered: (v) => widgetCount(v, '.mellow-math-block') > 0,
  sourced: (v) => widgetCount(v, '.mellow-math-block') === 0,
  boundaryReveals: false,
  copyExpect: 'X^2',
  deleteStartWidgetMayRemain: true,
});

runWidgetStateMatrix({
  label: 'Image（![alt](src)，含边界 reveal）',
  doc: 'plain ![alt](img.png) tail',
  nodeText: '![alt](img.png)',
  insideOffset: 3,
  count: (v) => widgetCount(v, '.mellow-md-image'),
  rendered: (v) => widgetCount(v, '.mellow-md-image') > 0,
  sourced: (v) => widgetCount(v, '.mellow-md-image') === 0,
  boundaryReveals: true,
  // 引擎 copy 管线对图片选区剥语法：plain 输出 alt 文本
  copyExpect: 'alt',
  sourceModeHides: true,
});

runWidgetStateMatrix({
  label: 'Mermaid（```mermaid，严格内 reveal）',
  doc: '```mermaid\ngraph TD;\nA-->B;\n```\n\nplain',
  nodeText: '```mermaid\ngraph TD;\nA-->B;\n```',
  insideOffset: 12,
  count: (v) => widgetCount(v, '.mellow-mermaid-widget'),
  rendered: (v) => widgetCount(v, '.mellow-mermaid-widget') > 0,
  sourced: (v) => widgetCount(v, '.mellow-mermaid-widget') === 0,
  boundaryReveals: false,
  copyExpect: 'graph TD',
});

runWidgetStateMatrix({
  label: 'Wikilink（[[Page]]，mark 定界符，含边界 reveal）',
  doc: 'plain [[Page]] tail',
  nodeText: '[[Page]]',
  insideOffset: 3,
  count: (v) => widgetCount(v, '.mellow-wikilink-delim'),
  rendered: (v) => widgetCount(v, '.mellow-wikilink-delim') === 2,
  sourced: (v) => widgetCount(v, '.mellow-wikilink-delim') === 0,
  boundaryReveals: true,
  copyExpect: 'Page',
  sourceModeHides: true,
});

runWidgetStateMatrix({
  label: 'TOC（[TOC]，严格内 reveal）',
  // 解析器只认大写 [TOC]（parseTocMarkers）
  doc: 'plain\n\n[TOC]\n\nplain',
  nodeText: '[TOC]',
  insideOffset: 2,
  count: (v) => widgetCount(v, '.mellow-toc'),
  rendered: (v) => widgetCount(v, '.mellow-toc') > 0,
  sourced: (v) => widgetCount(v, '.mellow-toc') === 0,
  boundaryReveals: false,
  copyExpect: '[TOC]',
});

runWidgetStateMatrix({
  label: 'YAML Front Matter（V5-R5 常驻灰底卡片）',
  doc: '---\ntitle: x\n---\n\nbody text',
  nodeText: '---\ntitle: x\n---',
  insideOffset: 6,
  count: (v) => widgetCount(v, '.mellow-yaml-card-line'),
  // V5-R5：常驻灰底卡片（源码可编辑），任何状态都在场
  rendered: (v) => widgetCount(v, '.mellow-yaml-card-line') > 0,
  sourced: (v) => widgetCount(v, '.mellow-yaml-card-line') > 0,
  boundaryReveals: false,
  alwaysRendered: true,
  copyExpect: 'title',
});

runWidgetStateMatrix({
  label: 'GitHubAlerts（> [!NOTE]，严格内 reveal）',
  doc: '> [!NOTE]\n> note body\n\nplain',
  // alert 装饰范围覆盖整个引用块（含 > note body 行）
  nodeText: '> [!NOTE]\n> note body',
  insideOffset: 4,
  count: (v) => widgetCount(v, '.mellow-alert'),
  rendered: (v) => widgetCount(v, '.mellow-alert') > 0,
  sourced: (v) => widgetCount(v, '.mellow-alert') === 0,
  boundaryReveals: false,
  // 删 body 末字符不破坏 '> [!NOTE]' 头部语法，告警块仍成立
  deleteEndKeepsNode: true,
  copyExpect: 'NOTE',
});

runWidgetStateMatrix({
  label: 'FootnoteRef（[^1]，严格内 reveal）',
  doc: 'plain text[^1] tail\n\n[^1]: note',
  nodeText: '[^1]',
  insideOffset: 2,
  count: (v) => widgetCount(v, '.mellow-footnote-ref'),
  rendered: (v) => widgetCount(v, '.mellow-footnote-ref') > 0,
  sourced: (v) => widgetCount(v, '.mellow-footnote-ref') === 0,
  boundaryReveals: false,
  copyExpect: '[^1]',
});

runWidgetStateMatrix({
  label: 'TaskCheckbox（常驻 widget，无 caret 驱动）',
  doc: '- [ ] task\n\nplain',
  nodeText: '- [ ] task',
  // offset 5 会插出 '- [ ]X task'（破坏任务语法），6 在 'task' 词内保持有效
  insideOffset: 6,
  count: (v) => widgetCount(v, '.mellow-md-task-checkbox'),
  rendered: (v) => widgetCount(v, '.mellow-md-task-checkbox') > 0,
  sourced: (v) => widgetCount(v, '.mellow-md-task-checkbox') > 0,
  boundaryReveals: false,
  alwaysRendered: true,
  deleteEndKeepsNode: true,
  sourceModeHides: true,
  copyExpect: 'task',
});
