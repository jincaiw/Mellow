# Mellow V0.0 Runtime Qualification — 记录

对应 `docs/specs/runtime-qualification-plan.md`。

## 最终决策

> **ADR-0019（Accepted）**：锁定 Tauri 2 为产品 Runtime；Electron/Chromium 为已预案 Fallback（触发条款见 ADR-0019 §2）。
> ADR-0002（Conditional）已被取代。真机矩阵数据回填后触发复审。

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
由 neutral 测试回归保护（见 packages/editor-core/test/neutral.test.ts）。

## Pass / Fail 表（plan §6/§7）

| 项 | 本机（构建级） | Windows 真机 | macOS 真机 | Linux 真机 |
|---|---|---|---|---|
| 最小壳构建（Tauri+Rust+React+editor-core） | ✅ | — | — | — |
| 打开 Markdown（dialog + fs read） | ✅（Rust 命令 + 类型适配） | ⛔ | ⛔ | ⛔ |
| 编辑（CoreEditor，185 测试） | ✅ | — | — | — |
| 保存（atomic write） | ✅（Rust 实现） | ⛔ | ⛔ | ⛔ |
| Heading / Bold marker reveal | ✅（editor-engine 29 测试） | — | — | — |
| List / Table 基础编辑 | ✅（CoreEditor 原生） | ⛔ | ⛔ | ⛔ |
| 中文输入（composition guard） | ✅（逻辑层 29 测试） | ⛔ | ⛔ | ⛔ |
| IME corruption = 0 | ⛔ | ⛔ | ⛔ | ⛔ |
| Clipboard P0 | ⛔ | ⛔ | ⛔ | ⛔ |
| PDF/Print | ⛔（V0.0 范围外） | ⛔ | ⛔ | ⛔ |
| 10MB 可编辑 / P95 | ⛔ | ⛔ | ⛔ | ⛔ |
| Linux P0 journeys | ⛔ | — | — | ⛔ |

**结论**：ADR-0002 保持 **Conditional**。真机门禁（IME/Caret/Clipboard/Print/10MB）未执行前不得转 Accepted。

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
| — | — | — | — | — |

## 自动化检查（本仓库可执行）

```sh
# 1. 构建 editor-core dist（bundle 构建模块）
cd packages/editor-core && npm run build

# 2. 生成 editor bundle（含 Tauri Bridge Adapter）
cd apps/desktop && node scripts/build-editor-bundle.mjs

# 3. 前端 + Rust
cd apps/desktop && npm run build
cd src-tauri && cargo check

# 4. 全部测试
#    CoreEditor 185 / editor-core 15 / editor-engine 29 / host-api 24
```

## 运行方式（真机 GUI）

```sh
cd apps/desktop && npm run tauri dev
# 最小界面：新建 / 打开… / 保存 / 另存为… + 编辑器（Heading/Bold/List/Table/中文输入）
```
