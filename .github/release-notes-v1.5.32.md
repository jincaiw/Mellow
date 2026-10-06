# Mellow v1.5.32

## 本次发布

**本次含产品行为变更** —— 删除 **30 个「无人使用」的 i18n 键**（两个 locale 各 30 个，目录 **841 → 811**）。

> 一句话：这些键**没有任何代码使用**（不是「暂时没用到」，是**改版遗留的化石**），
> 它们的存在会让人**把「某功能存在吗」读错**。本次按 **ADR-0032 Q1 = A1** 删除。

---

## 1. 删了什么、为什么

`packages/i18n/src/messages.ts` 里 **30 个键**在**产品代码 + 工具链**里从未被使用。
分组与来源：

| 组 | 键 | 遗留自 |
|---|---|---|
| 侧栏过滤面板 → 设置页 | `sidebar.showHidden` / `showNonMarkdown` / `filtersTitle` / `tree.includeGlob` / `tree.excludeGlob` | 选项从侧栏搬到 `settings.file.*` |
| 侧栏模式切换 | `sidebar.tree` / `list` / `summary` | 改用 `sidebar.*Aria` |
| 写作宽度选项列表 → 数值设置 | `settings.writingWidth.820` | 改用 `settings.editor.writingWidth` |
| **只被护栏维护** | `contextmenu.open` / `contextmenu.revealInTree` / `files.newFile` / `files.newFolder` | 实际用 `contextmenu.reveal` / 内联 `localizedTitle` |
| 未接线 | `reader.copy` / `status.words` / `quickopen.hint` / `updater.rollbackInProgress` 等 | 功能未接线或文案走别处 |

**为什么值得删**：它们不只是「占地方」——
- 会让读者**把「某功能存在吗」读错**（例如 `sidebar.showHidden` 会让人以为侧栏有过滤面板）；
- 其中 4 个**只被一条护栏断言「双语齐备」** —— 即「**护栏在维护死键**」（审计 §4.105）。

## 2. ⚠️ 删除前的三项取证（删除不可逆，缺一不可）

1. **无产品 / 工具链引用** —— 由 `verify-i18n-contract.mjs` 判据 D 自身给出
   （口径 = 产品 + 工具链，**刻意不含 `tests`**）；
2. **无 `tests/` 功能引用** —— 实测：仅 `verify-i18n-contract.mjs` 的登记表与
   `verify-sidebar-contract.mjs` 的**说明注释**提到（**均非断言**）；
3. **无动态构造** —— 全仓 `` t(`前缀${…}`) `` 形态**实测 0 处**。

**回退方式**：git 历史（`packages/i18n/src/messages.ts` 单文件）。

## 3. 判据随之升级

`MESSAGES_UNUSED` 登记表**清空** ⇒ `verify-i18n-contract.mjs` 判据 D
（「目录里不得有无人使用的键」）由「可登记」升级为**硬判据**，与 `src/` / `README.md` 同级。
**并去掉「登记表不得为空」这条断言** —— 真实死集合为空时它必然失败；
反空转改由「**双向核对 + 扫描面下限 + canary**」承担，而不是靠「要求登记表非空」。

## 4. 同批裁决（本 ADR 的另外三问，**无代码改动**）

`ADR-0032` 同日裁决四问（依据用户 2026-09-30 常设授权）：

| 问 | 裁决 | 说明 |
|---|---|---|
| Q1 30 个死 i18n 键 | **A1 删除** | 本次实施 |
| Q2 3 个死主题 token | **B3 维持登记** | 与 ADR-0027 Q3 口径一致（删除属主题面变更） |
| Q3 3 个零消费者包 | **C3 保留 + 记录触发条件** | ⚠️ **按 `AGENTS.md`「不要自行修改架构，先报告冲突」不自行改**（该条比常设授权更具体，因而优先） |
| Q4 3 个 schema 外持久化键 | **D2 维持登记 + 补文档** | 已在 master-plan 写明「不在设置页、且不被『恢复默认』清理」 |

## 5. ⚠️ 证据等级（如实声明）

- 本次删除的证据是**静态、可复核**：三项取证均由**护栏本身**与**全仓扫描**给出，可复现。
- **未做真机验证**（本环境无法做 —— 实测 `screen-timing windows` 返回 `cgWindows: []`（无屏幕录制权限）、
  `osascript` 访问 System Events 报 `-10004`（无辅助功能权限））。
- **macOS 产物未签名未公证** ⇒ 首次打开会遇到 Gatekeeper 警告。
- **`PASS-E = 0/50`、9 项 P0 未闭环依然成立** —— 本次是**清理**，不是完成度变更。
