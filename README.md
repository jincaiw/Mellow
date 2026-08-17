# Mellow

> Mellow 首先是一款 Typora 级 Markdown 编辑器，然后才是一款跨平台平台。

Mellow 是以 **MarkEdit**（vendored CoreEditor，CodeMirror 6 + Lezer）为编辑内核、以 **Typora 1.14.6** 为体验验收基线重新构建的跨平台 Markdown 桌面编辑器：Live Preview、文件树/大纲/搜索、表格/图片/数学/Mermaid、Focus/Typewriter、主题、导出，并吸收 **Paperling**（Tauri/React、Command Palette、Slash、Smart Paste、Visual Table）与 **markdown-preview**（Reader-first、Outline、Zoom）的优点。

**状态：pre-release（ADR-0020）**。真实 V1.0 发布门槛 = PRD P0 范围 + 发布评审 18 项验收全部通过（三平台真机矩阵、UX Score≥92 实测、30 任务效率 Gate、签名公证等）。当前 macOS 本地构建可用；Windows/Linux 构建与真机验证按优化方案阶段 1 推进中。

## 文档体系

仓库文档按「宪法 → 法律 → 判决 → 施工图」四级组织，优先级自上而下：

| 层级 | 目录 | 说明 |
|------|------|------|
| **宪法** | `docs/product/Mellow-PRD-V1.2-FINAL.md` | 产品需求文档 V1.2 FINAL，一切需求的最终依据 |
| **法律** | `docs/specs/` | 各领域具体规范（引擎、UI、表格、图片、剪贴板、文件安全、IME、运行时、Typora parity） |
| **判决** | `docs/adr/ADR-*.md` | 已做技术决策，**不允许随意推翻**；如需变更，追加新 ADR |
| **施工图** | `docs/plans/codex-implementation-plan.md`、`docs/plans/typora-deep-parity-plan.md` | 实施顺序与验收节奏 |

## 目录结构

```
mellow/
├── README.md / AGENTS.md / LICENSE / THIRD_PARTY_NOTICES.md
├── docs/
│   ├── product/      # 宪法：PRD V1.2 FINAL
│   ├── specs/        # 法律：各领域规范
│   ├── adr/          # 判决：ADR-0001 ~ ADR-0021
│   ├── plans/        # 施工图：codex 实施计划 / Typora 深度对标计划
│   ├── architecture/ # 实现架构（overview / editor-core / host-adapter / monorepo / extension-api）
│   └── qualification/# 验证记录（评审、IME 矩阵、golden journeys、benchmark）
├── apps/
│   └── desktop/      # Tauri 2 + React 桌面壳（Adapter 装配层，平台代码只允许在此）
├── packages/
│   ├── editor-core/      # vendored MarkEdit CoreEditor（只读，见 UPSTREAM.md）+ 平台无关 EditorCore 契约
│   ├── editor-engine/    # Mellow Live Markdown 引擎（注入式扩展，marker reveal/表格/数学/Mermaid/脚注/TOC/图片…）
│   ├── editor-react/     # 编辑器 React 绑定层（契约 re-export；组件化 UI 见阶段 2 计划）
│   ├── desktop-ui/       # 桌面 UI 组件（Tabbar/StatusBar/Welcome/OutlineList/SearchResultsList/FileList/FileTree）
│   ├── app-core/         # 应用核心逻辑（Document/Recovery/ExternalChange/Tabs/FileTree/Outline/QuickOpen/Search…）
│   ├── host-api/         # 系统能力契约（PRD §116，纯类型 + mock/null）
│   ├── document-model/   # 文档模型（ADR-0008）
│   ├── workspace/ commands/ i18n/ themes/ extension-api/ export/ settings/ shared/
└── tests/
    ├── benchmark/     # macOS 对照 harness（golden journeys / IME 矩阵 / 性能，对照 Typora 1.14.9）
    ├── fixtures/      # Markdown / 导出 / 文件安全素材库
    └── qualification/ # V0.0 门禁记录 + 可执行脚本（source-fidelity / packaging smoke）
```

## 文档索引

### 宪法

- [Mellow-PRD-V1.2-FINAL.md](docs/product/Mellow-PRD-V1.2-FINAL.md) — 产品需求文档（最终冻结版）

### 法律（Specs）

| 文档 | 领域 |
|------|------|
| [typora-parity-checklist.md](docs/specs/typora-parity-checklist.md) | Typora 体验对齐检查表 |
| [live-markdown-engine-spec.md](docs/specs/live-markdown-engine-spec.md) | 实时 Markdown 引擎 |
| [desktop-ui-design-spec.md](docs/specs/desktop-ui-design-spec.md) | 桌面 UI 设计 |
| [runtime-qualification-plan.md](docs/specs/runtime-qualification-plan.md) | 运行时（Tauri 2）资格认定 |
| [table-editing-spec.md](docs/specs/table-editing-spec.md) | 表格编辑 |
| [image-workflow-spec.md](docs/specs/image-workflow-spec.md) | 图片工作流 |
| [clipboard-smart-paste-spec.md](docs/specs/clipboard-smart-paste-spec.md) | 剪贴板与智能粘贴 |
| [document-file-safety-spec.md](docs/specs/document-file-safety-spec.md) | 文档与文件安全 |
| [ime-test-plan.md](docs/specs/ime-test-plan.md) | IME 测试计划 |
| [auto-update-spec.md](docs/specs/auto-update-spec.md) | 安全自动更新（签名/校验/渠道/回滚） |

### 判决（ADR）

见 [docs/adr/](docs/adr/)：ADR-0001（MarkEdit 核心）~ ADR-0019（Tauri 2 运行时锁定 + Electron 预案）、ADR-0020（发布状态修正：pre-release）。

### 施工图

- [codex-implementation-plan.md](docs/plans/codex-implementation-plan.md) — 实施计划
- [typora-deep-parity-plan.md](docs/plans/typora-deep-parity-plan.md) — Typora 深度对标评估与优化实施方案

## 核心原则

所有 P0 功能必须满足：

```text
功能正确
+ Typora parity
+ Windows/macOS/Linux
+ zh-CN/en-US
+ Keyboard
+ IME
+ Undo/Redo
+ File Fidelity
+ Automated Test
+ Manual Golden Journey
```

架构硬规则：Markdown 纯文本是唯一真源；CodeMirror 6 + Lezer 为编辑器核心；TypeScript 负责 Editor Core、Rust 负责 System Core；React + TypeScript 负责 Desktop UI；Tauri 2 为首选 Runtime（ADR-0019，含 Electron fallback 预案）；平台差异只在 Adapter；默认语言简体中文。

## 构建与运行

工具链：根目录 pnpm workspace（`pnpm-workspace.yaml`）；vendored CoreEditor 内部保留 yarn（特例）。