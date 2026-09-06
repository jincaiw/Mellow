# Mellow v1.5.4

v1.5.3 真机反馈第三轮修复：文件树边框 / 标题阶梯引擎级兜底 / 引用块加固 / 代码高亮与复制按钮 / Typora 侧栏与大纲交互。

## 修复

### 1. 文件树行「横线」去除
- 根因与 v1.5.3 大纲同型：`.file-tree button`（0,1,1）以更高特异性命中 `.tree-row`，每行被框成卡片。
- 修复：`.file-tree .tree-row`（0,2,0）显式归零边框/底色。

### 2. 标题字号阶梯——引擎级兜底
- 此前字号经 CoreEditor 的 span-class CSS 路径下发，真机 WKWebView 上三版均未生效（本机 Chromium / playwright WebKit / 静态产物均正常，无法本地复现）。
- 现在：editor-engine 在行装饰 `attributes.style` 直接写 `font-size`（真源 `window.config.fontSize` + `headerFontSizeDiffs`）。引擎行装饰在真机已验证有效（粗体、h1/h2 底线、引用竖线均正常渲染）。
- 设置字号变更（含 ⌘+ 滚轮）经 `bumpHeadingFont()` 同步重建；StateField 以字号签名比对，任意事务自动跟随。

### 3. 引用块嵌套竖条加固
- d2/d3 第二/三条竖线由绝对定位 `::before` 改为多段 `linear-gradient` 背景（padding-box 坐标 15–19 / 34–38px），消除定位依赖。

### 4. iframe 防缓存击穿
- `editor/index.html` URL 跨版本稳定，WKWebView 可能持续命中旧缓存（一个内部自洽的旧编辑器），是 v1.5.1–v1.5.3 显示修复在真机不生效的头号嫌疑。
- 现在 iframe src 携带每次启动唯一的 `?v=` 查询参数，强制走新 URL；tauri 协议按 path 解析，不影响资源定位。

## 新功能

### 5. 代码块语法高亮
- 此前仅内置 HTML/Markdown（lang-data 扩展从未 vendored）。现在基于已有 `@codemirror/lang-*` + `@codemirror/legacy-modes`（StreamLanguage）补齐：JS / TS / CSS / YAML / JSON / Python / Shell / C / C++ / Java / C# / Kotlin / Swift / Go / Rust / SQL / XML / Dockerfile / Diff / Lua / Ruby，全部动态 import 零新增依赖。

### 6. 代码块右上角复制按钮
- 语言标签旁驻留「复制」按钮（Typora parity）：点击复制围栏代码，1.2s 反馈「已复制」；`navigator.clipboard` 优先、`execCommand` 兜底。

### 7. 主区顶栏 + 浮动大纲 + 侧边栏显隐（Typora parity）
- 主区域顶部居中显示文档名。
- 大纲可作编辑器右侧浮层面板（顶栏右侧开关），点击标题跳转，不挤压正文。
- 侧边栏头部新增隐藏按钮；隐藏后主区顶栏左侧提供恢复入口（⇧⌘L 仍可用）。

## 工程
- 版本 1.5.3 → 1.5.4；bundle 指纹 core-main-v1.5.4 / engine-v1.5.4。
- 测试：engine 1127 + editor-core 19 + desktop-ui 20 jest 全绿；12 项 parity 契约通过；布局/侧栏 golden 重生成；e2e sidebar-verify 全过。
