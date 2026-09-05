# V5 真值表（Phase 0 产出）

来源：Typora 1.14.9 (build 7785) macOS，激活主题 = **Github**（`defaults read abnerworks.Typora theme → Github`）。
真值文件：`/Volumes/My-Data/jason.wa/Library/Application Support/abnerworks.Typora/themes/github.css`、`/Applications/Typora.app/Contents/Resources/TypeMark/style/{window.css,base.css}`。
取值优先级：主题 css 覆盖 base.css。

## 1. 正文排版

| 项 | Typora 真值 | Mellow 现状（v1.4.7） |
|---|---|---|
| 字号 | 16px（html font-size） | 默认 17（settings/index.ts:75） |
| 行高 | 1.6 | 1.65（settings:111） |
| 正文字色 | #333333 | 主题 accent 体系（无统一 #333） |
| 内容列宽 | #write max-width 860px（窗≥1400px→1024px；≥1800→1200px），padding 30px，padding-bottom 100px | 820px（settings:104） |
| 字体 | Open Sans / Clear Sans / Helvetica Neue | 系统字体栈（可保留，用户未提字体诉求） |
| 段落/块 margin | p/blockquote/ul/ol/dl/table = 0.8em 0 | 无段距体系 |

## 2. 标题（全部 bold，margin-top/bottom 1rem，line-height 见下）

| 级 | 字号 | line-height | 附加 |
|---|---|---|---|
| h1 | 2.25em (=36px@16) | 1.2 | border-bottom 1px #eee |
| h2 | 1.75em (=28px) | 1.225 | border-bottom 1px #eee |
| h3 | 1.5em (=24px) | 1.43 | — |
| h4 | 1.25em (=20px) | 1.4 | — |
| h5 | 1em (=16px) | 1.4 | — |
| h6 | 1em (=16px) 色 #777 | 1.4 | — |

Mellow 现状：diffs [5,3,1] → 22/20/18/17/17/17，无 border-bottom，标题 accent 色。
→ 新 headerFontSizeDiffs = [20,12,8,4,0,0]。

## 3. 块级元素

| 元素 | Typora 真值（github.css） |
|---|---|
| blockquote | border-left 4px solid #dfe2e5；padding 0 15px；color #777777；嵌套 blockquote padding-right 0；margin 0.8em 0 |
| fenced code (.md-fences) | bg #f8f8f8；border 1px #e7eaed；radius 3px；font-size 0.9em；margin 15px 0；padding-top 8px；padding-bottom 6px |
| inline code | bg #f3f4f4；border 1px #e7eaed；radius 3px；padding 2px 4px；font-size 0.9em |
| table | 行边框 1px #dfe2e5；thead/偶数行 bg #f8f8f8；th bold；th/td padding 6px 13px；table padding 0 |
| hr | height 2px；bg #e7e7e7；margin 16px 0 |
| 链接 | #4183C4 |
| front matter (pre.md-meta-block) | padding 1rem；font-size 85%；line-height 1.45；bg #f7f7f7；radius 3px；color #777777；margin-top 0 |

## 4. 侧栏

| 项 | Typora 真值（window.css + 主题变量） |
|---|---|
| 宽度 | --sidebar-width 默认 270px |
| 背景 | --side-bar-bg-color #fafafa；右边框 rgba(0,0,0,0.07) |
| 字号 | 14px（sidebar-content-content） |
| 文件树行 | line-height 22px；.file-node-content color #777；icon margin-right 4px |
| 选中项 | --active-file-bg-color #eee；文字色继承（无加粗） |

## 5. 渲染行为（核心差距，R 组）

Typora（WYSIWYG）非聚焦块渲染行为 —— Mellow 全部缺失（标记常显）：

1. **引用块**：非聚焦隐藏 `> ` 标记，渲染为左竖线 + #777 缩进文本；光标进入显示源码。
2. **表格**：非聚焦渲染为 HTML 表格（真值见 §3）；光标进入回源码。Mellow 现状 = 源码 + 手动 preview 按钮。
3. **代码块**：非聚焦隐藏 ``` 围栏行（语言以标签形式驻留块角），内容保持高亮 monospace；Mellow 现状 = 围栏常显。
4. **标题**：非聚焦隐藏 `#`/Setext 下划线标记；Mellow 现状 = 淡色常显。
5. **front matter**：常驻灰底卡片（§3 真值），源码可编辑；Mellow 现状 = 因 App.tsx:3749 默认值 bug，engine 卡片扩展未装配，仅 CoreEditor 着色。

实现机制：editor-engine 新增统一「非聚焦块渲染」ViewPlugin（selection 不在节点 range 内 → Decoration.replace / line class；进入 → 源码），复用 PreviewWidget 表格渲染路径；yaml 默认态改为灰底卡片常驻（源码可编辑，不再用键值卡片+折叠按钮）。
