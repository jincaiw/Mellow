# @mellow/export

导出（PDF + HTML）。pdfmake **确定性布局** + 子集字体。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口；**契约（不变量 / 错误语义 / 性能边界 / 禁止行为 / parity reference / 夹具）见同目录 `CONTRACT.md`**。

## 职责

把 Markdown 渲染结果导出为 PDF 与 HTML：排版参数（字体 / 字号 / 纸张）、内联解析、
块级解析、pdfmake 文档定义构建、**HTML 净化**（`html/sanitize.ts`）。

## 公开接口

`src/index.ts` 导出 **18** 个符号：

- 排版：`PDF_TYPOGRAPHY`、`PDF_THEME_COLORS`、`headingFontSize`、`PdfTypography`、`PdfThemeColors`、`PdfThemeName`、`PdfPaperSize`
- 选项：`PdfOptions`、`DEFAULT_PDF_OPTIONS`、`PdfEnv`、`loadNotoFonts`
- 解析：`parseInline`、`parseBlocks`、`Inline`、`PdfBlock`
- 构建：`PdfDocDefinition`、`buildPdfDocument`、`createPdfBuffer`

## 依赖关系（实测）

- **依赖**：无
- **被消费**：`apps/desktop`

## 测试

`test/` 下 **8** 个测试文件：`html.test.ts` / `sanitize.test.ts` / `corpus.test.ts` /
`image.test.ts` / `print.test.ts` / `print-style.test.ts` / `preserve-line-breaks.test.ts` / `index.test.ts`

## 边界与约束

- **净化白名单必须 ⊇ 编辑器白名单**：`html/sanitize.ts` 的标签集合必须**逐字包含**
  `editor-engine/src/safeHtml.ts` 的 `ALLOWED_TAGS` —— 由 `verify-parity-ledger.mjs` 的
  子集判据守（**子集非相等**：导出侧合法地更宽）。
  *事故记录*：曾漏抄 `kbd` ⇒ `<kbd>Ctrl</kbd>` 在导出 HTML 里被剥成纯文本（v1.5.28 修复）。
- 导出 HTML 是**独立文档**，不继承宿主主题变量 —— 它自带一套 CSS（`html/styles.ts`）。
