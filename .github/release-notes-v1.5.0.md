# Mellow v1.5.0 — Typora 对标第六轮（V6）：渲染层治理 + 视觉残差清零 + 壳 UI 完全 Typora 化

依据 17 组 v1.4.8 vs Typora 并排截图走查的全面整改。**本轮核心结论：v1.4.8 真机呈现的是「新侧栏壳 + 旧渲染层」混合态**——渲染真值早已在库，但 WKWebView 命中了无版本指纹的旧缓存资产。V6 从根因治起，并顺手清掉全部视觉/壳层残差。

## P0 渲染层治理（根治真机旧缓存）

- **资产版本指纹**：bundle 资产改名 `core-main-v{版本}.js` + `engine-v{版本}/`，升级即破 WKWebView 缓存；构建时自动清理旧版本资产
- **打包自检守卫**：新增 `verify-release-bundle.mjs`（版本指纹 / window.config 标题阶梯真值 / engine 特征串 / 旧资产残留检查），release.yml 三平台 CI 全部接入
- **一键完整构建**：`build-editor-all.mjs` 消灭「只跑抽取忘了上游构建」时序坑
- **标题阶梯覆盖根因修复**：`desktopEditorConfig.headerFontSizeDiffs` 运行时覆盖 CoreEditor 默认值（[5,3,1] 旧阶梯）导致 V5 真机标题字号未生效——现在统一为 Typora em 阶梯 **[20,12,8,4,0,0]** 并由守卫锁定
- **帮助菜单新增「诊断信息」**：显示应用版本 + 渲染层 bundle 指纹，两者不一致即提示 WebView 命中旧缓存（附清理指引）

## P1 视觉真值

- **链接颜色 = Typora 蓝 `#0969da`**（github.css 新版真值；暗色主题用 #4493f8 保证对比度）
- **行内 `<kbd>` 键帽渲染**：灰底圆角键帽（GitHub 观感），编辑态显示源码、失焦呈现键帽
- **列表项间距**：非首项 +0.25em（Typora li 观感）
- **外链图片默认自动加载**（Typora 行为；设置→图片可关，关闭后保留「加载远程图片」手动兜底）
- 语法高亮 / 表格观感：基础设施已在库，随 P0 缓存修复后真机复验

## P2 壳 UI 完全 Typora 化

- **macOS 回归原生标题栏**：去掉自绘顶栏与 Overlay 隐藏标题，窗口标题跟随「文档名 — Mellow」（dirty 时 ● 前缀），与 Typora 一致；Windows 保留自绘标题栏（Typora Windows 同构）
- **侧栏 quickbar 退役**：常驻过滤框 + 新建按钮移除；新建走右键菜单/命令面板；⌘F 在侧栏临时唤出过滤框（Esc 清空收起、Enter 确认）
- 侧栏选中条 / 行高真值随 P0 生效

## P3/P4 菜单与键位核对

- 帮助菜单补「官方网站」；段落菜单 / ⌘1-6 标题 / ⇧⌘V 粘贴纯文本 / 复制为 Markdown·HTML 核对确认已在库（对照 Typora 1.14.9 menu dump）

## 验证

- tsc / vite build / cargo check 全绿
- jest 12 包 1691 测试全绿（engine 1127 + app-core 203 + export 72 …）
- 视觉 golden 重刷：layout-golden 6 配置 + sidebar-golden 4 视图（含 ⌘F 过滤框新采样）±1px
- e2e：sidebar-verify / sidebar-resize-verify 全绿；12 项 parity 护栏全绿

---

**下载**：见下方 Assets（macOS dmg / Windows MSI+NSIS / Linux AppImage+deb+rpm）。更新器用户将自动收到升级提示（v1.4.9 起支持「自动安装」与「跳过此版本」）。
