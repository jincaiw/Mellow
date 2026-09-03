/**
 * P4.2 —— 9 模块 IME Composition Guard 专项测试（live-markdown-engine-spec §6）。
 *
 * 覆盖 V4 计划「补齐 9 个模块 guard」的各插点：
 * 1. taskCheckbox   plugin.update：合成期间 doc 变化只 map，不重算；
 * 2. codeLineNumbers plugin.update：同上（行号 widget 不重建）；
 * 3. image/widget   plugin.update：图片 replace decoration 冻结；
 * 4. image/engineApi applyChanges：合成期间拒绝宿主外部事务（返回 false）；
 * 5. selectionCommands：合成期间 selection/dispatch 命令 no-op（返回 false）；
 * 6. table/commands：合成期间 addRow 等编辑命令 no-op；
 * 7. emojiSource：合成期间不弹补全（返回 null）；
 * 8. codeFence fenceLangSource：同上；
 * 9. documentSearch：合成期间不提交查询（panel input → setSearchQuery 冻结）。
 *
 * 另：smartPunctuation 无插点（CM inputHandler 在 composition 期间不触发，
 * 见其文件头注释）；table/parser 纯函数无插点。
 */

import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, resetModeState, CHECKBOX_CLASS } from '../src/index';
import { installCompositionTracking, resetCompositionState } from '../src/composition';
import { setCodeLineNumbers } from '../src/codeLineNumbers';
import { installSelectionCommandsApi, buildSelectionCommandsExtension } from '../src/selectionCommands';
import { tableAt, addRow } from '../src/table/commands';
import { emojiSource } from '../src/emoji';
import { fenceLangSource } from '../src/codeFence';
import { attachEngineView, registerEngineImageApi, getEngineImageApi } from '../src/image/engineApi';
import { sleep } from './harness';

// document 级 composition 事件监听（幂等；后续测试经 dispatchEvent 驱动状态）
installCompositionTracking();

function startComposition(): void {
  document.dispatchEvent(new Event('compositionstart'));
}

function endComposition(): void {
  document.dispatchEvent(new Event('compositionend'));
}

function makeView(doc: string, extra: import('@codemirror/state').Extension[] = []): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(true), ...extra],
  });
  view.focus();
  return view;
}

beforeEach(() => {
  resetCompositionState();
  resetModeState();
});

afterEach(() => {
  setCodeLineNumbers(false);
});

describe('P4.2 — taskCheckbox guard', () => {
  test('合成期间 doc 变化：checkbox 不重算（冻结）；结束后恢复', async () => {
    const view = makeView('- [ ] todo');
    await sleep();
    const boxes = (): number => view.dom.querySelectorAll(`.${CHECKBOX_CLASS}`).length;
    expect(boxes()).toBe(1);

    startComposition();
    view.dispatch({ changes: { from: 10, insert: '\n- [ ] more' } });
    await sleep();
    expect(boxes()).toBe(1); // 冻结：新增 TaskMarker 不渲染

    endComposition();
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(boxes()).toBe(2); // 重算恢复
    view.destroy();
  });
});

describe('P4.2 — codeLineNumbers guard', () => {
  test('合成期间 doc 变化：行号不重算（冻结）；结束后恢复', async () => {
    setCodeLineNumbers(true);
    const view = makeView('```\nline1\nline2\n```');
    await sleep();
    const count = (): number => view.dom.querySelectorAll('.mellow-cln').length;
    expect(count()).toBe(2); // 内容行 line1/line2

    startComposition();
    view.dispatch({ changes: { from: 15, insert: '\nline3' } });
    await sleep();
    expect(count()).toBe(2); // 冻结：line3 不渲染行号

    endComposition();
    // 合成后继续输入（doc change）→ 重算补齐 line3 行号
    //（行号 plugin 重算条件为 doc/viewport/version，无 selectionSet）
    view.dispatch({ changes: { from: 21, insert: 'x' } });
    await sleep();
    expect(count()).toBe(3); // 重算恢复
    view.destroy();
  });
});

describe('P4.2 — image widget guard', () => {
  test('合成期间 doc 变化：图片 decoration 冻结；结束后恢复', async () => {
    const view = makeView('![a](b.png) end');
    await sleep();
    const count = (): number => view.dom.querySelectorAll('.mellow-md-image').length;
    // caret 移出图片节点（节点内 → 源码可编辑，不渲染 widget）
    view.dispatch({ selection: { anchor: 15, head: 15 } });
    await sleep();
    expect(count()).toBe(1);

    startComposition();
    view.dispatch({ changes: { from: 15, insert: '\n\n![c](d.png)' } });
    await sleep();
    expect(count()).toBe(1); // 冻结：新图片不渲染

    endComposition();
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(count()).toBe(2); // 重算恢复
    view.destroy();
  });
});

describe('P4.2 — image engineApi applyChanges guard', () => {
  test('合成期间宿主 patchChanges 被拒绝（返回 false，doc 不变）', async () => {
    const view = makeView('![a](b.png) end');
    attachEngineView(view);
    registerEngineImageApi();
    const api = getEngineImageApi();
    expect(api).not.toBeNull();

    startComposition();
    expect(api!.applyChanges([{ from: 0, to: 15, text: 'X' }])).toBe(false);
    expect(view.state.doc.toString()).toBe('![a](b.png) end');

    endComposition();
    expect(api!.applyChanges([{ from: 0, to: 15, text: 'X' }])).toBe(true);
    expect(view.state.doc.toString()).toBe('X'); // 0..15 = 全文档替换
    view.destroy();
  });
});

describe('P4.2 — selectionCommands guard', () => {
  test('合成期间 selectWord no-op（selection 不变）；结束后生效', () => {
    installSelectionCommandsApi();
    const view = makeView('foo bar baz', [buildSelectionCommandsExtension()]);
    view.dispatch({ selection: { anchor: 5, head: 5 } }); // 'bar' 内
    const api = (window as unknown as { __MELLOW_SELECTION_COMMANDS__: { selectWord(): boolean } }).__MELLOW_SELECTION_COMMANDS__;

    startComposition();
    expect(api.selectWord()).toBe(false);
    expect(view.state.selection.main.head).toBe(5);

    endComposition();
    expect(api.selectWord()).toBe(true);
    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(7);
    view.destroy();
  });
});

describe('P4.2 — table commands guard', () => {
  test('合成期间 addRow no-op（doc 不变）；结束后生效', () => {
    const doc = 'before\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter';
    const view = makeView(doc);
    const ctx = tableAt(view, 20);
    expect(ctx).not.toBeNull();

    startComposition();
    addRow(view, ctx!.model, 2);
    expect(view.state.doc.toString()).toBe(doc);

    endComposition();
    addRow(view, ctx!.model, 2);
    expect(view.state.doc.toString()).toContain('| 1 | 2 |\n| | |');
    view.destroy();
  });
});

describe('P4.2 — emoji / fenceLang 补全源 guard', () => {
  test('emojiSource：合成期间返回 null；结束后正常', () => {
    const view = makeView('x :smi');
    const ctx = { view, pos: 6, state: view.state };

    startComposition();
    expect(emojiSource(ctx)).toBeNull();

    endComposition();
    const result = emojiSource(ctx);
    expect(result).not.toBeNull();
    expect(result!.options.length).toBeGreaterThan(0);
    expect(result!.options[0].label).toBe('smile');
    view.destroy();
  });

  test('fenceLangSource：合成期间返回 null；结束后正常', () => {
    const view = makeView('```');
    const ctx = { view, pos: 3, state: view.state };

    startComposition();
    expect(fenceLangSource(ctx)).toBeNull();

    endComposition();
    const result = fenceLangSource(ctx);
    expect(result).not.toBeNull();
    expect(result!.options.some((o) => o.label === 'markdown')).toBe(true);
    view.destroy();
  });
});

describe('P4.2 — documentSearch guard', () => {
  test('合成期间面板 input 不提交查询；结束后恢复提交', async () => {
    const view = makeView('hello world');
    const { openSearchPanel, searchPanelOpen, getSearchQuery } = await import('@codemirror/search');
    openSearchPanel(view);
    await sleep();
    expect(searchPanelOpen(view.state)).toBe(true);
    const input = view.dom.querySelector<HTMLInputElement>('input[name="search"]');
    expect(input).not.toBeNull();
    expect(getSearchQuery(view.state).search).toBe(''); // 默认空查询

    startComposition();
    input!.value = 'wor';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep();
    expect(getSearchQuery(view.state).search).toBe(''); // 冻结：半程拼音不入查询

    endComposition();
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep();
    expect(getSearchQuery(view.state).search).toBe('wor'); // 恢复提交
    view.destroy();
  });
});
