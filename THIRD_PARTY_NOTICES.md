# Third-Party Notices

Mellow 是基于开源项目构建的。以下第三方组件与许可信息供合规审查。

## Vendored 源码

### MarkEdit — MIT License

- Repository: https://github.com/MarkEdit-app/MarkEdit
- Vendored: `packages/editor-core/`（CoreEditor 目录，固定 commit `81da2a20`）
- License: MIT（`packages/editor-core/LICENSE`，Copyright (c) 2023 MarkEdit.app）
- 用途：Markdown 编辑器核心（CodeMirror 6 + Lezer），Mellow 的基础项目
- 说明：vendored 目录保持只读，同步方式见 `packages/editor-core/UPSTREAM.md`

## 运行时依赖（npm / Cargo）

| 组件 | 版本 | License | 用途 |
|---|---|---|---|
| CodeMirror 6（@codemirror/*） | ^6.x | MIT | 编辑器框架（state/view/language/commands/search/autocomplete） |
| Lezer（@lezer/*） | ^1.x | MIT | Markdown 增量解析器 |
| markedit-api | v0.30.0 | MIT | MarkEdit 扩展 API 类型契约 |
| React / React DOM | ^18 | MIT | Desktop UI |
| Vite | ^6 | MIT | 前端构建 |
| TypeScript | ^5 | Apache-2.0 | 语言 |
| Jest / ts-jest | ^30/^29 | MIT | 测试 |
| Tauri 2（tauri crate） | ^2 | Apache-2.0 / MIT | 桌面运行时 |
| tauri-plugin-dialog | ^2 | Apache-2.0 / MIT | 文件对话框 |
| @tauri-apps/api / cli | ^2 | Apache-2.0 / MIT | Tauri 前端 API / CLI |

## 许可说明

- 上游代码（MarkEdit CoreEditor）的改动遵循上游 MIT 条款；Mellow 自身代码默认 MIT（待正式 LICENSE 文件发布时对齐）。
- 完整许可证文本见各依赖包内 LICENSE 文件（`node_modules/*/LICENSE`）与 `packages/editor-core/LICENSE`。
- 如有遗漏或疑问，请在本仓库提交 issue 补充。
