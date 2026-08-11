/**
 * Engine Image API（宿主 → 引擎通道：applyChanges 单事务 / refreshImages）
 * + 图片 widget 悬停操作条（spec §6 单图操作入口）。
 */

import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { history, undo } from '@codemirror/commands';
import { getEngineImageApi } from '../src/image/engineApi';
import { buildImageWidgetExtension, IMG_ACTIONS_CLASS, IMG_WRAPPER_CLASS } from '../src/image/widget';
import type { ImageHost } from '../src/image/host';
import { moveCaret, sleep } from './harness';

function setUp(doc: string, host: ImageHost): EditorView {
  return new EditorView({
    doc,
    parent: document.body,
    extensions: [markdown({ base: markdownLanguage }), history(), buildImageWidgetExtension(host)],
  });
}

function makeHost(): ImageHost {
  return {
    getDocumentPath: () => '/docs/note.md',
    pickImageFiles: async () => [],
    readClipboardFiles: async () => [],
    consumeDroppedFilePaths: () => [],
    copyFile: async () => ({ ok: true, value: undefined }),
    mkdir: async () => ({ ok: true, value: undefined }),
    writeBinary: async () => ({ ok: true, value: undefined }),
    resolveWebUrl: async (src) => (src.startsWith('http') ? src : `mock://${src}`),
    resolveAbsolutePath: (src) => src,
    exists: async () => true,
    revealFile: async () => {},
  };
}

describe('Engine Image API（applyChanges / refreshImages）', () => {
  afterEach(() => {
    // 清理全局 API（避免跨用例污染）
    delete (window as unknown as Record<string, unknown>)['__MELLOW_ENGINE_API__'];
  });

  test('applyChanges 单事务替换多引用（一次 Undo 可撤销全部）', () => {
    const view = setUp('![a](./assets/a.png)\n![b](./assets/b.png)\n', makeHost());
    const api = getEngineImageApi();
    expect(api).not.toBeNull();
    const ok = api!.applyChanges([
      { from: 0, to: 20, text: '![a](./assets/a-1.png)' },
      { from: 21, to: 41, text: '![b](./assets/b-1.png)' },
    ]);
    expect(ok).toBe(true);
    expect(view.state.doc.toString()).toBe('![a](./assets/a-1.png)\n![b](./assets/b-1.png)\n');
    // 单事务：一次 undo 全部还原
    undo(view);
    expect(view.state.doc.toString()).toBe('![a](./assets/a.png)\n![b](./assets/b.png)\n');
  });

  test('未注册（无 widget 扩展）→ null', () => {
    delete (window as unknown as Record<string, unknown>)['__MELLOW_ENGINE_API__'];
    expect(getEngineImageApi()).toBeNull();
  });

  test('refreshImages 触发 widget 重新解析（文档路径变化后）', async () => {
    const view = setUp('![x](a.png)\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    const img = view.dom.querySelector('img.mellow-md-image-img') as HTMLImageElement | null;
    expect(img?.src).toContain('mock://');
    // 模拟文档路径变化：宿主更新 __MELLOW_DOC_PATH__ 后 refreshImages
    (window as unknown as { __MELLOW_DOC_PATH__?: string }).__MELLOW_DOC_PATH__ = '/other/note.md';
    getEngineImageApi()?.refreshImages();
    await sleep();
    // 重新 resolve（mock resolveWebUrl 不依赖路径 → src 不变；仅验证不崩溃 + 仍渲染）
    expect(view.dom.querySelector('img.mellow-md-image-img')).not.toBeNull();
  });
});

describe('Image widget 悬停操作条（spec §6）', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['__MELLOW_IMAGE_ACTIONS__'];
    delete (window as unknown as Record<string, unknown>)['__MELLOW_ENGINE_API__'];
  });

  test('无宿主 handler → 不显示操作条', async () => {
    const view = setUp('![x](a.png)\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    expect(view.dom.querySelector(`.${IMG_ACTIONS_CLASS}`)).toBeNull();
  });

  test('宿主 handler → 显示操作条；点击分发 {src, action}', async () => {
    const requests: Array<{ src: string; action: string }> = [];
    (window as unknown as Record<string, unknown>)['__MELLOW_IMAGE_ACTIONS__'] = (req: { src: string; action: string }) => {
      requests.push(req);
    };
    const view = setUp('![x](a.png)\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    const wrapper = view.dom.querySelector(`.${IMG_WRAPPER_CLASS}`) as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    const bar = wrapper!.querySelector(`.${IMG_ACTIONS_CLASS}`);
    expect(bar).not.toBeNull();
    // 本地图 → 定位/打开/重命名/移动/复制/复制路径
    const labels = Array.from(wrapper!.querySelectorAll('.mellow-md-image-action-btn')).map((b) => b.textContent);
    expect(labels).toEqual(['定位', '打开', '重命名', '移动', '复制', '复制路径']);
    // 点击"移动"
    const moveBtn = Array.from(wrapper!.querySelectorAll('.mellow-md-image-action-btn'))
      .find((b) => b.textContent === '移动') as HTMLButtonElement;
    moveBtn.click();
    expect(requests).toEqual([{ src: 'a.png', action: 'move' }]);
  });

  test('远程图 → 下载/打开/复制路径', async () => {
    const requests: Array<{ src: string; action: string }> = [];
    (window as unknown as Record<string, unknown>)['__MELLOW_IMAGE_ACTIONS__'] = (req: { src: string; action: string }) => {
      requests.push(req);
    };
    const view = setUp('![x](https://a.com/x.png)\n', makeHost());
    await sleep();
    moveCaret(view, view.state.doc.length);
    await sleep();
    const wrapper = view.dom.querySelector(`.${IMG_WRAPPER_CLASS}`) as HTMLElement | null;
    const labels = Array.from(wrapper!.querySelectorAll('.mellow-md-image-action-btn')).map((b) => b.textContent);
    expect(labels).toEqual(['下载', '打开', '复制路径']);
    const dl = Array.from(wrapper!.querySelectorAll('.mellow-md-image-action-btn'))
      .find((b) => b.textContent === '下载') as HTMLButtonElement;
    dl.click();
    expect(requests[0]).toEqual({ src: 'https://a.com/x.png', action: 'downloadRemote' });
  });
});
