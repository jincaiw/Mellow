# Mellow v1.5.6

v1.5.5 之后的 Typora 对标收口：**修复 2 个「结构在、功能死」类真 bug**，补齐一批**运行时证据**（此前只有静态护栏），并修正台账 / 文档中的失真记录。

## 修复

### 1. 浮动编辑器工具栏永不显示（V7-W2.4）

- 现象：选中文本时工具栏**元素在、10 个按钮在，但 `display` 恒为 `none`** —— 即 Typora 的「浮动格式工具栏」完全不可用。
- 根因：`position()` 内部调用 `view.coordsAtPos()`，而 **CodeMirror 6 禁止在 update 周期内读取布局**（抛 `Reading the editor layout isn't allowed during an update`）；异常被 `getAnchor` 的 `catch` 静默吞掉并返回 `null` → 立即 `hideEl()`；此后 `visible=false`，`update()` 不再重定位 → **永不显示**。
- 修复：新增 `schedulePosition()`，把定位推迟到 update 周期之外（`requestAnimationFrame`；无 rAF 环境退化同步定位以兼容单测），`destroy()` 取消待执行帧。
- 实测：修复后工具栏 `300.7×34` 可见；点击「加粗」真的把选中文本变成 `**hello**`。
- 为何此前没暴露：结构契约与纯函数单测（`shouldShowToolbar`）都是绿的，但没有任何测试验证「工具栏真的出现」。

### 2. 表格列对齐分隔符连字符被侵蚀

- 现象：`| --- |` → 居中 → `| :--: |` → 左对齐 → `| :-: |`，**每切换一次对齐少一个连字符**，继续切换会得到非法的 `::`。
- 根因：`setColumnAlignment` 用固定 2 连字符的 `mark`（`:--:` / `--:` / `:--`）再 `slice` 拼装，**丢弃了原始连字符长度**。
- 修复：保留原连字符数（`---` → `:---:` → `:---`）。
- 为何此前没暴露：既有单测只断言**解析后的对齐语义**，而 `:--:` 与 `:-:` 解析结果相同 —— 语义正确、字面却在退化。另有一条既有测试（`table-large.test.ts`）把 bug 的产出 `:--:` 固化成了期望值，已一并更正。

## 新增运行时验证（此前只有静态护栏）

| 脚本 | 覆盖 | 结果 |
|---|---|---|
| `tests/e2e/feature-liveness-verify.mjs` | 25 项命令的真实效果（水平线 / TOC / 脚注 / 高亮 / 数学 / Mermaid / Focus 模式 / 拼写检查开关 …） | 25/25 |
| `tests/e2e/mouse-selection-verify.mjs` | 鼠标选择矩阵：单击 / 双击选词 / 三击选行 / 拖拽 / Shift 扩展 | 7/7 |
| `tests/e2e/ux-flows-verify.mjs` | Command Palette（240 候选项）/ Quick Open / 全局搜索 / Slash / 源码模式往返 | 9/9 |
| `tests/e2e/widget-buttons-verify.mjs` | 工具栏按钮**真的产生编辑效果**（Bold / 对齐 / 增删行列 / Tidy / 删表） | 9/9 |
| `tests/e2e/context-menu-verify.mjs` | 右键菜单端到端（一级 7 项 +「格式」子菜单 → 加粗生效） | 4/4 |
| `tests/e2e/ime-composition-verify.mjs` | IME 合成（含**表格单元格内**中文输入不撕裂列结构） | 8/8 |
| `tests/visual/scenes-golden.mjs` | §9.3 视觉 Golden 补齐 7 个场景（首次启动 / 单文档 Live / File List / Settings / Selection Toolbar / Table Toolbar / Reader） | 7/7 |

macOS 侧 **§9.3 的 14 场景现已全覆盖**（visual-golden 6 + sidebar-golden 4 + scenes-golden 7）。

## 质量基建

- **官方快捷键表真值合同**（`verify-menu-contract.mjs` §11，55 条键位）：键位真值由护栏守卫，不再只存在于不进 CI 的 e2e 中。据此抓到 2 条**过期断言**长期挂红。
- **补齐 Windows CI**：`ci.yml` 此前 6 个 job 全跑 `ubuntu-latest`、**没有 Windows runner**，与 ADR-0022「Windows 以 CI 为正式证据来源」冲突；新增 `windows-parity-guard`，并立不变量（缺 `windows-latest` 即失败）。
- **视觉 Golden 基线按平台分离**（`tests/visual/golden-path.mjs`）：基线是布局测量值，依赖平台字体度量与 DPI，跨平台共用必然失配 → 改为 macOS 主基线 + `*-golden.linux.json` / `*-golden.windows.json`；`runtime-qualification.yml` 的 Linux / Windows job 已加入采集。
- **证据词汇统一**：台账 `requiredEvidence` 禁用裸 `windows` / `linux`（在该裁决下不可满足，会变成永远关不掉的假门禁），统一为 `macos` / `windows-ci` / `linux-ci`。

## 台账与文档修正（失真治理）

- `P0-SHELL-003`：补记浮动工具栏缺陷与修复（此前状态为 `AUTO`，实际功能不可用）。
- `P0-EDITOR-005`：**收窄**缺口 —— 实测系统拼写检查（红色下划线）已真实接线并可调（`spellcheck` 属性 `true↔false`），缺的只是词典与右键建议列表（需 host-api 扩展），而非「拼写检查本身不工作」。
- `P0-EDITOR-003` / `P0-TABLE-001/002` / `P0-MENU-003`：补入鼠标选择、表格按钮、右键菜单的运行时证据。
- 主方案回填：§3.10（Articles Golden）、§4.5（鼠标选择矩阵）、§4.9（对齐侵蚀修复）、§5.2 G7-KEY-07（Find Next 别名复核）、§9.3（平台化基线）。

## 已知未闭环（Release Gate 仍为 NO-GO）

发布门禁仍判定 **6 项未闭环**，均为环境 / 资源限制，非代码缺陷：

| 项 | 卡点 |
|---|---|
| `P0-EDITOR-004` 原生 IME | 需真机（本机 macOS 实机矩阵未执行） |
| `P0-PERF-001` 大文件性能 | 冷启动带文件 N=3：1MB 与 Typora 持平（0.97×），10MB 约 2.59× —— 已定位为真实优化项，未擅自改动大文件架构 |
| `P0-PLATFORM-001` 三平台 Runtime | 需 Windows / Linux CI 运行证据 |
| `P0-QA-001` UX Score 30 任务 | 工具按设计只接受人工记录，禁止自动生成计时 |
| `P0-EDITOR-005` 拼写建议 | 需 host-api 暴露平台拼写服务 |
| `P0-LAYOUT-002` Win/Linux Golden | 采集已接入 CI，首次运行后需提交基线入库 |
