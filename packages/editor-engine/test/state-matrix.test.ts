/**
 * P4.1 —— 节点统一 **16** 状态矩阵。
 *
 * 真值源：`docs/specs/live-markdown-engine-spec.md` **§21 Required Test Matrix**
 *（该节逐项列出 16 个状态）。**此前本文件头部把它写成「§6.2」**——`typora-parity-master-plan.md`
 * §6.2 实为「布局不变量」，与状态矩阵无关；这是引用失真，已于 2026-09-30 更正。
 *
 * 16 状态（spec §21 逐项，命名对照见下）：
 *   idle / caret-before / caret-inside / caret-after
 *   selection-partial / selection-full / **mouse**（本文件记作 `mouse-click`，jsdom 代理）
 *   IME / undo / redo / copy / paste
 *   delete-start / delete-end / **keyboard** / **source-live switch**（本文件记作 `source-live-roundtrip`）
 *
 * `mouse` / `keyboard` 两项此前**缺席**（矩阵只跑了 15 态），2026-09-30 补齐 ——
 * 其中 `keyboard` 的意义是补上「真实 keydown → CM keymap → selection → reveal」这一**组合**，
 * 而既有 caret-* 只证明「选区位置 → reveal」（程序化 `moveCaret` 直接改选区）。
 *
 * 覆盖家族（marker-reveal 引擎可表达的 §6.2 节点）：
 *   ATX Heading / Setext Heading / Strong / Emphasis / Strikethrough /
 *   InlineCode / Link / Autolink / ListItem（无序+有序同策略）/
 *   Blockquote / Highlight（==，inlineExtras）/ FencedCode（专述，always-source）。
 *
 * Widget 型节点（Table / Image / Math / Mermaid / TaskList / Footnote / TOC /
 * YAML / GitHub Alerts）的状态语义由各自专属 suite 覆盖
 *（table-live-view / image-widget / math / mermaid / task-checkbox / footnote /
 * toc / yaml-front-matter / github-alerts），其显隐契约不走 markerTexts 通道。
 *
 * jsdom 说明：
 * - mouse-click 以「contentDOM mousedown/mouseup 事件 + click 等价 caret selection」
 *   为代理（jsdom 无布局，posAtCoords 不可用；引擎 reveal 由 selection 驱动，路径一致）；
 * - copy / paste 用 FakeClipboardData 事件代理（clipboard-copy / smart-paste 同款）。
 */

import { EditorView, keymap } from '@codemirror/view';
import { history, undo, redo, defaultKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, setSourceMode, resetModeState } from '../src/index';
import { resetCompositionState } from '../src/composition';
import {
  setUpEditor, moveCaret, selectRange, markerTexts, sleep, startComposition, endComposition,
} from './harness';

// ─────────────────────────── 通用探针 ───────────────────────────

/** 隐藏中的 marker 文本数（MARKER_CLASS 元素） */
function hiddenCount(view: EditorView): number {
  return markerTexts(view).length;
}

/** 无序列表 bullet marker 数（V7-I5：`-`/`*` → `•`，MARKER_BULLET_CLASS 元素） */
function bulletCount(view: EditorView): number {
  return view.dom.querySelectorAll('.mellow-md-marker-bullet').length;
}

/** inlineExtras 定界符元素数（idle 2 个；caret 进入后 0 个） */
function delimCount(view: EditorView): number {
  return view.dom.querySelectorAll('.mellow-md-extras-delim').length;
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

// ─────────────────────────── 家族配置与矩阵 runner ───────────────────────────

interface FamilyCfg {
  label: string;
  doc: string;
  /** 定位节点的子串（start/end 由它计算） */
  nodeText: string;
  /** caret-inside 在 nodeText 内的偏移 */
  insideOffset: number;
  /** caret-after 位置覆盖（块节点末边界在 nodeText 末尾之外时使用，如 Blockquote） */
  afterPos?: number;
  /** idle（rendered）判定：true = marker 已按 idle 策略隐藏/弱化 */
  hiddenWhenIdle: (view: EditorView) => boolean;
  /** 被 touch（caret/selection/composition 恢复后）判定：true = marker 可见 */
  revealedWhenTouched: (view: EditorView) => boolean;
  /** copy 后 text/plain 应包含的纯文本片段（纯文本会剥 marker） */
  copyExpect: string;
  /** 跳过某状态（附原因，仅限有明确合同豁免的家族） */
  skipStates?: Partial<Record<string, string>>;
}

async function makeView(cfg: FamilyCfg, kind: 'plain' | 'history' | 'composition'): Promise<EditorView> {
  let view: EditorView;
  if (kind === 'history') {
    view = new EditorView({
      doc: cfg.doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
  } else if (kind === 'composition') {
    view = new EditorView({
      doc: cfg.doc,
      parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), install(true)],
    });
  } else {
    view = setUpEditor(cfg.doc);
  }
  view.focus();
  return view;
}

/** 单家族 15 状态测试生成（每状态独立 view，finally 销毁防串扰） */
function runStateMatrix(cfg: FamilyCfg): void {
  const start = cfg.doc.indexOf(cfg.nodeText);
  const end = start + cfg.nodeText.length;
  const inside = start + cfg.insideOffset;
  const outside = cfg.doc.length; // 文档末尾（所有家族 doc 尾部都是节点外文本）

  const states: Array<[string, string]> = [
    ['idle', 'caret 节点外 → rendered（marker 隐藏/弱化）'],
    ['caret-before', 'caret 节点首边界 → source/mixed'],
    ['caret-inside', 'caret 节点内 → source/mixed'],
    ['caret-after', 'caret 节点末边界 → source/mixed'],
    ['selection-partial', '选区部分覆盖节点 → source'],
    ['selection-full', '选区完整覆盖节点 → source'],
    ['mouse-click', '鼠标点击（jsdom 代理）→ 与 caret-inside 同路径'],
    ['IME', 'composition 冻结 → 恢复后重算'],
    ['undo', '节点内插入后 Undo 还原 + reveal 正确'],
    ['redo', 'Undo 后 Redo 重放 + reveal 正确'],
    ['copy', 'Copy 非破坏：doc/selection 不变，plain 文本正确'],
    ['paste', 'Paste 最小插入：文本精确、节点仍解析'],
    ['delete-start', '删除节点首字符 → doc 精确 + invalid 落 source'],
    ['delete-end', '删除节点末字符 → doc 精确 + 状态一致'],
    ['source-live-roundtrip', 'Source ↔ Live 往返策略恢复'],
    // 2026-09-30：补 spec §21 的**第 16 个场景** —— 矩阵此前只有 15 个（`keyboard` 缺席）。
    // 既有 caret-* 用程序化 `moveCaret` 只证明「选区位置 → reveal」；本场景补的是**组合**：
    // keymap 层（真实 keydown）真的移动了选区，且 reveal 随之生效。
    ['keyboard', '键盘导航（真实 ArrowLeft keydown → keymap → selection → reveal）'],
  ];

  describe(`${cfg.label} — 16 状态矩阵`, () => {
    for (const [state, desc] of states) {
      const skip = cfg.skipStates?.[state];
      const body = skip === undefined ? test : test.skip;
      body(`${state} — ${desc}${skip === undefined ? '' : `（跳过：${skip}）`}`, async () => {
        switch (state) {
          case 'idle': {
            const view = await makeView(cfg, 'plain');
            try {
              await sleep();
              moveCaret(view, outside);
              await sleep();
              expect(cfg.hiddenWhenIdle(view)).toBe(true);
            } finally { view.destroy(); }
            break;
          }
          case 'caret-before':
          case 'caret-inside':
          case 'caret-after': {
            const view = await makeView(cfg, 'plain');
            try {
              await sleep();
              moveCaret(view, state === 'caret-before' ? start : state === 'caret-inside' ? inside : cfg.afterPos ?? end);
              await sleep();
              expect(cfg.revealedWhenTouched(view)).toBe(true);
              // spec §8 Caret Stability（审计 §4.17 补）：decoration 更新**不得改变文档**。
              // 本矩阵此前只断言 marker 可见性（「什么变得可见」），不检查「别的东西没变」——
              // 而 §8 正是关于后者（「任何 decoration 更新必须满足 document position unchanged」）。
              // 本断言覆盖所有「只移动 caret / 选区 / 点击」而不改文本的状态 × 全部家族。
              // 另两条（selection anchor/head、scroll anchor preserved）见审计 §4.17 的后续项。
              expect(view.state.doc.toString()).toBe(cfg.doc);
            } finally { view.destroy(); }
            break;
          }
          case 'selection-partial':
          case 'selection-full': {
            const view = await makeView(cfg, 'plain');
            try {
              await sleep();
              selectRange(view, state === 'selection-partial' ? start + 1 : start, state === 'selection-partial' ? start + 2 : end);
              await sleep();
              expect(cfg.revealedWhenTouched(view)).toBe(true);
              // spec §8 第二条不变量（审计 §4.17 补）：decoration 更新**不得改变
              // selection 的 anchor/head** —— 即选区必须仍是用户设定的那个，不能被
              // 重算 decoration 时顺手挪动。此前矩阵完全不检查这一条。
              const sel = view.state.selection.main;
              expect(sel.from).toBe(state === 'selection-partial' ? start + 1 : start);
              expect(sel.to).toBe(state === 'selection-partial' ? start + 2 : end);
              expect(view.state.doc.toString()).toBe(cfg.doc);
            } finally { view.destroy(); }
            break;
          }
          case 'mouse-click': {
            const view = await makeView(cfg, 'plain');
            try {
              await sleep();
              view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              view.contentDOM.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              moveCaret(view, inside); // click 语义 = caret 落点（jsdom 无布局代理）
              await sleep();
              expect(cfg.revealedWhenTouched(view)).toBe(true);
              // spec §8 Caret Stability（审计 §4.17 补）：decoration 更新**不得改变文档**。
              // 本矩阵此前只断言 marker 可见性（「什么变得可见」），不检查「别的东西没变」——
              // 而 §8 正是关于后者（「任何 decoration 更新必须满足 document position unchanged」）。
              // 本断言覆盖所有「只移动 caret / 选区 / 点击」而不改文本的状态 × 全部家族。
              // 另两条（selection anchor/head、scroll anchor preserved）见审计 §4.17 的后续项。
              expect(view.state.doc.toString()).toBe(cfg.doc);
            } finally { view.destroy(); }
            break;
          }
          case 'IME': {
            const view = await makeView(cfg, 'composition');
            try {
              await sleep();
              moveCaret(view, outside);
              await sleep();
              expect(cfg.hiddenWhenIdle(view)).toBe(true);

              startComposition();
              try {
                moveCaret(view, inside); // 合成中进入节点 → 冻结不重算
                await sleep();
                expect(cfg.hiddenWhenIdle(view)).toBe(true);
              } finally {
                endComposition();
              }
              moveCaret(view, inside); // 恢复后重算
              await sleep();
              expect(cfg.revealedWhenTouched(view)).toBe(true);
            } finally {
              view.destroy();
              resetCompositionState();
            }
            break;
          }
          case 'undo':
          case 'redo': {
            const view = await makeView(cfg, 'history');
            try {
              await sleep();
              moveCaret(view, inside);
              await sleep();
              view.dispatch({ changes: { from: inside, insert: 'X' }, selection: { anchor: inside + 1 } });
              await sleep();
              expect(view.state.doc.toString()).toBe(`${cfg.doc.slice(0, inside)}X${cfg.doc.slice(inside)}`);
              expect(cfg.revealedWhenTouched(view)).toBe(true);

              undo(view);
              await sleep();
              expect(view.state.doc.toString()).toBe(cfg.doc);
              expect(cfg.revealedWhenTouched(view)).toBe(true);

              if (state === 'redo') {
                redo(view);
                await sleep();
                expect(view.state.doc.toString()).toBe(`${cfg.doc.slice(0, inside)}X${cfg.doc.slice(inside)}`);
                expect(cfg.revealedWhenTouched(view)).toBe(true);
              }
            } finally { view.destroy(); }
            break;
          }
          case 'copy': {
            const view = await makeView(cfg, 'plain');
            try {
              await sleep();
              selectRange(view, start, end);
              const docBefore = view.state.doc.toString();
              const selBefore = view.state.selection.main;
              const data = fireCopy(view);
              expect(data.getData('text/plain')).toContain(cfg.copyExpect);
              // Source Fidelity：copy 不改写文档，selection 不丢（spec §8）
              expect(view.state.doc.toString()).toBe(docBefore);
              expect(view.state.selection.main.anchor).toBe(selBefore.anchor);
              expect(view.state.selection.main.head).toBe(selBefore.head);
            } finally { view.destroy(); }
            break;
          }
          case 'paste': {
            const view = await makeView(cfg, 'plain');
            try {
              await sleep();
              moveCaret(view, inside);
              await sleep();
              firePaste(view, 'Z');
              await sleep();
              expect(view.state.doc.toString()).toBe(`${cfg.doc.slice(0, inside)}Z${cfg.doc.slice(inside)}`);
              expect(cfg.revealedWhenTouched(view)).toBe(true);
            } finally { view.destroy(); }
            break;
          }
          case 'delete-start':
          case 'delete-end': {
            const view = await makeView(cfg, 'plain');
            try {
              await sleep();
              moveCaret(view, inside);
              await sleep();
              const from = state === 'delete-start' ? start : end - 1;
              view.dispatch({ changes: { from, to: from + 1, insert: '' } });
              await sleep();
              expect(view.state.doc.toString()).toBe(cfg.doc.slice(0, from) + cfg.doc.slice(from + 1));
              // 删 marker 字符后节点 invalid → source fallback（spec §4）；仍 valid 时 caret 在内 → source
              expect(cfg.hiddenWhenIdle(view)).toBe(false);
            } finally { view.destroy(); }
            break;
          }
          case 'source-live-roundtrip': {
            const view = await makeView(cfg, 'plain');
            try {
              await sleep();
              moveCaret(view, outside);
              await sleep();
              expect(cfg.hiddenWhenIdle(view)).toBe(true);

              setSourceMode(true);
              view.dispatch({ selection: view.state.selection });
              await sleep();
              expect(cfg.hiddenWhenIdle(view)).toBe(false); // Source Mode 全显示

              setSourceMode(false);
              view.dispatch({ selection: view.state.selection });
              await sleep();
              expect(cfg.hiddenWhenIdle(view)).toBe(true); // 回 Live 恢复 idle 策略
            } finally { view.destroy(); }
            break;
          }
          // spec §21 的第 16 个场景：**键盘导航**（此前矩阵只有 15 个，`keyboard` 缺席）。
          // 与 caret-* 的区别：那三个用程序化 `moveCaret`（直接改选区）只证明「选区位置 → reveal」；
          // 本场景走**真实 keydown → CM keymap → selection**，补上「组合」这一层。
          // `defaultKeymap` 在产品里由 CoreEditor 的 `extensions()` 装配（本 harness 不含），
          // 故此处显式加上 —— 与真实产品路径一致。
          case 'keyboard': {
            const view = new EditorView({
              doc: cfg.doc,
              parent: document.body,
              extensions: [markdown({ base: markdownLanguage }), history(), keymap.of(defaultKeymap), install(false)],
            });
            try {
              view.focus();
              await sleep();
              // 起点：节点**之后**一个字符（确保起点在节点外，与 idle 同侧）
              moveCaret(view, Math.min(end + 1, cfg.doc.length));
              await sleep();
              // 非恒绿前提：起点处节点仍为 idle/rendered（touched 判据应为 false）。
              // 否则「按键后为 true」可能只是因为该家族**一开始**就为 true（假阳性）。
              expect(cfg.revealedWhenTouched(view)).toBe(false);
              const before = view.state.selection.main.head;
              // 真实按键两次 → 光标左移进入节点（不是 setSelection）
              for (let i = 0; i < 2; i += 1) {
                view.contentDOM.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
                );
                await sleep();
              }
              // 前提断言（防恒绿）：键盘**确实**把光标移进了节点
              expect(view.state.selection.main.head).toBeLessThan(before);
              expect(view.state.selection.main.head).toBeGreaterThanOrEqual(start);
              // 光标已在节点内 → 与 caret-before/inside/after 同路径：必须 reveal。
              //
              // 这里用 `revealedWhenTouched` 而**不是** `hiddenWhenIdle`：后者是各家族的
              // **idle 探针**，对 mixed 模型的 Link 家族并不等价于「节点已 exit idle」——
              // Link 的 `hiddenWhenIdle` 探的是 **URL 是否隐藏**，而两次左移的落点
              // `end - 1` 恰是 `)`（= `node.from + close`）→ 按 spec §12 落在 **text 区**
              // （`inUrl` 为开区间 `(open, close)`，不含 `)`），此时 URL **仍应隐藏**、
              // 只显示 `[`/`]` —— 故 `hiddenWhenIdle` 为 true 属**正确**的 mixed 行为，
              // 不是缺陷。（首跑即因误用该判据而红，见 release-blocker-audit §4.33。）
              // `revealedWhenTouched` 才是各家族统一的「caret/selection 触及节点 → 显示」
              // 判据（caret-* / mouse-click / IME / undo / redo / paste 同用它）。
              expect(cfg.revealedWhenTouched(view)).toBe(true);
              // spec §8：键盘驱动的 decoration 重算同样**不得改写文档**。
              expect(view.state.doc.toString()).toBe(cfg.doc);
            } finally { view.destroy(); }
            break;
          }
        }
      });
    }
  });
}

beforeEach(() => {
  resetModeState();
});

// ─────────────────────────── 家族注册 ───────────────────────────

runStateMatrix({
  label: 'ATX Heading（# Title）',
  doc: '# Title\n\nplain',
  nodeText: '# Title',
  insideOffset: 3,
  hiddenWhenIdle: (v) => markerTexts(v).includes('# '),
  revealedWhenTouched: (v) => hiddenCount(v) === 0,
  copyExpect: 'Title',
});

runStateMatrix({
  label: 'Setext Heading',
  doc: 'Setext One\n=========\n\nplain',
  nodeText: 'Setext One\n=========',
  insideOffset: 4,
  hiddenWhenIdle: (v) => markerTexts(v).includes('========='),
  revealedWhenTouched: (v) => hiddenCount(v) === 0,
  copyExpect: 'Setext One',
});

runStateMatrix({
  label: 'Strong（**bold**）',
  doc: 'plain **bold** tail',
  nodeText: '**bold**',
  insideOffset: 3,
  hiddenWhenIdle: (v) => markerTexts(v).includes('**'),
  revealedWhenTouched: (v) => !markerTexts(v).includes('**'),
  copyExpect: 'bold',
});

runStateMatrix({
  label: 'Emphasis（*em*）',
  doc: 'plain *em* tail',
  nodeText: '*em*',
  insideOffset: 2,
  hiddenWhenIdle: (v) => markerTexts(v).includes('*'),
  revealedWhenTouched: (v) => !markerTexts(v).includes('*'),
  copyExpect: 'em',
});

runStateMatrix({
  label: 'Strikethrough（~~del~~）',
  doc: 'plain ~~del~~ tail',
  nodeText: '~~del~~',
  insideOffset: 3,
  hiddenWhenIdle: (v) => markerTexts(v).includes('~~'),
  revealedWhenTouched: (v) => !markerTexts(v).includes('~~'),
  copyExpect: 'del',
});

runStateMatrix({
  label: 'InlineCode（`code`）',
  doc: 'plain `code` tail',
  nodeText: '`code`',
  insideOffset: 2,
  hiddenWhenIdle: (v) => markerTexts(v).includes('`'),
  revealedWhenTouched: (v) => !markerTexts(v).includes('`'),
  copyExpect: 'code',
});

runStateMatrix({
  label: 'Link（[text](url) mixed）',
  doc: 'plain [text](https://example.com) tail',
  nodeText: '[text](https://example.com)',
  insideOffset: 2,
  hiddenWhenIdle: (v) => markerTexts(v).includes('https://example.com'),
  revealedWhenTouched: (v) => !markerTexts(v).includes('['),
  copyExpect: 'text',
});

runStateMatrix({
  label: 'Autolink（<url>）',
  doc: 'plain <https://ex.com> tail',
  nodeText: '<https://ex.com>',
  insideOffset: 3,
  hiddenWhenIdle: (v) => markerTexts(v).includes('<'),
  revealedWhenTouched: (v) => !markerTexts(v).includes('<'),
  copyExpect: 'https://ex.com',
});

runStateMatrix({
  label: 'ListItem（- second，idle → bullet，V7-I5）',
  doc: '- first\n- second\n\nplain',
  nodeText: '- second',
  insideOffset: 2,
  hiddenWhenIdle: (v) => bulletCount(v) === 2,
  revealedWhenTouched: (v) => bulletCount(v) <= 1,
  copyExpect: 'second',
});

runStateMatrix({
  label: 'Blockquote（caret 行显示）',
  doc: '> quote one\n> quote two\n\nplain',
  nodeText: '> quote two',
  insideOffset: 3,
  afterPos: 22, // 末行最后一个字符（nodeText 末尾 23 是块外 newline）
  hiddenWhenIdle: (v) => hiddenCount(v) === 2,
  revealedWhenTouched: (v) => hiddenCount(v) <= 1,
  copyExpect: 'quote',
});

runStateMatrix({
  label: 'Highlight（==hi==，inlineExtras）',
  doc: 'plain ==hi== tail',
  nodeText: '==hi==',
  insideOffset: 3,
  hiddenWhenIdle: (v) => delimCount(v) === 2,
  revealedWhenTouched: (v) => delimCount(v) === 0,
  copyExpect: 'hi',
});

// ─────────────────────────── FencedCode（always source） ───────────────────────────

describe('FencedCode — 16 状态矩阵（source-oriented，引擎永不隐藏）', () => {
  const DOC = '```ts\nconst a = 1;\n```\n\nplain';
  const fenceStart = 0;
  const fenceEnd = DOC.indexOf('\n\nplain');
  const inside = 13; // 'const a' 的 'a' 后（fence 内容内）
  const outside = DOC.length;

  test('idle / caret 各位置 / selection / mouse-click → 永无隐藏 marker', async () => {
    const view = setUpEditor(DOC);
    try {
      await sleep();
      moveCaret(view, outside);
      await sleep();
      expect(hiddenCount(view)).toBe(0);
      for (const pos of [fenceStart, inside, fenceEnd]) {
        moveCaret(view, pos);
        await sleep();
        expect(hiddenCount(view)).toBe(0);
      }
      selectRange(view, 0, fenceEnd);
      await sleep();
      expect(hiddenCount(view)).toBe(0);
      view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      view.contentDOM.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      moveCaret(view, inside);
      await sleep();
      expect(hiddenCount(view)).toBe(0);
    } finally { view.destroy(); }
  });

  test('IME：composition 冻结且代码内容始终 source', async () => {
    const view = setUpEditor(DOC);
    try {
      await sleep();
      moveCaret(view, outside);
      await sleep();
      startComposition();
      try {
        moveCaret(view, inside);
        await sleep();
        expect(hiddenCount(view)).toBe(0);
      } finally {
        endComposition();
      }
      moveCaret(view, inside);
      await sleep();
      expect(hiddenCount(view)).toBe(0);
    } finally {
      view.destroy();
      resetCompositionState();
    }
  });

  test('undo / redo：代码编辑可撤销重做，fence 不被改写', async () => {
    const view = new EditorView({
      doc: DOC, parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), install(false)],
    });
    try {
      await sleep();
      moveCaret(view, inside);
      view.dispatch({ changes: { from: inside, insert: 'X' }, selection: { anchor: inside + 1 } });
      await sleep();
      expect(view.state.doc.toString()).toBe('```ts\nconst aX = 1;\n```\n\nplain');
      undo(view);
      await sleep();
      expect(view.state.doc.toString()).toBe(DOC);
      redo(view);
      await sleep();
      expect(view.state.doc.toString()).toBe('```ts\nconst aX = 1;\n```\n\nplain');
      expect(hiddenCount(view)).toBe(0);
    } finally { view.destroy(); }
  });

  test('copy：fence 内容完整进入 plain（fence 源不改写）', async () => {
    const view = setUpEditor(DOC);
    try {
      await sleep();
      selectRange(view, fenceStart, fenceEnd);
      const data = fireCopy(view);
      expect(data.getData('text/plain')).toContain('const a = 1;');
      expect(view.state.doc.toString()).toBe(DOC);
    } finally { view.destroy(); }
  });

  test('paste / delete-start / delete-end：doc 精确，无 decoration 崩溃', async () => {
    const view = setUpEditor(DOC);
    try {
      await sleep();
      moveCaret(view, inside);
      firePaste(view, 'Z');
      await sleep();
      expect(view.state.doc.toString()).toBe('```ts\nconst aZ = 1;\n```\n\nplain');
      // jsdom 观察项：CM paste 事务未进入 undo 历史（undo 为空操作）——paste 的
      // undo 分组语义在 P4.3（Undo 按用户动作分组）专项覆盖，此处不断言 undo。
      view.dispatch({ changes: { from: fenceEnd - 1, to: fenceEnd, insert: '' } }); // 删末反引号（位置未变：Z 等长插入）
      await sleep();
      expect(view.state.doc.toString()).toBe('```ts\nconst aZ = 1;\n``\n\nplain');
      view.dispatch({ changes: { from: 0, to: 1, insert: '' } }); // 删首反引号 → fence invalid
      await sleep();
      expect(view.state.doc.toString()).toBe('``ts\nconst aZ = 1;\n``\n\nplain');
      expect(hiddenCount(view)).toBe(0);
    } finally { view.destroy(); }
  });

  test('source-live-roundtrip：两模式下代码均 source（无 marker 可隐藏）', async () => {
    const view = setUpEditor(DOC);
    try {
      await sleep();
      moveCaret(view, outside);
      await sleep();
      setSourceMode(true);
      view.dispatch({ selection: view.state.selection });
      await sleep();
      expect(hiddenCount(view)).toBe(0);
      setSourceMode(false);
      view.dispatch({ selection: view.state.selection });
      await sleep();
      expect(hiddenCount(view)).toBe(0);
    } finally { view.destroy(); }
  });

  // spec §21 第 16 态 `keyboard` 的 **source-oriented 对照**：即使按键把光标移进代码区，
  // 引擎也**永不**隐藏任何 marker（hiddenCount 恒 0）。与 marker-reveal 家族的 keyboard 态
  // 相反 —— 那些家族按键后应 reveal，本家族按键后**什么都不该发生**。
  test('keyboard：真实 ArrowLeft 在代码内移动，仍无隐藏 marker', async () => {
    const view = new EditorView({
      doc: DOC, parent: document.body,
      extensions: [markdown({ base: markdownLanguage }), history(), keymap.of(defaultKeymap), install(false)],
    });
    try {
      view.focus();
      await sleep();
      moveCaret(view, outside);
      await sleep();
      const before = view.state.selection.main.head;
      for (let i = 0; i < 3; i += 1) {
        view.contentDOM.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
        );
        await sleep();
      }
      // 前提断言（防恒绿）：按键**确实**移动了光标
      expect(view.state.selection.main.head).toBeLessThan(before);
      // source-oriented：无论光标在哪，都无 marker 被隐藏；且 doc 不被改写
      expect(hiddenCount(view)).toBe(0);
      expect(view.state.doc.toString()).toBe(DOC);
    } finally { view.destroy(); }
  });
});
