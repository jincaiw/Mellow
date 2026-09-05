# Mellow v1.4.8 —— 第五轮 Typora 完全对标（侧栏 / 排版 / 嵌套块渲染）

目标：以本机 Typora.app（Github 主题）样式真值为基准，完成侧栏、排版、块级渲染的全面对齐。

## 侧栏完全 Typora 化（V5-A）

- 头部收敛为单标签「文件 ▾」下拉切换（文件/大纲/搜索），移除三 tab、路径 chips、根路径条、Tree/List 切换、hover 工具按钮排（SidebarHeader 重写）。
- **文件列表（list）视图整体退役**：App 层渲染/state/键盘/右键/命令全部移除；`⌃⌘2` 不再绑定；FileListModel/app-core 库代码与单测保留。
- `file.revealInFileList` 菜单项对齐 Typora 文案「在文库中显示 / Reveal in Library」，语义等同切到文件树。
- 树形行样式对齐 Typora：24px 行高 / 14px 字号 / 22px 行高字距 / #777 字色 / 圆角选中条（--mellow-sidebar-active）。

## 排版对齐 Typora 真值（V5-B/D3）

- 默认字号 17→16px、行高 1.65→1.6、写作限宽新增 860（默认），全部取自 Typora Github 主题真值。
- 标题字号阶梯改为 Typora em 阶梯 [2.25, 1.75, 1.5, 1.25, 1, 1]，标题色回归正文字色。
- 新增 13 个 `--mellow-md-*` 排版 token（github 真值）+ 主题桥（iframe `__MELLOW_THEME_TOKENS__` + localStorage 兜底），wysiwygBlocks 扩展统一消费。
- Front Matter 常驻灰底卡片（Typora `pre.md-meta-block` 观感）。

## 块级渲染修复（V5-C）

- 引用内表格不渲染修复（parseTable 剥离 `> ` 前缀）。
- 引用内代码块 `> ` 泄露修复（fence 开闭行整行隐藏 + 语言标签）。
- 引用竖线嵌套缩进、HR 隐藏 marker 换线、ATX/Setext 排版 class。

## 质量门禁

- editor-engine 73 套件 1127 用例全绿；全仓 10 包 jest 全绿。
- 12 项 parity 护栏全绿；smoke / sidebar-verify / sidebar-resize / theme e2e 全绿。
- visual-golden（6 配置）与 sidebar-golden（3 视图）基准重建并复验 ±1px。
- 构建回归：editor bundle 重建 + vite build 通过。

## 发版

- 版本 1.4.7 → 1.4.8（tauri.conf.json + package.json）。
- 按 ADR-0020：CI + Release Packaging 全绿后人工三步转正。
