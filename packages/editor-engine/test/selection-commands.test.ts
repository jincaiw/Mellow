/**
 * Selection Commands 测试（D1-4 + D3：Typora 编辑→选择/删除范围）。
 *
 * 覆盖：
 * - selectLine：选中当前行 / 整行已选中时扩展下一行 / 末行不再扩展；
 * - selectParagraph：空行界定的段落范围 / 文档首尾边界；
 * - D3：selectWord / selectFormatSpan / goto* / delete* / moveLine* / imageSourceAtCursor；
 * - 纯函数：formatSpanAt / wordAt / paragraphRangeAt / imageSourceAt；
 * - API 未注册 view 时返回 false。
 */

import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install } from '../src/index';
import { installSelectionCommandsApi, formatSpanAt, wordAt, paragraphRangeAt, imageSourceAt } from '../src/selectionCommands';

const api = (): {
  selectLine: () => boolean;
  selectParagraph: () => boolean;
  selectWord: () => boolean;
  selectFormatSpan: () => boolean;
  gotoDocStart: () => boolean;
  gotoDocEnd: () => boolean;
  gotoSelection: () => boolean;
  gotoLineStart: () => boolean;
  gotoLineEnd: () => boolean;
  deleteWord: () => boolean;
  deleteFormatSpan: () => boolean;
  deleteParagraph: () => boolean;
  moveLineUp: () => boolean;
  moveLineDown: () => boolean;
  imageSourceAtCursor: () => string | null;
} =>
  (window as unknown as { __MELLOW_SELECTION_COMMANDS__?: Record<string, () => boolean | string | null> }).__MELLOW_SELECTION_COMMANDS__! as ReturnType<typeof api>;

function makeView(doc: string): EditorView {
  return new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(false)],
  });
}

describe('Selection Commands — selectLine', () => {
  beforeEach(() => {
    installSelectionCommandsApi();
  });

  it('选中当前行（caret 行内 → 整行）', () => {
    const view = makeView('第一行\n第二行\n第三行');
    view.dispatch({ selection: { anchor: 4, head: 4 } }); // 「第二行」内
    expect(api().selectLine()).toBe(true);
    const sel = view.state.selection.main;
    expect(sel.from).toBe(4);
    expect(sel.to).toBe(7);
    view.destroy();
  });

  it('整行已选中 → 扩展到下一行（CM selectLine 语义）', () => {
    const view = makeView('第一行\n第二行\n第三行');
    view.dispatch({ selection: { anchor: 4, head: 7 } }); // 已选「第二行」
    api().selectLine();
    const sel = view.state.selection.main;
    expect(sel.from).toBe(4);
    expect(sel.to).toBe(11); // 扩到「第三行」行尾
    view.destroy();
  });

  it('末行整行选中 → 不再扩展', () => {
    const view = makeView('第一行\n第二行');
    view.dispatch({ selection: { anchor: 4, head: 7 } }); // 末行整行
    api().selectLine();
    const sel = view.state.selection.main;
    expect(sel.to).toBe(7);
    view.destroy();
  });
});

describe('Selection Commands — selectParagraph', () => {
  beforeEach(() => {
    installSelectionCommandsApi();
  });

  it('空行界定的段落整体选中', () => {
    const view = makeView('前一段\n\n段落甲\n段落乙\n\n后一段');
    // 偏移：前一段 0-2 / \n3 / 空行4(\n) / 段落甲 5-7 / \n8 / 段落乙 9-11 / \n12 / 空行13(\n) / 后一段 14+
    view.dispatch({ selection: { anchor: 6, head: 6 } }); // 「段落甲」内
    expect(api().selectParagraph()).toBe(true);
    const sel = view.state.selection.main;
    expect(sel.from).toBe(5); // 「段落甲」行首
    expect(sel.to).toBe(12); // 「段落乙」行尾
    view.destroy();
  });

  it('文档首尾边界（无相邻空行）', () => {
    const view = makeView('唯一段落');
    view.dispatch({ selection: { anchor: 2, head: 2 } });
    api().selectParagraph();
    const sel = view.state.selection.main;
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(4);
    view.destroy();
  });
});

describe('Selection Commands — 未就绪', () => {
  it('无 activeView 时返回 false（不 throw）', () => {
    installSelectionCommandsApi();
    // 未创建 view（或已 destroy）→ activeView 为 null
    expect(api().selectLine()).toBe(false);
    expect(api().selectParagraph()).toBe(false);
  });
});

// ───────────────── D3：纯函数 ─────────────────

describe('formatSpanAt（光标处行内格式标记内容）', () => {
  it('粗体/斜体/代码/删除线/高亮内容范围', () => {
    expect(formatSpanAt('**bold**', 3)).toEqual({ from: 2, to: 6 });
    expect(formatSpanAt('*em*', 2)).toEqual({ from: 1, to: 3 });
    expect(formatSpanAt('`code`', 3)).toEqual({ from: 1, to: 5 });
    expect(formatSpanAt('~~del~~', 4)).toEqual({ from: 2, to: 5 });
    expect(formatSpanAt('==hl==', 3)).toEqual({ from: 2, to: 4 });
    expect(formatSpanAt('^sup^', 2)).toEqual({ from: 1, to: 4 });
    expect(formatSpanAt('~sub~', 2)).toEqual({ from: 1, to: 4 });
  });

  it('无标记 → null；标记外 → null', () => {
    expect(formatSpanAt('plain text', 3)).toBeNull();
    expect(formatSpanAt('**bold** tail', 10)).toBeNull();
  });

  it('标记不跨行（close 在换行后不算）', () => {
    expect(formatSpanAt('**a\nb**', 2)).toBeNull();
  });

  it('多个标记取光标所在的那对', () => {
    expect(formatSpanAt('**aa** and **bb**', 13)).toEqual({ from: 13, to: 15 });
  });
});

describe('wordAt（光标处词）', () => {
  it('英文词两侧扩展', () => {
    expect(wordAt('hello world', 2)).toEqual({ from: 0, to: 5 });
    expect(wordAt('hello world', 7)).toEqual({ from: 6, to: 11 });
  });

  it('CJK 单字', () => {
    expect(wordAt('中文内容', 1)).toEqual({ from: 0, to: 1 });
    expect(wordAt('中文内容', 2)).toEqual({ from: 1, to: 2 });
  });

  it('纯空白 → null', () => {
    expect(wordAt('   ', 1)).toBeNull();
  });

  it('空文档 → null', () => {
    expect(wordAt('', 0)).toBeNull();
  });
});

describe('paragraphRangeAt（空行界定段落）', () => {
  it('多行段落整体范围', () => {
    const doc = '前\n\n甲\n乙\n\n后';
    // 前0 / \n1 / 空行2 / 甲3 乙4(\n4) 乙5-6? → 甲=3, \n=4, 乙=5, \n=6, 空=7? 直接断言 from/to 与文本切片
    const r = paragraphRangeAt(doc, 4)!;
    expect(doc.slice(r.from, r.to)).toBe('甲\n乙');
  });

  it('文档末段（无后置换行）', () => {
    const doc = 'a\n\nlast';
    const r = paragraphRangeAt(doc, 5)!;
    expect(doc.slice(r.from, r.to)).toBe('last');
  });
});

describe('imageSourceAt（光标处图片）', () => {
  it('命中图片语法返回 src', () => {
    expect(imageSourceAt('![alt](img.png) tail', 5)).toBe('img.png');
  });

  it('非图片位置 → null', () => {
    expect(imageSourceAt('![alt](img.png) tail', 20)).toBeNull();
    expect(imageSourceAt('plain', 2)).toBeNull();
  });
});

// ───────────────── D3：dispatch 行为 ─────────────────

describe('Selection Commands — D3 dispatch', () => {
  beforeEach(() => {
    installSelectionCommandsApi();
  });

  it('selectWord：光标处词选中', () => {
    const view = makeView('hello world');
    view.dispatch({ selection: { anchor: 2, head: 2 } });
    expect(api().selectWord()).toBe(true);
    const sel = view.state.selection.main;
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(5);
    view.destroy();
  });

  it('selectFormatSpan：格式标记内容选中', () => {
    const view = makeView('**bold** tail');
    view.dispatch({ selection: { anchor: 4, head: 4 } });
    expect(api().selectFormatSpan()).toBe(true);
    const sel = view.state.selection.main;
    expect(sel.from).toBe(2);
    expect(sel.to).toBe(6);
    view.destroy();
  });

  it('selectFormatSpan：无标记退化为词', () => {
    const view = makeView('plain words');
    view.dispatch({ selection: { anchor: 2, head: 2 } });
    api().selectFormatSpan();
    const sel = view.state.selection.main;
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(5);
    view.destroy();
  });

  it('gotoDocStart / gotoDocEnd', () => {
    const view = makeView('第一行\n第二行');
    view.dispatch({ selection: { anchor: 5, head: 5 } });
    api().gotoDocStart();
    expect(view.state.selection.main.head).toBe(0);
    api().gotoDocEnd();
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    view.destroy();
  });

  it('gotoLineStart / gotoLineEnd', () => {
    const view = makeView('第一行\n第二行');
    view.dispatch({ selection: { anchor: 5, head: 5 } }); // 「第二行」内
    api().gotoLineStart();
    expect(view.state.selection.main.head).toBe(4);
    api().gotoLineEnd();
    expect(view.state.selection.main.head).toBe(7);
    view.destroy();
  });

  it('deleteWord：删除当前词', () => {
    const view = makeView('hello world');
    view.dispatch({ selection: { anchor: 2, head: 2 } });
    api().deleteWord();
    expect(view.state.doc.toString()).toBe(' world');
    view.destroy();
  });

  it('deleteFormatSpan：删除标记内容（含后置换行吞并规则）', () => {
    const view = makeView('**bold**');
    view.dispatch({ selection: { anchor: 4, head: 4 } });
    api().deleteFormatSpan();
    // 删除内容范围 [2,6) + 保留标记外壳（Typora 删除格式文本 = 只删内容）
    expect(view.state.doc.toString()).toBe('****');
    view.destroy();
  });

  it('deleteParagraph：删除块（连带段落换行）', () => {
    const view = makeView('前\n\n甲\n乙\n\n后');
    view.dispatch({ selection: { anchor: 4, head: 4 } }); // 「甲」行内
    api().deleteParagraph();
    expect(view.state.doc.toString()).toBe('前\n\n后');
    view.destroy();
  });

  it('moveLineUp / moveLineDown：交换相邻行并保持列', () => {
    const view = makeView('aa\nbb\ncc');
    view.dispatch({ selection: { anchor: 5, head: 5 } }); // 「bb」行内（偏移 3+2）
    expect(api().moveLineUp()).toBe(true);
    expect(view.state.doc.toString()).toBe('bb\naa\ncc');
    expect(view.state.selection.main.head).toBe(2); // bb 行内同列
    expect(api().moveLineDown()).toBe(true);
    expect(view.state.doc.toString()).toBe('aa\nbb\ncc');
    expect(view.state.selection.main.head).toBe(5);
    view.destroy();
  });

  it('moveLineUp 首行 / moveLineDown 末行 no-op', () => {
    const view = makeView('aa\nbb');
    view.dispatch({ selection: { anchor: 0, head: 0 } });
    expect(api().moveLineUp()).toBe(false);
    view.dispatch({ selection: { anchor: 4, head: 4 } });
    expect(api().moveLineDown()).toBe(false);
    expect(view.state.doc.toString()).toBe('aa\nbb');
    view.destroy();
  });

  it('imageSourceAtCursor：光标处图片 src', () => {
    const view = makeView('![alt](img.png) tail');
    view.dispatch({ selection: { anchor: 5, head: 5 } });
    expect(api().imageSourceAtCursor()).toBe('img.png');
    view.dispatch({ selection: { anchor: 16, head: 16 } });
    expect(api().imageSourceAtCursor()).toBeNull();
    view.destroy();
  });
});
