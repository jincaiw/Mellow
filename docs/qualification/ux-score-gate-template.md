# 阶段 5 真实发布门禁执行模板（UX Score + 30 任务效率 Gate）

> 依据：PRD §130-§132、ADR-0020（pre-release → V1.0 需 18 项全 PASS）、Typora parity master plan §14。
> 状态：⏳ 模板就绪，待三平台真机执行（需要 Windows/Linux 机器与 Typora 1.14.9 对照）。
> 原则：所有得分必须来自对照实测（同机器、同文档、同任务），不采信自评。
> 基线：Typora 1.14.9（build 7785）为规范验收版本；1.14.6 仅作历史参考。

## 一、UX Score（PRD §131，满分 100）

### 评分表
| 模块 | 权重 | 实测得分 | 证据（任务/截图/耗时） |
|---|---|---|---|
| Live Editing | 25 |  |  |
| Caret / IME / Undo | 15 |  |  |
| Markdown | 10 |  |  |
| Table / Image | 10 |  |  |
| Files / Search / Outline | 10 |  |  |
| Desktop UI | 10 |  |  |
| Clipboard | 5 |  |  |
| Export | 5 |  |  |
| Performance | 5 |  |  |
| File Safety | 5 |  |  |
| **合计** | **100** |  |  |

### Release 门槛
- 总分 ≥ 92；
- Live Editing ≥ 24/25；
- Caret/IME/Undo = 15/15；
- File Safety = 5/5。

> ⚠️ **分数必须写进记录的 `uxScore` 字段，本表只是摘要**（2026-09-30 起）：
> `ux-gate-recorder.mjs validate` 会**机器校验**上述四条门槛 ——
> `uxScore` 缺失、模块分越界、或任一门槛不达标都会**拒绝该记录**。
>
> 立此校验的原因：此前 UX Score **只存在于本文档的 Markdown 表**，记录器 schema 里没有它
> → 一份**只含 120 条计时、完全没有 UX Score** 的记录也能满足 `ux-gate` 证据标记，
> **PRD §131 的「总分 ≥92」门槛可被静默跳过**。
>
> 字段形态：`uxScore: { modules: { liveEditing: 24, caretImeUndo: 15, markdown: 10,
> tableImage: 10, filesSearchOutline: 10, desktopUi: 10, clipboard: 5, exportScore: 5,
> performance: 5, fileSafety: 5 }, evidence: ["…"] }`（键名见记录器 `UX_MODULES`）。

## 二、30 个核心 Typora 任务效率 Gate（PRD §132）

### 执行方法
1. 同一台机器、同一份测试文档（tests/fixtures/），Typora 1.14.9 与 Mellow 各做一遍；
2. 每任务记录：完成时间（秒）、错误（0/1）、步骤数、主观评分（1-5）；
3. 换顺序再做一轮（消除熟练度偏差），取均值；
4. 要求：≥90% 任务完成时间 ≤ Typora+5%；任一关键任务不慢 >15%；错误率不高于 Typora；IME corruption=0；data loss=0。

### 记录与校验

空白记录已生成（**含当前 commit**）：`docs/qualification/evidence/macos-ux-gate-DRAFT.json`。
**该文件已预置 120 条观测骨架** —— `task` / `app` / `round` 已生成，`appOrder` 已按交替规则算好，
**你只需补测量值**（`durationMs` / `error` / `steps` / `subjectiveScore` / `evidence` /
`entryPoint` / `sourceDiff`），**不要改结构**。骨架里**不含任何数值**，故不可能把占位值误当读数；
填完重命名为 `macos-ux-gate-<date>.json` 再校验。
（`ux-gate-recorder.mjs init` 拒绝覆盖已存在文件，故不要重复 init。）

```bash
# 中途随时查看进度（只读，不判定、不因未填完而失败）
node tests/qualification/ux-gate-recorder.mjs progress \
  --input docs/qualification/evidence/macos-ux-gate-DRAFT.json

# 120 条填完并改名后校验（计算 PRD §132 的 +5% / 关键任务 +15% / 错误率 / 主观评分 Gate）
node tests/qualification/ux-gate-recorder.mjs validate \
  --input docs/qualification/evidence/macos-ux-gate-<date>.json
```

`progress` 会报告：已填写完整条数、字段不完整的条目（指明缺哪个字段）、未填条目、
以及 **appOrder 交替规则**（同一轮内 typora/mellow 顺序必须一致；两轮之间必须交换）。
`validate` 要求 30 × 2 app × 2 round 共 120 条记录、每任务两轮交换 app 顺序、
截图/视频/日志证据、IME/data-loss 明确为零。

> ⚠️ **`DRAFT` 文件是未填写的草稿，不得作为证据登记**：它的 `tester`/`machine` 仍是
> `REPLACE_WITH_*` 占位符，`validate` 会直接拒绝。登记进台账前必须由真人填写并改名。

### 任务清单
| # | 任务 | T-R1 | T-R2 | M-R1 | M-R2 | 误差% | 错误 | 评分 |
|---|---|---|---|---|---|---|---|---|
| 1 | 启动 → 新建文档 → 输入标题 → 保存 |  |  |  |  |  |  |  |
| 2 | 双击打开 .md → 编辑一段 → 保存 |  |  |  |  |  |  |  |
| 3 | 打开文件夹 → 文件树浏览 → 切换文件 |  |  |  |  |  |  |  |
| 4 | Quick Open（Ctrl/Cmd+P）模糊搜索打开 |  |  |  |  |  |  |  |
| 5 | 全局搜索关键词 → 跳转 |  |  |  |  |  |  |  |
| 6 | 文档内查找 → 下一处 → 替换一处 |  |  |  |  |  |  |  |
| 7 | 粗体 / 斜体 / 删除线（快捷键） |  |  |  |  |  |  |  |
| 8 | 链接插入（Cmd/Ctrl+K） |  |  |  |  |  |  |  |
| 9 | 无序/有序列表输入与缩进 |  |  |  |  |  |  |  |
| 10 | 任务列表勾选 |  |  |  |  |  |  |  |
| 11 | 插入表格 → Tab 遍历 → 加行 → 对齐 |  |  |  |  |  |  |  |
| 12 | 粘贴截图 → 保存到 assets → 相对路径 |  |  |  |  |  |  |  |
| 13 | 浏览器富文本 → 智能粘贴转 Markdown |  |  |  |  |  |  |  |
| 14 | 复制 → 粘贴到 Word（富文本） |  |  |  |  |  |  |  |
| 15 | 复制 → 粘贴到 VS Code（Markdown） |  |  |  |  |  |  |  |
| 16 | 内联数学 → 渲染 → 再进入编辑 |  |  |  |  |  |  |  |
| 17 | Mermaid 代码块 → 渲染 → 修正错误 |  |  |  |  |  |  |  |
| 18 | 脚注插入 → 点击跳转 → 返回 |  |  |  |  |  |  |  |
| 19 | [TOC] → 点击跳转 |  |  |  |  |  |  |  |
| 20 | 大纲面板 → 当前标题高亮 → 点击跳转 |  |  |  |  |  |  |  |
| 21 | Focus Mode（F8）5 分钟连续写作 |  |  |  |  |  |  |  |
| 22 | Typewriter Mode（F9）5 分钟连续写作 |  |  |  |  |  |  |  |
| 23 | 源码模式（Ctrl/Cmd+/）切换往返 |  |  |  |  |  |  |  |
| 24 | 主题切换（亮/暗/跟随系统） |  |  |  |  |  |  |  |
| 25 | 导出 PDF（中文+图片+表格+公式+Mermaid） |  |  |  |  |  |  |  |
| 26 | 导出 HTML（带主题） |  |  |  |  |  |  |  |
| 27 | 打印（Ctrl/Cmd+P） |  |  |  |  |  |  |  |
| 28 | 外部修改（干净）→ 自动重载 |  |  |  |  |  |  |  |
| 29 | 外部修改（dirty）→ 冲突对话框处理 |  |  |  |  |  |  |  |
| 30 | 10MB 文件打开 → 搜索 → 编辑 → 保存 |  |  |  |  |  |  |  |

### 通过判定
- 统计：≥27/30 任务 ≤ Typora+5%；
- 关键任务（表格/图片/PDF/IME/保存）无一慢 >15%；
- 错误率 ≤ Typora；IME corruption=0；data loss=0；
- 主观评分均值 Mellow ≥ Typora。

## 三、执行前必读：两项已知障碍

### 3.1 ⚠️ 任务 30 在 Typora 侧**无法执行**（需先裁决）

任务 30 是「10 MB 文件打开 → 搜索 → 编辑 → 保存」，但 **Typora 1.14.9 不渲染
超过 2,000,000 字符的文档** —— 它对 10MB 只显示「该文件过大，因此无法在 Typora 中呈现」
提示页，既不渲染也不可编辑。

一级证据：`TypeMark/appsrc/window/frame.js` 的 `tryEnterOversize` 判定
`e.length > File.MAX_FILE_SIZE`，且同文件 `MAX_FILE_SIZE: 2e6`；
实测边界 1,900,000 字符正常渲染 / 2,100,000 字符为提示页。
详见 `tests/qualification/evidence/2026-09-23-typora-render-limit-2mb.md`。

**因此任务 30 的 Typora 两轮无法产生有意义记录。** 在裁决前不要为该任务编造 Typora 侧
数据（本门禁明令禁止伪造计时）；建议的处置是二选一：

- 把任务 30 的对照尺寸改为 ≤2MB（Typora 侧可执行），另立一条「>2MB 能力差异」的
  **非对照**观察项；
- 或任务 30 只评 Mellow 绝对指标，Typora 侧记「不适用」并说明原因。

### 3.2 环境前置

- **输入源须为键盘布局（如 ABC）**：IME 类任务另需按 `docs/specs/ime-test-plan.md`
  准备中文/日文输入源；若会话中途输入源被切成 IME，非 IME 任务的耗时会被候选窗干扰。
- **屏幕不得锁定/屏保**：锁定状态下任何应用都无法成为前台，截图与「外部修改重载」
  一类任务会得到静止画面。
- **同一台机器、同一份文档**：对照必须在同机同文档下进行（PRD §132）。

## 四、证据要求

> ⚠️ **以验证器的要求为准**（2026-09-30 对齐）：`ux-gate-recorder.mjs validate` 要求
> **每一条观测**（30 任务 × 2 应用 × 2 轮 = **120 条**）都带至少一项证据
> （截图 / 视频 / 日志路径）。本节原写「每**任务**附关键截图」（30 份）——
> 照那样做的人会在**几小时后**校验时才撞墙。**请边测边存证据，别等到最后。**

- **每平台**一份记录（`macos-ux-gate-*.json` / `windows-ux-gate-*.json` / `linux-ux-gate-*.json`）；
- **每条观测**至少一项证据（`evidence` 为非空数组，路径可指向截图/视频/日志）；
- 本表（Markdown）是**摘要**，`*.json` 记录才是**证据本体**（`validate` 只认它）；
- 三平台全部通过 + 其余 18 项验收全 PASS 后，才生成 V1.0 Release Notes（ADR-0020）。

## 五、更新记录
- 2026-08-18：创建模板（待真机执行）。
- 2026-09-30：UX Score 纳入记录器**机器校验**（缺 `uxScore`、模块越界、任一门槛不达标即拒绝）——
  此前它只在 Markdown 表里，`ux-gate` 证据可**不含 UX Score** 而照常通过。
- 2026-09-30：`init` 改为生成 **120 条观测骨架**（结构 + `appOrder` 已算好，**不含任何测量值**）。
  原先 `observations: []` 要求人工手写 120 条 × 8 字段的 JSON，且草稿无结构示例 ——
  既是巨大时间成本，也是错填高发区。骨架自检（条数 / 顺序规则 / 不得含测量字段 /
  未填必须被 validate 拒绝）已随 `--self-test` 挂在 parity 与 test 两条链上。
- 2026-09-25：① 记录与校验改为使用已生成的空白记录 `docs/qualification/evidence/macos-ux-gate-DRAFT.json`
  （含当前 commit），并新增 `progress` 中途进度报告（只读，不判定）；② 新增「执行前必读」
  一节，登记**任务 30 在 Typora 侧无法执行**（>2MB 拒渲染）与环境前置（输入源、锁屏）；
  ③ 修正 `init` 的落点目录此前不存在的问题（`docs/qualification/evidence/` 已创建）。
