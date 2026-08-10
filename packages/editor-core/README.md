# editor-core

**vendored MarkEdit CoreEditor**（TypeScript，CodeMirror 6 + Lezer）。只读，不修改源码。

## 结构

```
editor-core/
├── CoreEditor/          # MarkEdit 上游 CoreEditor（固定 commit 81da2a20）
│   ├── src/             # modules/styling/api/bridge（13,625 行）
│   ├── test/            # jest 185 用例（jsdom，可运行）
│   └── package.json     # yarn 4.17.1（corepack）
├── upstream-swift/      # ts-gyb 生成的 macOS Swift 桥参考（隔离，不参与跨平台构建）
├── LICENSE              # MIT（MarkEdit.app）
└── UPSTREAM.md          # 上游同步说明
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
yarn test                       # 185 用例
yarn build                      # dist/index.html（singlefile bundle）
```

## 契约

- 桥契约：`CoreEditor/src/@codegen/config.json` + `bridge/web|native/*`（Host API 蓝本）
- 配置注入：`window.config`（`{{EDITOR_CONFIG}}` 占位符）
- Mellow 侧桥类型：`packages/editor-react/src/types.ts`
