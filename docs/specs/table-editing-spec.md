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
