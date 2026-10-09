# ADR-0037 — PDF 导出里**公式与图表**渲染不出来：给 pdfmake 补渲染器，还是改用**已实现的 HTML 打印管线**？

**Status:** **Proposed**（2026-10-10）—— 待裁决。

> **本 ADR 为什么是 Proposed**：两条路都能修，但**成本与影响差一个量级**，且都会改变**用户可见的导出件**。
> 台账 `P0-EXPORT-001` 现在是 `IMPL` + `blockedBy: pdf-renderer-collaborators-pending`
> —— 那个 `blockedBy` 只说「等一个渲染器」，**没说「还有一条更便宜的路」**。
> **本 ADR 只做两件事**：① 把两条路的事实与代价摆出来；② 给出建议，使裁决成本降到「看一眼就能定」。

## 背景：现在是什么状态（**实跑证据**）

Mellow 有**两条**生成 PDF 的路：

| 路径 | 实现 | 入口 |
|---|---|---|
| **pdfmake 管线** | `packages/export/src/index.ts`（自研 block/inline 解析 + pdfmake） | 「导出 PDF…」（`export.pdf` 命令 → `createPdfBuffer`） |
| **HTML 打印管线** | `packages/export/src/print.ts` 的 `buildPrintHtml`（复用 `exportHtml` self-contained） | **当前无产品入口**（方案 §G7-FEAT-01 的 D-H 裁决 = ②：Print 直接调系统对话框打印主 Webview） |

**实跑对比（同一份含公式 / Mermaid / 图片的文档）**：

| 能力 | pdfmake 管线（**与 App 同形调用**） | HTML 打印管线（`buildPrintHtml`） |
|---|---|---|
| 行内 `$x^2$` | **字面**（`parseInline` 根本没 token 化行内数学） | **`<math>`（MathML）** ✅ |
| 块级 `$$…$$` | **`{text:"x^2",italics:true,style:"code"}`**（源码文本） | **`<math>`** ✅ |
| ` ```mermaid ` | **`{text:"graph TD;A-->B",style:"code"}`**（源码文本） | **内联 mermaid bundle，浏览器渲染** ✅ |
| 图片 | **本轮已修**（此前退化成 `![alt](src)`） | `<img>`（内联 data URL） ✅ |
| 表格 / 脚注 / TOC / alert | 实现 | 实现 |
| 页面分页 / 页眉页脚 / 大纲 | pdfmake 原生 | 靠 `@page` CSS（**大纲能力待确认**） |

**根因（已定位）**：`PdfEnv` 的三个可选协作者 —— `resolveImage` / `renderMath` / `renderMermaid` ——
都有「`env.X ? … : 回退为源码文本`」的**静默降级**分支，而 App 的 `createPdfBuffer(...)` 调用
**只传了 `fonts`**。其中 `resolveImage` **本轮已修**（并端到端验证）；
`renderMath` / `renderMermaid` **仍缺**，因为它们需要一个**栅格化渲染器**（pdfmake 只吃 PNG/JPEG）。

## Q1 — PDF 导出的公式与图表，走哪条路？

**选项**

- **A1 — 给 pdfmake 管线补栅格化渲染器。**
  - 做法：在 webview 里把 TeX / Mermaid 渲染成 SVG，再经 canvas 栅格化为 PNG data URL，
    作为 `renderMath` / `renderMermaid` 传给 `createPdfBuffer`。
  - 代价：新增约 100–200 行 App 侧代码（**webview 运行时**，本机 node 无法端到端验证 ⇒
    只能靠真机会话确认）；且 PDF 里的公式是**位图**（缩放/打印清晰度受限）。
  - 收益：pdfmake 的分页 / 页眉页脚 / 大纲能力全部保留。
- **A2 — PDF 导出改用 HTML 打印管线**（`buildPrintHtml` + webview 打印到 PDF）。
  - 做法：`export.pdf` 改为打开一个隐藏的打印视图（`buildPrintHtml` 的产物）并调系统「存储为 PDF」。
  - 代价：**换掉 PDF 生成引擎**（分页/页眉页脚/大纲要改由 `@page` CSS 承担，**大纲能力待确认**）；
    打印对话框会多一步交互；需要新增一个打印视图的宿主通道。
  - 收益：**公式、图表、图片三项立刻全部正确**，且**复用已经存在、已有单测**的管线
    （`print.test.ts` 覆盖 `@page` / math / mermaid / table / image / ready 脚本）。
- **A3 — 维持现状，登记为已知限制。**
  - 做法：把 `P0-EXPORT-001` 的 `blockedBy` 保留，并在设置页 / 导出完成提示里**明确说明**
    「PDF 导出不含公式与图表渲染，请用 HTML 导出或打印」。
  - 代价：Typora 的 PDF 导出**能**渲染公式与图表 ⇒ 这是**实打实的对标缺口**；
    且方案把 Math + Mermaid 列进了**导出 corpus**（master-plan 行 1115）⇒ 现状与该声明不符。

**建议 = A2**：它用**已经实现且已测试**的代码换掉「需要新写一个 webview 栅格化器」，
一次性解决三项（公式 / 图表 / 图片），且不引入位图清晰度问题。
**唯一必须先确认的是「大纲与页眉页脚能否由 `@page` CSS 等价实现」** —— 若不能，
则该能力回退为 A1 或「A2 + pdfmake 大纲补丁」。

> ⚠️ **本 ADR 不实施任何改动**：换 PDF 引擎属**架构级**改动（`AGENTS.md`：
> 「不要自行修改架构，先报告冲突」），必须由用户裁决。

## 影响与代价（逐项）

| 项 | A1 | A2 | A3 |
|---|---|---|---|
| 公式清晰度 | 位图（受 canvas 分辨率限制） | 矢量（MathML 由浏览器排版） | 无 |
| Mermaid | 位图 | 浏览器渲染（矢量） | 无 |
| 分页 / 页眉页脚 | pdfmake 原生（保留） | `@page` CSS（**待确认**） | 保留 |
| PDF 大纲 | 保留 | **待确认** | 保留 |
| 本机可验证性 | ❌（webview 运行时） | ⚠️ 产物 HTML 可验、打印步骤不可验 | ✅ |
| 代码量 | +100–200 行（新写） | 改调用点 + 新增打印视图通道 | 0 |

## 机器可读化（**本 ADR 顺带补上的那一半**）

- 台账 `P0-EXPORT-001` 的 `blockedBy` 由 `pdf-renderer-collaborators-pending` 改为
  **`pdf-renderer-decision-pending（ADR-0037）`** —— 让「等什么」指向**决策**而不是「等一个渲染器」；
- 审计「待裁决项登记表」**新增一行**（第 20 行），载体 = 本 ADR；
- 门禁 `PENDING_ADRS` 增列本 ADR ⇒ `Pending decisions:` 会列出它。

## 裁决

（待裁决。）裁决后必须同步：

1. 本文件顶部状态改为 `Accepted`，并在此写明所选选项；
2. 门禁 `PENDING_ADRS` / `DECIDED_ADRS` 与审计登记表第 20 行；
3. 台账 `P0-EXPORT-001` 的 `status` / `blockedBy`（若选 A2 且验证通过，可回到 `AUTO` 并附新证据）；
4. 若选 A3：须**同步设置页 / 导出提示的文案**，否则「已知限制」与「坏了」在用户眼里没有区别。
