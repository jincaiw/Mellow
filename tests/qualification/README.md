# Mellow V0.0 Runtime Qualification — 记录

对应 `docs/specs/runtime-qualification-plan.md` 与 ADR-0002（Conditional）。

## 状态

| 项 | 状态 |
|---|---|
| CoreEditor vendored（上游固定 SHA） | ✅ 见 `packages/editor-core/UPSTREAM.md` |
| CoreEditor jest 测试 | ✅ 185/185 |
| React + Tauri 2 最小 shell（apps/desktop） | 骨架 |
| 桥接（webkit mock → Tauri IPC） | 实现 |
| 文件打开/保存（dialog + atomic write） | 实现 |
| **Live Markdown 引擎 Phase 1（@mellow/editor-engine）** | ✅ 29/29 测试 |
| 中文 IME 真机验证（macOS WKWebView） | ⏳ 待本机 GUI 验证 |
| Windows WebView2 验证 | ⛔ 未覆盖（需 Windows 真机） |
| Linux WebKitGTK 验证 | ⛔ 未覆盖（需 Linux 真机） |
| 10MB 文件 / P95 输入延迟 | ⛔ 未覆盖（需真机基准） |
| Print/PDF | ⛔ 未覆盖（V0.0 范围外） |

> **Runtime Qualification 尚未覆盖项目**：三平台真机 IME/Caret/Clipboard/Print/10MB Gate 均未执行，
> 本仓库目前只完成技术准备（结构、桥接、最小可运行壳）。

## 运行方式

```sh
# 1. 构建 CoreEditor（packages/editor-core/CoreEditor）
npx -y yarn@4.17.1 install --immutable
npx -y yarn@4.17.1 test        # jest：CoreEditor 核心逻辑（185）
npx -y yarn@4.17.1 build       # 产物 dist/index.html

# 1b. 构建 Live Markdown 引擎（packages/editor-engine）
npm install
npm test                       # jest：marker reveal（29）
npm run build                  # 产物 dist/（宿主构建时自动集成）

# 2. 生成 Mellow editor bundle（注入 config + 桥接 + 引擎）
cd apps/desktop && node scripts/build-editor-bundle.mjs

# 3. 前端
npm install
npm run dev        # Vite dev（浏览器中可预览 shell；bridge 走 mock fallback）

# 4. Tauri
npm run tauri dev  # 桌面壳（macOS WKWebView）
npm run tauri build
```

## V0.0 验证范围（用户要求）

- [x] 打开 Markdown（dialog → fs read → resetEditor）
- [x] 编辑（CoreEditor 原生能力）
- [x] 保存（getEditorText → atomic write）
- [x] Heading / Bold / List / Table basic / 中文 IME —— CoreEditor 已实现，验证其可运行
- [ ] 三平台同一 Editor Core 的真机验证（本机仅 macOS）

## 已知边界

- 本机无完整 Xcode（仅 CommandLineTools），`tauri build` 打包 .app 可能受限，`cargo check/build` 可验证 Rust 侧。
- iframe 内桥接依赖 `window.parent.__TAURI__`（Tauri 2 `withGlobalTauri: true`）。
- 浏览器 `npm run dev` 无 Tauri API 时，host 层自动降级为内存 mock（可做 UI/布局开发）。
