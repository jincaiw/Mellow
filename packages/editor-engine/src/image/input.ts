/**
 * Image 输入渠道（spec §2）—— paste / drag / file picker。
 *
 * - paste：bitmap（items image/*）→ copy-to-assets；copied file（宿主剪贴板）→ copy-to-assets；
 *   纯文本 URL → 直插
 * - drag single / drag multiple：桌面宿主 drag-drop 事件注入绝对路径 → keep-original
 *   （web File 对象无路径，安全限制；路径必须经宿主）
 * - file picker：对话框（图片 filters）→ keep-original
 *
 * 所有 fs 操作走 host（注入接口）；文本插入为单 transaction（单 Undo，spec §11）。
 */

import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { ImageHost, ImageCandidate, ImagePlan } from './host';
import { applyImageUpload, executeFsOps, fileLinkMarkdown, mergePlanDetails, planImageCandidate, planImageCandidatesDetail, type InsertCandidatesOptions } from './insert';
import { isImageFile, isUrl } from './path';

/** 侧边栏 HTML5 拖拽的自定义 dataTransfer 类型（FileTree dragstart 写入，iframe drop 读取） */
export const SIDEBAR_FILE_DRAG_TYPE = 'application/x-mellow-file';

/** 运行时 CM6 模块 */
interface CmRuntime {
  ViewPlugin: typeof import('@codemirror/view').ViewPlugin;
}

function resolveCm(): CmRuntime {
  const requireFn = (window as unknown as { require?: (id: string) => unknown }).require;
  if (typeof requireFn !== 'function') {
    throw new Error('[mellow-editor-engine] window.require is not available');
  }
  const view = requireFn('@codemirror/view') as typeof import('@codemirror/view');
  return { ViewPlugin: view.ViewPlugin };
}

export interface InsertResult {
  ok: boolean;
  inserted?: boolean;
  error?: string;
  /** 已插入的 markdown 片段 */
  markdown?: string;
}

/**
 * 把候选图片插入编辑器（Typora §55 图床上传管线）：
 * plan → execute fsOps（bitmap 副本落盘）→ upload（host 已装配上传服务时；
 * 成功张替换 URL，失败张回退本地）→ dispatch（单 transaction）。
 * 任一 fs 失败：不插入文本，返回错误（spec §11 文件操作不做 undo）。
 */
export async function insertImageCandidates(
  host: ImageHost,
  view: EditorView,
  candidates: ImageCandidate[],
  opts: InsertCandidatesOptions = {},
): Promise<InsertResult> {
  const filtered = candidates.filter((c) => c.kind === 'bitmap' || c.kind === 'url' || (c.path !== undefined && c.path.length > 0));
  if (filtered.length === 0) {
    return { ok: true, inserted: false };
  }
  const details = await planImageCandidatesDetail(host, filtered, opts);
  const localPlan = mergePlanDetails(details);
  if (localPlan.markdown.length === 0) {
    return { ok: true, inserted: false };
  }
  const fsError = await executeFsOps(host, localPlan.fsOps);
  if (fsError !== null) {
    return { ok: false, inserted: false, error: fsError };
  }
  // 图床上传（Typora §55）：落盘后再上传（bitmap 副本已存在，PicGo 可读）；
  // upload: 'never' 或 host 未装配 → 跳过（本地插入）
  if (opts.upload !== 'never') {
    await applyImageUpload(host, details);
  }
  const plan = mergePlanDetails(details);
  if (plan.markdown.length === 0) {
    return { ok: true, inserted: false };
  }
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: plan.markdown },
    selection: { anchor: pos + plan.markdown.length },
  });
  return { ok: true, inserted: true, markdown: plan.markdown };
}

/** 提取 paste 数据 → 候选（同步部分） */
function candidatesFromPasteData(
  data: DataTransfer | null,
  clipFiles: Array<{ name: string; path: string }>,
): Array<ImageCandidate | Promise<ImageCandidate>> {
  const candidates: Array<ImageCandidate | Promise<ImageCandidate>> = [];

  // 1. bitmap：items 里 image/*（Chromium paste image 路径）
  if (data !== null) {
    const items = Array.from(data.items ?? []);
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file !== null) {
          candidates.push(Promise.resolve(file.arrayBuffer()).then(
            (buf): ImageCandidate => ({ kind: 'bitmap', name: file.name || undefined, alt: file.name || undefined, data: buf }),
          ));
        }
      }
    }
    // 2. files（非 bitmap 场景兜底：web File 无路径 → 跳过；路径经宿主剪贴板）
    for (const file of Array.from(data.files ?? [])) {
      const matched = clipFiles.find((c) => c.name === file.name);
      if (matched !== undefined && isImageFile(matched.path)) {
        candidates.push({ kind: 'file', name: matched.name, path: matched.path });
      }
    }
    // 3. 文本 URL（alt = 文件名，去 query/hash）
    const text = data.getData('text/plain')?.trim() ?? '';
    if (candidates.length === 0 && text.length > 0 && isUrl(text)) {
      const name = text.split('?')[0].split('#')[0].split('/').pop() ?? '';
      candidates.push({ kind: 'url', url: text, alt: name });
    }
  }

  // 宿主剪贴板文件（copied file；优先于文本路径）
  for (const f of clipFiles) {
    if (isImageFile(f.path) && !candidates.some((c) => !(c instanceof Promise) && c.kind === 'file' && c.path === f.path)) {
      candidates.push({ kind: 'file', name: f.name, path: f.path });
    }
  }

  return candidates;
}

/** 拖入非图片文件 → `[name](relative/path)` 链接（Typora 拖拽建链；单 transaction 单 Undo）。
 * 插入位置：drop 坐标（posAtCoords；视图外 → 最近位置），无坐标 → 光标。
 */
export function insertDroppedFileLinks(
  host: ImageHost,
  view: EditorView,
  absPaths: string[],
  at?: { x: number; y: number },
): boolean {
  const markdown = absPaths
    .map((p) => fileLinkMarkdown(host, p))
    .filter((m) => m.length > 0)
    .join('\n\n');
  if (markdown.length === 0) {
    return false;
  }
  const pos = (at !== undefined && Number.isFinite(at.x) && Number.isFinite(at.y) ? view.posAtCoords(at) : null) ?? view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: markdown },
    selection: { anchor: pos + markdown.length },
  });
  return true;
}

/** 构建 Image 输入扩展（paste/drop/picker） */
export function buildImageInputExtension(host: ImageHost): Extension {
  const cm = resolveCm();
  const { ViewPlugin } = cm;

  const plugin = ViewPlugin.fromClass(
    class ImageInputPlugin {
      constructor(_view: EditorView) {}

      update(_update: ViewUpdate): void {}
    },
    {
      eventHandlers: {
        dragover: (event: DragEvent): boolean => {
          // 允许图片拖入（默认 dragover 阻止 drop）
          event.preventDefault();
          return true;
        },
        drop: (event: DragEvent, view: EditorView): boolean => {
          event.preventDefault();
          // OS 级拖入（Finder/资源管理器）：桌面宿主注入的绝对路径（web File 无路径）
          const paths = host.consumeDroppedFilePaths();
          const candidates: ImageCandidate[] = [];
          const linkPaths: string[] = [];
          for (const p of paths) {
            if (isImageFile(p)) {
              candidates.push({ kind: 'file', path: p });
            } else {
              linkPaths.push(p); // 非图片文件 → 文件链接（Typora 拖拽建链）
            }
          }
          // 侧边栏 HTML5 拖拽（FileTree dragstart 写入的路径）
          const dt = event.dataTransfer;
          const sidebarPath = typeof dt?.getData === 'function' ? dt.getData(SIDEBAR_FILE_DRAG_TYPE) : '';
          if (sidebarPath !== '') {
            linkPaths.push(sidebarPath);
          }
          if (candidates.length > 0) {
            void insertImageCandidates(host, view, candidates);
          }
          if (linkPaths.length > 0) {
            insertDroppedFileLinks(host, view, linkPaths, { x: event.clientX, y: event.clientY });
            return true;
          }
          if (candidates.length > 0) {
            return true;
          }
          // 兜底：web File（无路径 → 不可复制/相对化，忽略）
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (files.some((f) => f.type.startsWith('image/'))) {
            return true; // 有图片但无路径：消费事件避免浏览器默认打开
          }
          return false;
        },
        paste: (event: ClipboardEvent, view: EditorView): boolean => {
          const data = event.clipboardData;
          // 同步探测：图片 items / URL 文本（命中 → 阻止默认，走图片插入）
          const hasImageItems = data !== null
            && Array.from(data.items ?? []).some((i) => i.kind === 'file' && i.type.startsWith('image/'));
          const text = data?.getData('text/plain')?.trim() ?? '';
          const isUrlText = text.length > 0 && isUrl(text);
          if (!hasImageItems && !isUrlText) {
            // 非图片文本：不干扰默认粘贴；异步探测宿主剪贴板文件（copied file → copy-to-assets）
            void host.readClipboardFiles().then((clipFiles) => {
              if (clipFiles.length === 0) {
                return;
              }
              const raw = candidatesFromPasteData(data, clipFiles);
              Promise.all(raw.map((c) => Promise.resolve(c))).then((candidates) => {
                if (candidates.length > 0) {
                  void insertImageCandidates(host, view, candidates, { strategy: 'copy-to-assets' });
                }
              });
            });
            return false;
          }
          event.preventDefault();
          void host.readClipboardFiles().then((clipFiles) => {
            const raw = candidatesFromPasteData(data, clipFiles);
            Promise.all(raw.map((c) => Promise.resolve(c))).then((candidates) => {
              if (candidates.length > 0) {
                void insertImageCandidates(host, view, candidates, { strategy: 'copy-to-assets' });
              }
            });
          });
          return true;
        },
      },
    },
  );

  return plugin;
}

/** file picker 插入（命令入口；无宿主对话框 → 空） */
export async function pickAndInsertImages(host: ImageHost, view: EditorView): Promise<InsertResult> {
  const paths = await host.pickImageFiles();
  if (paths.length === 0) {
    return { ok: true, inserted: false };
  }
  const candidates: ImageCandidate[] = paths
    .filter((p) => isImageFile(p))
    .map((p) => ({ kind: 'file', path: p }));
  return insertImageCandidates(host, view, candidates);
}

/** 单张 bitmap 直接插入（供宿主/工具栏调用） */
export function insertBitmap(host: ImageHost, view: EditorView, data: ArrayBuffer, name?: string): Promise<InsertResult> {
  return insertImageCandidates(host, view, [{ kind: 'bitmap', data, name }]);
}

export { planImageCandidate as planSingleImage, executeFsOps };
export type { ImagePlan };
