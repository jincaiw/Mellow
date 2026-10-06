# Desktop UI Design Spec

## 1. 目标

Mellow UI 必须做到：

> 用户首先看到文档，而不是软件。

不复制 Typora 像素，但保持其低干扰信息架构和操作心智。

---

## 2. 默认布局

```text
┌──────────────────────────────────────────────────────────┐
│ Titlebar / Tabs                           Window Controls │
├─────────────┬────────────────────────────────────────────┤
│ Sidebar     │                                            │
│             │              Document Surface              │
│ Files       │                                            │
│ Outline     │                                            │
│ Search      │                                            │
├─────────────┴────────────────────────────────────────────┤
│ Status Bar                                               │
└──────────────────────────────────────────────────────────┘
```

默认不常驻：
- AI panel
- right inspector
- activity bar
- ribbon
- mode segmented control

---

## 3. Window

建议初始：
- Windows/Linux：1200 × 800
- macOS：1180 × 780

最小：
- 900 × 600

记忆：
- size
- position
- maximized
- full screen
- sidebar
- ~~tabs~~（见 §4：SDI 无 tabs）
- active document

> **⚠️ 2026-10-01 更正（本节的数字与实现不符）**：
> - **初始尺寸**：实现为**三平台统一 `1200 × 800`**（`apps/desktop/src-tauri/src/window.rs` 的 `inner_size`）。
>   原写的 macOS `1180 × 780` **未实现** —— 且没有证据表明 macOS 需要差异 ⇒ 登记为
>   **未实现的建议值**（**不是**有意差异，别读成 D）。
> - **最小尺寸**：`900 × 600` ✅ 已实现（同文件 `min_inner_size`）。
> - **记忆项**：`size` / `position` / `maximized` / `full screen` / `sidebar` / `active document` 均已实现
>   （`geometry.rs`）；**`tabs` 在 SDI 下无对象**（见 §4）。

---

## 4. Tabs

> **⚠️ 2026-10-01：本节整节在 SDI 架构下不适用（登记为有意差异，非缺口）。**
>
> Mellow 是 **SDI（单文档窗口）**：一个窗口一个文档。仓库内**不存在任何 Tab UI** ——
> `packages/desktop-ui/src/` 无 Tab 组件、`apps/desktop/src/styles.css` 里 `.tab*` / `tab-bar`
> 规则**命中 0 条**。故下文的 Tab 高度 / 状态 / 单文件自动隐藏 / `Cmd+T` 均**无实现对象**。
>
> **依据**：SDI 是已确认的产品决策（`B1`）；「New Tab 与 Switch Between Opened Documents」
> 已在 master-plan **§12 D 表**登记为有意差异（见 **D-Y**，与 D-D 同源）。
> **本节此前从未与 SDI 决策对账** —— 即「权威 spec 里有一整节不可满足，而没人发现」。
> 保留原文（只作废，不删除），以免丢失「曾经考虑过 tabs」这一信息。

~~高度：~~
~~- 32–36 px~~

~~状态：~~
~~- active~~
~~- inactive~~
~~- hover~~
~~- dirty~~
~~- drag~~
~~- pinned P1~~

~~单文件：~~
~~- 可配置自动隐藏 Tab Bar~~

~~Windows/Linux：~~
~~- 不抢占 Typora `Ctrl+T` Table 默认快捷键~~

~~macOS：~~
~~- `Cmd+T` New Tab 可保留~~

> 其中「**Windows/Linux 不得抢占 `Ctrl+T`（Typora 的 Table 快捷键）**」这一条**仍然有效**，
> 且已被 `verify-menu-contract.mjs` **§11 官方快捷键表**锁住 —— 该表要求
> `insert.table` 的 Win/Linux 键位必须是 `Ctrl+T`（它不依赖 Tab UI，故不受本节作废影响）。

---

## 5. Sidebar

宽度：
- default **270** px
- min **160**
- max 480

顶部：
- 文件
- 大纲
- 搜索

不要 VS Code Activity Bar。

> **⚠️ 2026-10-01 更正**：本节原写 `default 260 / min 200` —— **与实现不符**。
> 实现（单一真源 `apps/desktop/src/App.tsx` 的 `SIDEBAR_MIN_WIDTH` / `SIDEBAR_DEFAULT_WIDTH`）
> 为 **160 / 270**，是**按 Typora 实机真值对齐**的结果（Typora `setSidebarWidth` 只做 `Math.max(e, 160)`，
> 默认 270）。**护栏 `verify-sidebar-contract.mjs` 当时已更正，但本节没同步** ——
> 即「同一组数值两处维护，只改了一处」。
> `max 480` 是 Mellow 另加的**保护上限**（Typora 无硬上限），已在 D 表登记（**D-AD**）。

---

## 6. File Tree

行高：
- **24** px

> **⚠️ 2026-10-06 更正**：本节原写 `26–30 px` —— **与实现不符**。
> 实现是 `.tree-row` 的 `min-height: 24px`（`apps/desktop/src/styles.css`），
> 且是**有意按 Typora 真机对齐**的结果 —— 同文件注释写明依据：Typora 文件行
> `line-height: 22px` + `#777` 字色 + `14px` 字号，Mellow 取 `padding: 1px`（上下各 1px）
> ⇒ `22 + 2 = 24`。故原区间是**未经实现的建议值**，**不是**有意差异（别读成 D）。
> 这是「同一组数值两处维护、只改了一处」的**第三例**（前两例是 §5 侧栏宽度、§8 排版默认值；
> 三者根因相同：`TYPOGRAPHY_DEFAULTS` 那次统一只覆盖了代码侧，**spec 这份副本被漏掉**）。
> 本条已纳入 `verify-shell-typography.mjs` 的「spec 硬数字必须等于代码单一真源」判据
> （§5 / §8 / §3 之外的第四个数字）—— 从 `.tree-row` 规则现读 `min-height` 与本节声明行交叉比对。

交互：
- single click select/open
- double click behavior optional
- arrow keyboard nav
- F2 rename Windows/Linux
- context menu
- drag move
- trash delete

视觉：
- active state 低对比
- folder hierarchy 清晰
- icon 不抢文字

---

## 7. Outline

要求：
- heading tree
- current highlight
- click jump
- filter
- collapse
- flat/tree

当前 heading 变化不得导致侧栏剧烈滚动。

---

## 8. Editor Surface

Writing width：
- 680
- **860** default
- 980
- auto

默认：
- body 16 px
- line-height **1.6**
- top padding 56 px
- bottom breathing >= 30vh

> **⚠️ 2026-10-01 更正**：本节原写 `820 default` 与 `line-height 1.65` —— **与实现不符**。
> 单一真源是 `packages/settings/src/index.ts` 的 **`TYPOGRAPHY_DEFAULTS`**
> （`writingWidth: 860` / `lineHeight: 1.6` / `fontSize: 16`），依据是 **Typora 真机 html font-size = 16px
> 与 github 主题 max-width 860px / line-height 1.6**。
> 该常量存在的**原因**就是历史上这组默认值散落三处且互相矛盾（settings / App 回落 / Reader CSS）——
> 那次修复把三处统一了，**但 spec 这份「第四处」被漏掉了**（同 §5）。
> `top padding 56px` / `bottom breathing >= 30vh` 已实现且有护栏
> （`verify-shell-typography.mjs`；实际底部留白 50vh ≥ 30vh）。

---

## 9. Floating Toolbar

只在 selection 时出现。

内容：
- H1/H2/H3
- Bold
- Italic
- Strike
- Code
- Link
- Quote
- List

规则：
- IME hidden
- Escape closes
- keyboard accessible
- never cover selected line center
- user can disable

---

## 10. Status Bar

高度：
- 22–26 px（实现 `min-height: 24px` ✅ 落在区间内）

**默认可见**：
- 字数
- 行:列

**默认可开启（默认隐藏）**：
- Markdown
- UTF-8
- LF
- Zoom
- 保存状态

可完全隐藏。

> **⚠️ 2026-10-01 更正**：本节原把上面 6 项**全列为「默认」** —— **与实现不符**。
> 实现里 `STATUSBAR_DEFAULT_HIDDEN`（`packages/desktop-ui/src/StatusBar.tsx`）默认隐藏
> `dirty / markdown / encoding / eol / zoom / status` ⇒ **默认只显示「字数」与「行:列」两项**。
> 这是 **E7（Typora 观感收敛）** 的有意结果（Typora 状态栏默认极简），
> 且有单测 `packages/desktop-ui/test/statusbar-defaults.test.ts` 锁住默认集。
> 单项可见性经右键菜单逐项切换（`fields` 持久化）。

---

## 11. Welcome

> **⚠️ 2026-10-06：本节整节在现行产品形态下不适用（登记为有意差异，非缺口）。**
>
> Welcome 欢迎页已按 **B2** 决策**停用并移除** —— Mellow 改为「**启动即文档**」（对齐 Typora）。
> 依据（一手）：`packages/desktop-ui/src/index.ts` 头部注释原文
> 「B2，第四轮：Welcome 欢迎页停用并移除 —— 启动即文档，对齐 Typora」。
>
> **机器可读取证（2026-10-06）**：
> · `apps/desktop/src/App.tsx` 内 `welcome` 命中 **0**；
> · `packages/*/src` 与 `tests/` 内命中 **0**；
> · `apps/desktop/src/styles.css` 里**曾有** 81 行**无引用**的 `.welcome*` 死样式（**已删**，
>   原处留了说明）—— 注意：本节这段说明文字本身也含该词，故「全仓命中 0」只在**排除说明文字**后成立；
> · ⚠️ **不要**把 `tests/benchmark/fixtures/typora-menu-dump.txt` 里的 `welcomePanelItem` /
>   `Welcome Guide` 当成反证 —— 那是 **Typora 自己**的 Help 菜单项，在 Mellow 由
>   `help.quickStart`（「快速上手」/「Quick Start」）承载，**不是**本节的欢迎页。
>
> **登记**：master-plan §12 D 表 **D-AJ**。
>
> **本节此前从未与 B2 决策对账** ⇒ 与 **§4（Tabs 整节）** 同型：
> 「**权威 spec 里有一整节不可满足，而没人发现**」。差别只在于 §4 是架构决策（SDI）所致、
> 本节是产品决策（B2）所致；两者都已登记为 D。
> 保留原文（只作废，不删除），以免丢失「曾经考虑过欢迎页」这一信息。

只包含：

```text
Mellow

新建文档
打开文件
打开文件夹

最近使用
```

不包含：
- news
- login
- AI prompt
- mascot
- marketing

---

## 12. Settings

结构：

```text
通用
编辑器
Markdown
文件
图片
外观
导出
快捷键
扩展
高级
```

左栏：
- 180–220 px

右内容：
- max 720 px

---

## 13. Menu

### File
- New
- New Window
- Open
- Quick Open
- Open Folder
- Recent
- Save
- Save As
- Export
- Print
- Close

### Edit
- Undo/Redo
- Cut/Copy/Paste
- Copy as Markdown
- Paste Plain
- Find/Replace
- Global Search

### Paragraph
- Paragraph
- H1-H6
- Table
- Code Fence
- Math Block
- Quote
- Lists
- Indent

### Format
- Bold
- Italic
- Underline
- Strike
- Inline Code
- Link
- Image
- Clear Format

### View
- Sidebar
- File Tree/List
- Outline
- Source
- Reader
- Focus
- Typewriter
- Toolbar
- Status
- Fullscreen
- Zoom

---

## 14. Platform Native Adaptation

### macOS
- native traffic lights
- system menu bar
- Cmd+, settings
- native fullscreen
- Quick Look P1

### Windows
- snap-compatible controls
- system file dialog
- Explorer integration
- JumpList P1

### Linux
- GNOME/KDE
- XDG/MIME
- portal/native dialog
- fcitx5/ibus

---

## 15. Color

默认主题要求：
- low saturation
- no large gradient
- no strong card shadows
- editor background dominant
- focus ring accessible
- selection readable in CJK

---

## 16. Typography

UI：
- system font

Body：
- system/CJK fallback

Mono：
- platform monospace or bundled lightweight optional

不得强制捆绑超大 CJK font。

---

## 17. Empty States

File：
> 打开文件夹以浏览文件

Outline：
> 当前文档没有标题

Search：
> 输入关键词搜索当前文件夹

禁止插画占满空白区。

---

## 18. Animation

允许：
- panel fade/slide 120–180ms
- menu native
- toolbar fade

禁止：
- caret animation
- spring editor layout
- marker movement animation
- table resize animation

---

## 19. Accessibility

- keyboard complete
- focus visible
- 200% zoom
- reduced motion
- screen reader baseline
- no color-only status

---

## 20. UI Release Gate

用户测试中：
- 找不到功能的次数不得明显高于 Typora
- 默认界面主观复杂度不得高于 Typora
- 常见任务入口不增加步骤
- 新能力默认不抢注意力
