/**
 * 拖入文件的**决策表**（Typora `File.onDropFile` 的逐字转写；2026-10-07 审计 §4.134）。
 *
 * ── 为什么单独抽成纯函数 ────────────────────────────────────────────────────
 * Typora 的 `onDropFile` 是一条**五行分支链**（目录 / 可导入 / 受支持文档 / 其他），
 * 且每一行都有「默认行为 + 一个 `link` 开关」两态。把它留在事件回调里，
 * 就只能靠真机拖拽来验；抽成纯函数后**每一行都能被单测钉住**（本文件旁的
 * `test/dropAction.test.ts` 覆盖全部行）。
 *
 * ── 逐字转写（`TypeMark/appsrc/main.js` 的 `File.onDropFile`）──────────────────
 * ```js
 * if (await isDirectory(paths[0])) {
 *   if (supportTextBundle && /\.textbundle$/i.exec(p)) {
 *     'link' === actionWhenDropFile ? insertLink(p) : openInTypora(p);          // ①
 *   } else if ('link' === actionWhenDropFolder) {
 *     insertLink(p);                                                            // ②a
 *   } else if (File.bundle.filePath || File.getMountFolder()) {
 *     openFolder(p);                                                            // ②b
 *   } else {
 *     switchFolder(p);                                                          // ②c
 *   }
 * } else {
 *   const ext = (p.match(/(?:^|\.)([^.]+)$/)[1] || '').toLowerCase();
 *   if (~IMPORTABLE.indexOf(ext))
 *     return 'link' === actionWhenDropImport ? insertLink(p) : doImportFile(p);  // ③
 *   if (~File.SupportedFiles.indexOf(ext))
 *     return isTyporaUrl ? insertLink(p)
 *          : ('link' === actionWhenDropFile ? insertLink(p) : openInTypora(p));  // ④
 *   if (!isKeyWindow()) return false;                                           // ⑤a
 *   for (…) { i > 0 ? insertParagraph() : void 0; insertLink(paths[i]); }        // ⑤b
 * }
 * ```
 *
 * ⚠️ **本函数刻意不覆盖的 Typora 细节**（Mellow 无对应场景，或属调用方职责）：
 * 1. `typora.url`（从大纲/标题拖拽的**内部** URL）⇒ 第 ④ 行改插链接。Mellow 无该内部拖拽 ⇒ 不建模；
 * 2. `insertLink` 在 **source mode** 下**跳过插入** ⇒ 属插入动作的职责，不在决策里；
 * 3. **多文件**：Typora 只用 `paths[0]` 判分支，但第 ⑤ 行会遍历**全部**并逐个插链接
 *    （第 1 个之后先插段落）。本函数只回答「**对第一个**该做什么」，多文件展开由调用方负责；
 * 4. 第 ② 行的 `openFolder` / `switchFolder` 在 Typora 是**两个不同动作**（前者打开该文件夹、
 *    后者替换当前工作区）。Mellow 是 SDI、工作区只有一个 ⇒ 两者合并为 `open-folder`；
 * 5. `File.bundle.isLocked` / `File.isLocked` 等只读态检查 ⇒ 属调用方职责。
 */

/** 拖入路径的类型。`missing` 不单独建模 —— Typora 的 `lstat` 失败时 `isDirectory()` 为假 ⇒ 走文件分支。 */
export type DropPathKind = 'directory' | 'file';

/** 决策结果（调用方按此分派）。 */
export type DropAction =
  /** 在光标处插入该路径的 Markdown 链接（图片走图片管线）。 */
  | 'insert-link'
  /** 打开该文档（Mellow 的 SDI 替换语义下需先做未保存确认）。 */
  | 'open-document'
  /** 把该文件夹设为工作区（对应 Typora 的 `openFolder` / `switchFolder` 合并）。 */
  | 'open-folder'
  /** 用 pandoc 导入（Mellow 走 `handleImportDocument` 的按路径变体）。 */
  | 'import-document'
  /** 什么都不做（Typora 第 ⑤ 行的 `isKeyWindow()` 为假）。 */
  | 'none';

/** 三个 `actionWhenDrop*` 偏好的取值（`open`/`link`、`import`/`link`）。 */
export interface DropPreferences {
  /** `actionWhenDropFile`：受支持文档（含 `.textbundle`）拖入时。 */
  file: 'open' | 'link';
  /** `actionWhenDropFolder`：目录拖入时。 */
  folder: 'open' | 'link';
  /** `actionWhenDropImport`：可导入扩展名拖入时。 */
  import: 'import' | 'link';
}

export interface DropContext {
  kind: DropPathKind;
  /** 小写、不含点的扩展名；无扩展名传 `''`。 */
  ext: string;
  /** 窗口是否处于「可插入」状态（Typora 的 `isKeyWindow()`）。 */
  isKeyWindow: boolean;
  /** 该路径是否以 `.textbundle` 结尾。 */
  isTextBundle: boolean;
  /** 宿主是否支持 `.textbundle`（Mellow 当前为 `false` ⇒ 该行不生效）。 */
  supportsTextBundle: boolean;
}

/** Typora 第 ③ 行的可导入扩展名（**逐字**取自 `onDropFile`）。 */
export const IMPORTABLE_DROP_EXTS: readonly string[] = [
  'latex', 'ltx', 'tex', 'wiki', 'dokuwiki', 'docx', 'rst', 'rest', 'org', 'textile', 'opml',
];

/**
 * Mellow 第 ④ 行的「受支持文档」扩展名。
 *
 * ⚠️ Typora 用的是 `File.SupportedFiles`（一个更大的集合，含代码/纯文本等）。
 * Mellow 能作为**文本文档**打开的只有 Markdown 家族（`app-core/fileTree.ts` 的 `isMarkdown` 同源），
 * 其余文本文件走第 ⑤ 行「插成链接」。⇒ 这是**有意收窄**，已登记在审计 §4.134。
 */
export const SUPPORTED_DOC_DROP_EXTS: readonly string[] = ['md', 'markdown', 'mdown', 'mkd'];

/**
 * 决策：对**第一个**拖入路径该做什么。
 * 逐行对应 Typora 的 `onDropFile`（见文件头）。
 */
export function decideDropAction(ctx: DropContext, prefs: DropPreferences): DropAction {
  if (ctx.kind === 'directory') {
    // ① `.textbundle`（仅当宿主支持）走**文件**开关；否则按目录处理
    if (ctx.supportsTextBundle && ctx.isTextBundle) {
      return prefs.file === 'link' ? 'insert-link' : 'open-document';
    }
    // ②a/②b/②c：`link` ⇒ 插链接；否则打开/切换文件夹（Mellow 合并为一个动作）
    return prefs.folder === 'link' ? 'insert-link' : 'open-folder';
  }

  const ext = ctx.ext.toLowerCase();
  // ③ 可导入扩展名
  if (IMPORTABLE_DROP_EXTS.includes(ext)) {
    return prefs.import === 'link' ? 'insert-link' : 'import-document';
  }
  // ④ 受支持文档
  if (SUPPORTED_DOC_DROP_EXTS.includes(ext)) {
    return prefs.file === 'link' ? 'insert-link' : 'open-document';
  }
  // ⑤a 其他文件：仅当窗口可插入
  if (!ctx.isKeyWindow) return 'none';
  // ⑤b 插成 Markdown（图片/链接）
  return 'insert-link';
}

/**
 * 从路径取小写扩展名（无扩展名 → `''`）。
 *
 * ⚠️ **不是** Typora 那条正则的逐字复刻 —— 实测 `/(?:^|\.)([^.]+)$/` 对**没有点**的路径
 * （如 `/a/b/noext`）会从 `^` 起匹配 ⇒ 返回**整条路径**（`'/a/b/noext'`）。
 * 那不影响分支（两者都不在可导入表与受支持文档表里 ⇒ 同样落到第 ⑤ 行），
 * 但作为「取扩展名」的函数返回整条路径是**误导性**的 ⇒ 这里按**意图**实现，并在此说明差异。
 */
export function dropExtOf(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path;
  const idx = base.lastIndexOf('.');
  if (idx === -1) return '';
  return base.slice(idx + 1).toLowerCase();
}
