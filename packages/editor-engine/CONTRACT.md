# CONTRACT — `@mellow/editor-engine`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。
> 本包是**最大、不变量最多**的包，因此本文件也最长。

## 1. 职责与边界

- **属于本包**：编辑器的**行为层**（对 vendored `editor-core` 的**注入式扩展**）——
  Live Markdown（marker reveal）、格式命令、表格、图片、数学/图表/告警/脚注/目录、
  IME 守卫、大文件降级、剪贴板智能粘贴、选中工具栏、源码/聚焦/打字机模式、引擎侧文案。
- **不属于本包**：内核本身（vendored `editor-core`，`UPSTREAM.md` 只读，**不得 fork**）、
  宿主装配（`editor-react`）、宿主能力（`host-api`）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**46** 个源文件）。关键面：`plugin.ts`（扩展装配）、`state.ts`、
  `config.ts`、`types.ts`、`nodes.ts`、`mdTokens.ts`、`safeHtml.ts`、`engineI18n.ts`、
  `largeFile.ts`、`inputLatency.ts`、`platformNav.ts`、`selectionCommands.ts`
- 跨包导入走**相对路径**（`name`/`main` 装饰性）—— 见审计 §4.95。

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **caret 边界语义有两族且不得合并**：**含边界**（`inlineExtras`/`kbdCaps`/`mdLink`/`wikilink` ⇒ caret 紧贴定界符**显示源码**）vs **严格内**（`math`/`mermaid`/`toc`/`githubAlerts`/`footnote` ⇒ **不显示**） | `test/widget-state-matrix.test.ts` 的 `boundaryReveals` + `verify-parity-ledger.mjs`（9 个文件按家族锁定） |
| **md token 两端同锁**：`--mellow-md-*` 必须同时在本包 `mdTokens.ts` 与 `packages/themes` 基表 | `verify-parity-ledger.mjs` R1–R3 |
| **`safeHtml` 是安全白名单的真值源**；导出侧白名单必须 ⊇ 它 | 同上（子集判据） |
| **剪贴板智能粘贴的「有效顺序」** ⇄ `docs/specs/clipboard-smart-paste-spec.md` §3 | `tests/parity/verify-clipboard-contract.mjs`（ADR-0030） |
| **大文件阈值**：**严格大于** `>5MB` / `>50,000 lines`（PRD §109） | `verify-parity-ledger.mjs`（PRD ↔ `largeFile.ts` ↔ benchmark 三方一致） |
| **引擎侧文案必须走 `tEngine()`**：无硬编码中文 / 键可解析 / 两 locale 齐备且不与 `packages/i18n` 重叠 / 接线链完整 | `verify-i18n-contract.mjs` E1–E4（ADR-0028） |
| **语义状态色**（如断链指示）必须带非颜色线索 | `verify-no-color-only-status.mjs`（`mdLink.ts` 的内联 `var()` 也在扫描面内） |
| **输入延迟埋点**可被真机读出（`frameMs` 等） | `test/input-latency.test.ts` + W-PERF-1 的交叉验证（ADR-0026） |
| 表格编辑/键盘/大表/列宽/撤销 的语义 | `test/table-*.test.ts`（12 个文件） |
| 平台导航键位正确 | `test/platformNav.test.ts` |
| 选中工具栏 / 斜杠命令 / 右键菜单 | `verify-shell-widgets.mjs`、`verify-context-menu-parity.mjs`、`test/selectionToolbar.test.ts`、`test/slashCommands.test.ts` |

## 4. 错误语义

- 渲染类失败**必须降级为源码/占位**而非崩溃（`test/invalid-fallback.test.ts`）。
- 公式/图表渲染失败要有**可见提示**（`reader.math.render.error` 等键已在目录中；
  ⚠️ 该键当前**未被消费**，见审计 §4.102 的 `MESSAGES_UNUSED`）。
- 图片 widget：**光标/选区碰到节点 ⇒ 显示源码、不渲染 widget**（`image/widget.ts`）——
  写断言前必须先确认光标是否抑制渲染。

## 5. 性能边界

- **CM6 update 周期内禁止读布局**（`coordsAtPos` 等）—— 会强制同步布局。
- 输入延迟目标（PRD §110，**16ms**）的判定口径见 ADR-0026（**热打开**口径，判定量
  `hotopen.switchMs`；16ms 目标**原理性不可判定**）。
- 大文件模式由 `largeFile.ts` 判定并降级（阈值是宪法条款，见 §3）。
- 表格/图片扫描对大文档需有上限（见 `test/table-large.test.ts`、`image-scan`）。

## 6. 禁止行为

- ❌ **fork vendored `editor-core`**（`UPSTREAM.md` 只读；改动必须登记）。
- ❌ 把两个 caret 家族的判定**合并去重**（**会静默改掉 math/mermaid 行为** —— 见审计 §4.71）。
- ❌ 在引擎里硬编码中文文案（E1 会拦）。
- ❌ 新增 `var(--mellow-X, …)` 而不让 X **可达**（R1 会拦：前缀是 md 但两端都没定义 ⇒ 恒取 fallback）。
- ❌ 让引擎直接读宿主的非 md 变量（iframe 拿不到 ⇒ 恒取 fallback；要读就必须拓宽 token 桥，属设计决策）。
- ❌ 只靠颜色传达状态（`verify-no-color-only-status.mjs`）。
- ❌ 在测试里**伪造计时**（UX Score 只接受人工记录，`ux-gate-recorder.mjs` 会拒）。

## 7. Typora parity reference

- Live Markdown / 格式命令 / 表格 / 图片 / 数学 / 图表 / 告警 / 脚注 / 目录 / 斜杠命令的行为对照：
  `docs/plans/typora-parity-master-plan.md` §3 真值表 + `docs/specs/` 下各 spec
  （`live-markdown-engine-spec` / `table-editing-spec` / `image-workflow-spec` /
  `clipboard-smart-paste-spec` / `performance-benchmark-spec`）。
- 一级证据：本机 Typora 1.14.9 的 `main.js`（行为）与主题 CSS（排版）。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- 夹具在**仓库级** `tests/fixtures/`：`markdown/` / `toc/` / `alerts/` / `footnote/` / `math/` /
  `mermaid/` / `yaml/` / `html/` / `clipboard/`；`test/state-matrix` 与
  `test/widget-state-matrix` 内含**行为矩阵**语料。

## 9. 测试入口

- `test/` 下 **79** 个测试文件（本仓最大）
- 护栏：`verify-adapter-contract.mjs`、`verify-clipboard-contract.mjs`、`verify-i18n-contract.mjs`、
  `verify-parity-ledger.mjs`、`verify-no-color-only-status.mjs`、`verify-shell-*.mjs`、
  `verify-settings-contract.mjs`、`verify-tauri-command-contract.mjs`、`verify-package-conventions.mjs`
