# tests/e2e — 浏览器端运行时验证

用 Playwright（Chromium，headless）在 **dev harness** 中验证真实运行时行为。
这些脚本**不进 CI**（CI 只跑 `tests/parity/verify-*.mjs` 与各包单测），
因此它们是「人工/本地复核」通道，不是门禁。

> **重要**：正因为不进 CI，**凡是「必须永远成立」的不变量，不要只写在这里** ——
> 应同时写进 `tests/parity/`（CI 常跑）。本项目已两次因「真值只存在于 e2e」
> 而让问题悄悄腐烂：
> ① 官方键位真值（已提升为 `verify-menu-contract.mjs` §11）；
> ② 快捷键唯一性（已提升为同文件 §13，当时 e2e 报出 `Cmd+Alt+F` 冲突）。

## 运行方式

```bash
# Playwright 装在仓库外临时目录（不污染依赖）。注意 /tmp 会被系统清理，需时重建：
mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright --no-save

cd <repo>
NODE_PATH=/tmp/pw/node_modules node tests/e2e/<script>.mjs
```

## 环境坑（都实际踩过）

### 1. 残留 vite 会让测试「假红」

多数脚本用**固定端口 + `--strictPort`** 启动 vite。若上一次运行被**中断**
（只 `pkill` 了 node 主进程、vite 子进程存活），新实例因端口被占**静默启动失败**，
而 `waitForServer` 会连上**旧实例** —— 旧实例带着上次会话状态，
于是断言集体假红，且**换任何等待时长都无效**。

**判别特征**：失败时 `document.getElementById('root').innerHTML.length` 明显偏大
（带着恢复的会话，如 33873 vs 全新实例的 1598）。

**处置**：清理残留后重跑；或把该脚本改为**动态选空闲端口**
（`smoke.mjs` 已改：`pickFreePort()` + `listen(0)`，见其注释）。
**不要**通过延长等待时间来「修」这类失败 —— 根因不是时序。

### 2. 用条件等待，不要用魔法时长

等编辑器就绪应轮询条件（`waitForFunction` 判 `webContents.webModules.core`），
而非 `waitForTimeout(5000)`。编辑器挂载走 `requestIdleCallback`，
在负载高的机器上可能超过任意固定值。（`smoke.mjs` 原为固定 5s，已改。）

### 3. `isTauri()` 门控的行为在 dev harness 天然测不到

如标题栏字数 effect 首行 `if (!isTauri()) return;`。此类断言应**如实降级为
静态契约**并标注，不要改断言求绿。

### 4. Playwright 点击编辑器要换算坐标系

`view.coordsAtPos()` 给的是 **iframe 视口内**坐标，而 `page.mouse.*` 用
**主页面视口**坐标 → 必须叠加 `page.locator('iframe').boundingBox()` 的 x/y。

### 5. 按键类探针必须显式设置光标位置

`setDoc` 若不设 `selection`，光标停在 0，按键结果完全误导。

### 6. 断言 widget / 装饰存在前，先确认光标是否抑制其渲染

图片 widget 有「光标/选区碰到节点 → 显示源码、不渲染 widget」语义
（`image/widget.ts`）。光标压在图片上时 `.mellow-md-image-*` 根本不存在。

### 7. **dev harness 不投递编辑器事件 → 「文档脏状态」造不出来**（2026-09-13 实测）

在 iframe 内真实键盘输入后，编辑器内容确实变了，但 **App 的 `dirty` 恒为 false**：

- `document.title` 不带脏标记；
- ⌘N 直接**无对话框**清空文档；
- ⌘S 同样无效果（mock 保存不落盘、不改标题），无法借「保存后重命名」间接置脏。

**根因**：`dirty` 的唯一建立点是
`host.onEvent(e => e.type === 'viewUpdate' && e.contentEdited)`（`App.tsx` 约 3440 行），
而 `host/browserMockHost.ts` **没有 onEvent / viewUpdate 通道**。

**影响面（比单个测试大）**：凡以「脏状态」为前提的行为都**无法在 e2e 中验证** ——
脏文档离开确认（G7-EDIT-09）、自动保存、定时保存、崩溃恢复快照、标题栏脏标记、
`reloadFromDisk` 前的未保存确认。

**处置**：`dirty-leave-dialog-verify.mjs` 写成**能力探针** —— 探测不到脏状态时明确
`SKIP` 并说明原因（同时仍断言「⌘N 在不脏时不被误拦」「全流程不出现 WebView 原生面板」），
**不伪造通过**；完整断言已写好，harness 补齐事件通道后自动生效。
详见方案 §5.8 **G7-QA-07**。
