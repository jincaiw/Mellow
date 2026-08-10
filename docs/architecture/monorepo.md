# Monorepo 结构与隔离规则

> 约束：PRD §117 / §113.4 / §117.1（面向 AI/Codex 的仓库设计）+ codex-implementation-plan Phase 0。

## 目标结构（PRD §117）

```
/
├── apps/
│   └── desktop/            # Tauri 2 + React（当前：最小壳 + host 层）
├── packages/
│   ├── editor-core/        # ⚠️ 目标：CoreEditor 独立契约化（现状 = core-editor vendored）
│   ├── editor-react/       # React 编辑器封装（未建）
│   ├── desktop-ui/         # 桌面 UI 组件（未建）
│   ├── document-model/     # 文档模型（ADR-0008，未建）
│   ├── workspace/  commands/  i18n/  themes/  extension-api/  shared/
│   └── editor-engine/      # ✅ Mellow Live Markdown 引擎（注入式）
├── extensions/
├── tests/
│   ├── fixtures/           # ✅ 测试素材库
│   └── qualification/      # ✅ V0.0 门禁记录
└── docs/
    ├── architecture/       # ✅ 本目录
    └── product/ specs/ adr/ plans/
```

## 隔离硬规则（PRD §113.4）

```text
editor-core 不允许导入任何 OS-specific package。
app-core     不允许直接调用 Swift / Win32 / DBus。
            只能经 Host API。
```

## 现状与差距（2026-08 基线）

| 项 | 现状 | 差距 |
|---|---|---|
| CoreEditor 独立 | `packages/core-editor/CoreEditor/`（vendored 原样） | T-0003 未完成：未按 Mellow 契约封装（入口/类型导出/平台假设清理） |
| 包划分 | core-editor + editor-engine + desktop | editor-react/desktop-ui/document-model 等未建 |
| 代码生成产物隔离 | ts-gyb 生成的 Swift 桥文件落在 vendored 目录（`packages/core-editor/MarkEditKit|MarkEditCore`） | ⚠️ macOS-only 产物不应进入跨平台包，后续迁移时隔离 |
| 平台代码 | `src-tauri/`（Rust） | 无 native/macos|windows|linux 适配目录（PRD §113.4） |

## package 规范（PRD §117.1）

每个 package 必须包含：`README.md`、`CONTRACT.md`、`src/`、`tests/`、`fixtures/`。
