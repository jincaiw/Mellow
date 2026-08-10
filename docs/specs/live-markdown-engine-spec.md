# Live Markdown Engine Spec

## 1. 目标

构建 Typora 级单一编辑表面：

> Markdown 原文始终存在，但在用户不编辑某个语法节点时，非必要标记自动隐藏并呈现最终排版。

---

## 2. 数据模型

唯一真源：

```text
Markdown Text
```

派生状态：

```text
Lezer AST
Decoration State
Widget State
Selection
Viewport
Mode
```

禁止把 HTML / rich-text AST 作为保存真源。

---

## 3. 核心管线

```text
Editor Transaction
  ↓
Lezer incremental parse
  ↓
Changed range analysis
  ↓
Render eligibility
  ↓
Decoration patch
  ↓
Viewport-only heavy widget render
```

不得每次输入重建全文 decoration。

---

## 4. Node State

每个可渲染节点统一使用：

```ts
type NodeVisualState =
  | "source"
  | "rendered"
  | "mixed"
  | "invalid"
```

### source

完整显示 Markdown。

### rendered

尽可能隐藏 marker，显示排版。

### mixed

节点的一部分需要源码、一部分可渲染。

典型：
- link text rendered，但 URL 在 caret 内时显示
- table UI + source patch
- image alt/path editing

### invalid

解析不完整时优先显示源码。

---

## 5. Reveal Policy

节点进入 `source` 或 `mixed` 的条件：

1. caret intersects node edit range
2. selection intersects syntax marker
3. IME composition intersects node
4. node invalid/partial
5. Source Mode
6. user setting: always show markers

---

## 6. Composition Guard

从 `compositionstart` 到 `compositionend`：

- 禁止 destroy/recreate EditorView
- 禁止 full-doc React sync
- 禁止 table tidy
- 禁止 slash commit
- 禁止 aggressive marker replacement
- 禁止 async AI patch
- 禁止 auto format
- 禁止 selection normalization

只允许：
- CodeMirror 原生 composition transaction
- 必要最小 decoration 更新
- viewport scroll

---

## 7. Undo Contract

一个用户动作应尽量对应一个 undo group。

例：

- 点击 checkbox → 1 undo
- 插入 table → 1 undo
- paste HTML → 1 undo
- table add row → 1 undo
- image path rewrite → 1 undo

禁止：
- UI command 产生 5–10 次离散 undo
- doc switch 进入上一文档历史
- recovery restore 混入普通 undo

---

## 8. Caret Stability

任何 decoration 更新必须满足：

```text
document position unchanged
selection anchor/head unchanged
scroll anchor preserved
```

除非用户动作本身改变文本。

---

## 9. Heading

状态：

```text
idle → rendered
caret enters → source/mixed
caret leaves → rendered
```

要求：
- marker reveal instant
- no width-jump causing scroll shift
- empty heading safe
- setext supported

---

## 10. Strong / Emphasis / Strike

策略：
- 内容排版
- marker hidden when idle
- whole span source when caret directly touches marker
- nested marks independent

---

## 11. Inline Code

默认 rendered：
- monospace
- background
- backticks hidden

caret inside：
- backticks visible or mixed depending position
- no autocorrect/spellcheck

---

## 12. Links

rendered：
- link text shown
- URL hidden

caret inside text：
- text source context

caret inside URL / modifier action：
- URL visible

broken local link：
- subtle error indicator
- source unchanged

---

## 13. Images

rendered：
- image widget
- alt/path hidden

caret enters:
- reveal source around image
- widget can remain preview aside if stable

failure：
- placeholder + path
- no silent path rewrite

---

## 14. Lists / Quotes

marker idle：
- visually normalized

caret line：
- marker visible

Enter：
- continuation

empty line：
- terminate

Nested：
- indentation preserved exactly.

---

## 15. Task List

idle：
- checkbox widget

click：
- patch `[ ]`/`[x]`
- one undo
- no whole-line serialization

---

## 16. Code Fence

source-oriented node：
- code text always source
- fenced delimiters may remain visible
- language UI can be decorated

Mermaid / math fences：
- optional rendered block when caret outside
- source when caret inside

---

## 17. Table

不把 table 转成富文本文档模型。

内部只允许：
- parse row/cell ranges
- render visual table overlay/surface
- edit via text patches
- minimal changed lines

Large table：
- avoid full-table reparse outside changed range where possible

---

## 18. Math

idle：
- rendered formula

caret inside：
- source
- optional side preview P1

error：
- source + compact error

---

## 19. Mermaid

idle：
- render widget

caret enters：
- source
- preview may collapse or remain depending layout stability

render:
- debounce
- cancellation token
- viewport lazy
- security mode

---

## 20. Performance Budgets

普通输入：
- parse + decorations + paint P95 < 16 ms

复杂节点：
- synchronous editor transaction < 16 ms
- heavy render async

Mermaid：
- never block keystroke
- debounce >= 150 ms

10 MB：
- default Large File Mode
- no eager heavy widget rendering

---

## 21. Required Test Matrix

对每个节点：

```text
idle
caret-before
caret-inside
caret-after
selection-partial
selection-full
IME
undo
redo
copy
paste
delete-start
delete-end
mouse
keyboard
source-live switch
```

---

## 22. Release Blockers

- caret jump
- selection loss
- IME corruption
- undo semantic break
- source rewrite without command
- full-doc rerender on keystroke
- heavy widget blocks typing
