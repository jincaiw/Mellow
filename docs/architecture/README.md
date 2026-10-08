# Architecture

Mellow 架构文档。

> **⚠️ 约束层级以 [`AGENTS.md`](../../AGENTS.md) 为准** —— 本目录**不参与优先级仲裁**。
> AGENTS.md 的表是：`docs/product/Mellow-PRD-V1.2-FINAL.md`（宪法，P0）> `docs/specs/*`（法律，P1）>
> `docs/adr/ADR-*`（判决，P2）> `docs/plans/codex-implementation-plan.md`（施工图，P3）。
> **本目录是「实现架构说明」**（描述代码怎么组织），**不是**高于 ADR 的裁决层。
>
> **2026-10-06 更正**：本行原写「约束层级：PRD（宪法）> **本文档（实现架构）** > ADR（决策）」——
> 那把本目录排在 **ADR 之上**、且**完全没提 specs**，与 `AGENTS.md` 的表**冲突**。
> 按 AGENTS.md 的规则（决策变更走新 ADR），**以 AGENTS.md 为准**。

## 文档

| 文档 | 内容 |
|---|---|
| [overview.md](overview.md) | 总体架构：四层结构、双核心、五层边界 |
| [editor-core.md](editor-core.md) | CoreEditor（TypeScript）模块地图、桥接契约、依赖 |
| [host-adapter.md](host-adapter.md) | Host Adapter：PRD §116 九服务契约与实现状态 |
| [monorepo.md](monorepo.md) | Monorepo 结构、平台代码隔离规则 |
| [migration.md](migration.md) | MarkEdit 迁移策略：Keep / Refactor / Replace、顺序、风险 |
| [extension-api.md](extension-api.md) | Extension API：PRD §119-121（权限模型 / Safe Mode）、ADR-0013 |

> **⚠️ 2026-10-08 更正（审计 §4.159）**：上表原**只有 5 行**，**漏了 `extension-api.md`**
> （本目录实际 **7** 个 `.md` = 上表 6 行 + `README.md` 自身）。
> ⚠️ **为什么以前没被发现**：本目录的护栏只查**反引号里的路径**，而这张索引用的是 **markdown 链接**
> ⇒ **索引的完整性从来没有判据**。现已落判据（`tests/parity/verify-doc-code-refs.mjs`：
> 本表的链接集合必须**双向等于**目录里的 `.md` 集合）。

## 快照

> **⚠️ 2026-10-06 复核：本目录整体是 `2026-08` 的 MarkEdit 上游快照 + V0.0 期的现状描述。**
> 各文件里**带日期**的表（如 monorepo 的「2026-08 基线」）是**历史快照**，如实保留；
> 而**不带日期**的断言（规模 / 实现状态 / 修改数）**按「当前」读** —— 本轮已逐条核对并更正（见各文件的更正块）。

- MarkEdit 上游基线：`81da2a20`（2026-08-09，v1.34.0）
- CoreEditor（TS）规模：**以 `packages/editor-core/upstream-manifest.json` 为真值源** ——
  钉住 commit 的上游树共 **199 个文件**（该文件的 `fileCount`）。
  > **2026-10-06 更正**：本行原写「**13,625 行 / 201 文件**」——
  > ① **201 与真值源（199）不符**；② 行数 **13,625 全仓无出处**、且**未声明口径**
  > （上游树？vendored 树？含不含 `test/`？）。⇒ 已改为**引用真值源**，不再复述一个无法核对的数字。
- Swift 层合计 **28,781 行**（macOS-only，迁移对象）—— 同为上游快照值，**本仓无真值源可核对**（如实声明）。
- **Vendored 树的改动**：`packages/editor-core/UPSTREAM.md` 记录**修改 19 / 新增 3**（共 22 处），
  由 `verify-upstream-manifest.mjs` 离线校验（钉住 commit 的上游树哈希）。
