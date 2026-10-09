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
> **实现现状（2026-10-01）**：Mellow **已实现**该对话框 —— 菜单 `paragraph.table` 子项与 Slash `/table`
> 共用的 `insert.table` 会打开应用内对话框（复用既有 `askUser` 状态机，见 `App.tsx` 的 `askForm`），
> 生成逻辑在 `packages/app-core/src/tableTemplate.ts`（默认 4 行 × 3 列；`Rows` 含表头行；
> 空值兜底列 2 / 行 1 —— 均为一手证据）。上限（30 列 / 100 行）是 **Mellow 自定**，见该文件头。

---

## 3b. Resize Table（Typora 官方文档有、本 spec 原先漏收）

一手证据：本机 Typora 自带文档 `TypeMark/Docs/Table Editing.md` 的 `## Resize Table` 一节：

> Put the cursor inside a table and a table tooltip will show above the table header.
> Click the most left icon, and you will be able to resize the table like most rich editors.
> If you want to make the table larger than **6 columns or 10 rows**, you could click the
> row/column number input and input a proper number.

要点：**表格 tooltip 最左图标**进入「调整表格」态（网格拖选行列），**超过 6 列 / 10 行时用数字输入**。
对应文案 `Resize Table=调整表格`（`Front.strings`）。

**实现现状（2026-10-01）**：Mellow **已实现** —— 表格工具栏的**最左按钮**「调整」打开弹层，
内含 **6×10 网格**（hover 预选 + 点击立即应用）与**两个数字输入**（列 / 行 + 应用），
覆盖文档所述的「超过 6 列或 10 行时用数字输入」路径。
引擎侧为 `packages/editor-engine/src/table/commands.ts` 的 `resizeTable` / `planResizeTable`
（**单次 dispatch** = 最小 patch + 一次 undo；**delimiter 行永不删**）；
工具栏弹层在 `packages/editor-engine/src/table/toolbar.ts`。尺寸上限（30 列 / 100 行）与创建对话框**共用同一组值**，
由 `verify-parity-ledger.mjs` 的「表格尺寸上限两端一致」护栏锁定。

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
- ~~提示“表格语法不完整”~~
- user can Tidy/Fix explicitly

> **⚠️ 2026-10-05：第 3 项「提示『表格语法不完整』」已**从本 spec 移除（**ADR-0029 **Q4 裁决**）。**
>
> **一手证据（本轮补足，两条独立通道）**：
>
> | 通道 | 检索 | 结果 |
> |---|---|---|
> | **文案**（Typora 1.14.9 的**全部 4 个 `.strings` × 2 语言**：Base + zh-Hans 的 Front / Menu / Panel / Welcome） | 与表格**不相交**的语法类词（`不完整\|无效\|语法\|非法\|incomplete\|invalid\|syntax\|malform\|broken`） | 命中 **20** 条，**其中与表格相关 0 条**；唯一「提示」形态的是三条 `请按语法 … 定义 {链接\|图片\|脚注}` |
> | **行为真值**（`TypeMark/appsrc/main.js`） | `表格+无效/不完整` / `table+invalid\|incomplete\|malform` / `(invalid\|malform)+table` / `*Valid*Table` 标识符 | **全部 0 命中**；表格函数族只有 `insertTable` / `deleteTable` / `copyTable` / **`reformatTable`**（= 菜单「Prettify Source Code / 格式化表格源码」）/ `tryResetTable` / `isTableEmpty` / `moveTableRow·Col` / `resizeTableEdit` 等 |
>
> ⇒ **Typora 对损坏表格既不提示、也不校验**：它只是**不按表格渲染**（source-like），
> 并提供**显式**的 `reformatTable` 动作 —— 这正好对应本节**已实现且有测试**的第 1/2/4 项
> （`table-live-view.test.ts` 的 4 例：缺分隔行 / 列数不一致 / 分隔行被换行拆断 ⇒ 不渲染 live view、
> 源码逐字不变、修好后恢复）。
>
> **裁决理由**：本 spec 是 **Typora parity spec**；该项**不是 parity**（Typora 无此行为），
> 且**从未实现**（全仓仅出现在本 spec 里）。保留一个「非 parity + 未实现」的要求会让读者以为它是差距。
> ⇒ **移除**，而不是「实现一个 Mellow 自有提示」—— 后者属**产品新增**，
> 若将来要做，须**单独提出**并登记为 **D（有意差异）**+ 定文案（因为文案与 Typora 不同）。
>
> ⚠️ **移除 ≠ 禁止**：本节第 1/2/4 项**不变**；将来若确有需要，走「新 ADR + D 登记」的正式路径。

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
