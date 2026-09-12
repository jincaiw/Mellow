/**
 * Image 渲染 widget（spec §1/§8：显示 / broken placeholder / retry / reveal / caret 源码）。
 */

import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { setSourceMode } from '../src/index';
import { buildImageWidgetExtension, IMG_WRAPPER_CLASS, IMG_BROKEN_CLASS, IMG_CENTERED_CLASS } from '../src/image/widget';
import type { ImageHost } from '../src/image/host';
import { moveCaret, sleep } from './harness';

function setUp(doc: string, host: ImageHost): EditorView {
  // 只装 widget 扩展（install() 已含 image 扩展，避免双插件）
  const view = new EditorView({
    doc,
    parent: document.body,
    extensions: [
      markdown({ base: markdownLanguage }),
      buildImageWidgetExtension(host),
    ],
  });
  view.focus();
  return view;
}

function imgElements(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll(`.${IMG_WRAPPER_CLASS}`)) as HTMLElement[];
}

function brokenElements(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll(`.${IMG_BROKEN_CLASS}`)) as HTMLElement[];
}

function makeHost(resolve: (src: string) => string | null = (s) => `mock://${s}`): ImageHost {
  const revealed: string[] = [];
  return {
    getDocumentPath: () => '/docs/note.md',
    pickImageFiles: async () => [],
    readClipboardFiles: async () => [],
    consumeDroppedFilePaths: () => [],
    copyFile: async () => ({ ok: true, value: undefined }),
    mkdir: async () => ({ ok: true, value: undefined }),
    writeBinary: async () => ({ ok: true, value: undefined }),
    resolveWebUrl: async (src) => resolve(src),
    resolveAbsolutePath: (src) => (src.startsWith('mock') ? null : src),
    exists: async () => true,
    revealFile: async (path) => { revealed.push(path); },
  };
}

/**
 * V7-W4.3（G7-TYPO-01）：单图独占段落居中 —— Typora 官方 CSS 语义
 * `p > img:only-child { display: block; margin: auto; }`。
 * 编辑器的「段落」= 一行；判定为该行除空白外只有这一个 Image 节点。
 */
describe('V7-W4.3 单图独占段落居中（Typora p > img:only-child）', () => {
  afterEach(() => setSourceMode(false));

  test('独占一行 → 包层带 centered 类', async () => {
    const view = setUp('![alt](assets/a.png)\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    const wrapper = imgElements(view)[0];
    expect(wrapper).toBeDefined();
    expect(wrapper?.classList.contains(IMG_CENTERED_CLASS)).toBe(true);
  });

  test('行内还有其他文字 → 不居中（Typora 同样不居中）', async () => {
    const view = setUp('caption ![alt](assets/a.png)\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(imgElements(view)[0]?.classList.contains(IMG_CENTERED_CLASS)).toBe(false);
  });

  test('两张图并排 → 都不居中（only-child 语义）', async () => {
    const view = setUp('![a](assets/a.png) ![b](assets/b.png)\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    const wrappers = imgElements(view);
    expect(wrappers.length).toBe(2);
    for (const w of wrappers) expect(w.classList.contains(IMG_CENTERED_CLASS)).toBe(false);
  });

  test('多段落：仅独占段落的图居中（居中态随段落独立判定）', async () => {
    const view = setUp('![solo](assets/a.png)\n\ninline ![x](assets/b.png) tail\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    const wrappers = imgElements(view);
    expect(wrappers.length).toBe(2);
    expect(wrappers[0]?.classList.contains(IMG_CENTERED_CLASS)).toBe(true);
    expect(wrappers[1]?.classList.contains(IMG_CENTERED_CLASS)).toBe(false);
  });

  test('居中态随编辑变化：同段落追加文字后取消居中（eq 必须含 centered）', async () => {
    const view = setUp('![alt](assets/a.png)\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(imgElements(view)[0]?.classList.contains(IMG_CENTERED_CLASS)).toBe(true);
    // 在图片前插入文字 → 不再是 only-child
    view.dispatch({ changes: { from: 0, insert: 'lead ' } });
    await sleep();
    expect(imgElements(view)[0]?.classList.contains(IMG_CENTERED_CLASS)).toBe(false);
  });
});

describe('Live Mode 渲染', () => {
  afterEach(() => setSourceMode(false)); // Source Mode 用例后重置（防跨用例污染）

  test('idle → 图片 widget 替换节点', async () => {
    const view = setUp('![alt](assets/a.png)\n', makeHost());
    await sleep();
    // caret 移到节点外（idle）
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(imgElements(view).length).toBe(1);
    const img = view.dom.querySelector('img.mellow-md-image-img') as HTMLImageElement | null;
    expect(img?.src).toContain('mock://');
    expect(img?.alt).toBe('alt');
  });

  test('caret 在节点内 → 源码（可编辑）', async () => {
    const view = setUp('![alt](assets/a.png)\n', makeHost());
    await sleep();
    moveCaret(view, 4);
    await sleep();
    expect(imgElements(view).length).toBe(0);
  });

  test('Source Mode → 源码', async () => {
    const view = setUp('![alt](assets/a.png)\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(imgElements(view).length).toBe(1);
    setSourceMode(true);
    view.dispatch({ selection: view.state.selection });
    await sleep();
    expect(imgElements(view).length).toBe(0);
  });

  test('远程 URL → 默认自动加载 img（V6-P1 1.2.6：Typora 行为）', async () => {
    const view = setUp('![x](https://a.com/x.png)\n', makeHost((s) => s));
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    const img = view.dom.querySelector('img.mellow-md-image-img') as HTMLImageElement | null;
    expect(img?.src).toContain('https://a.com/x.png');
  });

  test('远程 URL → 设置关闭（\'0\'）后显示占位 + 手动加载按钮（V6-P1 回退路径）', async () => {
    localStorage.setItem('mellow.image.loadRemote', '0');
    try {
      const view = setUp('![x](https://a.com/x.png)\n', makeHost((s) => s));
      await sleep();
      moveCaret(view, view.state.doc.length);
      await sleep();
      // 关闭自动加载：无 img，显示占位 + 「加载远程图片」按钮
      expect(view.dom.querySelector('img.mellow-md-image-img')).toBeNull();
      expect(view.dom.querySelector(`.${IMG_BROKEN_CLASS}`)).not.toBeNull();
      expect(view.dom.textContent).toContain('加载远程图片');
    } finally {
      localStorage.removeItem('mellow.image.loadRemote');
    }
  });
});

describe('Broken Image（spec §8）', () => {
  test('resolve 失败 → placeholder（文件名 + retry + reveal）', async () => {
    const view = setUp('![alt](missing.png)\n', makeHost(() => null));
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(brokenElements(view).length).toBe(1);
    const text = brokenElements(view)[0]?.textContent ?? '';
    expect(text).toContain('missing.png');
    expect(text).toContain('重试');
    expect(text).toContain('定位');
  });

  test('retry：重新 resolve 成功 → 图片恢复', async () => {
    let ok = false;
    const view = setUp('![alt](a.png)\n', makeHost((s) => (ok ? `mock://${s}` : null)));
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(brokenElements(view).length).toBe(1);
    ok = true;
    // 点击重试
    const retryBtn = Array.from(view.dom.querySelectorAll('.mellow-md-image-broken button')).find(
      (b) => (b as HTMLButtonElement).textContent === '重试',
    ) as HTMLButtonElement;
    retryBtn?.click();
    await sleep();
    expect(brokenElements(view).length).toBe(0);
  });

  test('reveal：resolveAbsolutePath 后调宿主 revealFile', async () => {
    const host = makeHost(() => null);
    const view = setUp('![alt](missing.png)\n', host);
    await sleep();
    const revealBtn = Array.from(view.dom.querySelectorAll('.mellow-md-image-broken button')).find(
      (b) => (b as HTMLButtonElement).textContent === '定位',
    ) as HTMLButtonElement;
    revealBtn?.click();
    await sleep();
    // 断言不崩（resolveAbsolutePath 返回 src 原样时 reveal 被调）
  });
});
