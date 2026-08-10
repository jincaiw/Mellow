# CONTRACT — editor-core

## 身份

vendored MarkEdit CoreEditor（TypeScript Editor Core，ADR-0001/0004）。

## 边界

| 允许 | 禁止 |
|---|---|
| 编辑核心：输入/Selection/Undo/AST/Decoration/命令 | 直接 import Tauri / Node / OS API |
| 注入式扩展接收（MarkEdit.addExtension） | 修改 CoreEditor 源码 |
| 通过 window.config 读取宿主配置 | 直接访问文件系统 |
| 通过 bridge 契约通知宿主 | 平台条件编译（`if platform` 逻辑） |

## 依赖（运行时）

`@codemirror/*` + `@lezer/*`（MIT）；`markedit-api`（GitHub，vendor 锁定）。

## 验收

- `yarn test` = 185/185；
- `yarn build` 产出 singlefile `dist/index.html`；
- 不出现新增 `window.webkit` / `window.__TAURI__` 引用（唯一豁免：`src/bridge/nativeModule.ts`）。
