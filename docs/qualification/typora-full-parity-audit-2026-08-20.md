# Mellow ↔ Typora 全量复评报告（四维差距矩阵）2026-08-20

> 基线：Typora 1.14.9（macOS 本机实测，AX API 菜单树 dump + 偏好设置面板 OCR + 主窗口布局实测）
> 对照：Mellow 最新 release 构建（2026-08-20 00:58，10 菜单完整版）
> 方法：A1-1 菜单树 509 行（`tests/benchmark/fixtures/typora-menu-dump.txt`，修饰键 bitfield 解码：bit0=Shift / bit1=Option / bit2=Control / bit3=无Cmd）；A2-1 Mellow 菜单树 170 行（`mellow-menu-dump.txt`）+ 命令注册表 ~94 项（App.tsx L2499-2613）+ 引擎 keymap。
> 判定口径：PASS-E = 一致或更优；PASS-B = 基本一致有小差异；FAIL = 缺失或明显不一致；NOT TESTED = 未验证。

---

## 维度一：功能（Features）

| # | 功能项 | Typora 1.14.9 实测 | Mellow 现状 | 判定 | 优先级 |
|---|---|---|---|---|---|
| F1 | 字体缩放（实时） | 视图菜单 放大⌘+ / 缩小⌘- / 实际大小⌘0；偏好设置独立「缩放%」+ Cmd+滚轮 | 仅设置面板改 editor.fontSize 数字，无快捷键无滚轮缩放 | **FAIL** | **P0** |
| F2 | 字体族选择 | 偏好设置外观面板字体大小（自动/自定义）+ 主题内字体 | settings schema 无 fontFamily 项 | **FAIL** | P1 |
| F3 | Quick Look 预览 .md | Finder 空格预览渲染 Markdown | 无（PRD §82 P1） | **FAIL** | P1 |
| F4 | 图片上传服务 | 偏好设置图像面板「上传服务」PicGo/iPic/UPic + 菜单「上传图片」 | extension-api 有契约骨架，无适配器无设置项 | **FAIL** | P1 |
| F5 | 导出图片（PNG/JPEG） | 文件→导出→图像 | 无（仅 PDF/HTML/DOCX） | **FAIL** | P2 |
| F6 | 打开最近文件子菜单 | 文件→打开最近文件（最近 10 项 + 清除菜单） | 仅欢迎屏与命令面板，菜单无子菜单 | **FAIL** | P1 |
| F7 | 导出格式全集 | PDF/HTML/HTML(无样式)/图像/Word/OpenOffice/RTF/Epub/LaTeX/MediaWiki/reST/Textile/OPML + Pandoc 自动检测 + 使用上一次设置导出⌃⌘E | PDF/HTML/DOCX 三种 | PASS-B | P2 |
| F8 | 文档操作（重命名/移动/删除/复原版本/从磁盘重载） | 文件菜单全套（重新命名⌘⇧S 组、移到、删除、复原到版本、从磁盘重新加载） | 有重命名命令（document.rename）、openWith、fileInfo；无移到/删除/版本复原/磁盘重载 | PASS-B | P2 |
| F9 | 多窗口 | 文件→新建窗口⇧⌘N + 窗口菜单全套管理 | 单窗口多 tab（架构差异，tab 体系已完备） | PASS-B（更优保留：单窗口多 tab + 标签管理命令） | P3 |
| F10 | 拼写检查 | 编辑→拼写和语法检查子菜单（显示⌘: / 立即检查⌘; / 键入时检查） | 无 | FAIL | P2 |
| F11 | 智能标点 | 编辑→替换子菜单（输入时转换/智能引号/智能破折号/文本替换） | 无（可后续评估） | FAIL | P3 |
| F12 | 语音/听写/表情符号 | 编辑菜单系统服务项（开始朗读/听写⌘🎤/表情⌘🌐） | 表情与符号/听写已有（系统 predefined） | PASS-B | P3 |
| F13 | 查找替换 | ⌘F 查找 / ⌥⌘F 查找替换 / ⌘G / ⇧⌘G / ⌥⌘E 替换下一个 | ⌘F ✓ / ⌃H 替换（Windows 风格）/ ⌘G ⇧⌘G ✓（CM search） | PASS-B（macOS 侧缺 ⌥⌘F 别名） | P1 |
| F14 | 数学/Mermaid/表格/脚注/Wikilink/TOC | 全支持 | 全支持（引擎测试全绿，Golden Journeys PASS） | **PASS-E** | — |
| F15 | 字数统计窗口 | 视图→字数统计窗口（独立面板，阅读速度换算） | 状态栏字数（无独立窗口） | PASS-B | P3 |
| F16 | 大纲窗口（浮动） | 视图→大纲窗口 | 侧栏大纲模式已有 | PASS-B | P3 |
| F17 | 只读模式 | 视图→只读模式 | Reader 模式（更优：独立渲染视图+缩放+打印） | **PASS-E**（更优保留） | — |
| F18 | 版本复原（macOS Versions） | 文件→复原到（系统版本浏览器） | 无（依赖文件安全体系，autosave+快照可评估） | FAIL | P3 |

## 维度二：特点（快捷键体系 + 编辑行为）

### 快捷键对照表（macOS，Typora AX 实测 vs Mellow 实测）

**已对齐（PASS-E）**：

| 动作 | Typora | Mellow | |
|---|---|---|---|
| 源码模式 | ⌘/ | ⌘/ | ✓ |
| 专注模式 | F8 | F8 | ✓ |
| 打字机模式 | F9 | F9 | ✓ |
| 侧边栏切换 | ⇧⌘L | ⇧⌘L | ✓ |
| 全局搜索 | ⇧⌘F | ⇧⌘F | ✓ |
| 快速打开 | ⇧⌘O | ⇧⌘O | ✓ |
| 设置 | ⌘, | ⌘, | ✓ |
| 粗体/斜体/链接 | ⌘B/⌘I/⌘K | ⌘B/⌘I/⌘K | ✓ |
| 标题 1-6 | ⌘1~⌘6 | ⌘1~⌘6 | ✓ |
| 复制为 Markdown | ⇧⌘C | ⇧⌘C（引擎） | ✓ |
| 粘贴为纯文本 | ⇧⌘V | ⇧⌘V（引擎） | ✓ |
| 插入图片 | ⌃⌘I | ⌃⌘I | ✓ |
| 表格插入行 | ⌘↵ | ⌘↵（引擎） | ✓ |
| 表格 Tab 导航 | Tab/⇧Tab | Tab/⇧Tab | ✓ |
| 移动行 | ⌥↑/⌥↓ | ⌥↑/⌥↓（CM defaultKeymap） | ✓ |
| 撤销/重做 | ⌘Z/⇧⌘Z | ⌘Z/⇧⌘Z | ✓ |
| 打印 | ⌘P | ⌘P | ✓ |
| 重开关闭标签 | ⇧⌘T | ⇧⌘T | ✓（Typora 无此项，Mellow 更优） |
| 命令面板 | — | ⇧⌘P | ✓（Mellow 独有，更优） |

**缺失（FAIL，需实施）**：

| 动作 | Typora | Mellow 现状 | 优先级 |
|---|---|---|---|
| 字体放大/缩小/重置 | ⇧⌘= / ⇧⌘- / ⇧⌘0 | 无 | **P0** |
| 侧边栏大纲/文档列表/文件树 | ⌃⌘1 / ⌃⌘2 / ⌃⌘3 | 无（仅⇧⌘L总开关） | **P0** |
| 查找和替换 | ⌥⌘F | ⌃H（Windows 风格；macOS 应补 ⌥⌘F 别名） | P1 |
| 公式块 | ⌥⌘B | 无 | P1 |
| 代码块 | ⌥⌘C | 无 | P1 |
| 引用块 | ⌥⌘Q | 无 | P1 |
| 有序/无序/任务列表 | ⌥⌘O / ⌥⌘U / ⌥⌘X | 无 | P1 |
| 链接引用 | ⌥⌘L | 无 | P2 |
| 行内代码 | ⌃` | 无（有命令无快捷键） | P1 |
| 删除线 | ⌃⇧` | 无 | P1 |
| 清除样式 | ⌘\ | 无 | P1 |
| 标题级别升降 | ⌘+ / ⌘- | 无（注：Typora 此项与字体缩放物理同键，属 Typora 自身冲突设计，Mellow 实施时需语境分流或改键） | P2 |
| 显示所有标签页 | ⇧⌘\ | 无 | P2 |
| 导出 PDF | ⌃⌘P | 无 | P2 |
| 使用上一次设置导出 | ⌃⌘E | 无 | P3 |
| 删除行 | ⇧⌘⌫ | 无 | P2 |
| 选择段落或块 | ⌥⌘P | 无 | P3 |
| 选中当前行或句 | ⌘L | 无 | P3 |

**Typora 侧未对齐但判定「更优保留」**：Mellow 的 Slash 命令（`/` 触发）、Reader、Split 视图、命令面板均为 Typora 无有的增强；Typora 的 ⇧⌘S=保存为在 Mellow 对齐 ✓（Typora 实际是 ⇧⌥⌘S，Mellow 用 macOS 标准 ⇧⌘S 更符合平台习惯）。

### 编辑行为

| 行为项 | Typora | Mellow | 判定 |
|---|---|---|---|
| 智能粘贴（HTML→Markdown） | ✓ | smartPaste + safe-html（Golden j13 PASS-E） | PASS-E |
| 复制双路（text/html） | ✓ | copyAsMarkdown + text/html（j12 PASS-E） | PASS-E |
| 空选区成对 marker 插入 | ✓ | applyInlineFormat 空选区语义 | PASS-E |
| 表格列宽拖拽/行列操作 | ✓ | 表格引擎全绿 | PASS-E |
| IME（拼音） | ✓ | IME guard corruption=0（j2 PASS-E） | PASS-E |
| 日文 IME | ✓ | NOT TESTED（j3，B6 执行） | NOT TESTED |
| 自动补全 Emoji/括号匹配 | ✓（偏好设置开关） | 部分（auto-pairs）；Emoji 补全无 | PASS-B |
| 粘贴图片行为 | 偏好设置控制（无特殊操作/复制/上传） | 插入本地 assets（image-ops j14 PASS-E） | PASS-B（上传路径待 B5） |
| Markdown 语法开关（严格模式/内联公式/上下标/高亮/GFM 警告/智能标点） | 偏好设置 Markdown 面板逐项开关 | settings markdown section 逐项开关 | PASS-E |

## 维度三：桌面 UI（窗口 chrome / 菜单栏 / 状态栏 / 侧边栏）

| 项 | Typora 实测 | Mellow 现状 | 判定 | 优先级 |
|---|---|---|---|---|
| 菜单栏结构 | 10 菜单（Apple/Typora/文件/编辑/段落/格式/显示/主题/窗口/帮助） | 10 菜单（Apple/Mellow/文件/编辑/视图/插入/格式/段落/主题/帮助），结构等价映射 | PASS-B | — |
| 应用菜单 | 关于/许可证/设置⌘,/检查更新/服务/隐藏/退出 | 关于/隐藏/退出/退出并保留窗口——**缺设置⌘,与检查更新菜单项**（命令面板可达） | FAIL（补菜单项） | P1 |
| 文件菜单差集 | 新建⌘N/标签⌘T/窗口⇧⌘N、打开最近、快速打开⇧⌘O、简介、文档列表/文件树中显示、打开文件位置、删除、关闭/全部关闭、保存/保存为/复制/重命名/移到、复原到、磁盘重载、保存全部、共享、导入、导出 13 格式、页面设置⌘P、打印⌘P | 新建⌘T/打开⌘O/QuickOpen⇧⌘O/打开文件夹/保存⌘S/另存为⇧⌘S/Finder显示/打印⌘P/导出PDF/HTML/Word/打开方式/文件信息/关闭⌘W | 缺：打开最近、新建窗口、全部关闭、保存全部、磁盘重载、页面设置、导出图片、共享 | P1/P2 |
| 编辑菜单差集 | 拷贝图片、复制为纯文本、复制为Markdown⇧⌘C、复制为HTML、简化格式、粘贴为纯文本⇧⌘V、选择子菜单5项、上移/下移行、删除子菜单、数学工具、换行符CRLF/LF切换、空格与换行偏好、替换偏好、拼写检查子菜单、查找子菜单5项 | 撤销/重做/剪切/复制/粘贴/全选/查找⌘F/替换（无加速键）——**替换菜单项缺 ⌥⌘F 加速键**；复制为Markdown⇧⌘C、粘贴纯文本⇧⌘V 已由引擎实现但菜单无入口 | FAIL（菜单补项） | P1 |
| 视图菜单差集 | 标签栏开关、全部标签⇧⌘\、源码⌘/、只读、专注F8、打字机F9、工具栏、侧边栏⇧⌘L、大纲⌃⌘1、文档列表⌃⌘2、文件树⌃⌘3、搜索⇧⌘F、字数窗口、大纲窗口、双指缩放、实际大小⌘0、放大⌘=、缩小⌘-、保持最前端、全屏 | 命令面板⇧⌘P、专注F8、打字机F9、源码⌘/、Reader、Split、全屏⌃⌘F、最小化、缩放 | 缺：放大/缩小/实际大小、侧边栏/大纲/文件树、全部标签、保持最前端、DevTools | **P0/P1** |
| 段落菜单差集 | 标题⌘1-6+段落⌘0、标题升降、表格子菜单17项、公式块⌥⌘B、代码块⌥⌘C、代码工具、警告框5类、引用⌥⌘Q、有序⌥⌘O/无序⌥⌘U/任务⌥⌘X、任务状态、列表缩进⌘]/⌘[、上下插段落、链接引用⌥⌘L、脚注、水平线、TOC、YAML | 仅 标题⌘1-3（4-6无加速键显示）+段落 | **FAIL**（段落菜单大幅缺失，功能多数在引擎/命令面板有，缺菜单入口+加速键） | **P0** |
| 格式菜单差集 | 加粗⌘B/斜体⌘I/下划线⌘U/代码⌃`/删除线⌃⇧`/注释/超链接⌘K/链接操作/图像子菜单9项/清除样式⌘\ | 粗体⌘B/斜体⌘I/删除线/行内代码/高亮/上标/下标/链接⌘K/引用/列表 | 缺：下划线、清除样式⌘\、图像子菜单；多：高亮/上下标（更优保留） | P1 |
| 主题菜单 | 6 主题（Github/Gothic/Newsprint/Night/Pixyll/Whitey）+ 选中态 | 3 项（Light/Dark/跟随系统）；实际内置 5 主题（mellow-light/dark、paper、git-light/dark）未列全 | FAIL（D-K） | P1 |
| 帮助菜单 | What's New/QuickStart⌘?/参考/装Pandoc/自定义主题/图片/更多/鸣谢/日志/隐私/官网/反馈 | 仅速查表 | PASS-B（补核心项即可） | P2 |
| 窗口菜单 | 最小化/缩放/移动调整（magnet式）/全屏平铺/标签切换⌃⇥/合并窗口/窗口列表 | 视图菜单内（最小化/缩放/全屏）+ 标签⇘⌘T/⇧⌘T | PASS-B | P2 |
| 状态栏 | 底部左字数/右行:列（hover footer，默认隐藏） | 7 项常显（编码/行尾/字数等，U 系列已精简） | PASS-B（口径不同；Typora 更极简，可评估收敛为可配置） | P3 |
| 标签栏 | 多 tab + 全部标签⇧⌘\ + 移到新窗口 + 合并 | 多 tab + 单 tab 自动隐藏 + 重开⇧⌘T（U7 已对齐） | PASS-E | — |
| Always on Top | 视图→保持窗口在最前端 | 无 | FAIL | P2 |
| DevTools 菜单 | 视图→Dev Tools | 无（dev 构建另有入口） | FAIL | P2 |

### 偏好设置对照（Typora 7 面板实测 vs Mellow 12 sections）

| Typora 面板（实测 OCR） | Mellow 对应 | 差距 |
|---|---|---|
| 外观：字体大小（自动/自定义）、缩放%、Cmd滚轮缩放、字数统计、阅读速度、工具栏、浅/深主题独立、打开主题文件夹、获取主题 | appearance（theme）+ editor（fontSize/writingWidth/lineHeight/toolbar） | 缺：缩放%、Cmd滚轮、字体族、主题文件夹入口（有 openUserCss 命令无设置入口） |
| 编辑器：默认缩进2、对齐缩进、匹配括号引号、匹配Markdown字符、Emoji补全、即时渲染显示块源码、复制行为（纯文本复制源码/无选中复制整行） | editor section（lineNumbers/lineWrapping/typewriter/focus/toolbar 等） | 缺：缩进宽度、auto-pairs 开关、Emoji 补全、复制行为偏好 |
| Markdown：严格模式、标题样式atx、列表样式、自动链接、内联公式、上下标、高亮、GFM警告、图表、智能标点 | markdown section 逐项开关 | **PASS-E**（结构等价） |
| 图像：插入默认行为、本地/网络规则、YAML自动上传、相对路径偏好、转义URL、上传服务（PicGo等） | image section（assetDir/loadRemote） | 缺：插入行为选择、上传服务（D-D）、语法偏好 |
| 导出：13 格式默认开启列表、默认导出文件夹、Pandoc 路径、导出后打开目录 | export section | 缺：导出文件夹、导出后动作 |
| 通用：关闭窗口自动退出、语言、更新、许可证、自定义快捷键、对话框 | general（reopenLast/language）+ updater + shortcuts | 基本等价；缺自动退出偏好 |
| 文件：打开新文件行为（大纲/标签/窗口）、大纲折叠、默认扩展名、切换自动保存、最近目录记录、拖入行为 | file（autosave）+ workspace | 缺：打开新文件行为、拖入行为 |

## 维度四：UI 布局

| 项 | Typora 实测 | Mellow 现状 | 判定 | 优先级 |
|---|---|---|---|---|
| 侧边栏宽度 | 可拖拽（默认约 220pt） | 固定 260px（CSS min200/max480 无拖拽 handle） | FAIL（D-J） | P2 |
| 侧边栏模式 | 大纲/文档列表/文件树 三模式 + ⌃⌘1/2/3 | files/outline/search 三模式 + 最近文件夹（功能等价，快捷键缺） | PASS-B | P1（快捷键） |
| 写作宽度/行高 | 主题控制 + 偏好设置 | editor.writingWidth/lineHeight 设置 | PASS-E | — |
| 主编辑区字体 | 自动缩放（14-20px 动态）+ 用户覆盖 | fontSize 固定值 | PASS-B | P1（B1-2 后达成 E） |
| 状态栏布局 | hover footer（左字数/右行:列） | 常显 7 项 | PASS-B | P3 |
| 欢迎屏 | 无（直接空文档） | 精简欢迎屏（U5 已收敛） | PASS-E | — |
| 主题视觉 | 6 主题（Github/Gothic/Newsprint/Night/Pixyll/Whitey，浅4深1+Pixyll 衬线风） | 5 主题（mellow-light/dark、paper、git-light/dark） | PASS-B（B3 校准后达 E） | P1 |
| 窗口默认尺寸 | 记忆上次 | 记忆上次 | PASS-E | — |

---

## 差距汇总（按优先级定稿，待用户确认后进 Phase B）

### P0（立即实施）

1. **B1-1 字体缩放三键**：⇧⌘=/⇧⌘-/⇧⌘0 实时缩放（步进 1px、范围 12-28、持久化 editor.fontSize、菜单项、设置面板同步显示）
2. **B1-2 侧边栏模式快捷键**：⌃⌘1 大纲 / ⌃⌘2 文件列表 / ⌃⌘3 文件树（侧栏打开且切到对应模式）
3. **B2-1 段落/视图菜单补全**：段落菜单补 表格子菜单（⌥⌘T 插入表格 + 行列操作）+ 公式块⌥⌘B + 代码块⌥⌘C + 引用⌥⌘Q + 有序⌥⌘O/无序⌥⌘U/任务⌥⌘X + 列表缩进⌘]/⌘[ + 脚注 + 水平线 + 标题4-6加速键；视图菜单补 放大/缩小/实际大小 + 侧边栏/大纲/文件树 + 全部标签⇧⌘\ + 保持最前端
4. **B2-2 编辑菜单补全**：复制为Markdown⇧⌘C / 粘贴为纯文本⇧⌘V 菜单入口（引擎已有，接线菜单）+ 替换⌥⌘F 加速键 + 拷贝图片
5. **修复**：插入表格菜单加速键丢失（menu.rs "Cmd+Opt+T" 未生效，AX dump 证实）

### P1（第二批）

6. **B2-3 文件菜单**：打开最近子菜单（最近 10 + 清除）+ 全部关闭 + 保存全部 + 从磁盘重新加载 + 页面设置
7. **B2-4 应用菜单**：设置⌘, 菜单项 + 检查更新菜单项
8. **B2-5 主题菜单列全**：5 内置主题 radio + 打开用户 CSS + 跟随系统
9. **B3-1 字体族设置**：settings schema + 设置面板 + CoreEditor fontFace 透传 + Reader 同步
10. **B3-2 主题校准**：对照 Typora 6 主题视觉参数（Night 深色对比度 / Newsprint 纸感 / Pixyll 衬线），评估补第 6 主题
11. **B4 Quick Look 扩展**（macOS，独立 Rust target）
12. **B5 图片上传服务**（PicGo adapter + 设置项 + 粘贴上传降级）
13. **快捷键补集**：行内代码⌃` / 删除线⌃⇧` / 清除样式⌘\ / 查找替换⌥⌘F（macOS 别名）

### P2（第三批）

14. 导出图片（PNG）
15. 侧边栏宽度拖拽（D-J）
16. Always on Top + DevTools 菜单（debug 构建）
17. 帮助菜单补项（QuickStart/Markdown 参考/反馈）
18. 拼写检查（系统 NSSpellChecker 接线）
19. 导出 PDF ⌃⌘P 快捷键 + 标题升降级（语境分流方案）
20. j3 日文 IME 实测（B6）

### 更优保留（不实施 Typora 行为，报告中逐条标注）

- 命令面板⇧⌘P / Slash 命令 / Reader / Split / 重开标签⇧⌘T（Typora 无，Mellow 增强）
- 状态栏编码/行尾常显（信息量优于 Typora hover footer；后续可加「极简模式」偏好）
- 单窗口多 tab（vs Typora 多窗口，架构决策已定）
- 高亮/上下标菜单项（Typora 无菜单项）
- ⇧⌘S 另存为（macOS 标准，优于 Typora ⇧⌥⌘S）

---

## 附：验证证据

- Typora 菜单树：`tests/benchmark/fixtures/typora-menu-dump.txt`（509 行，2026-08-20 重新 dump 含完整修饰键）
- Mellow 菜单树：`tests/benchmark/fixtures/mellow-menu-dump.txt`（170 行，最新 release 构建）
- Typora 偏好设置 7 面板 OCR 截图：`/tmp/typora-pref-{appearance2,editor,image,export,general,file,current}.png`
- 修饰键解码验证锚点：重做=⇧⌘Z(mods1)、公式块=⌥⌘B(mods2)、大纲=⌃⌘1(mods4)、专注=F8(mods8 NoCmd)——与 Typora 官方文档一致
- dump 工具：`tests/benchmark/lib/dump-menu.sh`（修正版）、`tests/benchmark/lib/ocr.swift`（--boxes 坐标版）
