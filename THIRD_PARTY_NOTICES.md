# Third-Party Notices

Mellow 是基于开源项目构建的。以下第三方组件与许可信息供合规审查。

> **覆盖范围（2026-10-08 重写，审计 §4.156）**：**Mellow 自身代码** + **vendored 上游源码** +
> **随产品分发的运行时依赖**（npm `dependencies` + `src-tauri/Cargo.toml` 的直接依赖）。
> ⚠️ 覆盖范围由护栏锁定（`tests/parity/verify-doc-code-refs.mjs` ⑲）：
> **每个 workspace 包的 `dependencies` 与 `Cargo.toml` 各依赖段的 crate 都必须在本文件中出现**
> （精确名，或本文件显式声明的 scope 通配，如 `` `@codemirror/*` ``）。
> ⚠️ **边界如实声明**：**构建 / 开发工具（devDependencies）不在判据覆盖内** —— 它们不随产品分发；
> 本文件第五节仍把它们列全，供人工审阅。
>
> 重写原因（实测）：本文件此前只列 **10 行**，且多为**构建工具**（Vite / TypeScript / Jest），
> 而 **28 个 npm 运行时依赖里漏了 10 个**（含 `mermaid` / `katex` / `pdfmake` / `markdown-it` /
> `sanitize-html` 与 3 个 Tauri 插件）；Rust 侧同样只列了 `tauri` 与 `tauri-plugin-dialog`。
> 另有一处**已过期**的声称（见第六节）。

## 一、Mellow 自身

- License: **MIT**（根 `LICENSE`，Copyright (c) 2026 Mellow Contributors）

## 二、Vendored 上游源码

### MarkEdit — MIT License

- Repository: https://github.com/MarkEdit-app/MarkEdit
- Vendored: `packages/editor-core/`（CoreEditor 目录，固定 commit `81da2a20`）
- License: MIT（`packages/editor-core/LICENSE`，Copyright (c) 2023 MarkEdit.app）
- 用途：Markdown 编辑器核心（CodeMirror 6 + Lezer），Mellow 的基础项目
- 说明：vendored 目录**不 fork 上游**（改动以最小注入为主）；**对上游树的改动必须登记**在
  `packages/editor-core/UPSTREAM.md`（清单与仓库实际哈希由护栏双向锁定）

## 三、运行时依赖（npm，随产品分发）

| 组件 | 版本 | License | 用途 |
|---|---|---|---|
| `@codemirror/*` | ^6.x | MIT | 编辑器框架（autocomplete / commands / lang-markdown / lang-yaml / language / legacy-modes / search / state / view） |
| `@lezer/*` | ^1.x | MIT | Markdown 增量解析器（common / highlight / html / lr / markdown） |
| `markdown-it` | ^15.0.0 | MIT | Markdown → HTML（导出管线） |
| `markdown-it-footnote` | ^4.0.0 | MIT | 脚注插件 |
| `markdown-it-task-lists` | ^2.1.1 | **ISC** | 任务列表插件 |
| `sanitize-html` | ^2.17.6 | MIT | 导出 HTML 清洗 |
| `katex` | ^0.18.4 | MIT | 数学渲染（导出） |
| `mermaid` | ^11.16.1 | MIT | 图表渲染（导出） |
| `pdfmake` | ^0.3.11 | MIT | PDF 导出 |
| `react` | ^18.3.1 | MIT | Desktop UI |
| `react-dom` | ^18.3.1 | MIT | Desktop UI |
| `@tauri-apps/api` | ^2 | Apache-2.0 / MIT | Tauri 前端 API |
| `@tauri-apps/plugin-dialog` | ^2.7.2 | Apache-2.0 / MIT | 文件对话框 |
| `@tauri-apps/plugin-opener` | ^2.5.4 | Apache-2.0 / MIT | 用系统默认程序打开链接 / 文件 |
| `@tauri-apps/plugin-process` | ^2.3.1 | Apache-2.0 / MIT | 进程与重启 |
| `@tauri-apps/plugin-updater` | ^2.10.1 | Apache-2.0 / MIT | 自动更新 |

## 四、运行时依赖（Cargo，随产品分发）

> 版本为 `apps/desktop/src-tauri/Cargo.lock` 的**锁定版本**。

| crate | 锁定版本 | License | 用途 |
|---|---|---|---|
| `tauri` | 2.11.5 | Apache-2.0 / MIT | 桌面运行时 |
| `tauri-plugin-dialog` | 2.7.2 | Apache-2.0 / MIT | 文件对话框 |
| `tauri-plugin-opener` | 2.5.4 | Apache-2.0 / MIT | 打开外部链接 / 文件 |
| `tauri-plugin-process` | 2.3.1 | Apache-2.0 / MIT | 进程与重启 |
| `tauri-plugin-updater` | 2.10.1 | Apache-2.0 / MIT | 自动更新 |
| `serde` | 1.0.229 | MIT / Apache-2.0 | 序列化 |
| `serde_json` | 1.0.151 | MIT / Apache-2.0 | JSON |
| `regex` | 1.13.1 | MIT / Apache-2.0 | 正则 |
| `notify` | 8.2.0 | **CC0-1.0** | 文件系统监听 |
| `trash` | 5.2.6 | MIT | 移入回收站 |
| `ureq` | 2.12.1 | MIT / Apache-2.0 | HTTP（更新检查） |
| `arboard` | 3.6.1 | MIT / Apache-2.0 | 剪贴板 |
| `image` | 0.25.10 | MIT / Apache-2.0 | 图片解码 / 编码 |
| `objc2` | 0.6.4 | MIT | macOS 原生绑定（Objective-C 运行时） |
| `objc2-app-kit` | 0.3.2 | Zlib / Apache-2.0 / MIT | macOS AppKit 绑定（标题栏等） |
| `objc2-foundation` | 0.3.2 | MIT | macOS Foundation 绑定 |
| `windows-sys` | 0.61.2 | MIT / Apache-2.0 | Windows 原生（JumpList） |

## 五、构建 / 开发工具（**不随产品分发**；列出仅供审阅）

| 组件 | 版本 | License | 用途 |
|---|---|---|---|
| `vite` | ^6（app）/ ^7（vendored CoreEditor） | MIT | 前端构建 |
| `@vitejs/plugin-react` | ^4.3.4 | MIT | React 插件 |
| `typescript` | ^5 | Apache-2.0 | 语言 |
| `jest` / `ts-jest` | ^30 / ^29 | MIT | 测试 |
| `@tauri-apps/cli` | ^2 | Apache-2.0 / MIT | Tauri CLI |
| `markedit-api` | v0.30.0 | MIT | MarkEdit 扩展 API **类型契约**（`devDependency`，仅类型） |
| `minisign-verify` | 0.2.5 | MIT | 更新签名校验（`dev-dependencies`） |
| `@types/node` / `@types/react` / `@types/react-dom` | — | MIT | 类型声明 |

## 六、许可说明

- 上游代码（MarkEdit CoreEditor）的改动遵循上游 MIT 条款；**Mellow 自身代码为 MIT**
  （根 `LICENSE` 已发布，Copyright (c) 2026 Mellow Contributors）。
  > ⚠️ **2026-10-08 更正**：本节原写「Mellow 自身代码默认 MIT（**待正式 LICENSE 文件发布时对齐**）」——
  > 而根 `LICENSE` **早已存在**，该句**已过期**。
- 完整许可证文本见：各依赖包内 `LICENSE` 文件（`node_modules/*/LICENSE`）、
  `packages/editor-core/LICENSE`、以及 cargo registry（`~/.cargo/registry/src/*/<crate>-<ver>/LICENSE*`）。
- ⚠️ **两个非 MIT 的运行时依赖**（其余均为 MIT 或 Apache-2.0/MIT 双许可）：
  - **`markdown-it-task-lists` = ISC**
  - **`notify` = CC0-1.0**
  两者均**允许**商业使用与再分发，但**不是** MIT ⇒ 单列于此，以免被默认成 MIT。
- 如有遗漏或疑问，请在本仓库提交 issue 补充。
