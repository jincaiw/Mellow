/**
 * Image 输入渠道（spec §2：paste bitmap / copied file / URL / drag single / drag multiple / picker）。
 */

import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { history, undo } from '@codemirror/commands';
import { buildImageInputExtension } from '../src/image/input';
import { pickAndInsertImages } from '../src/image/input';
import type { ImageHost } from '../src/image/host';
import { moveCaret, sleep } from './harness';

interface MockHost extends ImageHost {
  picked: string[];
  dropped: string[];
  clipFiles: Array<{ name: string; path: string }>;
  writes: Array<{ path: string; data: ArrayBuffer }>;
  copies: Array<{ from: string; to: string }>;
}

function makeHost(overrides: Partial<MockHost> = {}): MockHost {
  const base: MockHost = {
    getDocumentPath: () => '/docs/note.md',
    pickImageFiles: async () => overrides.picked ?? [],
    readClipboardFiles: async () => overrides.clipFiles ?? [],
    consumeDroppedFilePaths: () => overrides.dropped ?? [],
    copyFile: async (from, to) => {
      base.copies.push({ from, to });
      return { ok: true, value: undefined };
    },
    mkdir: async () => ({ ok: true, value: undefined }),
    writeBinary: async (path, data) => {
      base.writes.push({ path, data });
      return { ok: true, value: undefined };
    },
    resolveWebUrl: async (src) => `mock://${src}`,
    resolveAbsolutePath: () => null,
    exists: async () => true,
    revealFile: async () => {},
    picked: overrides.picked ?? [],
    dropped: overrides.dropped ?? [],
    clipFiles: overrides.clipFiles ?? [],
    writes: [],
    copies: [],
  };
  return base;
}

function setUp(host: ImageHost): EditorView {
  // 只装 input 扩展（install() 已含 image 扩展，避免双插件）
  return new EditorView({
    doc: 'hello',
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), history(), buildImageInputExtension(host)],
  });
}

/** 模拟 paste 事件（items/文件/文本）—— CM eventHandlers 绑定在 contentDOM */
function firePaste(view: EditorView, data: Partial<DataTransfer>): void {
  const dt = {
    files: [] as File[],
    items: [] as DataTransferItem[],
    getData: () => '',
    ...data,
  } as unknown as DataTransfer;
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: dt });
  view.contentDOM.dispatchEvent(event);
}

/** 模拟 drop 事件 */
function fireDrop(view: EditorView): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [], items: [] } });
  view.contentDOM.dispatchEvent(event);
}

describe('paste（spec §2）', () => {
  test('bitmap（items image/*）→ copy-to-assets 写入 + 插入', async () => {
    const host = makeHost();
    const view = setUp(host);
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' }) as File & { arrayBuffer: () => Promise<ArrayBuffer> };
    png.arrayBuffer = async () => new Uint8Array([137, 80, 78, 71]).buffer as ArrayBuffer; // jsdom File 缺 arrayBuffer
    const item = {
      kind: 'file',
      type: 'image/png',
      getAsFile: () => png,
    } as unknown as DataTransferItem;
    firePaste(view, { items: [item] as unknown as DataTransferItemList });
    await sleep();
    expect(host.writes.length).toBe(1);
    const text = view.state.doc.toString();
    expect(text).toContain('![image.png]');
    expect(text).toContain('assets/image.png');
  });

  test('copied file（宿主剪贴板）→ copy-to-assets', async () => {
    const host = makeHost({ clipFiles: [{ name: 'photo.png', path: '/tmp/photo.png' }] });
    const view = setUp(host);
    firePaste(view, {});
    await sleep();
    expect(host.copies.length).toBe(1);
    expect(host.copies[0]).toMatchObject({ from: '/tmp/photo.png', to: '/docs/assets/photo.png' });
    expect(view.state.doc.toString()).toContain('assets/photo.png');
  });

  test('文本 URL → 直插', async () => {
    const host = makeHost();
    const view = setUp(host);
    firePaste(view, { getData: () => 'https://a.com/x.png' });
    await sleep();
    const text = view.state.doc.toString();
    expect(text).toContain('![x.png](https://a.com/x.png)');
  });

  test('非图片文本 → 不插入（走 CM 默认粘贴）', async () => {
    const host = makeHost();
    const view = setUp(host);
    firePaste(view, { getData: () => 'hello world' });
    await sleep();
    // CM 默认粘贴插入文本
    expect(view.state.doc.toString()).toContain('hello world');
    // 无图片 fs 操作
    expect(host.writes.length).toBe(0);
    expect(host.copies.length).toBe(0);
  });

  test('粘贴插入单 Undo 还原（spec §11）', async () => {
    const host = makeHost({ clipFiles: [{ name: 'photo.png', path: '/tmp/photo.png' }] });
    const view = setUp(host);
    firePaste(view, {});
    await sleep();
    const after = view.state.doc.toString();
    expect(after).not.toBe('hello');
    undo(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('hello');
  });
});

describe('drag（spec §2 single/multiple）', () => {
  test('drag single → keep-original 相对路径', async () => {
    const host = makeHost({ dropped: ['/docs/pic.png'] });
    const view = setUp(host);
    fireDrop(view);
    await sleep();
    expect(view.state.doc.toString()).toContain('![](pic.png)');
  });

  test('drag multiple → 多张插入（fs 无操作，keep-original）', async () => {
    const host = makeHost({ dropped: ['/docs/a.png', '/docs/b.jpg', '/docs/c.md'] });
    const view = setUp(host);
    fireDrop(view);
    await sleep();
    const text = view.state.doc.toString();
    expect(text).toContain('![](a.png)');
    expect(text).toContain('![](b.jpg)');
    expect(text).not.toContain('c.md'); // 非图片过滤
    expect(host.copies.length).toBe(0); // keep-original 无复制
  });

  test('dropped 为空（web File 无路径）→ 消费事件不插入', async () => {
    const host = makeHost({ dropped: [] });
    const view = setUp(host);
    fireDrop(view);
    await sleep();
    expect(view.state.doc.toString()).toBe('hello');
  });
});

describe('file picker（spec §2）', () => {
  test('选择图片 → keep-original 插入', async () => {
    const host = makeHost({ picked: ['/docs/select.png', '/docs/skip.txt'] });
    const view = setUp(host);
    await pickAndInsertImages(host, view);
    expect(view.state.doc.toString()).toContain('![](select.png)');
    expect(view.state.doc.toString()).not.toContain('skip.txt');
  });

  test('取消（空）→ 不插入', async () => {
    const host = makeHost({ picked: [] });
    const view = setUp(host);
    const r = await pickAndInsertImages(host, view);
    expect(r.inserted).toBe(false);
    expect(view.state.doc.toString()).toBe('hello');
  });

  test('caret 位置插入', async () => {
    const host = makeHost({ picked: ['/docs/at.png'] });
    const view = setUp(host);
    moveCaret(view, 3);
    await pickAndInsertImages(host, view);
    const text = view.state.doc.toString();
    expect(text.startsWith('hel')).toBe(true);
    expect(text).toContain('![](at.png)');
    expect(text.endsWith('lo')).toBe(true);
  });
});
