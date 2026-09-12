# Mellow v1.5.7

v1.5.6 之后的收口版本：**补齐 Edit 菜单「新段落 / 新行」**，修复 **3 类 CI 失败**，并为「已修复」项建立运行时审计。

## 新增

- **Edit → 新段落 / 新行（G7-MENU-06）**：官方 Shortcut Keys 表 Edit 段开头两项。
  语义由实测确定 —— Mellow 的 Enter 只插单个 `\n`（Markdown 中是**段内软换行**，
  行高 32px 紧凑），真分段需空行 `\n\n`（行高 38px、段间距 64px）。
  故「新段落」插 `\n\n`、「新行」插 `\n`，**均不复用 Enter**。
  - 不声明快捷键：官方给的 Enter / Shift+Enter 注册为 accelerator 会全局吞掉回车键。
  - Enter 本身不改（输入路径最高风险面 + 列表续写耦合），差异登记为 G7-EDIT-07。

## 修复

1. **parity 护栏在 CI 连挂 4 轮**：台账 evidence 指向被 gitignore 的
   `tests/benchmark/results|reports/`，本机有、CI 没有 → 断言必失败。
   产物改存 `tests/qualification/evidence/`，并加护栏禁止再指向生成目录。
2. **packages 单测失败**：新增菜单项后 `menu-schema.test.ts` 的 Edit 索引断言被挤掉，
   按官方顺序更新并新增顺序锁定。
3. **Windows CI 失败（CRLF）**：`actions/checkout` 在 Windows 以 CRLF 检出源码，
   护栏 `.replace()` 注入锚点含 `\n` → 全部失配（报「注入没有生效」「canary 未武装」）。
   所有护栏的源码读取统一归一化，并加元护栏防止后人再漏。

## 质量基建

- 新增 `tests/e2e/claimed-fixes-verify.mjs`：「已修复」项运行时审计（6 项）。
  本轮三次遇到「结构/单测在、功能不工作」，故不再采信文档，改为实证。
  首轮结果：单图独占居中 / 状态栏开关 / 字数面板**均确实落地**。
- `runtime-qualification.yml` 增加 **v* 标签自动触发**：ADR-0022 要求 Windows / Linux
  Runtime 证据以该 workflow 为正式来源，此前需人工点按，改为随发版自动运行。

## 已知未闭环（Release Gate 仍 NO-GO）

P0-EDITOR-004（原生 IME）、P0-PERF-001（性能）、P0-PLATFORM-001（三平台 Runtime）、
P0-QA-001（UX Score / 30 任务）、P0-EDITOR-005（拼写词典，需 host-api）、
P0-LAYOUT-002（三平台视觉 Golden）—— 均依赖真机 / CI / host-api，本环境无法闭环。
