# ADR-0023 — 菜单 / 命令 / 快捷键单一真源：`menuSchema`（packages/commands）

**Status:** Accepted（2026-09-03）

## 背景
- V4 计划 §17.2 决策点 D6 建议「新增 ADR 记录『菜单单一真源 CommandDescriptor』，不动已有 ADR」。
- P1 施工包（Menu / Command / Shortcut 单一真源 + 快捷键纠偏）已实施并收口：三平台菜单、快捷键、Cheatsheet、i18n 提示均从同一 schema 派生，且有契约护栏（`tests/parity/verify-menu-contract.mjs`、`verify-menu-contract-guard.mjs`）挂入 root test 链。
- 实际落地机制命名为 **`menuSchema`**（`packages/commands/src/menuSchema.ts`），非计划草案中的占位名「CommandDescriptor」；本 ADR 以实际实现为准记录。

## 决策
1. **菜单结构单一真源**：所有菜单条目（id、labelKey、平台过滤、角色/预定义项、command 关联）只定义于 `packages/commands/src/menuSchema.ts`；`apps/desktop/src/nativeMenu.ts` 前端物化与 `apps/desktop/src-tauri/src/menu.rs`（`syncNativeMenu` → Rust 物化完整菜单，含平台过滤与平台 accelerator）均为该 schema 的消费者，不得各自维护第二份菜单定义。
2. **快捷键只定义一次**：带菜单条目的快捷键在 `menuSchema` 的 `shortcut` 三平台字段声明（空缺 = 该平台无原生键位，退化为前端 keydown）；仅键盘快捷键（无菜单条目）留在命令定义处，属补充键位。D1 决议（全改 Typora 官方键位）体现在该字段的取值中。
3. **下游全部派生**：Cheatsheet 快捷键提示（`apps/desktop/src/Cheatsheet.tsx`）从 Command Registry（menuSchema 派生）读取当前平台键位，不手工维护（D9 决议）；`verify-menu-contract.mjs` 断言 Rust 菜单、前端 schema、命令注册表三方一致。
4. **权限边界**：`packages/commands` 为核心包，保持平台中立（ADR-0021/P7.1 adapter contract 护栏约束）；平台差异仅以声明式字段（`macOnly`、per-platform `shortcut`）表达，不出现运行时平台分支。

## 后果
- 正面：菜单/快捷键/i18n/Cheatsheet 四处消费一个真源；键位纠偏改一处生效三平台；漂移由护栏在 CI 检出。
- 代价：新增菜单条目必须先改 schema（含三平台 shortcut 决策），条目粒度变更需同步护栏锚点。
- 关联决策点状态更新（§17.2）：**D3 已随本机制落地**（Win/Linux 原生 accelerator 由 `shortcut` 三平台字段驱动，`menu.rs` 物化）；**D9 已落地**（Cheatsheet 派生，无手工维护）；**D4 已落地**（视觉 Golden 采用关键区域契约点采样 + `layout-golden.json` 基准 + 容差，见 `tests/parity/verify-visual-golden.mjs`）；**D8 仍待用户提供 self-hosted runner 机器与安全基线**。
