/**
 * P4.7 invalid / partial Markdown fallback source（Typora parity V4）。
 *
 * spec §4/§5 rule 4「node invalid/partial → source」+ § invalid「解析不完整时
 * 优先显示源码」。引擎三重 fallback（plugin.ts / nodes.ts 已核实）：
 *   a) 无内容节点（未闭合 marker 等不构成语法节点）→ 无隐藏项，纯字面；
 *   b) 节点存在但 extractMarkers 返回 null（如 heading marker 后无空格）→ source；
 *   c) 节点被编辑破坏 → 语法树退化，整体回字面；修复后重新 reveal。
 * 通用断言：doc 字面永不改变（Markdown 纯文本唯一真源）、不崩溃。
 *
 * 已知缺口（不在本任务实现，记观察项）：spec §12 broken local link 的
 * subtle error indicator 未实现（mdLink.ts 无 error 路径；broken image 已由
 * image/widget.ts placeholder 覆盖）。
 */

import { setUpEditor, markerTexts, moveCaret, sleep } from './harness';

describe('P4.7 未闭合 / 残缺构造 → 字面 fallback', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('未闭合 bold（**bold）→ 无语法节点，无隐藏项，doc 不变', async () => {
    const view = setUpEditor('**bold');
    await sleep();
    moveCaret(view, 1); // 任意位置
    await sleep();
    expect(markerTexts(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe('**bold');
    view.destroy();
  });

  test('混合：*em* 正常 + **bold 未闭合 → 仅 em 隐藏，bold 字面', async () => {
    const view = setUpEditor('*em* **bold');
    await sleep();
    moveCaret(view, 11); // 末尾（全部节点外）
    await sleep();
    expect(markerTexts(view)).toEqual(['*', '*']);
    expect(view.state.doc.toString()).toBe('*em* **bold');
    view.destroy();
  });

  test('未闭合 inline code（`code）→ 无隐藏项', async () => {
    const view = setUpEditor('`code');
    await sleep();
    moveCaret(view, 5);
    await sleep();
    expect(markerTexts(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe('`code');
    view.destroy();
  });

  test('混合：~~s~~ 正常 + **b 未闭合 → 仅 strike 隐藏', async () => {
    const view = setUpEditor('~~s~~ **b');
    await sleep();
    moveCaret(view, 9);
    await sleep();
    expect(markerTexts(view)).toEqual(['~~', '~~']);
    expect(view.state.doc.toString()).toBe('~~s~~ **b');
    view.destroy();
  });

  test('#tag（# 后无空格）→ 非 ATX heading，HeaderMark 不隐藏', async () => {
    const view = setUpEditor('#tag plain');
    await sleep();
    moveCaret(view, 10);
    await sleep();
    expect(markerTexts(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe('#tag plain');
    view.destroy();
  });

  test('空 heading（# + 空行）→ 安全处理，不崩溃', async () => {
    const view = setUpEditor('# \nx');
    await sleep();
    moveCaret(view, 3); // 'x' 上（heading 0..2 之外）
    await sleep();
    // spec「empty heading safe」：'# ' 含空格整体隐藏（nodes.ts heading extractMarkers 含空格）
    expect(markerTexts(view)).toEqual(['# ']);
    expect(view.state.doc.toString()).toBe('# \nx');
    view.destroy();
  });

  test('未闭合链接（[text]() → Lezer 解析为空 URL Link，[ ] 隐藏', async () => {
    const view = setUpEditor('[text](');
    await sleep();
    moveCaret(view, 7);
    await sleep();
    // 实测锁定：CM 把 [text]( 解析为 dest 为空的 Link 节点（link 标记 '[' ']' 隐藏，
    // '(' 为 LinkMark 后无 URL 不隐藏）—— 结构上非 invalid，属于「宽松解析」
    expect(markerTexts(view)).toEqual(['[', ']']);
    expect(view.state.doc.toString()).toBe('[text](');
    view.destroy();
  });

  test('孤立 marker 串（****）→ 无隐藏项，doc 不变', async () => {
    const view = setUpEditor('****');
    await sleep();
    moveCaret(view, 4);
    await sleep();
    expect(markerTexts(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe('****');
    view.destroy();
  });

  test('残缺表格行（| a | b，无分隔行）→ 非 table，无隐藏项', async () => {
    const view = setUpEditor('| a | b');
    await sleep();
    moveCaret(view, 7);
    await sleep();
    expect(markerTexts(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe('| a | b');
    view.destroy();
  });

  test('混合残缺文档 smoke：一次加载不崩溃、doc 逐字保留', async () => {
    const doc = '**bold\n*em\n`code\n#tag\n[text](\n| a | b\n****\n';
    const view = setUpEditor(doc);
    await sleep();
    moveCaret(view, doc.length);
    await sleep();
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });
});

describe('P4.7 编辑破坏 → 回退 source；修复 → 恢复 rendered', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('删除闭合 marker 一半 → 节点消失全字面；补回 → 重新 rendered', async () => {
    const view = setUpEditor('**bold**x');
    await sleep();
    moveCaret(view, view.state.doc.length); // 节点外（闭区间：node.to=8 需越过）
    await sleep();
    expect(markerTexts(view)).toEqual(['**', '**']);

    // 破坏：删第二个 '*'（pos 6）→ '**bold*x' 不再是 StrongEmphasis
    view.dispatch({ changes: [{ from: 6, to: 7, insert: '' }] });
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(markerTexts(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe('**bold*x');

    // 修复：补回 '*' → 恢复 rendered
    view.dispatch({ changes: [{ from: 6, to: 6, insert: '*' }] });
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(view.state.doc.toString()).toBe('**bold**x');
    expect(markerTexts(view)).toEqual(['**', '**']);
    view.destroy();
  });

  test('删除 strike 闭合 marker → 全字面 fallback', async () => {
    const view = setUpEditor('~~s~~x');
    await sleep();
    view.dispatch({ changes: [{ from: 3, to: 4, insert: '' }] }); // 删一个 '~'
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(markerTexts(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe('~~s~x');
    view.destroy();
  });

  test('heading marker 后删空格 → extractMarkers fallback → source', async () => {
    const view = setUpEditor('# head\nx');
    await sleep();
    moveCaret(view, 7); // 节点外
    await sleep();
    expect(markerTexts(view)).toEqual(['# ']); // heading marker 含尾随空格整体隐藏

    // 删 '# ' 的空格 → '#head' 非 ATX → fallback source
    view.dispatch({ changes: [{ from: 1, to: 2, insert: '' }] });
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(markerTexts(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe('#head\nx');
    view.destroy();
  });
});
