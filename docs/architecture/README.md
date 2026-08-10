# Architecture

Mellow 架构文档。约束层级：`docs/product/Mellow-PRD-V1.2-FINAL.md`（宪法）> 本文档（实现架构）> `docs/adr/`（决策）。

## 文档

| 文档 | 内容 |
|---|---|
| [overview.md](overview.md) | 总体架构：四层结构、双核心、五层边界 |
| [editor-core.md](editor-core.md) | CoreEditor（TypeScript）模块地图、桥接契约、依赖 |
| [host-adapter.md](host-adapter.md) | Host Adapter：PRD §116 九服务契约与实现状态 |
| [monorepo.md](monorepo.md) | Monorepo 结构、平台代码隔离规则 |
| [migration.md](migration.md) | MarkEdit 迁移策略：Keep / Refactor / Replace、顺序、风险 |

## 快照

- MarkEdit 上游基线：`81da2a20`（2026-08-09，v1.34.0）
- CoreEditor（TS）：13,625 行 / 201 文件；Swift 层合计 28,781 行（macOS-only，迁移对象）
