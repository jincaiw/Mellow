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
import type { ImageHost } from './host';

const IMG_WRAPPER_CLASS = 'mellow-md-image';
const IMG_BROKEN_CLASS = 'mellow-md-image-broken';

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
  alt: string;
}

/** 提取 Image 节点信息：`![alt](src)` → { from, to, src, alt } */
export function parseImageNode(text: string): { src: string; alt: string } | null {
  const m = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(text.trim());
  if (m === null) {
    return null;
  }
  return { alt: m[1], src: m[2].trim() };
}

/** 构建 Image 渲染扩展（host 注入） */
export function buildImageWidgetExtension(host: ImageHost): Extension {
  const cm = resolveCm();
  const { ViewPlugin, Decoration, WidgetType, RangeSetBuilder, syntaxTree } = cm;

  class ImageWidget extends WidgetType {
    private container: HTMLSpanElement | null = null;
    private resolvedUrl: string | null = null;
    private broken = false;

    constructor(
      readonly spec: ImageSpec,
    ) {
      super();
      void this.resolve();
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
      if (this.broken || this.resolvedUrl === null) {
        this.container.appendChild(buildBrokenPlaceholder(this.spec, this.retry.bind(this)));
        return;
      }
      const img = document.createElement('img');
      img.className = 'mellow-md-image-img';
      img.src = this.resolvedUrl;
      img.alt = this.spec.alt;
      img.draggable = false;
      // img error → broken placeholder（网络失败/文件消失）
      img.addEventListener('error', () => {
        this.broken = true;
        this.render();
      });
      this.container.appendChild(img);
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

  const buildDecorations = (view: EditorView): DecorationSet => {
    if (isSourceMode()) {
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
            widget: new ImageWidget({ from: node.from, to: node.to, src: parsed.src, alt: parsed.alt }),
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
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
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
  });

  return [plugin, style];
}

export { IMG_WRAPPER_CLASS, IMG_BROKEN_CLASS };
