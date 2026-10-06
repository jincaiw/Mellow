# CONTRACT — `@mellow/export`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：Markdown → **PDF / HTML** 的导出 —— 排版参数、内联/块级解析、pdfmake 文档定义构建、
  **HTML 净化**（`html/sanitize.ts`）、导出侧 CSS（`html/styles.ts`）。
- **不属于本包**：Markdown 的**解析**（走 `markdown-it`）与**渲染**（编辑器/Reader 各有渲染链）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**18** 个导出）：`PDF_TYPOGRAPHY`、`PDF_THEME_COLORS`、`headingFontSize`、
  `PdfTypography`、`PdfThemeColors`、`PdfThemeName`、`PdfPaperSize`、`PdfOptions`、
  `DEFAULT_PDF_OPTIONS`、`PdfEnv`、`loadNotoFonts`、`parseInline`、`parseBlocks`、`Inline`、
  `PdfBlock`、`PdfDocDefinition`、`buildPdfDocument`、`createPdfBuffer`
- 子模块：`html/sanitize.ts`（净化）、`html/styles.ts`（导出侧 CSS）、`print.ts` / `printStyle.ts`

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **导出白名单 ⊇ 编辑器白名单**（子集，非相等；导出侧合法地更宽） | `tests/parity/verify-parity-ledger.mjs`（`ALLOWED_TAGS ⊆ 导出白名单`） |
| 导出 HTML 是**独立文档**，不依赖宿主主题变量 | 代码结构（自带 CSS）；`test/html.test.ts` |
| 换行保留语义（`preserveLineBreaks`） | `test/preserve-line-breaks.test.ts` |
| 图片在导出物里可解析 | `test/image.test.ts` |
| 排版参数与 `settings` 的 `TYPOGRAPHY_DEFAULTS` 同源 | `verify-settings-contract.mjs` + `verify-visual-golden.mjs` |

## 4. 错误语义

- **净化器语义**：`disallowedTagsMode: 'discard'` ⇒ **去标签、保文本**
  （`<p>a</p><kbd>Ctrl</kbd>` → `<p>a</p>Ctrl`）。**不丢字、不报错**。
- 字体加载失败（`loadNotoFonts`）⇒ 降级为内置子集字体，不抛。

## 5. 性能边界

- PDF 布局由 pdfmake **确定性**完成（同输入 ⇒ 同字节输出）；**不承诺**流式渲染。
- 大文档导出是**同步**路径 ⇒ 调用方负责放到不阻塞 UI 的时机（当前由用户显式触发）。

## 6. 禁止行为

- ❌ **从自己的实现取值去填「与编辑器一致」的断言** —— 编辑器白名单是**真值源**，
  导出侧必须**逐字包含**它（曾漏抄 `kbd` ⇒ 导出 HTML 里 `<kbd>` 被剥成纯文本，v1.5.28 修复）。
- ❌ 在导出 HTML 里引用宿主 CSS 变量（导出物要在任何环境独立打开）。
- ❌ 让净化器「更严」到剥掉编辑器能渲染的标签（会让导出与所见不一致）。

## 7. Typora parity reference

- 导出 PDF 的排版默认值（字号 / 行高 / 纸张）与 Typora 的导出偏好对照，
  见 `docs/plans/typora-parity-master-plan.md` 的导出工作包。
- ⚠️ 已知**有意不同**：`export.image.fontSize` 默认 **16**，**刻意不对齐** Typora 的 24
  （见审计 §4.85 的登记）。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）；语料在
  `test/corpus.test.ts` 内联 + `tests/fixtures/markdown/`。

## 9. 测试入口

- `test/` 下 **8** 个：`html` / `sanitize` / `corpus` / `image` / `print` / `print-style` /
  `preserve-line-breaks` / `index`
- 护栏：`verify-parity-ledger.mjs`（净化器子集）、`verify-settings-contract.mjs`、
  `verify-package-conventions.mjs`
