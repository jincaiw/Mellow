# AGENTS.md — Mellow AI Development Instructions

本文档约束进入本仓库的 AI agent（以及人类协作者）的工作方式。

## 任务开始前的必读流程

所有任务开始前，AI 必须**优先阅读**：

1. `AGENTS.md`（本文档）
2. `docs/product/Mellow-PRD-V1.2-FINAL.md`（宪法：产品需求）

然后**只读取当前任务要求的 Spec 和 ADR**，不读无关文档。

## 统一规则（所有任务必须遵守）

1. Mellow 以 MarkEdit 为基础项目。
2. 保留 MarkEdit CoreEditor，不从零重写编辑器。
3. Markdown 纯文本是唯一真源。
4. CodeMirror 6 + Lezer 是编辑器核心。
5. TypeScript 负责 Editor Core。
6. Rust 负责 System Core。
7. React + TypeScript 负责 Desktop UI。
8. Tauri 2 为首选 Runtime，但必须先通过 Runtime Qualification。
9. 如果 Tauri 无法达到 Typora 级三平台编辑体验，允许切换 Electron/Chromium。
10. Windows、macOS、Linux 共用产品语义和核心代码。
11. 平台差异只能存在于 Adapter / Native Enhancement。
12. 默认语言简体中文，完整支持 English 和 i18n。
13. 数据安全、IME、Caret、Undo 优先于新增功能。
14. Typora 1.14.6 是功能和 UX 验收基线。
15. 不允许未经要求进行无关重构。
16. 不允许擅自替换已经 Accepted 的 ADR。
17. 每完成一个任务必须执行测试并报告结果。

## 架构细则（统一规则的展开，同样不可违反）

- 不允许把 Markdown 转成私有 Rich Text 数据模型（规则 3 的实现约束）。
- 不允许 UI 直接访问文件系统（文件 IO 归 Rust System Core）。
- 不允许 Editor Core 直接依赖 Tauri（经 Host Adapter 隔离，保 Electron fallback 可行）。

## 权威文档

| 优先级 | 文档 | 角色 |
|--------|------|------|
| P0 | `docs/product/Mellow-PRD-V1.2-FINAL.md` | 宪法：产品需求，功能定义最终依据 |
| P1 | `docs/specs/*.md` | 法律：各领域功能对标与规范 |
| P2 | `docs/adr/ADR-*.md` | 判决：已定技术决策，不允许随意推翻 |
| P3 | `docs/plans/codex-implementation-plan.md` | 施工图：实施顺序与验收节奏 |

关键入口：

- 产品需求：`docs/product/Mellow-PRD-V1.2-FINAL.md`
- 功能对标：`docs/plans/typora-parity-master-plan.md`（唯一权威对标方案，2026-08-22 起取代旧 checklist/audit/review/deep-parity-plan 四文档）
- 实施顺序：`docs/plans/codex-implementation-plan.md`

## 修改规则

修改代码前：

1. 找到相关 Spec
2. 阅读相关 ADR
3. 检查已有测试
4. 只修改当前任务需要的模块
5. 不进行无关重构（统一规则 15）

完成后必须：

1. 运行测试（统一规则 17）
2. 验证 Typora parity（对照 Typora 1.14.6，统一规则 14）
3. 验证 Undo/Redo
4. 编辑器改动验证 IME
5. 文件改动验证 Source Fidelity

## 冲突处理

如果实现与 Spec 冲突：
**不要自行修改架构，先报告冲突。**

- 需求冲突：以 PRD V1.2 FINAL 为准；若 spec 与 PRD 冲突，先指出冲突再动手，不得擅自裁决。
- 决策变更：ADR 是已接受（Accepted）的决策。若要变更，正确做法是**新增 ADR** 并在新 ADR 中说明被取代的旧 ADR；禁止直接改写旧 ADR 的结论（统一规则 16）。

## 工作流约定

- 新功能/新组件：先确认需求与文档依据，再实现。
- Bug 修复：先定位根因，再修复，并说明影响范围。
- 文档修改：中文技术文档遵循中英文混排规范（中英文之间加空格、使用全角标点、术语保留英文原文）。
- 提交信息：使用 Conventional Commits，中文描述变更内容。
- P0 门槛：任何 P0 功能必须满足 README「核心原则」全部条目（功能正确、Typora parity、三平台、双语、Keyboard、IME、Undo/Redo、File Fidelity、自动化测试、Manual Golden Journey）。

## 目录约定

```
docs/product/   # 宪法：PRD（只应有一个 FINAL 版本）
docs/specs/     # 法律：领域规范，一个领域一个文件
docs/adr/       # 判决：ADR-XXXX-描述性slug.md，只追加不修改
docs/plans/     # 施工图：实施计划
docs/architecture/  # 实现架构（overview/editor-core/host-adapter/monorepo/migration）

apps/desktop/   # Tauri 2 + React 桌面壳（Adapter 装配层，平台代码只允许在此）

packages/
  editor-core/     # vendored MarkEdit CoreEditor（只读，见 UPSTREAM.md）
  editor-engine/   # Mellow Live Markdown 引擎（注入式扩展）
  editor-react/    # 编辑器 React 封装（EditorHost + 桥契约）
  app-core/        # 应用核心逻辑（经 host-api 依赖注入）
  host-api/        # 系统能力契约（PRD §116，纯类型）
  document-model/  # 文档模型（ADR-0008）
  workspace/  commands/  i18n/  themes/  extension-api/  shared/

tests/
  qualification/  # V0.0 运行时门禁记录
  fixtures/       # Markdown 测试素材库
```

## 包依赖规则

```
editor-core ──┐（零 OS 依赖；webkit 耦合由构建期注入消除）
              ├── editor-react ──┐
              ├── editor-engine ─┼── app-core ── host-api（契约）
              └── 宿主（desktop）─┘        │
                     ▲                      └── 系统能力实现（仅 desktop）
                     └── 平台代码只允许在 apps/desktop（Adapter，PRD §113.4）
```
