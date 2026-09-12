# SDI 真值表 v1（B1 Phase 0 交付物）

- 状态：**草稿 v1**（macOS 证据已回填；Windows/Linux 与参考机偏好项待实测，标记 🟡）
- 来源 A：`tests/benchmark/fixtures/typora-menu-dump.txt`（macOS Typora **1.14.9 / build 7785**，2026-09-04 真机提取，含 Menu.strings + MainMenu.nib + frame.js 校验和）
- 来源 B：公开资料（2026-09 检索，厂商社区/文档，标注 🟠）
- 来源 C：用户参考机实测（**待执行**，步骤见 §2 复核脚本）

图例：✅ 可定论（A/B 证据）｜🟡 需参考机实测（C）｜🟠 公开资料推断（B，默认值）

---

## 1. 真值行（对应 typora-parity-b1-sdi-plan.md §3 的 0.0–0.14）

| # | 复核项 | 结论 | 证据 / 依据 | 对 B1 的影响 |
|---|---|---|---|---|
| 0.0 | 参考机「启用标签页」状态 + 顶部标签栏可见性 | 🟡 **门禁项**。macOS 1.14.9 资源里仅 1 处 tab 字符串（`New Tab=>新建标签页`，dump L256），nib 含 `newTab:` 动作（L737）→ mac Typora **具备**新建标签能力；但偏好面板字符串不在 Menu.strings 范围，**默认开/关无法由此定论**。公开资料指偏好→外观→「启用标签页」（🟠） | A：L256、L737 | 若参考机标签页=开启 → B1 前提不成立（见方案 §10 决策 0） |
| 0.1 | ⌘N（Win Ctrl+N）新建文档落点 | 🟡（mac 侧推断：nib 同时含 `newWindow:`，且**无**区别于 New 的独立动作线索；Typora 传统 ⌘N=新窗空白文档）。⌘N 的 keyEquivalent 无法从 dump 提取（keyEquiv 存 nib 但本 dump 未导键位），需实测 | A：`newWindow:` L589 | 决定 `file.new` 是否=新窗口（§6 命令表） |
| 0.2 | ⌘W（Win Ctrl+W）语义 | ✅ **macOS：Close=关窗口（performClose:），非关标签**；SDI 模型 + 脏文档由 Typora 自处理提示。dump 无独立「Close Tab/关闭标签页」文案与动作。Windows 待实测（🟡） | A：`Close` L254-258、`performClose:` L258 | 支撑 D4（⌘W=关窗需 CloseRequested 保护）与 D7 改名 `file.closeWindow` |
| 0.3 | ⌘O 打开第二文档：替换 / 新窗 / 新标签 | 🟡（mac 资源证明存在 `newTab:` 通道，文件树/⌘O 是否走它取决于 Typora 内部策略，dump 无法判定） | A：`newTab:` L737 | D3 主分叉 |
| 0.4 | 最近文件点击落点 | 🟡 同 0.3 逻辑 | — | D3 |
| 0.5 | 侧栏文件树单击落点 | 🟡 | — | D3（预判：替换当前窗口） |
| 0.6 | Finder/资源管理器双击第二个 .md | 🟡（单实例 IPC 重定向；落点是新标签 or 新窗取决于启用标签页状态与 Typora 策略） | B（🟠） | D3 / Rust odoc |
| 0.7 | 拖 .md 进窗口 | 🟡 | — | D3 |
| 0.8 | File 菜单完整截图（mac + Win） | mac 资源侧可定论部分：菜单含 New / New Window / New Tab / Open / Open Recent / **Reopen Closed File（`reopenClosedFilesMenu:`）** / Close / Save / Save All（`saveAllDocuments:`）…；**无「Close All/全部关闭」文案与动作 → mac 文件菜单没有「全部关闭」**（与 Mellow 现 file.closeAll ⌥⌘W 三平台都有不一致）。完整菜单层级与 Win 端 🟡 | A：`reopenClosedFilesMenu:` L759、`saveAllDocuments:` L643、dict L31/176-180/223/232/234；搜遍 L382-1489 无 closeAll | mac 删除 file.closeAll 菜单项（命令保留或随平台条件渲染）；Win/Linux 依 0.8 实测 |
| 0.9 | mac「窗口」菜单截图 | 🟡 运行时项（`_NSWindowsMenu` L1100 为系统窗口菜单；「显示上一个/下一个标签页」由 AppKit 按 window tabbing 模式运行时注入，nib 不含） | A：L1092-1100 | D8（Mellow mac 窗口菜单手工加 prev/next 无 Typora 依据 → 倾向删除） |
| 0.10 | ⌘T / ⌘⇧T / Ctrl+Tab 响应 | 🟡 mac ⌘T 大概率=新建标签页（nib 有 newTab:）；⌘⇧T 若=Reopen Closed File 需实测；Ctrl+Tab/Ctrl+Shift+Tab 传统=mac 窗口/标签切换，Mellow 现绑定的循环语义无 Typora 佐证 | A：`newTab:` L737 | 键位释放/重绑 |
| 0.11 | 「全部关闭」（若有）是否退出应用 | 🟡 mac 侧**无此项**（见 0.8）；若 Win 有，实测是否连窗口带 app 一起退 | — | file.closeAll 实现 |
| 0.12 | 关闭全部窗口后 Dock/任务栏点击 | 🟡 | — | D9 空态策略 |
| 0.13 | 重启恢复：2 个有路径文档 + 1 个脏未命名 | 🟡（macOS 系统「退出时恢复窗口」与 Typora 自管会话并存，实测为准） | — | D1（恢复深度） |
| 0.14 | 「重新打开关闭的文件」菜单位置与作用域 | mac 侧定论存在该动作；归属菜单（File 顶层 or Open Recent 子菜单）与是否跨窗口 🟡 | A：`Reopen Closed File` L74-76、L759 | D5（closed 栈 app 级化） |

**已定论结论汇总（macOS Typora 1.14.9）**
1. ⌘W = 关闭**窗口**（`performClose:`），无「关闭标签页」概念 → B1 的 D4/D7 成立。
2. mac File 菜单**无「全部关闭」** → Mellow mac 的 closeAll 菜单项需条件化/移除；Win/Linux 待实测。
3. Typora **确实存在** New Tab / New Window / Reopen Closed File / Open in New Window 四个窗口/标签级动作 → 「SDI 无任何多文档能力」的说法不成立；正确表述是「默认单窗口单文档 + 可选标签/新窗通道」，这使 B1 的真实约束变为「标签页偏好关闭时，Mellow 应呈现纯 SDI」，而非「Typora 不存在标签页」。

---

## 2. 参考机复核脚本（用户执行，约 3–5 分钟）

### 必做（门禁 0.0，mac 与 Win 参考机各一次）
1. 打开 Typora → 偏好设置（⌘, / Ctrl+,）→ 外观/通用页截图。
   - 找「启用标签页 / Open new files in tabs / Tab bar」类开关，记录开/关。
2. 顶部：当前是否可见标签栏？开 2 个文档后标签栏是否出现？
3. 回填 §3 表 → 0.0 状态。

### mac 参考机（每项一句话结果 + 可选截图）
- 0.1 ⌘N 后：新窗口？当前窗口被替换？
- 0.2 打开文档改脏 → ⌘W：弹保存框？关的是窗口？
- 0.3 ⌘O 开第二文档：出现在新窗口 / 当前窗口 / 新标签？
- 0.5 侧栏文件树单击另一文件（当前有文档时）
- 0.8 文件菜单整菜单截图（含全部快捷键）
- 0.9 窗口菜单整菜单截图
- 0.10 依次按 ⌘T、⌘⇧T、Ctrl+Tab、Ctrl+Shift+Tab，记录有无反应及结果
- 0.13 开 A.md + B.md（两窗）+ 一个脏未命名 → ⌘Q → 重开：恢复成什么样？
- 0.14 关一个文档后，File 菜单里找「重新打开关闭的文件」的位置；作用到新窗口还是原窗口？

### Win/Linux 参考机（若可得，重点项）
- 0.0 同门禁；0.2 Ctrl+W；0.8 文件菜单截图（确认有无「新建标签页 / 新建窗口 / 全部关闭」）；0.13 恢复行为。
- B3 已定：Win/Linux 无「窗口」顶层菜单（前轮真机 dump 佐证，不必重测）。

---

## 3. 回填登记（实测后在此追加，逐条 ⚑ 结论 + 截图路径）
（待回填）

---
*生成：2026-09-05 17:40（macOS 1.14.9 dump 证据回填）；来源 A 行号均指 `tests/benchmark/fixtures/typora-menu-dump.txt`*
