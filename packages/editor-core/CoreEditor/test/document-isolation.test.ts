/**
 * 文档切换历史隔离 —— `document-file-safety-spec` §12 Release Blocker
 * 「**document history crossing tabs**」。
 *
 * ⚠️ **本文件是 Mellow 增补**（上游 CoreEditor 没有），re-vendor 时不要丢。
 *
 * 立此文件的理由（2026-09-30 审计）：
 * `packages/document-model/src/index.ts` 的头部注释声明
 * 「**文档切换不共享 Undo History** …… 编辑器侧由 resetEditor（重建 EditorView）保证
 * 历史隔离（CoreEditor 已实现，对应 spec §12 Release Blocker）」——
 * 但**全仓没有任何断言在守它**。`packages/document-model/test/document-model.test.ts`
 * 里那条名为「Editor 层历史隔离由 resetEditor 保证」的测试，实际只断言
 * `a.id !== b.id`（与历史隔离无关，且上一条测试已覆盖）。
 *
 * 而这是 spec §12 列出的 **Release Blocker**（最高严重级）：
 * 历史若跨文档，在 A 文档按 Undo 会**改掉 B 文档的内容** —— 属数据损坏级，
 * 且**屏幕上完全看不出**（用户只看到「撤销没反应/撤销了别的东西」）。
 * 「屏幕上看不出的那一面」正是冒烟测试必然漏掉的一面。
 *
 * 本测试断言的是**行为**（切换后 Undo 回不去上一个文档），而不是实现形态
 * （「resetEditor 里有没有 destroy()」）—— 这样即便将来重构成别的隔离手法，
 * 只要不变量仍成立就依然通过；一旦不变量被破坏则必然失败。
 */
import { describe, expect, test, beforeEach } from '@jest/globals';
import { Config } from '../src/config';
import { resetEditor } from '../src/core';
import { tryGetEditor } from '../src/common/utils';
import { undo, undoDepth } from '../src/@vendor/commands/history';

// 最小 config（与 core.test.ts 同构；resetEditor 会读 window.config）
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

describe('resetEditor 历史隔离（spec §12 Release Blocker：document history crossing tabs）', () => {
  beforeEach(() => {
    tryGetEditor()?.destroy();
    document.body.innerHTML = '';
  });

  test('切换文档后 Undo 不得回退到上一个文档的内容', async () => {
    // ── 文档 A：先证明「Undo 历史确实可用」，否则下面的断言会变成空壳 ──
    await resetEditor('AAA');
    const viewA = tryGetEditor();
    expect(viewA).toBeDefined();
    viewA?.dispatch({ changes: { from: 3, insert: 'BBB' } });
    expect(viewA?.state.doc.toString()).toBe('AAABBB');
    expect(undoDepth(viewA?.state as NonNullable<typeof viewA>['state'])).toBe(1);
    expect(undo(viewA as NonNullable<typeof viewA>)).toBe(true);
    expect(viewA?.state.doc.toString()).toBe('AAA');

    // ── 切到文档 B（resetEditor 就是真实的文档切换路径）──
    await resetEditor('CCC');
    const viewB = tryGetEditor();
    expect(viewB?.state.doc.toString()).toBe('CCC');
    expect(viewB).not.toBe(viewA); // 视图已重建

    // 若历史跨文档，这里会回退成 'AAA'（= Release Blocker）
    expect(undoDepth(viewB?.state as NonNullable<typeof viewB>['state'])).toBe(0);
    expect(undo(viewB as NonNullable<typeof viewB>)).toBe(false);
    expect(viewB?.state.doc.toString()).toBe('CCC');
  });

  test('切换后是全新的 EditorState（历史隔离的机制所在）', async () => {
    await resetEditor('AAA');
    const stateA = tryGetEditor()?.state;
    await resetEditor('BBB');
    const stateB = tryGetEditor()?.state;
    // CM6 的 history 存在 EditorState 里 → 状态不复用即历史不复用
    expect(stateB).not.toBe(stateA);
    expect(undoDepth(stateB as NonNullable<typeof stateB>)).toBe(0);
  });

  test('反向：同一文档内 Undo 必须仍然可用（别把隔离做成「历史全废」）', async () => {
    await resetEditor('AAA');
    const view = tryGetEditor();
    view?.dispatch({ changes: { from: 3, insert: '111' } });
    view?.dispatch({ changes: { from: 6, insert: '222' } });
    expect(view?.state.doc.toString()).toBe('AAA111222');
    // 两次 dispatch 落在同一 undo 组时只算一步，故不断言次数，只断言「能退回去」
    expect(undo(view as NonNullable<typeof view>)).toBe(true);
    expect(view?.state.doc.toString()).not.toBe('AAA111222');
  });
});
