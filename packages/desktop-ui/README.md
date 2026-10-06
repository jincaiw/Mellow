# @mellow/desktop-ui

Mellow 桌面 UI 组件（PRD §117 desktop-ui）。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口；**契约（不变量 / 错误语义 / 性能边界 / 禁止行为 / parity reference / 夹具）见同目录 `CONTRACT.md`**。

## 职责

从 `apps/desktop/src/App.tsx` **增量抽取**的展示层组件（**阶段 2，行为等价**）：
侧栏（文件树 / 文件列表 / 大纲 / 搜索结果）、状态栏、虚拟滚动。

## 公开接口

`src/index.ts` 导出 **23** 个符号：

- 状态栏：`StatusBar`、`StatusBarProps`、`StatusBarField`、`STATUSBAR_DEFAULT_HIDDEN`、`fieldVisible`
- 侧栏面板：`OutlineList`、`SearchResultsList`、`FileList`、`FileTree`（各带 `*Props`）
- 侧栏骨架：`SidebarHeader`、`SidebarFooter`、`SidebarMode`
- 虚拟滚动：`VirtualRows`、`buildOffsets`、`findRange`、`VirtualRange`

## 依赖关系（实测）

- **依赖**：`app-core`
- **被消费**：`apps/desktop`

## 测试

- `test/virtual.test.ts` / `test/virtual-bench.test.ts` —— 虚拟滚动偏移与范围计算
- `test/statusbar-defaults.test.ts` —— 状态栏默认隐藏集

## 边界与约束

- **行为等价抽取**：抽取过程中不得改变外观 / 交互 —— 外观由
  `tests/visual/{visual,sidebar,scenes}-golden.mjs` 的 golden 守住。
- 组件**不直接读 localStorage**：持久化经 `settings` 包的 schema / `apps/desktop` 的适配层。
