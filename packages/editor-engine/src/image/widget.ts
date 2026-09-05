/**
 * Image 渲染 widget（spec §1/§8）—— Live Mode 图片显示。
 *
 * - caret 不在 Image 节点内 → replace 节点为 <img>（src 经 host.resolveWebUrl）
 * - caret 在节点内 / Source Mode → 源码（可编辑）
 * - broken（resolve 失败 / img error）→ compact placeholder：
 *   文件名/路径 + retry + reveal source（禁止自动删除引用，spec §8）
 * - 远程 URL：直接 <img>（无静默下载，spec §9；localize 属 Phase 2）
 */

import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { isSourceMode } from '../mode';
import { isLargeFileMode } from '../largeFile';
import { isComposing } from '../composition';
import type { ImageHost } from './host';
import { attachEngineView, trackImageWidget, registerEngineImageApi } from './engineApi';
import { isRemoteSrc } from './scan';
import { stripImageSize } from './path';
import type { ImageSize } from './path';

const IMG_WRAPPER_CLASS = 'mellow-md-image';
const IMG_BROKEN_CLASS = 'mellow-md-image-broken';
const IMG_ACTIONS_CLASS = 'mellow-md-image-actions';

/** 图片 widget 操作请求（宿主注入 __MELLOW_IMAGE_ACTIONS__ handler 处理；V0.0 最小操作集） */
export type ImageWidgetAction =
  | 'reveal'
  | 'open'
  | 'rename'
  | 'move'
  | 'copy'
  | 'copyPath'
  | 'downloadRemote'
  /** C1 右键菜单新增：设置显示尺寸（ =WxH 后缀） */
  | 'setSize'
  /** C1：Markdown → HTML 转换（光标处单张） */
  | 'mdToHtml'
  /** C1：HTML → Markdown 转换 */
  | 'htmlToMd'
  /** C1：上传到图床并替换 src */
  | 'upload'
  /** C1：删除（本地文件进回收站 + 二次确认；移除 Markdown 引用） */
  | 'delete';

export interface ImageWidgetActionRequest {
  /** 原始 src（未反转义） */
  src: string;
  action: ImageWidgetAction;
}

/** 宿主注入的操作 handler（desktop App 接线到 app-core 编排） */
export type ImageWidgetActionsHandler = (request: ImageWidgetActionRequest) => void;

const ACTIONS_GLOBAL_KEY = '__MELLOW_IMAGE_ACTIONS__' as const;

function getActionsHandler(): ImageWidgetActionsHandler | null {
  const win = window as unknown as Record<string, unknown>;
  return typeof win[ACTIONS_GLOBAL_KEY] === 'function' ? (win[ACTIONS_GLOBAL_KEY] as ImageWidgetActionsHandler) : null;
}

/** 运行时 CM6 模块（iframe 内与 CoreEditor 同一实例） */
interface CmRuntime {
  EditorView: typeof import('@codemirror/view').EditorView;
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
  Decoration: typeof import('@codemirror/view').Decoration;
  WidgetType: typeof import('@codemirror/view').WidgetType;
  RangeSetBuilder: typeof import('@codemirror/state').RangeSetBuilder;
  syntaxTree: typeof import('@codemirror/language').syntaxTree;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  const state = requireFn('@codemirror/state') as typeof import('@codemirror/state');
  const language = requireFn('@codemirror/language') as typeof import('@codemirror/language');
  return {
    EditorView: view.EditorView,
    ViewPlugin: view.ViewPlugin,
    Decoration: view.Decoration,
    WidgetType: view.WidgetType,
    RangeSetBuilder: state.RangeSetBuilder,
    syntaxTree: language.syntaxTree,
  };
}

interface ImageSpec {
  from: number;
  to: number;
  src: string;
  /** 尺寸（Typora =WxH 语法；null = 原始尺寸） */
  size?: ImageSize | null;
  alt: string;
}

/** 提取 Image 节点信息：`![alt](src)` → { from, to, src, alt } */
export function parseImageNode(text: string): { src: string; alt: string; size: ImageSize | null } | null {
  const m = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(text.trim());
  if (m === null) {
    return null;
  }
  const parsed = stripImageSize(m[2].trim());
  return { alt: m[1], src: parsed.src, size: parsed.size };
}

/** 构建 Image 渲染扩展（host 注入） */
export function buildImageWidgetExtension(host: ImageHost): Extension {
  const cm = resolveCm();
  const { ViewPlugin, Decoration, WidgetType, RangeSetBuilder, syntaxTree } = cm;

  class ImageWidget extends WidgetType {
    private container: HTMLSpanElement | null = null;
    private resolvedUrl: string | null = null;
    private broken = false;
    private remoteLoaded = false;
    private untrack: (() => void) | null = null;

    constructor(
      readonly spec: ImageSpec,
    ) {
      super();
      this.untrack = trackImageWidget({ retry: this.retry.bind(this), dispose: () => this.destroy() });
      void this.resolve();
    }

    override destroy(): void {
      this.untrack?.();
      this.untrack = null;
    }

    override eq(other: ImageWidget): boolean {
      return other.spec.from === this.spec.from
        && other.spec.to === this.spec.to
        && other.spec.src === this.spec.src;
    }

    private async resolve(): Promise<void> {
      const url = await host.resolveWebUrl(this.spec.src);
      this.broken = url === null;
      this.resolvedUrl = url;
      this.render();
    }

    override toDOM(): HTMLElement {
      this.container = document.createElement('span');
      this.container.className = IMG_WRAPPER_CLASS;
      this.render();
      return this.container;
    }

    /** 内部重建内容（resolve/retry 后 CM 不会重调 toDOM） */
    private render(): void {
      if (this.container === null) {
        return;
      }
      this.container.textContent = '';
      // 悬停操作条（宿主注入 handler 时显示；spec §6 单图操作入口，各分支均保留）
      const appendActions = (): void => {
        const bar = buildActionsBar(this.spec, () => this.container?.querySelector('img') ?? null);
        if (bar !== null) {
          this.container?.appendChild(bar);
        }
      };
      if (this.broken || this.resolvedUrl === null) {
        this.container.appendChild(buildBrokenPlaceholder(this.spec, this.retry.bind(this)));
        appendActions();
        return;
      }
      // Security M2：远程图片默认不加载（默认无需联网）；设置开启或显式点击后才加载。
      if (isRemoteSrc(this.spec.src) && !this.remoteLoaded && !remoteImagesEnabled()) {
        this.container.appendChild(buildRemotePlaceholder(this.spec.src, () => {
          this.remoteLoaded = true;
          this.render();
        }));
        appendActions();
        return;
      }
      const img = document.createElement('img');
      img.className = 'mellow-md-image-img';
      img.src = this.resolvedUrl;
      if (this.spec.size !== undefined && this.spec.size !== null) {
        img.style.width = `${this.spec.size.width}px`;
        img.style.height = `${this.spec.size.height}px`;
      }
      img.alt = this.spec.alt;
      img.draggable = false;
      // Large File Mode：图片懒加载（PRD §109 image lazy）
      if (isLargeFileMode()) img.loading = 'lazy';
      // img error → broken placeholder（网络失败/文件消失）
      img.addEventListener('error', () => {
        this.broken = true;
        this.render();
      });
      this.container.appendChild(img);
      appendActions();
    }

    private retry(): void {
      this.broken = false;
      this.resolvedUrl = null;
      void this.resolve();
    }
  }

  function buildBrokenPlaceholder(spec: ImageSpec, retry: () => void): HTMLElement {
    const el = document.createElement('span');
    el.className = IMG_BROKEN_CLASS;
    el.title = spec.src;

    const name = document.createElement('span');
    name.className = 'mellow-md-image-broken-name';
    name.textContent = spec.src.split('/').pop() ?? spec.src;
    el.appendChild(name);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.textContent = '重试';
    retryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      retry();
    });
    el.appendChild(retryBtn);

    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.textContent = '定位';
    revealBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const abs = host.resolveAbsolutePath(spec.src);
      if (abs !== null) {
        void host.revealFile(abs);
      }
    });
    el.appendChild(revealBtn);

    return el;
  }

  /** Security M2：远程图片默认不加载（默认无需联网） */
  function remoteImagesEnabled(): boolean {
    try {
      return localStorage.getItem('mellow.image.loadRemote') === '1';
    } catch {
      return false;
    }
  }

  function buildRemotePlaceholder(src: string, load: () => void): HTMLElement {
    const el = document.createElement('span');
    el.className = IMG_BROKEN_CLASS;
    el.title = src;

    const name = document.createElement('span');
    name.className = 'mellow-md-image-broken-name';
    name.textContent = `🌐 ${src.split('/').pop() ?? src}`;
    el.appendChild(name);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '加载远程图片';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      load();
    });
    el.appendChild(btn);

    return el;
  }

  /**
   * 悬停操作条（spec §6 单图操作；宿主注入 handler 时显示）。
   * E2（Typora 对标）：追加尺寸徽标（渲染尺寸 + 缩放比例）与画布内尺寸编辑入口
   * （复用右键 setSize 管线，=WxH 后缀语法）。
   */
  function buildActionsBar(spec: ImageSpec, getImg: () => HTMLImageElement | null): HTMLElement | null {
    const handler = getActionsHandler();
    if (handler === null) {
      return null;
    }
    const remote = isRemoteSrc(spec.src);
    const items: Array<{ action: ImageWidgetAction; label: string; title: string }> = remote
      ? [
          { action: 'setSize', label: '尺寸', title: '设置显示尺寸（宽×高）' },
          { action: 'downloadRemote', label: '下载', title: '下载到本地 asset 目录并更新引用' },
          { action: 'open', label: '打开', title: '在浏览器中打开' },
          { action: 'copyPath', label: '复制路径', title: '复制图片 URL' },
        ]
      : [
          { action: 'setSize', label: '尺寸', title: '设置显示尺寸（宽×高）' },
          { action: 'reveal', label: '定位', title: '在文件管理器中定位' },
          { action: 'open', label: '打开', title: '用系统默认应用打开' },
          { action: 'rename', label: '重命名', title: '重命名文件并更新引用' },
          { action: 'move', label: '移动', title: '移动到其他目录并更新引用' },
          { action: 'copy', label: '复制', title: '复制到 asset 目录并更新引用' },
          { action: 'copyPath', label: '复制路径', title: '复制图片绝对路径' },
        ];
    const bar = document.createElement('span');
    bar.className = IMG_ACTIONS_CLASS;
    // E2：尺寸徽标（img 加载完成后填充：渲染宽×高 + 非原始尺寸时的缩放百分比）
    const badge = document.createElement('span');
    badge.className = 'mellow-md-image-size-badge';
    badge.style.display = 'none';
    const updateBadge = (): void => {
      const img = getImg();
      if (img === null || !img.complete || img.naturalWidth === 0) {
        return;
      }
      const w = Number.parseFloat(img.style.width) || img.naturalWidth;
      const h = Number.parseFloat(img.style.height) || img.naturalHeight;
      const scaled = w !== img.naturalWidth || h !== img.naturalHeight;
      const pct = scaled ? ` · ${Math.round((w / img.naturalWidth) * 100)}%` : '';
      badge.textContent = `${Math.round(w)}×${Math.round(h)}${pct}`;
      badge.style.display = 'inline';
    };
    getImg()?.addEventListener('load', updateBadge);
    updateBadge();
    bar.appendChild(badge);
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mellow-md-image-action-btn';
      btn.textContent = item.label;
      btn.title = item.title;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler({ src: spec.src, action: item.action });
      });
      bar.appendChild(btn);
    }
    return bar;
  }

  const buildDecorations = (view: EditorView): DecorationSet => {
    if (isSourceMode(view)) {
      return Decoration.none;
    }
    const { state } = view;
    const builder = new RangeSetBuilder<import('@codemirror/view').Decoration>();
    const caret = state.selection.main;
    syntaxTree(state).iterate({
      from: 0,
      to: state.doc.length,
      enter: (node) => {
        if (node.name !== 'Image' || node.from >= node.to) {
          return;
        }
        // caret/selection 碰节点 → 源码（可编辑，同 link mixed 语义）
        if (node.from <= caret.head && node.to >= caret.anchor) {
          return;
        }
        const text = state.sliceDoc(node.from, node.to);
        const parsed = parseImageNode(text);
        if (parsed === null) {
          return;
        }
        builder.add(
          node.from,
          node.to,
          Decoration.replace({
            widget: new ImageWidget({ from: node.from, to: node.to, src: parsed.src, alt: parsed.alt, size: parsed.size }),
          }),
        );
      },
    });
    return builder.finish();
  };

  const plugin = ViewPlugin.fromClass(
    class ImageWidgetPlugin {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) {
        attachEngineView(view); // 宿主 patchChanges 通道（单事务 applyChanges）
        registerEngineImageApi();
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        // 文本变化：先映射 decoration 位置，保持渲染正确
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
        }
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          // Composition Guard：合成期间只映射位置，不重算（spec §6）
          if (isComposing(update.view)) {
            return;
          }
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (value: { decorations: DecorationSet }) => value.decorations,
    },
  );

  const style = cm.EditorView.theme({
    [`.${IMG_WRAPPER_CLASS}`]: {
      display: 'inline-block',
      verticalAlign: 'middle',
      maxWidth: '100%',
      margin: '0 2px',
      position: 'relative',
    },
    [`.mellow-md-image-img`]: {
      maxWidth: '100%',
      maxHeight: '480px',
      borderRadius: '4px',
      cursor: 'default',
    },
    [`.${IMG_BROKEN_CLASS}`]: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '2px 8px',
      border: '1px dashed #ccc',
      borderRadius: '4px',
      background: 'rgba(0,0,0,0.04)',
      fontSize: '12px',
      color: '#888',
    },
    [`.mellow-md-image-broken-name`]: {
      fontFamily: 'inherit',
    },
    // 悬停操作条（默认隐藏；hover 显示；spec §6 单图操作入口）
    [`.${IMG_ACTIONS_CLASS}`]: {
      display: 'none',
      position: 'absolute',
      left: '50%',
      bottom: '4px',
      transform: 'translateX(-50%)',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: 'rgba(0,0,0,0.75)',
      whiteSpace: 'nowrap',
      zIndex: 1,
    },
    [`.${IMG_WRAPPER_CLASS}:hover .${IMG_ACTIONS_CLASS}`]: {
      display: 'inline-flex',
    },
    [`.mellow-md-image-action-btn`]: {
      border: 'none',
      background: 'transparent',
      color: '#fff',
      fontSize: '11px',
      padding: '1px 5px',
      borderRadius: '3px',
      cursor: 'pointer',
    },
    [`.mellow-md-image-action-btn:hover`]: {
      background: 'rgba(255,255,255,0.2)',
    },
    // E2：尺寸徽标（渲染尺寸 + 缩放比例）
    [`.mellow-md-image-size-badge`]: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: '11px',
      padding: '1px 4px',
      whiteSpace: 'nowrap',
    },
  });

  return [plugin, style];
}

export { IMG_WRAPPER_CLASS, IMG_BROKEN_CLASS, IMG_ACTIONS_CLASS };
