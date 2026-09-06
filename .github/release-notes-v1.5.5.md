# Mellow v1.5.5

v1.5.4 真机反馈第四轮修复：引用换行缩进 / 嵌套引用竖条 / 列表圆点 / 标题与段落间距收敛。

## 修复

### 1. 引用块软换行第二行缩进
- 根因：CoreEditor 的 contentIndent 装饰（QuoteMark 分支）给引用行注入内联 `text-indent:-X; margin-inline-start:X`（为源码 `> ` 对齐设计），与本引擎的 border+padding 叠加后，首行文字贴条、续行缩进 15px——只在引用段落发生软换行时暴露（Playwright Chromium/WebKit 探针一致复现）。
- 修复：引擎主题对 `.mellow-quote-line` 以 `!important` 归零 contentIndent 的内联缩进，全部行对齐 bar+15px（Typora 观感）。

### 2. 嵌套引用内条缺失
- 根因：v1.5.4 的多段 linear-gradient 使用双位置 stop 语法（`color 15px 19px`），真机 WKWebView 整条声明解析失败 → 内层竖条消失。
- 修复：全部 stop 改为单位置写法（`transparent 0, transparent 15px, …`），WebKit 全版本兼容。

### 3. 无序列表圆点（「•」不显示 / 双 marker）
- 根因：a) 源字符隐藏依赖 `color: transparent`，被内层 token span 的自身 color 覆盖 → 「•-」双 marker；b) `::before` 用绝对定位放置圆点，真机 WKWebView（adoptedStyleSheets 路径）下不可靠 → 圆点整体消失。
- 修复：源字符改 `font-size: 0` 隐藏（内层无显式字号，穿透继承，全平台可靠）；`::before` 改内联 baseline 渲染 + 显式 font-size，无定位依赖；颜色继承链失效时也回落到可见的正文色。

### 4. 标题/段落间距过大
- 根因：v1.5.1 起标题行上下 padding 固定 1rem×2；v1.5.4 引擎级字号阶梯在真机生效后（37px 标题），间距达 Typora 的约 1.5 倍。另外相邻块的 0.8em padding 无 margin 折叠、两两相加实际 1.6em。
- 修复：按截图实测 Typora ink-gap 收敛——标题 padding 依级 em 化（h1 0.5em/0.2em、h2 0.9em/0.3em、h3 0.45em/0.3em、h4-h6 0.35em/0.3em，em 随行级字号缩放）；块距 0.8em→0.4em×2。

## 工程
- 版本 1.5.4 → 1.5.5；bundle 指纹 core-main-v1.5.5 / engine-v1.5.5。
- 验证：Playwright Chromium + WebKit 双引擎 DOM 探针（contentIndent 归零 / gradient / bullet 计算样式）+ 截图比对；engine jest 全绿；parity 契约通过。
