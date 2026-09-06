# Mellow v1.5.1

v1.5.0 真机反馈修复版：4 项问题（菜单裁撤 / 侧栏 Typora 化 / 渲染异常 / 光标偏移）。

## 修复

### 1. 「显示」菜单裁撤
- 删除【用 Reader 打开】【只读模式】两个菜单项（用户裁决）。
- 命令保留在注册表，仍可经命令面板 / Reader 内按钮触达。

### 2. 侧边栏 Typora 化
- 头部改为 Typora 三段式：☰ 汉堡（左，弹出 文件/大纲/搜索 切换菜单）+ 居中模式标题 + 🔍 搜索（右，切换到搜索面板）。
- 文件行保留文件夹/文件图标。

### 3. 默认模式 Markdown 渲染修复
- **引用块**：绿色斜体 → 灰色 `#777` 非斜体（light）/ `#8b949e`（dark）；移除 `tags.quote` 的共享 italic token。
- **列表标记**：橙红色（`#953800`/`#ffa657`）→ 正文字色，Typora 对齐。
- **标题字号阶梯 WebKit 兜底**：`.cls, *:has(> .cls)` 合并选择器列表在不支持 `:has()` 的旧 WebKit 中整条规则被丢弃（标题阶梯全灭）——拆分为两条独立规则，`:has()` 失效时 span 级 `.cm-md-headingN` 仍生效。
- 标题字色正文字色修复（V5 已修，本版随 bundle 重建全量生效）。

### 4. 鼠标位置与光标位置偏移
- 根因：行装饰用 margin 制造块间距（标题 1rem、顶层块 0.8em、列表项 0.25em），margin 在行 div 之外形成点击「死区」，posAtCoords 把落在空隙的点击映射到错误行。
- 修复：全部 margin → padding（点击区域归属正确行）；h1/h2 底线改经 `::after` 贴住文本；引用块左侧竖线因 padding 化在段间连续（更接近 Typora）。

## 工程
- 版本 1.5.0 → 1.5.1，editor bundle 指纹 `core-main-v1.5.1.js` / `engine-v1.5.1/`（击穿 WKWebView 资产缓存）。
- 测试：editor-engine 1127 + CoreEditor 185 + desktop-ui 20 jest 全绿；menu/settings/sidebar 三契约通过；侧栏 golden 四视图重新生成；布局 golden 6 配置全过。
