# Table Editing Spec

## 1. 目标

达到 Typora Table GUI 使用体验，同时保持 Git-friendly minimal diff。

---

## 2. 数据原则

Markdown table source 是唯一真源。

禁止：
- table 作为独立 JSON
- 每次编辑完整 serialize

允许：
- parse cell ranges
- visual overlay
- minimal text patch

---

## 3. 创建

- Markdown source
- Paragraph → Table
- Slash `/table`
- TSV Paste

Create Dialog：
- rows
- columns
- optional alignment

> **⚠️ 2026-10-01 一手证据更正（本节的「optional alignment」不成立）**
>
> 取本机 Typora 1.14.9 的资源逐字核对：
> - `TypeMark/html/content.html` 里确有创建对话框 —— `id="table-insert-dialog"` 的 modal，
>   标题 `data-localize="Insert Table"`，字段**只有两个**：
>   `#table-insert-col`（label `Columns`，`value="3"`）与 `#table-insert-row`（label `Rows`，`value="4"`），
>   按钮 `Cancel` / `OK`。**没有任何 alignment 控件**。
> - 对应文案在 `zh-Hans.lproj/Front.strings`：`Insert Table=插入表格`、`Columns=列`、`Rows=行`。
>
> 故本节的「**optional alignment**」是**规格失真**（把「表格有对齐能力」错记成「创建时可设对齐」）。
> 对齐的正确位置在 §4 Toolbar / §6（只 patch delimiter row）——创建对话框**不得**加对齐字段，
> 否则会做出一个 Typora 没有的界面。
>
> **实现现状（2026-10-01）**：Mellow **尚未实现**该对话框 —— `insert.table`
>（菜单 `paragraph.table` 子项 / Slash `/table`）直接插入固定 2×2。属**已登记缺口**（见审计 §4.39）。

---

## 3b. Resize Table（Typora 官方文档有、本 spec 原先漏收）

一手证据：本机 Typora 自带文档 `TypeMark/Docs/Table Editing.md` 的 `## Resize Table` 一节：

> Put the cursor inside a table and a table tooltip will show above the table header.
> Click the most left icon, and you will be able to resize the table like most rich editors.
> If you want to make the table larger than **6 columns or 10 rows**, you could click the
> row/column number input and input a proper number.

要点：**表格 tooltip 最左图标**进入「调整表格」态（网格拖选行列），**超过 6 列 / 10 行时用数字输入**。
对应文案 `Resize Table=调整表格`（`Front.strings`）。

**实现现状（2026-10-01）**：Mellow **未实现**（工具栏无该入口，无网格调整 UI）。属**已登记缺口**（审计 §4.39）。

---

## 4. Toolbar

Caret inside table 显示轻量 toolbar：

- row above
- row below
- delete row
- col left
- col right
- delete col
- align L/C/R
- tidy
- delete table

---

## 5. Keyboard

- Tab next
- Shift+Tab previous
- last + Tab add row
- Ctrl/Cmd+Enter add row
- arrows normal caret
- Escape closes toolbar

---

## 6. Minimal Patch

Add row：
- insert one source line

Alignment：
- patch delimiter row only

Checkbox/content：
- patch current cell

Tidy：
- only command allowed to reformat table alignment

---

## 7. Invalid Table

若表格 source 部分损坏：

- 不强制修复
- fallback source-like display
- 提示“表格语法不完整”
- user can Tidy/Fix explicitly

---

## 8. IME

composition inside cell：
- no table rerender that moves caret
- no automatic spacing normalization
- commit source first, visual update after compositionend

---

## 9. Large Table

100 × 30 target：
- edit usable
- no full DOM rebuild per keypress
- toolbar delayed if necessary
- viewport-aware rendering

---

## 10. Tests

必须覆盖：
- Chinese
- emoji
- links
- inline code
- escaped pipe
- alignment
- empty cell
- multiline incompatibility handling
- undo
- external update
- source/live switch
