# Mellow v1.5.20

## 本次发布

本版本修掉一个**「设置改了、重启又变回去」**的缺陷：**关掉格式工具栏后，重启它又出现**。
并顺带把「冷启动时持久化设置是否真的生效」这件事**系统化核对了一遍**，固化为护栏。

> 一句话：**「关掉的开关」现在真的关得住**（此前它只在当次会话有效）。

---

## 1. 缺陷：`外观 → 格式工具栏` 关掉后**重启又出现**

### 现象与根因

`appearance.toolbar`（storageKey `mellow.selectionToolbar.enabled`，默认开）的开关状态
**确实**从持久化值恢复到了界面状态 —— 但**引擎从未在启动时被告知**：

该设置**只在「菜单 / 设置」的回调里**下发给引擎（`setSelectionToolbarEnabled`），
**没有任何一处**在「引擎就绪」时下发它。

于是重启后剩下这一半分裂：**菜单勾选态 = 关，实际工具栏 = 开**。

（源码里还留着上一轮修的**另一半**分裂的注释：「此前恒为 true，用户关闭后重启会出现
『菜单勾选态 = 开，实际工具栏 = 关』」—— 那一半修了，**引擎侧这一半没修**。）

### 实测取证（新探针 `tests/e2e/startup-state-probe.mjs`）

```
=== 用例 1：appearance.toolbar=false（非默认）→ 选中文本 ===
{"found":true,"display":"flex"}     ← 关掉了却仍然显示

=== 用例 2：对照（默认开）→ 选中文本 ===
{"found":true,"display":"flex"}
```

修复后：用例 1 → `display:"none"` ✅，用例 2 仍 `flex` ✅（**对照证明判据有效**，
否则「用例 1 通过」可能只是因为工具栏压根没渲染出来）。

## 2. 把这件事**系统化**：宿主→引擎的启动状态下发逐条核对

上一版修掉的是**主题这一族**（编辑器主题 / md token / 字体没在启动时下发）。
既然它是「一族」，就把**全部**宿主→引擎的 `set*` 列全，逐条判定「冷启动时是否生效」：

**方法**：以 `editor-core` 的**宿主契约**（`packages/editor-core/src/core.ts` 的 `set*` 方法）
为**完备清单**，逐个回查它在 `App.tsx` 里的下发点是否**一定晚于引擎就绪**。
**契约是完备的，故这份核对是穷尽的** —— 比「想起来哪个就查哪个」可靠。

| 结果 | 项 |
|---|---|
| ✅ 已在就绪回调里 | 13 个 `setEditorConfig(...)` 子方法 + `setSpellcheckEnabled` / `setSmartPunctuationEnabled` / `setCodeLineNumbersEnabled` / `setTypewriterMode` / `setFocusMode` |
| ❌ → 上一版已修 | `setTheme` / `setMdTokens` / `setEngineLocale` |
| ❌ → **本版修复** | **`setSelectionToolbarEnabled`** |
| ✅ 非持久设置 | `setDocumentPath`（按文档）/ `setLargeFileMode`（按文件大小） |

## 3. 固化为护栏（否则下次还会漏）

`verify-adapter-contract.mjs` 新增一节：**宿主→引擎的每个状态 `set*` 都必须出现在
`App.tsx` 的 `STARTUP_STATE_APPLY_BEGIN/END` 区间内**（该区间即「引擎就绪」回调里的下发段）。
新增一个 `set*` 却忘了在就绪时下发 → 护栏失败。

**注入验证 3 例**：移出 `setMdTokens` / 移出 `setSelectionToolbarEnabled` / 删掉区间标记 —— 全部报错；基线通过。

## 4. 为什么这类缺陷长期没被发现（值得记）

**已有的 e2e 与视觉 Golden 都在「默认值」下采样**（亮色主题 / 工具栏默认开 / 中文）——
于是 **「默认能跑」被当成了「能跑」**，而**非默认入口**（暗色 / English / 关掉某开关）整条路径无人走。

本版起，测试开始覆盖**非默认入口**：`theme-follow-probe`（暗色）、`i18n-engine-probe`（English）、
`startup-state-probe`（关掉的开关）。

---

## 已知未闭环（保持 `NO-GO`）

- 未闭环 **10 项**，阻塞原因**全部**是**人工 UX Gate 会话**或**真机/平台证据**。
- **待裁决**：无。

> ⚠️ 本版修复涉及**启动时序**，**真机三平台体验验收仍未做** —— 请以实际观感为准。

## 发布状态

**Pre-release**。按 **ADR-0024**（Accepted 2026-09-30）**Q2=B1**（`ux-gate` 逐项前置），
**全局人工 UX Gate 会话本身仍未完成** → **不宣称正式发布**，Latest 仍指向上一正式版本。
