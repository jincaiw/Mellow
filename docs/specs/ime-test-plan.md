# IME Test Plan

## 1. 目的

中文 IME 是 Mellow V1 Release Gate。

---

## 2. 平台

### Windows
- Microsoft Pinyin
- Sogou Pinyin

### macOS
- system Simplified Chinese Pinyin
- Wubi

### Linux
- fcitx5 Pinyin
- ibus Pinyin

P1:
- Japanese
- Korean

---

## 3. 基础输入

每个输入法测试：

- continuous sentence
- punctuation
- mixed Chinese/English
- emoji
- candidate selection
- backspace during composition
- arrow during composition
- cancel composition

---

## 4. Node Matrix

- paragraph
- heading
- bold
- italic
- strike
- inline code
- link
- image alt
- list
- task
- quote
- code fence
- table
- inline math
- block math
- Mermaid source
- YAML
- search
- rename
- command palette
- slash menu

---

## 5. 必须验证

- no lost char
- no duplicated char
- no caret jump
- no premature slash commit
- no unexpected marker hide
- no undo corruption
- no full editor remount

---

## 6. Composition Event Logging

Debug build 可记录：

- compositionstart
- compositionupdate
- compositionend
- beforeinput
- input
- selectionchange
- CM transaction

Release build 不收集用户文本。

---

## 7. Automated + Manual

自动：
- event sequence tests
- regression fixtures

手工：
- 真输入法
- 真候选窗
- 真实平台

IME 不允许只靠自动化测试通过。

---

## 8. Gate

任何平台存在：
- 丢字
- 重复
- blocker caret
- undo corruption

=> V1 禁止发布。
