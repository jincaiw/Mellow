# Mellow v1.5.28

## 本次发布

**本次含产品行为变更** —— 修的是 **HTML 导出的标签白名单**。

> 一句话：**`<kbd>`（键盘按键）在导出的 HTML 里不再被剥成纯文本**，与编辑器 / Reader 保持一致。

---

## 1. 缺陷：导出净化器自称「与编辑器白名单对齐」，实测**已漂移**

`packages/export/src/html/sanitize.ts` 的文件头写着「与编辑器 safeHtml 白名单对齐，PRD §48」，
而实际集合关系是：

```text
编辑器 = 41 个标签   Reader = 41 个标签   导出 = 71 个标签
编辑器 \ 导出 = ['KBD']      ← 差异
```

编辑器那一组是**逐字复制**过去的（40/41 一致），**唯独漏了 `kbd`** —— 是**漏抄**，不是有意排除。

**影响**：导出侧用 `disallowedTagsMode: 'discard'`，其语义是「**去标签、保文本**」
（`<p>a</p><kbd>Ctrl</kbd><object>OBJ</object>` → `<p>a</p>CtrlOBJ`）。

⇒ **`<kbd>Ctrl</kbd>` 在编辑器 / Reader 里渲染成按键样式，导出 HTML 时被剥成纯文本 `Ctrl`**。
不丢字、不报错、**屏幕上看不出原因**。

## 2. 为什么长期没被发现

导出包 7 个测试文件里，**只有** `rawHtml: false`（整体转义）那条路径被测过；
而 `rawHtml` **默认就是 `true`**，走的是 `sanitizeOutput` 白名单 —— **从未被测**。

⇒ 白名单漂移**既无测试、也无护栏**，一点信号都没有。

## 3. 修法

1. **产品**：导出白名单补回 `'kbd'`，并在该组上方写明
   「**必须逐字包含** `editor-engine/src/safeHtml.ts` 的 `ALLOWED_TAGS`」+ 本次事故记录。
2. **护栏**：新增「编辑器 / Reader 白名单 **⊆** 导出白名单」判据。
   **锁子集、不锁相等** —— 导出有意多放行 TOC / footnote / task list / KaTeX 等自身产物，
   锁相等会**误伤**这些有意差异。
3. **测试**：新增 `packages/export/test/sanitize.test.ts`（10 例），覆盖 `kbd` 保留、
   常见行内/块级标签、video/audio/iframe + sandbox、`no script`、`no inline events`、
   `no JavaScript URL`、`style` 被剥、`target=_blank` 补 `rel`、`discard` 语义、配置单例同源。

> **`input` 是一处有意差异**：它**不在**编辑器白名单里、**在**导出白名单里
> （`- [x]` → task list 复选框）。测试里已用一条**正向**断言把它记录下来。

---

## 安装前请读（如实声明）

- **macOS 产物未签名、未公证**（无 Apple 开发者凭据）⇒ 首次打开会遇到 Gatekeeper 警告，
  需在「系统设置 → 隐私与安全性」中允许，或右键「打开」。
- **完成度未变**：`PASS-E = 0/50`、未闭环 **9** 项（全部阻塞于**人工 UX Gate 会话 / 真机证据**）
  依然成立。**本次是发布状态的延续，不是完成度的变化。**
- 性能埋点（W-PERF-1）已端到端打通，但 **PRD §110 的 16 ms 目标本身仍未裁决判定**（ADR-0026 Q3）。

---

## 验证

- `npm run parity` 全绿（19 个护栏接入 `test` + `parity` 两条链）。
- `packages/export` 单测 **100/100**（8 suites）；`tsc --noEmit` 通过。
- 新判据注入验证 **5/5**：还原本次缺陷（删 `kbd`）⇒ 护栏红；
  编辑器 / Reader 各加一个导出没有的标签 ⇒ 红；
  **导出多放行一个标签 ⇒ 仍绿**（防误报方向）；谓词放宽 ⇒ canary 报错。

## 相关文档

- 审计记录：`docs/qualification/release-blocker-audit-2026-09-25.md` **§4.83**
