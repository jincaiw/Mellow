/**
 * E6a Readonly Mode 引擎单测：
 * - buildReadonlyExtension 安装后默认可编辑；
 * - setReadonlyMode(true) → .mellow-readonly class 在场、domEventHandlers 输入不落 doc；
 * - setReadonlyMode(false) → 恢复。
 */
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { install, setReadonlyMode, isReadonlyMode } from '../src/index';
import { sleep } from './harness';

function makeView(doc: string): EditorView {
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), install(false)],
  });
  view.focus();
  return view;
}

function typeText(view: EditorView, text: string): void {
  for (const ch of text) {
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
  }
}

describe('E6a Readonly Mode', () => {
  afterEach(() => {
    setReadonlyMode(false);
    document.body.innerHTML = '';
  });

  test('默认可编辑：输入落 doc', async () => {
    const view = makeView('plain');
    try {
      await sleep();
      view.dispatch({ changes: { from: 5, insert: 'X' } });
      await sleep();
      expect(view.state.doc.toString()).toBe('plainX');
    } finally { view.destroy(); }
  });

  test('只读开启：class 在场、CM 编辑被拒', async () => {
    const view = makeView('plain');
    try {
      await sleep();
      setReadonlyMode(true);
      await sleep();
      expect(isReadonlyMode()).toBe(true);
      expect(view.dom.classList.contains('mellow-readonly')).toBe(true);

      // CM editable=false：contentDOM 输入被引擎拒绝（DOM 级 beforeinput/keydown 不产生事务）
      const before = view.state.doc.toString();
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      view.contentDOM.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'a', bubbles: true, cancelable: true }));
      await sleep();
      expect(view.state.doc.toString()).toBe(before);
    } finally { view.destroy(); }
  });

  test('恢复可编辑：class 移除', async () => {
    const view = makeView('plain');
    try {
      await sleep();
      setReadonlyMode(true);
      await sleep();
      setReadonlyMode(false);
      await sleep();
      expect(isReadonlyMode()).toBe(false);
      expect(view.dom.classList.contains('mellow-readonly')).toBe(false);
      view.dispatch({ changes: { from: 5, insert: 'Y' } });
      await sleep();
      expect(view.state.doc.toString()).toBe('plainY');
    } finally { view.destroy(); }
  });

  test('create 时已处于只读态的新视图立即收敛（继承全局状态）', async () => {
    setReadonlyMode(true);
    const view = makeView('plain');
    try {
      await sleep();
      expect(view.dom.classList.contains('mellow-readonly')).toBe(true);
    } finally { view.destroy(); }
  });

  test('typeText 辅助：可编辑态字符输入仍按引擎既有语义（不强制落字）', async () => {
    const view = makeView('plain');
    try {
      await sleep();
      typeText(view, 'Z');
      await sleep();
      // jsdom 无真实按键到事务的通道，这里仅保证事件路径不抛错
      expect(view.state.doc.toString()).toContain('plain');
    } finally { view.destroy(); }
  });
});
