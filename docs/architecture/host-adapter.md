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

| 服务 | 位置 | 状态 | 说明 |
|---|---|---|---|
| fs | `apps/desktop/src-tauri/src/fs.rs` | ✅ | dialog + atomic write（temp+rename） |
| dialog | 同上 | ✅ | tauri-plugin-dialog（open/save 过滤） |
| bridge | `src-tauri/src/bridge.rs` | ✅ | bridge_call 路由（V0.0 core notify* → null） |
| window | — | ⛔ | CoreEditor notifyWindow* 已接但宿主未处理 |
| clipboard | — | ⛔ | 依赖 CoreEditor 现有 pasteboard API + 宿主适配 |
| watcher | — | ⛔ | Phase 5（ADR-0009） |
| search / export / keychain / process | — | ⛔ | Phase 3 / 6 / 5 / 后续 |

## 前端桥接（已实现）

```
React (apps/desktop/src/host/)
├── editorHost.ts   iframe.contentWindow.webModules.core.*（resetEditor/getText）
├── fs.ts           invoke('open_document'/'save_document')
├── bridge.ts       构建期注入：webkit.messageHandlers.bridge mock → invoke('bridge_call')
└── types.ts        桥接契约类型（对齐 CoreEditor）
```

浏览器 dev 模式（无 Tauri）host 层自动降级为内存 mock。
