# Host Adapter

> 约束：PRD §116 + ADR-0007（Editor/UI 不直接依赖 Tauri/OS API）+ ADR-0016（平台差异下沉 Adapter）。
> 目的：**Electron fallback 不需要重写 Editor**（AGENTS.md 统一规则 9）。

## 契约（PRD §116）

```ts
interface DesktopHost {
  fs: FileService          // 打开/保存/读目录（atomic write，ADR-0009）
  dialog: DialogService    // 打开/另存对话框、错误提示
  clipboard: ClipboardService  // 多格式 copy/smart paste（ADR-0011）
  window: WindowService    // 窗口状态/尺寸/关闭
  watcher: WatchService    // 外部变更监听（ADR-0009）
  search: SearchService    // 全局搜索
  export: ExportService    // PDF/HTML/Print（ADR-0014）
  keychain: KeychainService  // 凭据
  process: ProcessService  // 进程/侧车
}
```

## 实现状态矩阵

> **⚠️ 2026-10-06 重写**：本表原把 **window / clipboard / watcher / search / export** 五项
> 全部标为 **⛔「Phase 3 / 5 / 6 / 后续」** —— 那是 **V0.0 期**的状态。**这五项都已实现**，
> 且都能在仓库里指到文件（宿主 Adapter 在 `apps/desktop/src/host/`，系统能力在 `apps/desktop/src-tauri/src/`）。
> **判据**：下表每一格都给出**可打开的路径**；这些路径由 `tests/parity/verify-doc-code-refs.mjs` 常态断言存在。

| 服务 | 系统侧（Rust） | 宿主 Adapter（TS） | 状态 |
|---|---|---|---|
| fs | `apps/desktop/src-tauri/src/fs.rs` | `apps/desktop/src/host/fileServices.ts` | ✅ atomic write（temp+rename） |
| dialog | `apps/desktop/src-tauri/src/fs.rs` | `apps/desktop/src/host/dialogs.ts` | ✅ tauri-plugin-dialog（open/save 过滤） |
| clipboard | `apps/desktop/src-tauri/src/clipboard.rs` | `packages/editor-engine/src/clipboardCopy.ts` | ✅ 多格式 copy + smart paste（§3 优先级已由 ADR-0030 收敛为显式判断） |
| window | `apps/desktop/src-tauri/src/window.rs` | `apps/desktop/src/host/windowService.ts` | ✅ 标题 / 关闭门禁 / 几何记忆（size·position·maximized·fullscreen·sidebar） |
| watcher | `apps/desktop/src-tauri/src/watcher.rs` | `apps/desktop/src/host/watcherAdapter.ts` | ✅ 外部变更监听（`mellow://file-changed`，含 dirty 冲突路径） |
| search | `apps/desktop/src-tauri/src/search.rs` | `apps/desktop/src/host/searchServices.ts` | ✅ 流式全局搜索 |
| export | `apps/desktop/src-tauri/src/print.rs` | `packages/export/src/printStyle.ts` | ✅ PDF / HTML / Print |
| keychain | — | — | ⛔ **有意不实现**（ADR-0029 Q5 = E1：本仓上传路径**不持有凭据**；扩展的 `keychain` 权限 V1 一律拒绝） |
| process | — | — | 🟡 **无统一的 `ProcessService`** —— 需要外部进程的能力各自直接调用（如 `apps/desktop/src-tauri/src/pandoc.rs`）；**如将来要统一，应新增 ADR** |

> **为什么这张表必须给路径**：原表的「⛔」是**没有路径可核**的断言 —— 读者只能选择相信或不信。
> **每个状态都挂一条可打开的路径**之后，「已实现 / 未实现」就变成**可核对的事实**，并由护栏常态断言。

## 前端桥接

```
apps/desktop/src/host/            # Adapter 装配层（PRD §113.4：平台代码只允许在此）
├── fileServices.ts   FileService（invoke Rust 命令）
├── dialogs.ts        DialogService（tauri-plugin-dialog）
├── windowService.ts  WindowService（@tauri-apps/api/window）
├── watcherAdapter.ts WatchService（watch_document + mellow://file-changed）
├── searchServices.ts SearchService（Tauri streaming search）
├── spellcheck.ts     SpellcheckService（macOS 走 Rust NSSpellChecker）
├── updater.ts        安全自动更新（auto-update-spec）
├── uploadService.ts  ImageUploadService（Rust 三通道）
├── userThemes.ts     用户主题加载（appData/themes/*.css）
├── openers.ts        OpenerService（tauri-plugin-opener）
├── recoveryStorage.ts RecoveryStorage（AppData）
└── browserMockHost.ts 浏览器 dev 共享 mock 宿主（**单例**）
```

契约类型在 **`packages/host-api/src/`**（纯类型包，PRD §116 —— 零实现、零 OS 依赖）。

> **⚠️ 2026-10-06 更正**：本节原列 4 个文件（`editorHost.ts` / `fs.ts` / `bridge.ts` / `types.ts`）——
> **一个都不存在**。实际是上列 **12 个按服务拆分的文件**。
> 浏览器 dev 模式（无 Tauri）由 `browserMockHost.ts` 统一降级为内存 mock；
> 它必须是**单例**（所有 browser service 复用同一实例），否则浏览器端与桌面端的 fs 语义会分叉。
