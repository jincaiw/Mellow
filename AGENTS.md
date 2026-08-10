# AGENTS.md — Mellow AI Development Instructions

本文档约束进入本仓库的 AI agent（以及人类协作者）的工作方式。

## 项目定位

Mellow 是基于 MarkEdit 重构的跨平台 Markdown 编辑器。

## 最高产品目标

1. Typora 级 Live Markdown 使用体验
2. Windows / macOS / Linux
3. 默认简体中文，支持完整 i18n
4. Markdown 源文本为唯一真源
5. 数据安全、IME、Caret、Undo 优先于新增功能

任何改动都不得削弱「Typora 体验一致或更优」这一产品承诺。

## 权威文档

| 优先级 | 文档 | 角色 |
|--------|------|------|
| P0 | `docs/product/Mellow-PRD-V1.2-FINAL.md` | 宪法：产品需求，功能定义最终依据 |
| P1 | `docs/specs/*.md` | 法律：各领域功能对标与规范 |
| P2 | `docs/adr/ADR-*.md` | 判决：已定技术决策，不允许随意推翻 |
| P3 | `docs/plans/codex-implementation-plan.md` | 施工图：实施顺序与验收节奏 |

关键入口：

- 产品需求：`docs/product/Mellow-PRD-V1.2-FINAL.md`
- 功能对标：`docs/specs/typora-parity-checklist.md`
- 实施顺序：`docs/plans/codex-implementation-plan.md`

## 架构原则（来自 ADR，不可随意推翻）

- 保留 MarkEdit CoreEditor
- CodeMirror 6 + Lezer
- TypeScript Editor Core
- Rust System Core
- React Desktop UI
- Tauri 2 首选，但必须通过 Runtime Qualification
- 不允许把 Markdown 转成私有 Rich Text 数据模型
- 不允许 UI 直接访问文件系统
- 不允许 Editor Core 直接依赖 Tauri
- 平台差异必须下沉到 Adapter

## 修改规则

修改代码前：

1. 找到相关 Spec
2. 阅读相关 ADR
3. 检查已有测试
4. 只修改当前任务需要的模块
5. 不进行无关重构

完成后必须：

1. 运行测试
2. 验证 Typora parity
3. 验证 Undo/Redo
4. 编辑器改动验证 IME
5. 文件改动验证 Source Fidelity

## 冲突处理

如果实现与 Spec 冲突：
**不要自行修改架构，先报告冲突。**

- 需求冲突：以 PRD V1.2 FINAL 为准；若 spec 与 PRD 冲突，先指出冲突再动手，不得擅自裁决。
- 决策变更：ADR 是已接受（Accepted）的决策。若要变更，正确做法是**新增 ADR** 并在新 ADR 中说明被取代的旧 ADR；禁止直接改写旧 ADR 的结论。

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
apps/           # 应用代码（待建）
packages/       # 共享包（待建）
tests/          # 测试（待建）
```
