# editor-core

**vendored MarkEdit CoreEditor**（TypeScript，CodeMirror 6 + Lezer）。**注入式扩展、不 fork 上游**；
对上游树的改动**必须登记**在 [`UPSTREAM.md`](./UPSTREAM.md)（清单与仓库实际哈希由护栏
`tests/parity/verify-upstream-manifest.mjs` 双向锁定）。

> ⚠️ **2026-10-06 更正（审计 §4.93）**：本行原写「**只读，不修改源码**」—— **不成立**：
> `UPSTREAM.md` 记录本仓**修改 21 个上游文件 / 新增 3 个**。准确表述是
> 「**不 fork**（改动以最小注入为主）+ **改动必须登记**」。

## 结构

```
editor-core/
├── CoreEditor/          # MarkEdit 上游 CoreEditor（固定 commit 81da2a20；改动登记见 UPSTREAM.md）
│   ├── src/             # modules/styling/api/bridge（规模以 `upstream-manifest.json` 的 199 个文件为真值源）
│   ├── test/            # jest 200 用例（jsdom，可运行）
│   └── package.json     # yarn 4.17.1（corepack）
├── src/                 # Mellow 平台适配层（public API）
│   ├── index.ts         # 包入口：EditorCore / buildBundleHtml / 契约
│   ├── core.ts          # EditorCore：平台无关生命周期与公开 API
│   ├── contract.ts      # 平台无关契约类型
│   ├── bundle.ts        # bundle 构建注入（config + 桥接）
│   └── bridge-injection.ts  # webkit 依赖消除（宿主桥路由）
├── upstream-swift/      # ts-gyb 生成的 macOS Swift 桥参考（隔离）
├── LICENSE              # MIT（MarkEdit.app）
└── UPSTREAM.md          # 上游同步说明
```

## Public API（Mellow 封装层）

```ts
import { EditorCore, buildBundleHtml, installBridge } from '@mellow/editor-core';

// 编辑器生命周期（platform-neutral）
const core = new EditorCore({ onEvent: (e) => console.log(e.type) });
core.mount(container);
await core.ready();
await core.open(markdownText);
const text = core.getText();

// 宿主桥注册（Tauri 自动走 __TAURI__；Electron/测试用 installBridge）
installBridge({ invoke: async (message) => { /* 路由到宿主 */ } });

// bundle 构建（把 CoreEditor 构建产物变成平台无关 bundle）
const bundle = buildBundleHtml(sourceHtml, { config: { theme: 'github-light' } });
```

## 硬规则

1. **不重写**：本包是 MarkEdit 编辑核心的精确复刻，改动一律走上游同步（见 UPSTREAM.md）。
2. **不引入 OS-specific API**：CoreEditor 源码仅 1 处平台耦合 —— `window.webkit.messageHandlers.bridge`
   （`src/bridge/nativeModule.ts`），由宿主构建期注入 mock 消除（`packages/editor-react/src/bridge.ts`）。
3. **不依赖 Tauri**：本包零 Tauri 引用；系统能力经 host-api 契约。
4. **不改变 Markdown 行为**：任何 Mellow 能力增量（如 marker reveal）以注入式扩展实现
   （`packages/editor-engine`），不进本包。

## 构建与测试

```sh
corepack enable                 # 或 npx -y yarn@4.17.1
yarn install --immutable
yarn test                       # 200 用例
yarn build                      # dist/index.html（singlefile bundle）
```

## 契约

- 桥契约：`CoreEditor/src/@codegen/config.json` + `bridge/web|native/*`（Host API 蓝本）
- 配置注入：`window.config`（`{{EDITOR_CONFIG}}` 占位符）
- Mellow 侧桥类型：`packages/editor-react/src/types.ts`
