# Mellow

> Mellow 首先是一款 Typora 级 Markdown 编辑器，然后才是一款跨平台平台。

## 文档体系

仓库文档按「宪法 → 法律 → 判决 → 施工图」四级组织，优先级自上而下：

| 层级 | 目录 | 说明 |
|------|------|------|
| **宪法** | `docs/product/Mellow-PRD-V1.2-FINAL.md` | 产品需求文档 V1.2 FINAL，一切需求的最终依据 |
| **法律** | `docs/specs/` | 各领域具体规范（引擎、UI、表格、图片、剪贴板、文件安全、IME、运行时、Typora parity） |
| **判决** | `docs/adr/ADR-*.md` | 已做技术决策，**不允许随意推翻**；如需变更，追加新 ADR |
| **施工图** | `docs/plans/codex-implementation-plan.md` | 实施顺序与验收节奏 |

## 目录结构

```
mellow/
├── README.md
├── AGENTS.md
├── docs/
│   ├── product/      # 宪法：PRD V1.2 FINAL
│   ├── specs/        # 具体法律：各领域规范
│   ├── adr/          # 已定技术决策（ADR-0001 ~ ADR-0018）
│   └── plans/        # 实施计划
├── apps/
│   └── desktop/      # V0.0 Runtime Qualification Shell（Tauri 2 + React + host 层）
├── packages/
│   └── editor-core/  # vendored MarkEdit CoreEditor（CM6+Lezer，固定上游 commit，只读）
└── tests/
    └── qualification/  # V0.0 运行时门禁记录
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

### 判决（ADR）

见 [docs/adr/](docs/adr/)：ADR-0001（MarkEdit 核心）~ ADR-0018（AI 为可选扩展）。

### 施工图

- [codex-implementation-plan.md](docs/plans/codex-implementation-plan.md) — 实施计划

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

## 阅读顺序建议

1. 先读宪法（PRD），建立全局认知
2. 再读施工图（实施计划），了解推进节奏
3. 动某个领域前，读对应的 Spec + 相关 ADR

## 代码现状（V0.0 Runtime Qualification 技术准备）

- `packages/editor-core/`：MarkEdit CoreEditor vendored（上游 `81da2a20`），**不修改源码**，jest 185 用例全绿
- `apps/desktop/`：最小 Tauri 2 + React 壳，实现打开/编辑/保存 + Host Adapter 桥接（webkit mock → Tauri IPC）
- `tests/qualification/`：V0.0 门禁清单；三平台真机 IME/Caret/Clipboard/Print/10MB Gate **尚未覆盖**

## 开发基线

- **架构**：`docs/architecture/`（overview / editor-core / host-adapter / monorepo / migration）
- **合规**：`THIRD_PARTY_NOTICES.md`（MarkEdit MIT 归属 + 依赖清单）
- **测试素材**：`tests/fixtures/markdown/`（8 个 fixture）
- **CI**：`.github/workflows/ci.yml`（CoreEditor test+build / editor-engine test+build / desktop 构建 / Rust check）
- **引擎**：`packages/editor-engine/`（marker reveal Phase 1，29 用例）
