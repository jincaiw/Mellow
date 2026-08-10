# upstream-swift — macOS Swift 桥参考（隔离区）

由 CoreEditor 的 ts-gyb codegen 生成（`yarn build` 时写入），包含：

- `MarkEditCore/` — EditorConfig/EditorSharedTypes 等共享模型（Swift）
- `MarkEditKit/` — WebBridge*/NativeModule* 生成的桥实现（Swift，WKWebView 专用）

**定位**：

- 这些文件是 **macOS-only** 的参考实现，不参与 Mellow 跨平台构建；
- 用途：桥契约的语义参考（Host API 蓝本）、未来 macOS Native Enhancement 的可复用资产；
- Mellow 的宿主桥在 Rust（`apps/desktop/src-tauri`）+ TS（`packages/editor-react`）侧实现。

**约束**：本目录不得被任何跨平台包 import。
