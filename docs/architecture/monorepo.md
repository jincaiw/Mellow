# Monorepo 结构与隔离规则

> 约束：PRD §117 / §113.4 / §117.1（面向 AI/Codex 的仓库设计）+ codex-implementation-plan Phase 0。

## 目标结构（PRD §117）

```
/
├── apps/
│   └── desktop/            # Tauri 2 + React（当前：最小壳 + host 层）
├── packages/
│   ├── editor-core/        # ⚠️ 目标：CoreEditor 独立契约化（现状 = editor-core vendored）
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

> **⚠️ 2026-10-06 复核：下表是 2026-08 的**历史快照 **，其中「未建」已全部不成立。**
>
> 实测（`ls packages/`）当前共 **15 个包**（**口径 = 全部目录**，**含 vendored `editor-core`**；
> ⚠️ `verify-package-conventions.mjs` 的口径是 **14**，因为它**排除 vendored** —— **两个数都对**，别混）：
> `app-core` / `commands` / `desktop-ui` / `document-model` / `editor-core` / `editor-engine` /
> `editor-react` / `export` / `extension-api` / `host-api` / `i18n` / `settings` / `shared` / `themes` / `workspace`。
> ⇒ 下表原标「**未建**」的 `editor-react` / `desktop-ui` / `document-model` **都已建成**；
> 另新增了 `app-core` / `export` / `host-api` / `settings` / `themes` 等。
> 快照**如实保留**（它记录了当时的差距），但**不要再把它当现状**。

| 项 | 现状 | 差距 |
|---|---|---|
| CoreEditor 独立 | `packages/editor-core/CoreEditor/`（vendored 原样） | T-0003 未完成：未按 Mellow 契约封装（入口/类型导出/平台假设清理） |
| 包划分 | editor-core + editor-engine + desktop | editor-react/desktop-ui/document-model 等未建 |
| 代码生成产物隔离 | ts-gyb 生成的 Swift 桥文件落在 vendored 目录（`packages/editor-core/MarkEditKit\|MarkEditCore`） | ⚠️ macOS-only 产物不应进入跨平台包，后续迁移时隔离 |
| 平台代码 | `src-tauri/`（Rust） | 无 native/macos\|windows\|linux 适配目录（PRD §113.4） |

## package 规范（PRD §117.1）

每个 package 必须包含：`README.md`、`CONTRACT.md`、`src/`、`tests/`、`fixtures/`。

> **⚠️ 2026-10-06 实测（如实登记：这条**宪法级规范目前基本未执行 **）**
>
> | 要求 | 实际（15 个包） |
> |---|---|
> | `src/` | **15 / 15** ✅ |
> | `test(s)/` | 12 / 15 |
> | `README.md` | **2 / 15** |
> | `CONTRACT.md` | **1 / 15** |
> | `fixtures/` | **0 / 15** |
>
> ⇒ 本行是**如实引用 PRD §117.1**（宪法），但**现状与它差距很大**，且**没有任何护栏在守**。
> 两种正当处置：① **补齐**（并加护栏）；② 走 **ADR** 说明为何在本仓不适用/需改写。
> **本轮不擅自选择** —— 它改的是「包结构规范」，属方案级；此处只把**差距变成可见的事实**
> （否则读者会把「PRD 写了必须」误读成「仓库已经这样」）。
