# B1 完整改造方案：去 Tabbar，对齐 Typora 单文档窗口（SDI）

- 状态：**已实施（v1.4.7，2026-09-05）**；评审结论见 §10 决策结果回填
- 基线与影响版本：v1.4.6（已发布，含 A1–A3 / B2 / B3 / C 小项；本方案与其无代码冲突，独立单列）
- 范围：第四轮 B1（AskUserQuestion 已选「完全对齐去掉 Tabbar」→ 本会话选定「先出完整改造方案」）
- 相关计划：`typora-parity-final-plan-v4.md`（§18 变更记录将追加 B1 行）、`typora-parity-master-plan.md`
- 摸底时间：2026-09-05（代码锚点基于 v1.4.6 tag `ae0ad28` 工作区）

---

## 0. 摘要（TL;DR）

去掉应用级 Tabbar 不是「删一个组件」，而是**产品模型手术**：把「一窗口多文档 + 会话恢复」整体迁移到「一窗口一文档（SDI），多文档 = 多窗口」，并要求补齐 Typora 在 SDI 下的**关闭保护 / 多窗口会话 / 打开语义**三块当前不存在的能力。

本次摸底确认的耦合规模（v1.4.6）：

| 层 | 位置 | 规模 |
|---|---|---|
| 状态层 | `packages/app-core/src/tabs.ts`（TabManager） | 223 行；tabs[] + activeId + closed 栈（MAX_CLOSED=20）+ snapshot 会话 |
| 状态单测 | `packages/app-core/test/tabs.test.ts` | 100 行（随模型收敛需重写） |
| UI 组件 | `packages/desktop-ui/src/Tabbar.tsx` | 91 行 + desktop-ui `index.ts` 导出 + styles.css `.tabbar` 区（100–190 行） |
| 宿主接线 | `apps/desktop/src/App.tsx` | **88 处** tab 引用；渲染条件 4561、右键菜单 4569–4582、tab overview 4890–4925 |
| 命令层 | App.tsx CommandRegistry | `file.new`3882 / `file.newWindow`3883 / `file.newTab`3886 / `file.open`3893 / `tabs.close`3910 / `tabs.closeOthers`3911 / `tabs.closeRight`3912 / `tabs.reopenClosed`3913 / `file.closeAll`3915 / `tabs.next`3919 / `tabs.prev`3920 / `tabs.showAll`4204 |
| 菜单契约 | `packages/commands/src/menuSchema.ts` | file 菜单 4 槽（97 newTab、101 reopenClosed、117 tabs.close、118 closeAll）+ view 354 showAll + window 378/379 prev/next（mac） |
| 设置 | `packages/settings/src/index.ts:112` | `editor.autoHideTabBar`（storageKey `mellow.editor.autoHideTabBar`，App.tsx 269–270、applyCommand `settings.autoHideTabBar` 3769） |
| 多语言 | `packages/i18n/src/messages.ts` | tab/tabs/tabbar/menu.tabs 前缀键 34（zh 侧统计，en 同量级） |
| 会话持久化 | App.tsx | `TABS_SESSION_KEY='mellow.tabs.session'` 103；persist 1282–1288 / refresh 1290–1295 / 启动恢复 2698–2730（受 `mellow.general.reopenLast` 开关） |
| Rust | `apps/desktop/src-tauri/src/window.rs` | `new_window`（13–53，label `main-{stamp}`，同 URL） |
| 合同/回归测试 | 见 §7 | menu-schema.test / verify-menu-contract(.guard) / verify-shell-widgets / visual-golden / layout-golden.json / sidebar-verify / capture-window-chrome |

**必须先行核实的重大前提**（决定本方案是否成立，见 §3 门禁）：较新版 Typora **自带多标签能力**（偏好设置→外观→「启用标签页」；⌘T 新建标签页、⌘O/文件树双击在新标签打开），且本地化字典含 `New Tab / New Window / Open in New Window / Reopen Closed File / Switch Between Opened Documents`。本项目第四轮现场观测到的「SDI 无 Tab 条」很可能是**参考机处于「标签页关闭」偏好**。因此 B1 的正确前提是「对齐基准 = 参考 Typora 在标签页关闭状态下的 SDI 行为」——Phase 0 必须在真机复核并截图留证；若参考机实际开着标签页，则 STOP 回炉（见 §10 决策 0）。

---

## 1. 目标模型（B1 完成后 Mellow 应有的形态）

以「参考 Typora（标签页关闭）」为真值，目标窗口行为：

1. **窗口 ⇔ 文档 1:1**。窗口内没有 tab 集合；标题栏即单一文档。顶部无标签条。
2. 已打开文档时，再打开文档（⌘O / 最近文件 / 侧栏文件树单击 / 外部 odoc / CLI / 拖入）→ **新窗口**（或按 Phase 0 真值表：当前窗口替换——此为本方案最大行为分叉点，见 §5 D3）。
3. `⌘N`（New）→ 新窗口 + 空白未命名文档。
4. `⌘W`（Close）→ 关闭当前窗口；文档 dirty 时先保存确认。
5. 系统关闭（mac 红绿灯 / Win ✕）等同 ⌘W：dirty 确认后关闭（**当前缺失，B1 必修**，§5 D4）。
6. 会话恢复（`reopenLast`）→ 恢复为「上次打开的每个文档各一个窗口」（或评审降级为「仅主窗口最后文档」，§5 D1）。
7. 崩溃恢复（recovery，documentId 维度）不受影响；「恢复」动作 = 每条目开一窗口。
8. 删除的 UI/命令/键位：Tabbar、tab 右键菜单、tab overview、`file.newTab`(⌘T/Ctrl+Alt+T)、`tabs.closeOthers/closeRight`、`tabs.next/prev`(Ctrl+Tab 等)、`tabs.showAll`(⇧⌘\)；`editor.autoHideTabBar` 设置项及其 applyCommand/i18n/设置面板条目同步移除。
9. 保留的 tab 遗产语义（按 Phase 0 真值收编）：`tabs.reopenClosed`(⌘⇧T) → 若 Typora 有「重新打开关闭的文件」，改为**新窗口打开**，关闭栈从 per-window 提升为 app 级。

---

## 2. Typora 真值证据盘点（现状库内可引用素材）

| 素材 | 位置 | 能证明 / 不能证明 |
|---|---|---|
| 官方菜单 dump（真实机器） | 第四轮现场记录（v4 计划 §17 相关行） | 参考机当前菜单结构与顶层无「标签页」类顶层菜单（Win/Linux 无「窗口」）——**仅代表参考机当时偏好** |
| 中文本地化字典 | `tests/benchmark/fixtures/typora-menu-dump.txt`：New Tab 256、New Window 257、Open in New Window 269、Reopen Closed File ~297、Switch Between Opened Documents 339、Window 373 | Typora **资源层面存在**标签/新窗口语义 → 不能仅凭「现场没看见标签栏」断言 Typora 无 Tab |
| 键位注释（本仓库） | App.tsx:3881「Typora 官方键位——新建 ⌘N、新建窗口 ⇧⌘N、**新建标签页 ⌘T/Ctrl+Alt+T**」 | 前轮曾按「Typora 有新建标签页」立项 → 与 SDI 结论互相矛盾，须归零重验 |
| 公开资料（2026 检索） | 偏好设置→外观→「启用标签页」；⌘T 新建标签页（mac）；文件树双击/⌘O → 新标签打开；拖多文件到标签栏各自成标签 | 现代 Typora 多标签是**可选项**，默认/常见为单文档窗口观感 |

**结论**：本方案按「参考机 = 标签页关闭（SDI）」推进，但把「参考机偏好状态确认」设为硬门禁（Phase 0 Step 0），否则后续 10 个阶段全部建立在错误前提上。

---

## 3. Phase 0 — SDI 行为真值复核（先行门禁，零代码，产出《SDI 真值表 v1》）

在**用户参考机**（mac + Win/Linux 各一，若可得）对 Typora 逐项实测，截图留证。每行给出：触发 → 结果 → 截图路径。

| # | 复核项 | 目的（决定哪些设计点） |
|---|---|---|
| 0.0 | 偏好设置→外观：**「启用标签页」勾选状态** + 有无该开关；顶部是否可见标签栏 | 门禁：B1 前提是否成立；若开着标签页 → STOP（§10 决策 0） |
| 0.1 | ⌘N（Win: Ctrl+N）当前窗口内容变化？新窗口？标题栏/标签栏出现什么 | D3/§6 命令表 file.new |
| 0.2 | ⌘W（Win: Ctrl+W）行为：关窗口还是关标签；脏文档是否弹保存确认 | §5 D4 / file.closeAll 语义 |
| 0.3 | ⌘O 打开第二文档：当前窗口替换 / 新窗口 / 若开着标签页则新标签？ | D3（打开语义主分叉） |
| 0.4 | 最近文件（File→Open Recent）点一项：同上 | D3 |
| 0.5 | 侧栏「文件」树单击文件（当前已打开另一文档时） | D3 |
| 0.6 | Finder/资源管理器双击第二个 .md（单实例 IPC） | D3 / Rust odoc 通道 |
| 0.7 | 拖一个 .md 进当前窗口 | D3 |
| 0.8 | File 菜单完整截图：有没有「新建窗口 / 关闭窗口 / 关闭标签页 / 全部关闭 / 重新打开关闭的文件」；各自加速键 | §6 菜单槽位与 id 重命名（D7） |
| 0.9 | mac「窗口」菜单完整截图：Minimize/Zoom/显示上一个-下一个标签页/Bring All to Front… | D8（prev/next 槽去留） |
| 0.10 | ⌘T / ⌘⇧T / Ctrl+Tab / Ctrl+Shift+Tab 在参考机是否有任何响应 | §6 键位（⌘T 去留、reopenClosed 键位） |
| 0.11 | 「全部关闭」⌥⌘W：是否退出应用 | §6 file.closeAll 实现 |
| 0.12 | 关闭全部窗口后 Dock/任务栏图标：点图标是否开新窗口；未命名脏窗口关闭是否确认 | 空态窗口策略（沿用现有「启动空档 → 未命名」） |
| 0.13 | 重启 Typora 恢复：开 2 个有路径文档 + 1 个脏未命名，退出重开 | D1（会话恢复深度） |
| 0.14 | 菜单「重新打开关闭的文件」是否存在于 File/Open Recent；作用域（本窗口？跨窗口？） | D5 / closed 栈 app 级化 |

**交付**：`docs/plans/sdi-truth-table-v1.md`（每行来源标注 dump/截图/录屏）。Phase 1–8 的决策点（D1/D3/D5/D6/D7/D8）据此拍板；无法实测的项在表中标「假设 + 依据」，由用户确认。

> **进度（2026-09-05）**：真值表 v1 草案已产出，macOS Typora 1.14.9 资源证据已回填（来源 A）。三条新定论：
> 1. ⌘W = 关闭窗口（`performClose:`），无「关闭标签页」概念 → D4/D7 成立；
> 2. mac File 菜单**无「全部关闭」**（资源中无 closeAll 文案/动作）→ Mellow mac 的 `file.closeAll` 菜单项需按平台条件化；
> 3. Typora 确有 `newTab:` / `newWindow:` / `reopenClosedFilesMenu:` 动作 → 正确前提是「默认单文档观感 + 可选标签通道」，B1 = 对齐「标签页关闭」状态（门禁 0.0 仍待参考机确认）。

---

## 4. 架构决策与推荐（评审点，括号内为工作量影响）

| 编号 | 决策 | 选项 | 推荐 |
|---|---|---|---|
| D1 | 会话恢复深度 | **P1**：仅恢复主窗口最后文档（省 Rust 注册表，改动小）；**P2**：恢复全部上次窗口（每文档一窗，需 Rust 窗口注册表 + per-window 几何） | 视 Phase 0.13 真值：Typora 恢复多窗口则 P2，否则 P1。**默认 P2**（完全对齐代价） |
| D2 | 文档状态收敛方式 | **1a**：保留 `TabManager` 但锁死单元素（tabs.test 保留 3 处改断言）；**1b**：收敛重写为 `DocumentState`（删 tabs[]/activeId/closed/closeOthers/closeRight/reorder/snapshot 多 tab 结构，保留 documentId/dirty/encoding/eol/diskState/revision 概念） | **1b**（模型干净、长期无债；代价是 App.tsx 88 处引用与 tabs.test 重写，与 B1 目标一致） |
| D3 | 「再打开一个文档」语义 | **同窗替换**（Typora 侧栏/⌘O 在标签页关闭时多为替换；用户当前工作流可能依赖）；**新窗口**（绝对 SDI 直觉）；**按来源分流**（树单击=替换、odoc/⌘N=新窗） | 由 Phase 0.3–0.7 真值表决定；**预判按来源分流**，同一份打开核心函数按调用方传 `{mode:'replace'|'new-window'}` |
| D4 | 系统关闭保护通道 | **A**：Rust `CloseRequested` 拦截 → emit 给前端 → 前端 dirty 确认后 `window.destroy()`（自毁 flag 防环）；**B**：不拦截，仅记会话（现状，脏数据靠 crash snapshot 兜底） | **A**。现状 lib.rs:229–233 仅做几何监听，系统关窗**无保存确认**；SDI 下关窗=关文档，缺口从「可容忍」变「必修」 |
| D5 | 「重新打开关闭的文件」 | 删除（无标签即无 closed 概念）；保留但 app 级 + 新窗口打开； | 以 Phase 0.14 真值为准（本地化字典存在 Reopen Closed File，倾向保留 app 级） |
| D6 | 多窗口会话载体 | localStorage per-window（`mellow.session.<label>`，现状 localStorage 全窗共享会互相覆盖，最差）；Rust 侧 `windows.json`（app_data_dir，label→docPath/geometry，仿 geometry.rs A2 模式） | Rust 侧（与 A2 geometry、RunEvent flush 同构；几何记忆顺带 per-label 化） |
| D7 | `tabs.close` 命令 id | 改名 `file.closeWindow`（语义干净，牵动 menu contract/i18n/verify 全链重命名）；沿用 `tabs.close` 仅改 label「关闭窗口」 | 改名（B1 是语义手术，命令 id 残留 `tabs.*` 是债；全链重命名清单在 §6/§7 已列出） |
| D8 | mac「窗口」菜单 prev/next 槽 | 删除两槽（收敛为 predefined：Minimize/Zoom/Bring All to Front 等，对齐参考机 dump）；尝试 Tauri 原生 window tabbing（不可行，Tauri 无等价） | 删除；窗口菜单最终形态以 Phase 0.9 截图为准 |
| D9 | 空窗策略 | 启动无恢复 + 关掉最后窗口后：自动开一空白窗口（现 ensureOneTab 语义上移）；保持无窗（Typora 关完窗口后 Dock 点击开新窗） | 沿用现有：关最后一文档→若为最后窗口则关闭应用；启动兜底未命名窗（App.tsx 2720–2730 已实现），仅需把「⌘W 后 ensureOneTab」改为「关窗口」 |

---

## 5. 分阶段实施任务清单（WBS，评审通过后按序执行）

> 约定：⌘=mac Cmd；Win/Linux 键位括号内标注。所有「删除」均含对应 **i18n 键（zh/en）与 settings schema 条目**的同步清理；所有重命名含 **menu contract / verify 脚本 / golden** 同步（§7 是总迁移矩阵，阶段内不重复列）。

### Phase 1 — 状态层收敛为单文档（D2=1b）

| 任务 | 说明 / 锚点 |
|---|---|
| B1-1.1 | `app-core/src/tabs.ts` → 收敛为 `document.ts`（`DocumentState`）：删除 tabs[]/activeId/`reorder`/`closeOthers`/`closeRight`/`setActive`/多 tab `open` 去重分支/snapshot 多 tab 结构/`TabSessionSnapshot`；保留并归一字段 path/content/title/dirty/documentId/revision/encoding/eol/diskState 及 `update*`/`currentTabPatch` 等价物；closed 栈**移出**到 app 级（D5 定稿后：删或迁 Rust/app-core 全局模块） |
| B1-1.2 | `app-core/src/index.ts` 导出切换；`tabs.test.ts` 重写为 `document.test.ts`（覆盖 open/update/dirty/close-empty 语义，去掉多 tab 用例） |
| B1-1.3 | `app-core` 内其它引用 tabs 的模块核对（当前 `tabs.ts` 仅被 desktop 侧消费；用 `grep -rn "tabs" packages/app-core/src --include=*.ts` 复核） |

### Phase 2 — UI：移除 Tabbar / overview / 设置项

| 任务 | 说明 / 锚点 |
|---|---|
| B1-2.1 | 删 `desktop-ui/src/Tabbar.tsx` + `index.ts` 导出；`TabbarProps` 类型引用清除 |
| B1-2.2 | App.tsx 4560–4583：删除 Tabbar 渲染块与 tab 右键菜单（4569–4582 的 setContextMenu items）；**标题栏注意**：现 Tabbar 与 palette 钮同处 `<header class="titlebar">`，删除后确认 palette/窗口控制按钮布局与 `.titlebar` 高度不受影响（单 tab 隐藏态本就不含 tabbar 行，应为零视觉差，Golden 佐证） |
| B1-2.3 | 删 tab overview：`setTabOverviewOpen` state、命令 4204、渲染 4890–4925、样式 `.tab-overview-*`、i18n `tabs.overview.*` |
| B1-2.4 | styles.css：删 `.tabbar` 全部区块（100–190，含 compact 129–137、.tab-close 162–178、.tab-new F3 179+）；扫 `.tab`/`.tabbar` 其它引用（1513 hide-select 集合行要去掉 `.tabbar`） |
| B1-2.5 | 设置：`packages/settings/src/index.ts:112` 删 `editor.autoHideTabBar` 定义；App.tsx 269–270 state、3769 applyCommand case；i18n `settings.editor.autoHideTabBar`（messages.ts:500/1265）；旧 localStorage 值忽略即可（不迁移） |
| B1-2.6 | `packages/settings/test` 若有覆盖 autoHideTabBar 的用例同步删改（grep 复核） |

### Phase 3 — 命令 / 菜单 / 键位重连（先按 §6 映射表，D3/D5/D7/D8 定稿后落码）

| 任务 | 说明 |
|---|---|
| B1-3.1 | 命令注册区 App.tsx 3880–3920 / 4204：按 §6 表新增/改名/删除；`file.new` 从 handleNew 切到 `invoke('new_window')`（含非 Tauri 降级 handleNew 保 dev 可用） |
| B1-3.2 | 键盘拦截层清除 tab 快捷键：`tabShortcutAction`（tabs.ts 69–78）及相关 keydown 分支（Cmd/Ctrl+W 若由 native menu accelerator 承担则菜单层已覆盖；前端 web 层 `⌘T/⌘⇧T/Ctrl+Alt+T/Ctrl+Tab/Ctrl+Shift+Tab` 分支逐处删） |
| B1-3.3 | menuSchema.ts：按 §6 槽位表改；recent 子菜单 101 行为按 D5 处理 |
| B1-3.4 | 菜单/命令**改名后**（D7）：commandRegistry id、dispatch 引用、`menu.tabs.close` label、菜单 events（Rust menu.rs 只透传 id，无需改 Rust，仅改前端表） |

### Phase 4 — Rust：关闭保护 + 多窗口会话（D1=P2 / D4=A / D6=Rust）

| 任务 | 说明 / 锚点 |
|---|---|
| B1-4.1 | **关闭保护**：window.rs / lib.rs 对每窗口 `on_window_event` 增 `CloseRequested` 分支（现 229–233 仅几何）：`prevent_close()` → emit `mellow://close-requested`（带 window label）→ 前端 `confirmCloseDocument()`（复用 confirmCloseTabs 3444 提炼）→ 确认后 `invoke('confirm_close', {label})` 销毁；销毁前记会话。**防环 flag**：Rust 侧 `allow_close` 集合 |
| B1-4.2 | **窗口注册表**（仿 geometry.rs A2 模式）：新 `session.rs`：`WindowRecord { label, path|null, geometry }`；`load/save/record/flush`；`RunEvent::{ExitRequested, Exit}` 落盘（同 geometry flush 处合并写，避免双文件抖动）；`app_data_dir/windows.json` |
| B1-4.3 | **几何 per-label**：geometry.rs 现单窗 key → 按 window label 分键（A2 只记了主窗；B1 后多窗各自记忆，复用 visible_on_any_screen 校验） |
| B1-4.4 | **启动恢复**：lib.rs setup 读 windows.json → 为每个有 path 的 record 建窗口（携带恢复参数，经 PendingOpen/odoc 通道或 URL query 打开）；与现 `reopenLast`/`mellow.tabs.session`（App.tsx 2706–2716）职责合并——SDI 后前端 localStorage 会话逻辑删除，改由 Rust 注入 |
| B1-4.5 | **新窗参数化**：`new_window(app, { path?: string })` 扩展签名（现 window.rs:13 无参）；前端 invoke 传 path 用于「再打开文档 → 新窗口」 |
| B1-4.6 | Rust 单测：window.rs/geometry.rs/session.rs 边界用例（label 唯一、脏窗阻止、恢复窗口屏外回退复用） |

### Phase 5 — 打开语义分流（D3）+ 入口重连

| 任务 | 说明 / 锚点 |
|---|---|
| B1-5.1 | 打开核心函数重构：现 `openPathInTab`（3016–3052）/ `handleOpen`（2985–3013）拆为 `openDocument(path, {mode:'replace'|'new-window'})`；mode 由调用方真值表决定 |
| B1-5.2 | 四个同窗加 tab 入口逐个改：pandoc 导入输出 3075、文件树/列表打开（3093 附近、3154 附近）、odoc 事件 3807（→ 现窗口替换 or 新窗，以 Phase 0.6 真值）、最近文件 4392 |
| B1-5.3 | replace 模式 = 现「关当前文档 → 开新文档」：脏文档复用关闭确认；`autoLoadParentFolder` 2976/记录最近/侧栏联动逻辑保持 |
| B1-5.4 | 拖放路径注入（2681–2696）目标改为 openDocument（mode 以真值表定）；CLI/OpenRequest（lib.rs 237–260）同 |

### Phase 6 — 崩溃恢复与杂项语义

| 任务 | 说明 |
|---|---|
| B1-6.1 | recovery UI（Recover/Compare/Ignore，App.tsx 4477–4530）动作保持 documentId 语义；「恢复」触发 = 当前窗口（若空/同文档）或新窗口打开快照（以恢复对话框所在窗口为准，最小改动：当前窗口加载） |
| B1-6.2 | `saveAll`/`reloadFromDisk`/`moveTo`/`trash`/`rename` 等单文档命令过一遍：删除 tab 维度分支（如 saveAll 3471 的多 tab 循环 → 单文档 save；trash 后 3606 ensureOneTab → 关窗语义） |
| B1-6.3 | 状态栏/`msg.newTab` 等提示文案去 tab 化（2971、3644「已重新打开」等） |

### Phase 7 — 测试与合同迁移（矩阵见 §7）

按矩阵逐文件改 + 全量回归。产出：menu/visual/shell-widgets 合同脚本更新版、layout-golden.json 重刷、新增 SDI 行为 e2e（close-requested 拦截、多窗会话、⌘N 新窗）。

### Phase 8 — 验收与发版（ADR-0020）

构建链 `node scripts/build-editor-bundle.mjs && tsc --noEmit && vite build` → jest（涉及包）→ parity 全套（tests/parity/*.mjs）→ visual golden 6 配置人工比对 → e2e 回归（smoke/sidebar/drag-drop/zoom/font/image-upload）→ UX 手动清单（§8）→ 提 PR → CI + Release Packaging 全绿 → `gh release edit` 三步转正（`--draft=false` → `--prerelease=false` → `--latest`）。

---

## 6. 命令 / 菜单 / 键位映射表（v1.4.6 → B1）

> 语义列中「=真值」表示以 Phase 0 实测为准；此处给出**推荐落点**（按 Typora 标签页关闭的 SDI 推断）。

| 现状命令 | 现状语义 / 锚点 | B1 后命令 | B1 后语义（推荐） | 菜单槽（menuSchema.ts） | 键位 |
|---|---|---|---|---|---|
| `file.new` 3882 | 同窗加未命名 tab（handleNew 2955） | `file.new`（保留 id） | **新窗口空白文档**：`invoke('new_window')`（Rust 默认即空白）；非 Tauri 降级 handleNew | file:95 保留 | ⌘N / Ctrl+N |
| `file.newWindow` 3883 | 新窗口（invoke new_window） | 合并或保留 | 若 Phase 0.8 真值 Typora 有独立「新建窗口」→ 保留，否则删菜单槽、命令并入 file.new | file:96（=真值） | ⇧⌘N / Ctrl+Shift+N |
| `file.newTab` 3886 | 同窗加 tab（handleNew） | **删除** | —— | file:97 删 | ⌘T / Ctrl+Alt+T 解除（Phase 0.10 确认参考机无响应则不另绑） |
| `file.open` 3893 | 同窗加 tab（handleOpen 2985） | `file.open` | `openDocument(mode=真值)`（⌘O 第二文档：替换 or 新窗） | file:99 保留 | ⌘O / Ctrl+O |
| `tabs.close` 3910 | 关 tab，兜底 ensureOneTab | **`file.closeWindow`**（D7） | 关当前文档=关当前窗口：dirty 确认 → destroy（B1-4.1 通道）；不再 ensureOneTab | file:117（label 改「关闭窗口」） | ⌘W / Ctrl+W |
| `tabs.closeOthers` 3911 | 关其它 tab | **删除** | —— | 仅 tab 右键（删） | —— |
| `tabs.closeRight` 3912 | 关右侧 tab | **删除** | —— | 仅 tab 右键（删） | —— |
| `tabs.reopenClosed` 3913 | closed 栈重开同窗 tab | `recent.reopenClosed`（改名；closed 栈 app 级）或**删除** | =真值（0.14）。保留则：新窗口打开最近关闭的有路径文档；未命名脏文档不可重开 | file recent 子菜单 101 保留/删 | ⌘⇧T / Ctrl+Shift+T |
| `file.closeAll` 3915 | 关全部 tab → 兜底 1 未命名（handleCloseAll 3625） | `file.closeAll` | =真值（0.11）：关全部窗口（每窗经 CloseRequested 各自确认）。**mac 资源侧已证无此菜单项 → mac 平台菜单项移除（命令保留，防快捷键/Cmd 面板误触发）；Win/Linux 待 0.8 实测** | file:118（mac 条件化） | ⌥⌘W / Ctrl+Shift+W |
| `tabs.next` 3919 | Ctrl+Tab 循环 | **删除** | —— | window:379 删（mac） | —— |
| `tabs.prev` 3920 | Ctrl+Shift+Tab | **删除** | —— | window:378 删（mac） | —— |
| `tabs.showAll` 4204 | overview 弹层 | **删除** | —— | view:354 删 | ⇧⌘\ 解除 |
| `window.close` 3995 | windowService.close | 保留（被 file.closeWindow 复用底层） | 关窗 | （mac 系统/File 菜单，=真值 0.8） | —— |

**mac「窗口」菜单收敛**（D8）：删除 prev/next 后余 predefined（Minimize/Zoom/Bring All to Front 等），最终形态 = Phase 0.9 参考机截图；Win/Linux 维持 B3 结论（无「窗口」顶层菜单）。

---

## 7. 测试与合同迁移矩阵

| 文件 | 行 / 位置 | 迁移动作 |
|---|---|---|
| `packages/app-core/test/tabs.test.ts`（100 行） | 全量 | 重写为 `document.test.ts`（B1-1.2） |
| `packages/commands/test/menu-schema.test.ts` | 86–90 顶层顺序断言 | 去掉 `file.newTab`；`tabs.close`→`file.closeWindow`（D7）；按需调整 file 菜单槽计数 |
| 同上 | 161 recent 子菜单断言 | `tabs.reopenClosed` → 新 id 或删（D5） |
| `tests/parity/verify-menu-contract.mjs` | 159/174/175 期望命令集 | 同步 D7 改名与删除项；新增「禁止 `tabs.*`/`file.newTab` 残留」负向断言 |
| `tests/parity/verify-menu-contract-guard.mjs` | 71–72 防回归样例 | 替换为新的邻近槽位样例（guard 逻辑保持） |
| `tests/parity/verify-shell-widgets.mjs` | 26–50、108 | 删除 tabbar 源码断言段；文件若只剩 tabbar 契约则整体删除，或改校验「titlebar 内无 .tabbar」 |
| `tests/visual/visual-golden.mjs` | 94、147、209–215 | 删 tabbar box 采样与 tabbarH；采样流程去掉「建双 tab」，单文档直采；README.md 同步 |
| `tests/visual/golden/layout-golden.json` | 6 配置 | `tabbarH` → null；重刷并人工比对 |
| `tests/e2e/sidebar-verify.mjs` | 83–95 | desktop-defaults 断言改为 `querySelector('.tabbar')===null`（不再依赖 autoHideTabBar）；**226/233 的 role=tab 是侧栏三段切换钮，与文档 tab 无关，保留** |
| `tests/e2e/capture-window-chrome.mjs` | 61 附近 | 去掉「新建 tab 呈现 tabbar」步骤，改单文档采样说明 |
| `tests/e2e/*`（smoke/theme/zoom/drag-drop 等） | 涉 tab 处 | grep 复核（现仅 sidebar/capture 显式涉 tabbar） |
| `packages/i18n/src/messages.ts` | tab 前缀 34 键（zh，en 同量级） | 删 `tab.*/tabs.*/tabbar.*/menu.tabs.*/menu.file.newTab/menu.file.recentReopen?/settings.editor.autoHideTabBar`；改 `menu.tabs.close`→`menu.file.closeWindow` |
| `packages/settings/src/index.ts` | 112 | 删 `editor.autoHideTabBar`（+ settings 面板条目与测试） |
| `docs/plans/typora-parity-final-plan-v4.md` | §18 变更记录 | 追加 B1/V4.7 行（决策、范围、真值表链接） |

**新增测试**（Phase 7）：SDI e2e——`⌘N 开新窗`、`⌘W 关窗（脏→确认）`、`系统关窗 dirty 拦截（模拟 CloseRequested 事件）`、`两窗会话恢复`、`file.newTab/tabs.showAll 命令不存在`（负向）。

---

## 8. 手动 UX 验收清单（发版前人工过）

1. ⌘N → 新窗口空白文档；⌘W → 关窗（空窗即退出/回到空态按 D9）。
2. 打开 A.md，再 ⌘O 打开 B.md → 行为与 Phase 0.3 真值一致。
3. 侧栏文件树单击另一文档（A 有未保存修改）→ 按真值弹保存确认或新开窗。
4. 红绿灯/✕ 关闭脏文档窗口 → 保存确认弹出，取消可留在窗口。
5. 开 2 窗（A.md、B.md），退出重开 → 按 D1 恢复策略还原。
6. 拖一个 .md 进窗口、Finder 双击第二个 .md → 入口行为正确。
7. 菜单/命令面板/快捷键面板：无任何 `tabs.*`/「新建标签页」残留；⌘T、Ctrl+Tab、⇧⌘\ 无响应（或不冲突）。
8. 设置面板无「单 Tab 时自动隐藏标签栏」；旧值不复活 UI。
9. Golden 视觉：单文档 titlebar/编辑器与 v1.4.6 单 tab 隐藏态逐像素一致（预期零 diff 除 tabbarH 键移除）。

---

## 9. 风险与回滚

| 风险 | 等级 | 缓解 |
|---|---|---|
| 前提错误：参考机 Typora 实际开着标签页 | **高** | Phase 0 Step 0 门禁；触发即 STOP，回炉重评（见 §10 决策 0） |
| localStorage 全窗共享写冲突（`mellow.tabs.session` / 其它 key）在多窗下互相覆盖 | 高 | D6：会话迁 Rust `windows.json`；前端会话键删除 |
| 系统关窗无保存确认（现状缺口）在 SDI 下放大为丢文档 | 高 | D4=A：CloseRequested 拦截 + 自毁 flag 防环（B1-4.1），重点测 mac 红绿灯 / Win ✕ / Cmd+Q 三路 |
| App.tsx 88 处引用改动回归 | 中 | 分 Phase 1→6 顺序执行，每阶段 tsc --noEmit + 相关测试绿再进下一阶段 |
| 命令改名（D7）牵动 menu contract/verify/golden 全链 | 中 | §7 矩阵一次改齐；verify-menu-contract 加负向断言兜底 |
| e2e/Golden 迁移遗漏导致 CI 红 | 中 | Phase 7 先于 Phase 8 验收门；CI frozen-lockfile 纪律（react-dom devDeps 教训：desktop-ui 新测试涉 react 必须同步 package.json + pnpm-lock importers） |
| 多窗口几何/恢复在 Linux 合成器差异 | 低 | 复用 geometry.rs `visible_on_any_screen` 屏外回退 |
| 回滚 | —— | B1 改动全部集中在独立 commit 序列；保留 v1.4.6 tag 为回退点；`mellow.tabs.session` 旧数据被忽略（不迁移），回滚仅需 revert commit 序列即可恢复多 tab |

---

## 10. 待评审决策清单（评审会逐项拍板）

0. **门禁**：先做 Phase 0 Step 0——确认参考机 Typora「启用标签页」状态。若为**开启**：B1 前提不成立，需回到「Tabbar 去留」重新决策（届时提供两条路：对齐 SDI 形态 vs 对齐 Typora 标签栏形态）。
1. D1 会话恢复：P2 全窗口恢复（默认）还是 P1 仅主窗口？
2. D2 状态层：确认 1b 收敛重写（diff 大但干净）。
3. D3 打开语义：待 Phase 0.3–0.7 真值表（预判「按来源分流」：树单击替换 / odoc·⌘N·最近文件·⌘O 依真值）。
4. D4 关闭保护：确认新增 Rust CloseRequested 拦截（A 方案）。
5. D5 reopenClosed：保留（app 级 + 新窗）还是删除？以 0.14 实测为准。
6. D7 命令改名：`tabs.close` → `file.closeWindow`（默认）还是保守沿用 id？
7. D8 窗口菜单：确认删除 prev/next 两槽（mac）。
8. 评审通过后是否按 Phase 1→8 全量执行并走 v1.4.7 发版流程（ADR-0020）。

> 建议节奏：先批 Phase 0（门禁 + 真值表），真值表回填后再批 Phase 1–8 实施。

---

## 11. 决策结果回填（v1.4.7 实施落点，2026-09-05）

> 用户裁决：「mac 为主 + 一次批连续执行至发版」（0.0 门禁按 mac Typora 1.14.9 资源证据推进，见真值表 v1）。实施按 Phase 1→8 顺序收口，关键决策落点：

| 决策 | 落点 |
|---|---|
| D1 会话恢复深度 | **P1**：仅主窗口（label `main`）恢复最后文档，载体保留前端 localStorage `mellow.tabs.session`（键名与旧结构兼容：DocumentState 读取 v≤1.4.6 `{tabs,activeId,closed}` 旧结构）。P2（Rust `windows.json` 多窗口注册表）**延后**——真值表 0.13 未实测（🟡），且 SDI 下多窗口恢复协议风险大，先以主窗口恢复覆盖主要工作流 |
| D2 状态层收敛 | **1b 收敛重写**：`tabs.ts` → `documentState.ts`（`DocumentState` 单文档模型）；删除 tabs[]/activeId/closed 栈/reorder/closeOthers/closeRight/setActive/reopenClosed/多 tab snapshot；`tabs.test.ts` → `documentState.test.ts`（7 用例） |
| D3 打开语义 | **当前窗口替换**（⌘O/最近文件/侧栏/odoc/CLI/拖入/pandoc 导入/wikilink/mdLink）：统一 `guardSingleDocument()`（dirty 确认后替换）；`⌘N` = 新窗口空白文档（`invoke('new_window')`），非 Tauri 回落 handleNew |
| D4 关闭保护 | **A 方案落地**：Rust 每窗口 `CloseRequested` 拦截（`CloseGate` 放行集合）→ `prevent_close` + emit `mellow://window-close-requested` → 前端 dirty 确认 → `allow_close_window` 登记 → 放行。⌘W/删除文档后关窗先 arm 再 close，防二次询问 |
| D5 reopenClosed | **删除**（`tabs.reopenClosed`/⌘⇧T 菜单与命令移除；closed 栈随 DocumentState 收敛一并删除） |
| D6 会话载体 | 前端 localStorage 保留（D1=P1）；Rust 注册表延后 |
| D7 命令改名 | **`tabs.close` → `file.closeWindow`**（⌘W/Ctrl+W）；`file.closeAll` 加 `winLinuxOnly`（mac 无「全部关闭」菜单项，命令保留）；全链（menuSchema/i18n/verify）同步 |
| D8 窗口菜单 | mac「窗口」菜单移除 prev/next 两槽，仅余 Minimize/Zoom |
| D9 空态策略 | Tauri：关闭文档=关闭窗口（最后一窗关闭即退出/回 Dock）；dev/浏览器回落 `ensureBlankDoc()` 空白未命名 |

**i18n 去 tab 化**：`tab.untitled`→`doc.untitled`、`msg.switchedTab`→`msg.openedDoc`、`msg.newTab`→`msg.untitledCreated`、`dialog.closeTabs(,Dirty)`→`dialog.closeDocDirty`（zh/en 同步）。

**会话键兼容**：`mellow.tabs.session` 键名保留（读取旧结构并取 activeId/末尾文档一次性迁移），新写入 `{ tab }` 单文档结构。
