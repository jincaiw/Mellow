# Clipboard & Smart Paste Spec

## 1. 目标

复制粘贴是 Typora 体验核心，不得只按浏览器默认 clipboard 处理。

> **2026-10-05 逐节审计（本 spec 此前只审过 §10 安全）**：
> 结论先行 —— **§3 的优先级与实现的有效顺序存在冲突**（见 §3 的更正块，已立 **ADR-0030** 承载）；
> 其余各节**已实现且有判据**（§2 / §4–§7 / §9 / §10 逐节附注）。

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

> **2026-10-05 核对（正向确认）**：
>
> | 声明 | 实现 | 判定 |
> |---|---|---|
> | `text/plain` / `text/html` | 浏览器原生 copy 通道（`role: copy`）+ `buildClipboardCopyExtension` | ✅ |
> | **RTF where available** | `packages/editor-engine/src/clipboardCopy.ts` **确实写 `text/rtf`** | ✅ |
> | internal Markdown flavor | `edit.copyMarkdown` | ✅ |
> | Copy | 原生 `role: copy`（Edit 菜单） | ✅ |
> | Copy as Markdown | `edit.copyMarkdown` | ✅ |
> | Copy as Plain | `edit.copyPlain` | ✅ |
> | Copy as HTML Code | `edit.copyHtmlSource` | ✅（菜单文案见 i18n `menu.edit.copyHtmlSource`） |
> | Copy without Theme Styling | `edit.copyWithoutTheme` | ✅ |
>
> 五个用户命令**全部存在**。跨应用的**真机**验证见 §8。

---

## 3. Paste Priority

建议优先级：

1. explicit Paste Plain
2. image/file payload
3. TSV table candidate
4. HTML rich content
5. URL-on-selection
6. plain text

> **优先级 2 的落实方式（机器可读）**：`payload-yield-explicit`
>
> **✅ 2026-10-05 已裁决并落地（ADR-0030 裁决 = A3）** —— 本节与实现的冲突**已消除**。
>
> **原冲突**：优先级 **1**（Paste Plain）与 **3–5**（TSV / HTML / URL）在
> `smartPaste.ts` 的**同一个**处理器里（链内顺序正确：测试已钉住 **3 > 4**、**4 > 5**）；
> 而优先级 **2**（image / file payload）在**另一个**处理器里（`packages/editor-engine/src/image/input.ts`）。
> 两者是**独立注册的 `eventHandlers.paste`**，CM 按扩展顺序调用、**首个返回 `true` 者胜**，
> 而 `index.ts` 把 `buildSmartPasteExtension()` 排在 `buildImageExtensions()` **之前**
> ⇒ 剪贴板**同时**含富文本与图片时 HTML 分支先赢 ⇒ **与本节「2 高于 3 / 4」相反**
> （图片会被转成远程 `![](src)`，不走图片管线）。
>
> **裁决 A3（把顺序决策收敛到一处显式判断）**：在 `handleSmartPaste()` 里
> **显式**检查剪贴板是否带**图片 payload**（`items` 的 `image/*` 或 `files` 的 `image/*`），
> 有则**让位**（`return false`）交给图片处理器。
> ⇒ ① 与本节优先级一致；② **不再依赖扩展注册顺序**（消除「顺序即语义」这一隐性耦合）；
> ③ **只认 `image/*`** —— 那是图片处理器唯一会消费的类型；非图片的 file payload 不让位
> （没有处理器消费它，让位只会让这次粘贴「什么都不发生」）。
>
> **测试**：`smart-paste.test.ts` 新增 **5 例** —— 三类「让位」（`files` / `items` / TSV 也让位）
> + 两类**防过宽**（无 payload 时 HTML 照常转换；非图片 payload 不让位）。
> **护栏**：`verify-clipboard-contract.mjs` 锁「**落实方式**」这一机器可读声明 ⇄ 源码现算，
> 去掉显式让位即失败。


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

> **2026-10-05 核对（正向确认）**：7 项「必须」**全部实现** ——
> headings（H1–H6）/ lists（UL·OL）/ links（`A`，且 `href` 须过 `isSafeUrl`）/ emphasis（STRONG·B·EM·I·DEL）/
> code（`CODE`·`PRE`）/ table basic（`tableMarkdown`，含列补齐与 `\|` 转义）/ line breaks（`BR` → 两空格硬换行）。
> **「sanitize before conversion」确实成立**：`htmlToMarkdown()` 的**第一步**就是 `sanitizeHtml(html)`，
> 之后**重新 parse** 再转换（不是就地改 DOM）—— 即清洗与转换是两个阶段，顺序正确。
> 另有 `BLOCKQUOTE` / `IMG` / `DIV` 的额外支持（超出本节要求）。

---

## 5. URL on Selection

selection 非空 + clipboard 是 URL：

```text
text + URL → [text](URL)
```

若 selection 已在 link 中：
- replace target only where safe

> **2026-10-05 核对（正向确认）**：
> - `text + URL → [text](URL)` ✅ —— 但**仅在选区非空**时（`!selection.empty && isSafeUrl(plain)`）；
>   无选区时**不**误建链接，交回 CM 默认按纯文本插入 —— 该行为有测试钉住
>   （`smart-paste.test.ts`「无选区 + plain URL → 交回 CM 默认按纯文本插入（不误建链接）」）。
> - 「若 selection 已在 link 中 → replace target only where safe」✅ ——
>   `linkedTargetRange()` 定位 `[label](target)` 的**标签区间**，命中则**只替换 target**（保留 label）；
>   未命中才包成 `[text](url)`。`isSafeUrl` 限定 `http` / `https` / `mailto`。

---

## 6. TSV → Table

检测：
- >= 2 columns
- consistent tabs
- multiple rows

转换 GFM table。

Undo：
- one step

> **2026-10-05 核对（正向确认）**：检测三条**全部实现且比本节更严** ——
> `tsvToGfmTable()` 要求 `rows.length >= 2`（multiple rows）、`rows[0].length >= 2`（≥2 columns）、
> 且 **`rows.every(row => row.length === rows[0].length)`**（本节说「consistent tabs」，
> 实现要求的是**完全矩形** —— 更严，不一致的行数会**拒绝转换**而不是猜）。
> **Undo = one step** ✅：`pasteText()` 只 `dispatch` **一次** transaction
> （模块头注释即声明「each successful conversion is one CodeMirror transaction, so it is one Undo step」）。

---

## 7. Paste Plain

完全忽略 rich formats。

> **2026-10-05 核对（正向确认）**：`pastePlain(view, plainText)` 的入参**只有纯文本** ——
> 它由 `Mod-Shift-v` 键位直接读 `navigator.clipboard.readText()` 后调用，**不接触** `DataTransfer`，
> 故 rich formats 在**类型层面**就不可达（不是「读了但没用」）。✅

---

## 8. Cross-app Test Matrix

- VS Code
- Cursor
- system plain editor
- Word
- Gmail/web rich editor
- Apple Notes
- LibreOffice

> **⚠️ 2026-10-05 覆盖实测：7 个目标应用里，自动化只覆盖 1 个；人工矩阵 7 行全部「未测」。**
>
> **载体**：`tests/qualification/clipboard-copy-cross-app.md`（人工矩阵模板，7 行 × 6 列）
> + `tests/benchmark/clipboard-cross-app.mjs`（**只自动化「系统纯文本编辑器」那一列**，目标 = TextEdit）。
>
> | 目标应用 | 自动化 | 人工矩阵状态 |
> |---|---|---|
> | 系统纯文本编辑器 | ✅ TextEdit（C1 多 MIME / C2 Copy-as-Markdown 逐字符读回 / C3 纯文本粘贴读回） | ⛔ 未测（脚本结果另存 `tests/benchmark/results/`） |
> | VS Code / Cursor / Word / Gmail / Apple Notes / LibreOffice | **无** | **⛔ 未测**（模板里 6 行 × 6 列**全为「未测」**） |
>
> ⇒ 本节的矩阵**有载体，但载体是空的**：模板存在、**从未填写过**。
> 且**自动化那一列也不在 CI**（需真机 + Accessibility 权限，本机托管会话内不可用）。
>
> **处置**：如实登记，**不**假装已覆盖。补法有两条，需裁决（**与 ADR-0030 分开**）：
> ① 真机人工执行并回填模板；② 缩减本节矩阵到「实际可执行」的范围。
> 本轮**未**扩张或缩减本节 —— 它是 V1 的验收要求，口径变更属方案级。

---

## 9. IME / Clipboard

IME composition 期间粘贴：
- let editor own transaction
- no auto conversion until composition safely resolved where required

> **2026-10-05 核对（正向确认）**：`buildSmartPasteExtension()` 的 paste 处理器**第一句**就是
> `if (isComposing(view)) return false;` ⇒ composition 期间**不拦截**事件、**不转换**
> ⇒ 编辑器自己拥有该 transaction ✅。两条都有测试钉住
> （`smart-paste.test.ts` 的「composition 期间 TSV paste 不转换」「composition 期间 HTML paste 不转换；
> **compositionend 后同一格式生效**」—— 后半句尤其重要：它证明「不转换」是**时序**行为而非「永久失效」）。

---

## 10. Security

HTML:
- sanitize
- no script
- no event handler
- no javascript URL

> **2026-10-05 复核（本节已于 2026-09-30 审过，见审计 §4.32）**：四条**全部实现** ——
> `sanitizeHtml()` 移除 `SCRIPT` / `STYLE` / `IFRAME` / `OBJECT` / `EMBED` / `META` / `LINK` / `BASE` / `FORM`；
> 剥掉所有 `on*` 属性、`style`、`srcdoc`；`href` / `src` 必须过 `isSafeUrl()`
> （**只放行 `http:` / `https:` / `mailto:`** ⇒ `javascript:` 与 `data:` 均被剥除）。
> 另有 `A` / `IMG` 渲染时的**二次校验**（`isSafeUrl` 不过则退化为纯文本 / 丢弃）。
