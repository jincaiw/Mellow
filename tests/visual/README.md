# tests/visual — 视觉 Golden（P2-2.7 / P2-2.8）

## visual-golden.mjs（P2-2.7，防回退）

四配置布局契约 Golden：`win-900x600` / `win-1200x800` / `win-1440x900` / `zoom-200`（200% Zoom = fontSize 34px，R2-4 口径 17px = 100%）。

- **采样**（±1px 对比 `golden/layout-golden.json`）：
  - 外层 shell：titlebar 36px、tabbar（双 tab 才显示——单 tab 自动隐藏是 Typora parity）、editor-container、editor-frame 写作宽度 820px 居中、sidebar / statusbar / mode-indicators **默认不可见**；
  - iframe 编辑器：`.cm-content` paddingTop **56px**（P2-2.2）、`.cm-line` lineHeight = **fontSize × 1.65**（P2-1.6，setLineHeight stylesheet 作用域在 .cm-line）、fontSize 17 / 34。
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
