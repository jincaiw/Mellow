# Typora Parity Checklist

## 1. 目的

本清单用于回答一个问题：

> Typora 用户迁移到 Mellow 后，是否真的可以无学习成本完成原有工作？

任何条目只有同时通过“功能、行为、快捷键、视觉反馈、文件结果、三平台”才算通过。

---

## 2. 评分规则

- `PASS-E`：与 Typora 等价
- `PASS-B`：明确优于 Typora
- `FAIL`：不可发布
- `N/A`：非当前版本范围

---

## 3. Live Editing

### 3.1 Heading

- [ ] 输入 `# ` 后进入 H1
- [ ] 光标离开后 marker 隐藏
- [ ] 光标进入后 marker 恢复
- [ ] Backspace 可预测
- [ ] Enter 后回到普通段落
- [ ] Undo 一步恢复一次用户动作
- [ ] IME 不导致 marker 抖动
- [ ] Source Mode round-trip 不改变源码
- [ ] Windows/macOS/Linux 行为一致

### 3.2 Bold / Italic / Strike / Inline Code

- [ ] selection wrap
- [ ] empty selection pair insertion
- [ ] toggle behavior
- [ ] nested formatting
- [ ] partial selection
- [ ] copy/paste
- [ ] undo/redo
- [ ] IME
- [ ] marker reveal

### 3.3 Links / Images

- [ ] click/follow
- [ ] modifier-click
- [ ] editing target reveal
- [ ] broken path feedback
- [ ] relative path preserved
- [ ] rename/move patch minimal

---

## 4. Block Editing

### 4.1 Lists

- [ ] Enter continuation
- [ ] empty item terminates
- [ ] Tab indent
- [ ] Shift+Tab outdent
- [ ] ordered list renumber
- [ ] nested task list
- [ ] multiline item
- [ ] paste list
- [ ] undo/redo

### 4.2 Code Fence

- [ ] language autocomplete
- [ ] syntax highlight
- [ ] copy
- [ ] fold
- [ ] line wrap
- [ ] tab behavior
- [ ] source fidelity

### 4.3 Table

- [ ] source create
- [ ] menu create
- [ ] slash create
- [ ] TSV paste
- [ ] Tab next cell
- [ ] Shift+Tab prev
- [ ] last cell creates row
- [ ] add/delete row
- [ ] add/delete column
- [ ] alignment
- [ ] tidy
- [ ] IME
- [ ] large table
- [ ] minimal git diff

---

## 5. Math / Mermaid / TOC / Footnote

### Math

- [ ] inline math
- [ ] block math
- [ ] error message
- [ ] source reveal
- [ ] copy source
- [ ] Typora corpus compatibility

### Mermaid

- [ ] live render
- [ ] lazy render
- [ ] source reveal
- [ ] error state
- [ ] copy source
- [ ] export SVG

### TOC

- [ ] live update
- [ ] click jump
- [ ] export
- [ ] source fidelity

### Footnote

- [ ] ref render
- [ ] click jump
- [ ] return
- [ ] hover preview
- [ ] source reveal

---

## 6. 文件管理

- [ ] File Tree
- [ ] File List
- [ ] Outline
- [ ] Quick Open
- [ ] Global Search
- [ ] Recent Files
- [ ] Recent Folders
- [ ] Pin Folder
- [ ] Rename
- [ ] Move
- [ ] Trash
- [ ] Undo file op
- [ ] Hidden files
- [ ] Non-Markdown files
- [ ] Include/Exclude glob
- [ ] Keyboard tree navigation

---

## 7. Focus / Typewriter

### Focus

- [ ] F8
- [ ] current line mode
- [ ] current paragraph mode
- [ ] no caret jump
- [ ] theme compatible

### Typewriter

- [ ] F9
- [ ] caret center
- [ ] mouse click behavior
- [ ] long document
- [ ] IME
- [ ] table/code block

---

## 8. Clipboard

- [ ] Ctrl/Cmd+C
- [ ] Ctrl/Cmd+Shift+C Copy Markdown
- [ ] Ctrl/Cmd+Shift+V Paste Plain
- [ ] HTML → Markdown
- [ ] URL + selection → link
- [ ] TSV → table
- [ ] copy to Word
- [ ] copy to Gmail
- [ ] copy to VS Code
- [ ] copy to plain editor
- [ ] RTF where supported

---

## 9. 图片

- [ ] drag single
- [ ] drag multiple
- [ ] paste bitmap
- [ ] paste copied file
- [ ] file picker
- [ ] clipboard URL
- [ ] relative path
- [ ] `./` prefix
- [ ] Chinese filename
- [ ] space filename
- [ ] Move All
- [ ] Copy All
- [ ] missing image
- [ ] remote image
- [ ] asset folder rename

---

## 10. Themes / UI

- [ ] Light
- [ ] Dark
- [ ] separate Light/Dark theme
- [ ] custom CSS
- [ ] sidebar hidden
- [ ] status bar hidden
- [ ] floating toolbar optional
- [ ] no permanent AI panel
- [ ] default UI no mode switcher
- [ ] content remains visual focus

---

## 11. Export

- [ ] PDF
- [ ] HTML styled
- [ ] HTML no style
- [ ] CJK
- [ ] math
- [ ] Mermaid
- [ ] table
- [ ] image
- [ ] footnote
- [ ] TOC
- [ ] print
- [ ] page break

---

## 12. Safety

- [ ] no-edit-save byte identical
- [ ] preserve LF/CRLF
- [ ] preserve encoding
- [ ] external change clean → reload
- [ ] external change dirty → conflict dialog
- [ ] crash recovery
- [ ] recovery compare
- [ ] atomic save
- [ ] disk full
- [ ] permission denied
- [ ] network drive

---

## 13. UX Gate

V1 发布要求：

- Total score >= 92
- Live Editing >= 24/25
- Caret/IME/Undo = 15/15
- File Safety = 5/5
- 30 个 Typora 核心任务中，至少 90% 完成时间 <= Typora +5%
- 任一关键任务不得慢于 Typora >15%
- IME corruption = 0
- Data loss = 0
