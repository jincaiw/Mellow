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
- tabs
- active document

---

## 4. Tabs

高度：
- 32–36 px

状态：
- active
- inactive
- hover
- dirty
- drag
- pinned P1

单文件：
- 可配置自动隐藏 Tab Bar

Windows/Linux：
- 不抢占 Typora `Ctrl+T` Table 默认快捷键

macOS：
- `Cmd+T` New Tab 可保留

---

## 5. Sidebar

宽度：
- default 260 px
- min 200
- max 480

顶部：
- 文件
- 大纲
- 搜索

不要 VS Code Activity Bar。

---

## 6. File Tree

行高：
- 26–30 px

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
- 820 default
- 980
- auto

默认：
- body 16 px
- line-height 1.65
- top padding 56 px
- bottom breathing >= 30vh

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
- 22–26 px

默认：
- 字数
- 行:列
- Markdown
- UTF-8
- LF
- Zoom

可完全隐藏。

---

## 11. Welcome

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
