# Accessibility Phase — 审计与修复记录

- 日期：2026-08-13
- 范围：Editor / Sidebar / Outline / Search / Settings / Command Palette / Floating Toolbar / Table Toolbar
- 基准：keyboard navigation / focus ring / semantic labels / 200% zoom / contrast / reduced motion（WCAG 2.1 AA）
- 验证：CodeMirror 编辑器（CoreEditor）单独验证，非仅 React UI

## 1. 审计矩阵（修复前）

| 区域 | Keyboard | Focus ring | Semantic | Contrast | Zoom | Motion |
|---|---|---|---|---|---|---|
| Editor（CM6/CoreEditor） | ✅ CM6 键盘操作 + 宿主快捷键 | ✅ CM6 `.cm-focused`（cursor/selection/outline） | ✅ CM6 contenteditable 语义；iframe `title="Mellow Editor"` | ✅ 编辑器文本主题色 | ⚠️ 布局流动，字体 px | ✅ CoreEditor `prefers-reduced-motion` 已有 |
| Sidebar（files/outline/search） | ✅ `tabIndex=0` + 键盘处理 | ❌ 无 focus ring | ✅ `aria-label`（tree/outline/searchAria） | ⚠️ muted 文本 | ⚠️ | ❌ 无降级 |
| Outline | ✅ 复用 sidebar 键盘 | ❌ | ✅ 容器 aria-label | ⚠️ | ⚠️ | ❌ |
| Search | ✅ 原生 input + Enter | ❌ | ❌ input 无 label（仅 placeholder） | ⚠️ | ⚠️ | ❌ |
| Settings | ✅ 原生控件 | ❌ | ✅ nav aria-label + 标题层级 | ⚠️ | ⚠️ | ❌ |
| Command Palette / QuickOpen | ✅ autoFocus + ↑↓/Enter/Esc | ❌ | ❌ input 无 label、列表无 listbox/option | ⚠️ | ⚠️ | ❌ |
| Floating Toolbar | ✅ roving tabindex + 键盘 | ❌（组件自身无 outline 规则） | ✅ role=toolbar + aria-label + title | ✅ toolbar 深底浅字 | ⚠️ | ❌ |
| Table Toolbar | ✅ 真实 button（Tab/Enter） | ❌ | ✅ title（en 文案） | ⚠️ | ⚠️ | ❌ |

## 2. 已实施修复

### 2.1 Focus ring（P0）
- `styles.css` 新增全局 `:focus-visible`（2px outline，`var(--mellow-focus-ring)` 随主题切换）+ `:focus:not(:focus-visible)` 抑制鼠标环；
- 主题变量补全：light `--mellow-focus-ring: #3563d6`（浅底对比 5.37:1 ≥ WCAG 2.4.11 3:1）；**dark 主题新增** `--mellow-focus-ring: #6d94ff`（深底 5.82:1）；
- 覆盖全部 React UI 与编辑器周边控件；CM6 内容区沿用其自带 `.cm-focused` 指示。

### 2.2 Reduced Motion（P1）
- `styles.css` 新增 `@media (prefers-reduced-motion: reduce)`：禁用全部 animation/transition（`!important` 兜底）+ `scroll-behavior: auto`；
- 与 CoreEditor 已有的 reduced-motion 检测（`CoreEditor/index.ts`、`preview/index.css`）形成双层覆盖。

### 2.3 Semantic labels（P1）
- Command Palette：input 加 `aria-label`；结果容器 `role="listbox"`；选项 `role="option"` + `aria-selected` + `aria-disabled`；
- QuickOpen：input `aria-label` + 结果 listbox/option/aria-selected；
- Search：input `aria-label`；
- Reader：内容区 `role="main"` + `aria-label={title}`；
- SplitPreview：内容区 `role="region"` + `aria-label`。

### 2.4 Contrast（P1）
- light `--mellow-fg-muted: #999999 → #757575`（浅底 2.85 → **4.61:1** ✅ AA）；
- light `--mellow-accent: #4a7cff → #3563d6`（accent 作文字色浅底 3.74 → **5.37:1**；按钮白字 **5.37:1** ✅）；
- 其余关键色验证：fg 15.9 / fg-subtle 5.7 / link 5.4 / danger 4.9 / dark 全达标。

## 3. 修复后矩阵

全部 8 区域的 Keyboard ✅（原有）、Focus ring ✅（全局）、Semantic ✅（修复后）、Contrast ✅（正文/次级文本达标）、Motion ✅（降级规则）。

## 4. 验证项（需人工/GUI 确认）

- **200% zoom**：布局为流动 flex（无固定宽度硬编码溢出）；Reader 内置 zoom 0.5–2.0；编辑器字体大小走设置。建议在 macOS「缩放」或 WebView zoom 下人工走查（本 Phase 未做 GUI 实测）。
- 深色主题的 accent 按钮白字（`#6d94ff` 白字 2.86:1）——深色主题 accent 在代码中作为**文字色**使用（深底 5.82 ✅）；若后续作为按钮背景需复核。
- `--mellow-fg-muted` 变更的视觉回归：次级文本略深，建议目测确认。

## 5. 测试

- app-core 104 测试通过（含 extension 16）；
- themes / desktop tsc + vite build 通过；
- 本 Phase 无逻辑改动（纯样式 + JSX 属性），无新增单测。
