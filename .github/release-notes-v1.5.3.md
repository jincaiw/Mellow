# Mellow v1.5.3

v1.5.2 真机反馈第二轮修复：侧栏交互 / 大纲排版 / 列表 marker / 字号阶梯加固与诊断。

## 修复

### 1. ☰ 改为 文件↔大纲 直接切换（非菜单）
- 依据 Typora 实机行为：单击 ☰ 在 文件/大纲 间直接切换，tooltip 随目标变化（「切换到大纲视图」/「切换到文件视图」）；不再弹出下拉菜单。
- 搜索模式经 🔍 进入；任意模式下单击 ☰ 返回文件视图。
- 同步更新 e2e / golden 测试（☰ 往返 + 🔍 进入搜索）。

### 2. 侧栏大纲去「横线」
- 根因：`.file-tree button` 规则（1px 边框 + 底色）以更高特异性命中 `.outline-row`，每个大纲条目被框成卡片。
- 修复：`.file-tree .outline-row`（0,2,0）显式归零边框/底色，Typora 对齐（仅 hover/current/selected 有底色）。

### 3. 无序列表 marker → Typora 圆点
- 此前 WYSIWYG 下无序列表把源码 `-` 以 35% 透明度弱化显示（视觉即「小短线」）。
- 现在：`-`/`*` 源字符透明保宽 + ::before 画 `•` 圆点；有序列表 `1.` 保持弱化数字（与 Typora 一致）；caret 进入该行时完整显示源字符。

### 4. 标题字号阶梯加固 + 诊断增强
- setFontSize 改用 `setProperty('font-size')` 写入；CSSOM 迭代包 try/catch（老 WebView 抛异常不再中断 setUp 链路）；写入后回读校验，失败自动降级为整表 `textContent` 重写（纯 CSS 文本原生解析，无逐条赋值依赖）。
- 诊断对话框（帮助 → 诊断）新增：字号阶梯配置（fontSize + diffs）、标题/正文实测字号 —— 真机若仍现「标题同字号」，截图诊断即可定位失效层级。

## 工程
- 版本 1.5.2 → 1.5.3；bundle 指纹 core-main-v1.5.3 / engine-v1.5.3。
- 测试：engine 1127 + CoreEditor 185 + desktop-ui 20 jest 全绿；menu/settings/sidebar 契约通过；侧栏 golden 重生成；布局 golden 6 配置零漂移；e2e sidebar-verify/resize 全过。
