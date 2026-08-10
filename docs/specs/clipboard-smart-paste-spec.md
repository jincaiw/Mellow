# Clipboard & Smart Paste Spec

## 1. 目标

复制粘贴是 Typora 体验核心，不得只按浏览器默认 clipboard 处理。

---

## 2. Copy

Normal Copy 尽可能写：

- text/plain
- text/html
- RTF where available
- internal Markdown flavor if runtime supports

用户命令：
- Copy
- Copy as Markdown
- Copy as Plain
- Copy as HTML Code
- Copy without Theme Styling

---

## 3. Paste Priority

建议优先级：

1. explicit Paste Plain
2. image/file payload
3. TSV table candidate
4. HTML rich content
5. URL-on-selection
6. plain text

---

## 4. HTML → Markdown

必须：
- preserve headings
- lists
- links
- emphasis
- code
- table basic
- line breaks

sanitize before conversion.

---

## 5. URL on Selection

selection 非空 + clipboard 是 URL：

```text
text + URL → [text](URL)
```

若 selection 已在 link 中：
- replace target only where safe

---

## 6. TSV → Table

检测：
- >= 2 columns
- consistent tabs
- multiple rows

转换 GFM table。

Undo：
- one step

---

## 7. Paste Plain

完全忽略 rich formats。

---

## 8. Cross-app Test Matrix

- VS Code
- Cursor
- system plain editor
- Word
- Gmail/web rich editor
- Apple Notes
- LibreOffice

---

## 9. IME / Clipboard

IME composition 期间粘贴：
- let editor own transaction
- no auto conversion until composition safely resolved where required

---

## 10. Security

HTML:
- sanitize
- no script
- no event handler
- no javascript URL
