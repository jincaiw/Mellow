# ADR-0036 — **语法特性开关**（PRD §94）与**导出路径**的接线缺口：三条渲染路径要不要一致？

**Status:** **Proposed**（2026-10-10）—— 待裁决。

> **本 ADR 为什么是 Proposed**：修它会让**导出件的内容**发生变化（对改过设置的用户），
> 属**用户可见结果**。且「三条渲染路径要不要语法一致」本身是一个**产品取舍**
> （PDF 是 pdfmake 独立实现，改造面远大于 HTML 导出）。
> **本 ADR 只做两件事**：① 把缺口**从「没人核对」搬进机器可读的登记表**；
> ② 给出**逐项事实与建议**，使裁决成本降到「看一眼就能定」。

## 背景：缺口是什么（**逐项实测**）

`packages/settings/src/index.ts` 里有 **11 个语法特性开关**（PRD §94），
storageKey 全部是 `mellow.engine.features.*`：

```
markdown.highlight / markdown.supSub / markdown.emoji / markdown.alerts / markdown.math /
markdown.mermaid / markdown.toc / markdown.footnote / markdown.wikilink / markdown.html / markdown.yaml
```

这 11 个 key **只被 bundle loader（预览 / 编辑器）读取**
（`packages/editor-engine/src/index.ts:309-320` 逐个消费）。
而 Mellow 有**三条**渲染路径：

| 路径 | 实现 |
|---|---|
| 预览 | CoreEditor（lezer markdown）+ `editor-engine` 的扩展 |
| HTML 导出 | `packages/export/src/html/markdown.ts`（`markdown-it` + 插件） |
| PDF 导出 | `packages/export/src/index.ts`（**pdfmake，独立实现**） |

**实测矩阵（登记表的来源，见 `tests/parity/fixtures/export-feature-parity.json`）**：

| 开关 | 预览 | HTML 导出 | PDF 导出 |
|---|---|---|---|
| `markdown.highlight` | implemented | **not-implemented** | **not-implemented** |
| `markdown.supSub` | implemented | **not-implemented** | **not-implemented** |
| `markdown.emoji` | **always-on**（开关只管补全） | **not-implemented** | **not-implemented** |
| `markdown.alerts` | implemented | **not-implemented** | **always-on** |
| `markdown.math` | implemented | **option-unwired** | **always-on** |
| `markdown.mermaid` | implemented | **option-unwired** | **always-on** |
| `markdown.toc` | implemented | **always-on** | **always-on** |
| `markdown.footnote` | implemented | **always-on** | **always-on** |
| `markdown.wikilink` | implemented | **not-implemented** | **not-implemented** |
| `markdown.html` | implemented | **option-unwired** | **not-implemented** |
| `markdown.yaml` | implemented | **not-implemented** | **not-implemented** |

词表：`implemented`（实现且**受开关控制**）/ `option-unwired`（**有**选项但**调用点不传**）/
`always-on`（**恒启用**、无选项）/ `not-implemented`（**完全没有**）。

**两类后果**（都**用户可见**）：

1. **开关关不掉**（`always-on` + `option-unwired`）：用户在设置里关掉 `markdown.math` /
   `markdown.mermaid` / `markdown.html`，**导出件仍然渲染** —— 选项在
   `HtmlExportOptions` 里**存在**（`math` / `mermaid` / `rawHtml`，默认 `true`），
   但 `apps/desktop/src/App.tsx` 的 `exportHtml(...)` 调用**只传** `mode` / `theme` / `title` /
   `preserveLineBreaks`。`markdown.toc` / `markdown.footnote` 更彻底：两条导出路径**恒启用**、
   **没有**对应选项。
2. **预览与导出长得不一样**（`not-implemented`）：`==高亮==`、`^上标^`、`~下标~`、`:smile:`、
   `> [!NOTE]`、`[[页面]]`、YAML front matter 在**预览里渲染、导出件里是字面源码**。
   ⚠️ 其中 `highlight` / `supSub` **默认开启** ⇒ **默认配置下就已经不一致**。

**为什么不是「有意差异」**：PRD §94 是 **Settings** 章节（不是「编辑器专属」），
用户把它理解成「这篇文档里的这种语法要不要渲染」；而 Typora 的导出与编辑用**同一个 Lexer**
（`File.option.enableHighlight` 等直接作用于导出），即**对标对象也不这样**。

**顺带发现的一处文档错误**：`packages/editor-engine/src/config.ts` 写着
「全部默认开启（**与 Typora 默认行为一致**）」—— 而一手证据（Typora 1.14.9 的
`DEFAULT_OPTIONS`）显示 `enableHighlight: false` / `enableSubscript: false` /
`enableSuperscript: false`，**并不一致**（该默认值偏离已由 **ADR-0034** 登记为待裁决）。
⇒ 该注释是**未被任何判据守着的断言**，且**已与事实相反**。

## Q1 — 三条渲染路径的**语法一致性目标**是什么？

**选项**

- **A1 — 只修「开关关不掉」（`option-unwired` + `always-on`），不动 `not-implemented`。**
  - 做法：`App.tsx` 的导出调用补传 `rawHtml` / `math` / `mermaid`（读同一批
    `mellow.engine.features.*`）；给 HTML 导出的 toc / footnote 补开关；PDF 侧补同批开关。
  - 代价：**默认值下输出不变**（三处默认都 `true`）；只有**改过设置**的用户会看到导出件变化 ——
    而那正是他们要求的。PDF 侧要新增选项并接线（pdfmake 管线独立，改造面中等）。
  - 收益：**设置不再静默失效**；`markdown.*` 的语义变成「所有渲染路径」。
- **A2 — A1 + 补齐 `not-implemented` 的 6 个语法（highlight / supSub / emoji / alerts / wikilink / yaml）。**
  - 做法：HTML 导出加 markdown-it 自定义 inline rule；PDF 导出加对应 token 与渲染。
  - 代价：**大**。且会让**默认配置**下的导出件新增这些渲染（**用户可见变化**）。
  - 收益：预览与导出**完全一致**；`markdown.*` 的语义彻底统一。
- **A3 — 维持现状，登记为有意差异。**
  - 做法：把本表登记进 D 表（有意差异），并**在设置页写明**「本开关只影响预览、不影响导出」。
  - 代价：`==高亮==` / `^上标^` 在导出件里继续是字面；用户会认为「导出坏了」。
  - ⚠️ 若选此项，**必须**同步改设置页文案，否则「有意差异」与「没发现」在用户眼里没有区别。

**建议 = A1**：它把「**设置静默失效**」这一类**缺陷**清掉（默认输出不变、风险低），
而把「导出要不要支持这 6 个扩展语法」留给**后续独立裁决**（那才是真正的产品取舍）。

> ⚠️ **本 ADR 不实施任何改动**：改的是**用户可见的导出件内容**，属产品决策。

## 机器可读化（**本 ADR 顺带补上的那一半**）

- 登记表 `tests/parity/fixtures/export-feature-parity.json`：11 个开关 × 3 条路径 + 受控词表 + 逐条 `ref`；
- 判据（`verify-settings-contract.mjs`）：登记表必须**双向覆盖** schema 里全部语法特性开关，
  状态取自受控词表，且**非 `implemented` 的条目必须带存在的 `ref`**（三向 canary + 覆盖下限）；
- 审计「待裁决项登记表」**新增一行**（第 19 行），载体 = 本 ADR；
- 门禁 `PENDING_ADRS` 增列本 ADR ⇒ `Pending decisions:` 会列出它。

## 裁决

（待裁决。）裁决后必须同步：

1. 本文件顶部状态改为 `Accepted`，并在此写明所选选项；
2. 门禁 `PENDING_ADRS` / `DECIDED_ADRS` 与审计登记表第 19 行；
3. **若选 A1 / A2**：把登记表里相应条目的状态改为 `implemented`（判据仍绿，这正是它的设计）；
4. **若选 A3**：把本表登记进 D 表，并**同步设置页文案**；
5. **顺带**：修正 `packages/editor-engine/src/config.ts` 那句与一手证据相反的注释。
