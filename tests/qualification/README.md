# Mellow Runtime Qualification — 记录

对应 `docs/specs/runtime-qualification-plan.md`。

> **对标基线治理（2026-08-24）**：当前功能与 UX 规范验收基线固定为 Typora 1.14.9（build 7785）。任何 1.14.6 或更早版本的带日期报告仅保留其历史上下文，不得替代当前验收。当前聚合状态以 `tests/parity/typora-parity-ledger.json` 为准。

> **CI 验收策略（2026-08-24，ADR-0022）**：Windows 与 Linux 使用 GitHub Actions 的 `windows-latest` / `ubuntu-latest` 作为正式 Runtime 证据来源；Linux 的 Xvfb + fcitx5 中文输入矩阵和 Windows 的启动／文档打开／10 MB 冒烟均为 fail-fast Gate。Windows CI 的 SendKeys 保存读回仅为诊断（无交互桌面可能无法抵达 WebView2），不得误记为已验证的输入交互；Windows／Linux 不再要求人工真机补测；macOS 保持实机 Typora 对照。

> **Release 构建不变量（2026-08-25）**：Runtime Qualification 的三平台二进制必须以 `cargo build --release --features custom-protocol` 构建。该 feature 使 Tauri 嵌入 `frontendDist`；否则直接 Cargo 构建会加载 `devUrl`（`localhost:1420`），启动存活并不代表编辑器已加载。此不变量由 `tests/parity/verify-runtime-qualification-workflow.mjs` 保护。

> **门禁表回填（2026-09-03，V4 计划 P8 第 10 项）**：下表「本机（构建级）」列已按当前自动化事实回填；真机/CI 列按 ADR-0022 证据策略标注。自动化通过 ≠ 三平台体验验收完成（见 V4 计划 §16 完成定义），ledger 状态升 PASS-E 仍需真机 Gate 证据。

## 最终决策

> **ADR-0019（Accepted）**：Tauri 2 为产品 Runtime；Electron/Chromium 为已预案 Fallback（触发条款见 ADR-0019 §2）。
> macOS 实机与 Windows／Linux CI 矩阵用于持续 Runtime Qualification 与体验证据回填，不回退已接受 ADR。

## 架构（本轮验证）

```
editor-core（平台无关，零 Tauri 知识）
  ├── BRIDGE_INJECTION → window.__MELLOW_BRIDGE__ 契约（无桥 no-op）
  └── buildBundleHtml（config + 桥接注入）
        ↓（apps/desktop 构建期）
Tauri Bridge Adapter（desktop 专属）→ __MELLOW_BRIDGE__ 接到 __TAURI__.core
        ↓
Rust System Core（src-tauri）：bridge_call / open_document / save_document(atomic)
        ↓
Tauri 2（macOS WKWebView / Windows WebView2 / Linux WebKitGTK）
```

**解耦保证**：editor-core 源码 0 处 Tauri 标识（`__TAURI__`/`@tauri-apps`/`tauri://`），
由 neutral 测试回归保护（见 packages/editor-core/test/neutral.test.ts）；
全核心包平台边界由 `tests/parity/verify-adapter-contract.mjs` 回归保护（2026-09-03，P7.1）。

## Pass / Fail 表（plan §6/§7，2026-09-03 回填）

图例：✅ 通过 / 🔶 部分（自动化或 CI 已过、仍有已记录缺口）/ ⛔ 未通过或未执行 / — 不适用。

| 项 | 本机（构建级自动化） | Windows（CI，ADR-0022） | macOS（实机） | Linux（CI，ADR-0022） |
|---|---|---|---|---|
| 最小壳构建（Tauri+Rust+React+editor-core） | ✅ | ✅（CI release 构建 gate） | ✅ | ✅（CI release 构建 gate） |
| 打开 Markdown（dialog + fs read） | ✅（Rust 命令 + 类型适配） | ✅（CI 启动/打开 gate） | 🔶（实机 journey 待回填） | ✅（CI 冒烟） |
| 编辑（CoreEditor 185 + 全仓 jest 1419） | ✅ | ✅（同构建） | 🔶 | ✅（同构建） |
| 保存（atomic write + source fidelity corpus） | ✅（Windows byte-identical gate） | ✅（CI gate） | 🔶 | 🔶（corpus 待 CI 扩展） |
| Live Markdown（marker reveal / nodes） | ✅（editor-engine 971，含 P4.10 联合矩阵 8 例） | — | 🔶（实机 Typora 对照待 P4.12） | — |
| Table 编辑（one-undo/minimal diff/100×30） | ✅（table-undo-diff 16 + table-large 7） | — | 🔶 | — |
| 中文输入（composition guard + IME 冻结） | ✅（逻辑层全绿） | ✅（Xvfb+fcitx5 矩阵 gate，Linux 列；Windows IME 矩阵 CI 仅诊断级） | 🔶（20 分钟实机写作待 P4.11） | ✅（CI IME matrix） |
| IME corruption = 0 | ✅（自动化层） | 🔶（SendKeys 保存读回为诊断，不入证据） | ⛔（实机待执行） | 🔶（CI 矩阵内断言） |
| Clipboard P0（smart paste priority/IME guard） | ✅（smart-paste 17） | ⛔（cross-app 7 目标待执行） | ⛔ | ⛔ |
| PDF / HTML Export | ✅（export 72，含 PRD §142 corpus 4 例；italics 与转义管道真 bug 已修） | — | 🔶（三平台视觉一致待真机） | — |
| 10MB 可编辑 / P95 | ✅（large-file 自动化护栏） | ✅（CI 10MB 冒烟 gate） | ⛔（benchmark 待 P4.12） | 🔶 |
| Settings / Theme / Export 契约 | ✅（settings 13 + verify-settings-contract） | — | — | — |
| Extension permission / Safe Mode | ✅（permissions 14 + app-core extensions） | — | — | — |
| File Safety（rename/trash/undo/recovery/conflict） | ✅（app-core 200 含 FileOpHistory 12） | — | 🔶（disk-full/network corpus 真机项） | 🔶 |
| Reader / Palette / Slash / User CSS / AI 默认关闭 | ✅（P6.3 契约护栏） | — | 🔶（manual golden journey） | 🔶 |
| 三平台打包矩阵（dmg/nsis/msi/appimage/deb/rpm） | ✅（tauri.conf + adapter-contract 护栏） | ⛔（安装/卸载/更新矩阵待执行） | ⛔（签名公证 DMG 待执行） | ⛔ |
| UX Score 100 分 / 30 计时任务 | ✅（工具链就绪：ux-score-gate-template.md + ux-gate-recorder.mjs self-test） | ⛔（记录为 0） | ⛔（记录为 0） | ⛔（记录为 0） |

**结论**：ADR-0019 保持 **Accepted**。构建级与 CI 自动化已全绿，但真机/CI 体验 Gate（macOS 实机 Typora 对照、cross-app、UX Score 30 任务、安装矩阵）未回填前，不得将三平台体验结论标记为完整通过（V4 §16：状态只能为 AUTO / platform-partial）。

## 当前阶段总览（2026-09-03）

- **P0–P4 自动化收口**：Live Editing 契约（engine 971）、Menu/Context-menu/Settings/Sidebar/Shell 契约护栏全绿（含注入缺陷拒绝验证）。
- **P5 四域**（Table/Image/Clipboard/File）自动化完成；cross-app 7 目标、PicGo 真实链路、network/disk-full corpus 为真机/CI 项。
- **P6**：Export corpus 落地（修复 italics 字体缺失与表格转义管道两个真 bug）；Reader/Palette/Slash 默认隐藏与可发现性、AI 默认关闭（PRD §122）、User CSS 契约护栏落地。**导出能力全量已实现（2026-09-03 复核纠正）**：PDF / HTML（含无样式）/ Image（PNG/JPEG）/ Previous Export（`export.repeat`，⌃E/Ctrl+E）/ Pandoc 九格式（docx/odt/rtf/epub/latex/mediawiki/rst/textile/opml，`src-tauri/src/pandoc.rs` + `pandoc_available/export/import`，无 pandoc 环境测试 graceful skip）+ File→Import（pandoc 反向转 Markdown）；Pandoc 真实链路与导出视觉一致为真机/CI 项。**原两项真观察项亦已实现（2026-09-03 用户裁决解冻，D7 单项解冻）**：① broken local link error indicator（`mdLink.ts` `__MELLOW_MD_LINK_EXISTS__` + `mellow-mdlink-broken` subtle 暗红，spec engine §12；宿主 fs.exists 缓存预取 + `refreshMdLinks` 重绘链路）；② Windows JumpList（`src-tauri/jumplist.rs` SHAddToRecentDocs 系统最近文档，`recordRecentFile` 挂点，非 Windows no-op）。两者任务栏/视觉真机验证归真机项。
- **P7.1**：Adapter contract 护栏（核心包平台中立 + 桥链锚点 + 打包矩阵 + drift canary）。
- **P8 准备**：UX Score 模板与 30 任务 recorder 就绪（工具链 self-test PASS），待三平台真机执行；本表即 P8 第 10 项「过期门禁表回填」的交付。
- 聚合状态以 `tests/parity/typora-parity-ledger.json` 为准（32 项；PASS-E 0，升格需真机证据）。

## Benchmark 模板（plan §5 Performance，真机填写）

| 文件 | 大小 | 打开 ms | 输入 P95 ms | 滚动 | 备注 |
|---|---|---|---|---|---|
| fixtures/markdown/mixed-document.md | ~1 KB | | | | |
| 1 MB 合成文档 | 1 MB | | | | |
| 5 MB 合成文档 | 5 MB | | | | |
| 10 MB 合成文档 | 10 MB | | | | |
| 100k 行 | — | | | | |

## Platform Issue 记录

| 日期 | 平台 | 现象 | 影响 | 状态 |
|---|---|---|---|---|
| 2026-09-03 | 全平台（构建级） | export `pdfMake.fonts` 缺 italics 档位；表格 cell 含 `\|` 时列数越界崩溃 | 含斜体/转义管道文档导 PDF/HTML 必崩 | ✅ 已修（export corpus 暴露，回归保护见 packages/export/test/corpus.test.ts） |

## 自动化检查（本仓库可执行）

```sh
# 1. 全仓测试（12 包 jest 1419 例 + parity 契约护栏 + qualification self-test）
pnpm test

# 2. 构建 editor-core dist（bundle 构建模块）
cd packages/editor-core && npm run build

# 3. 生成 editor bundle（含 Tauri Bridge Adapter）
cd apps/desktop && node scripts/build-editor-bundle.mjs

# 4. 前端 + Rust
cd apps/desktop && npm run build
cd src-tauri && cargo check
```

各包规模（2026-09-03，jest）：editor-engine 971 / app-core 200 / export 72 / host-api 43 / document-model 26 / commands 25 / editor-core 19（另有 vendored CoreEditor 185）/ i18n 15 / desktop-ui 13 / settings 13 / extension-api 14 / themes 8。

## 运行方式（真机 GUI）

```sh
cd apps/desktop && npm run tauri dev
# 最小界面：新建 / 打开… / 保存 / 另存为… + 编辑器（Heading/Bold/List/Table/中文输入）
```
