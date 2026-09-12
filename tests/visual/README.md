# tests/visual — 视觉 Golden（P2-2.7 / P2-2.8）

## visual-golden.mjs（P2-2.7，防回退）

四配置布局契约 Golden：`win-900x600` / `win-1200x800` / `win-1440x900` / `zoom-200`（200% Zoom = fontSize 32px，100% 基准 = `TYPOGRAPHY_DEFAULTS.fontSize` = 16px —— Typora 真值 html font-size 16px）。

> V7-W2.2（G7-SHELL-03）：本文件的 16 / 1.6 / 860 三个数值取自排版单一真源
> `packages/settings/src/index.ts` 的 `TYPOGRAPHY_DEFAULTS`，由
> `tests/parity/verify-visual-golden.mjs` 做字面量交叉比对（漂移即红）。
> 历史值 17px / ×1.65 / 820px 已废弃：17 是 vendored CoreEditor iframe 的初始值（非 Mellow 默认），
> 1.65 / 820 是运行时回落残留。

- **采样**（±1px 对比 `golden/layout-golden.json`）：
  - 外层 shell：titlebar、editor-container、editor-frame 通栏（A1 写作宽度内部化，max-width none）、sidebar / statusbar / mode-indicators **默认不可见**；
  - iframe 编辑器：`.cm-content` paddingTop **56px**（P2-2.2）、`.cm-line` lineHeight = **fontSize × 1.6**（`TYPOGRAPHY_DEFAULTS.lineHeight`，setLineHeight stylesheet 作用域在 .cm-line）、fontSize 16 / 32、写作宽度 max-width **860px** + 内容居中。
  - **实测 vs 期望硬断言**（`assertEditorContract`）：字号 / 行高 / 写作宽度三项都会与单一真源比对，期望字段不再「只记录不比对」。
- **截图归档**：`actual/<config>.png`（人工评审素材）。
- 布局回退时退出码 1；基准漂移（有意变更）用 `--update` 重建并随 PR 提交评审。

```bash
node tests/visual/visual-golden.mjs           # 对比基准
node tests/visual/visual-golden.mjs --update  # 有意布局变更后重建基准
```

前置（editor iframe 资源，dev 模式由 public/editor/ 提供）：

```bash
cd packages/editor-core/CoreEditor && yarn install && yarn build   # vendored 上游（workspace 外，yarn 管理）
pnpm --filter @mellow/editor-core build                            # editor-core tsc（buildBundleHtml）
cd apps/desktop && node scripts/build-editor-bundle.mjs            # 注入 Adapter 桥 + P2-2.2 排版契约
```

## capture-window-chrome.mjs（P2-2.8，三平台 window chrome 归档）

当前平台以 dev 浏览器归档 shell window chrome（1440×900）到 `tests/benchmark/screenshots/p2-8-window-chrome-<platform>.png`，非当前平台在 manifest 中标记 `PENDING_REAL_MACHINE`（Windows 走 D5 self-hosted runner）。归档状态与采样（titlebar 76px traffic-lights 留白等）记录在 `tests/benchmark/screenshots/window-chrome-manifest.json`，供人工评审。

```bash
node tests/visual/capture-window-chrome.mjs
```

## 静态护栏

`tests/parity/verify-visual-golden.mjs`（已接入 root `test` / `parity` 链）断言脚本结构、四配置、golden 基准契约值（56px / 默认隐藏）、截图与 manifest 存在。
