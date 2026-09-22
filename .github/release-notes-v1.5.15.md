# Mellow v1.5.15

## 本次发布

本版本是**资格验证（Qualification）修复版**，用于在真实 runner 上验证跨平台视觉采集链路。

- 新增 `tests/visual/dev-server.mjs` 跨平台 dev server 启动器：Windows 上 `npx` 实际是
  `npx.cmd`，Node 的 `spawn` 无 shell 时抛 ENOENT —— 这是 Windows §9.3 视觉采集
  **长期静默产出 0 个基线文件**的根因。启动器同时保留 spawn 失败原因，把
  「无法定位的超时」变成「指名原因」。
- Runtime Qualification 的视觉采集步骤改为**逐条记录退出码**：原先三条 `node …` 串行
  执行，步骤退出码只取最后一条命令，前面的失败会被掩盖（bash `-e` 下更会直接跳过后续脚本）。
- 三处视觉脚本的「实测 vs 期望」硬断言**提到基线写入之前**：原先首次采集不校验，
  会把「字号/行高/写作宽度错」「侧栏没渲染」「退役选择器复活」直接烘进基准，
  此后比对永远绿 —— 即把功能不工作固化成基准。
- 侧栏默认宽度新增与 `App.tsx` `SIDEBAR_DEFAULT_WIDTH` 的单一真源交叉比对。
- Linux 布局基线 `tests/visual/golden/layout-golden.linux.json` 校验后入库（6 配置，
  实测值与期望逐项一致）→ Linux 布局漂移自下次运行起受门禁保护。
- 修复 `sidebar-golden` / `drag-drop-verify` 的 `window.prompt` 残留（真实回归）：
  commit `5cb37df`（G7-EDIT-10 收尾）把 9 处 `window.prompt` 迁到应用内 `askInput()`，
  但漏改这两个既有消费者，它们仍用 `page.on('dialog', …).accept()` 应答 ——
  该事件迁移后**永不触发**，于是「mock workspace 构建失败」静默腐烂。
  新增共享驱动 `tests/shared/in-app-dialog.mjs`，两者统一改用它；
  `verify-shell-widgets.mjs` 锁反例（不得再用 dialog 事件应答输入，保留 `dismiss` 负向记录用法）。

## 验证

- `npm run parity`：通过（含新增的跨平台启动器护栏 + 硬断言顺序护栏 + canary）
- 本机 `startViteDevServer` 冒烟：vite 正常拉起、`/editor/index.html` 可达
- 门禁注入验证：平台分支漂移、断言缺失均被检出

## 发布说明

保持 pre-release。Release Gate 仍为 NO-GO：PASS-E 全局策略要求 `ux-gate`（人工计时），
且 Windows 视觉基线需本次 runner 运行验证、Linux `sidebar-golden` 的
`mock workspace 构建失败` 待复现。
