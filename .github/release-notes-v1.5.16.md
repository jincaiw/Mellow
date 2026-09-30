# Mellow v1.5.16

## 本次发布

本版本是**构建可信度与证据纪律修复版**：修掉一个让「交付产物里的引擎不是这一版源码」沉默 6 天的
构建缺陷，并把它的防线从散文升级为**机器闸门**；同时打通了 PRD §110「Input < 16ms」的
**唯一可判定来源**（应用内埋点）。

### 1. 交付产物可信度（本次最重要的修复）

- **修「交付产物里的引擎不是这一版源码」**：`packages/editor-engine/dist`（gitignore 的 tsc 产物）
  停留在 09-25，而 `inputLatency.ts` 是 09-30 新增 —— `build-editor-bundle.mjs` 直接读该 dist，
  而 `apps/desktop` 的 `build` script **不构建各包 dist**。于是「本地 `npm run build` + `tauri build`」
  会把旧引擎打进包：**09-30 之后全部引擎改动（埋点、行内代码属性、智能标点代码上下文守卫、
  表格 resize/工具栏）都没进任何本地构建产物**，而 `tsc` 全绿、屏幕上看不出原因、CI 也不会红
  （CI 与 release 流水线都先跑各包构建，**只有本地临时路径会漏**）。
- **新增确定性闸门** `assertPkgDistFresh`（放在三条构建路径的公共入口 `build-editor-bundle.mjs`）：
  `src/**/*.ts`（去 `.d.ts`）的模块集合必须**等于** `dist/**/*.js` 的模块集合。
  **缺失 → 硬失败**（报出模块名 + 确切修法）；**孤儿 → 不复制进产物**（死代码不进包）。
  覆盖 `editor-engine` 与 `editor-core`；**不比 mtime**（checkout 顺序下不可靠）。
- **CoreEditor 上游产物同型闸门**：`CoreEditor/dist/index.html` 也是 gitignore 的构建前置，
  改了 `CoreEditor/src` 却没重建同样会静默发布旧渲染层 → 补「缺失/陈旧即硬失败」。
- **产物级复核**：`verify-release-bundle.mjs` 现在比对「交付包的引擎模块集合 == 源码模块集合」（双向）。
- 顺带清除 `tsc` 不清 `outDir` 遗留的 4 个孤儿产物（`markers` / `scrollBridge`，自 8 月起随包发布）。
- 修 `build-local.sh` 两处「脚本拦自己」：旧 `dist` 的移开落点原为 `${TMPDIR}`，
  而仓库在 `/Volumes/My-Data`、`${TMPDIR}` 在 `/System/Volumes/Data` —— **跨卷 `mv` 退化为
  复制+递归删除，照样撞 safe-delete 守卫** → 改落同卷的 `node_modules/.cache`；
  并为 `CoreEditor/dist` 补同型处置。

### 2. 性能埋点：PRD §110「Input < 16ms」的判定通道打通

- 读数出口：Rust `input_latency_dump_path`（**环境变量 `MELLOW_INPUT_LATENCY_DUMP` 门控**，
  未设置时不建定时器，对正常运行零成本）→ App 定期读 iframe 的 `__MELLOW_INPUT_LATENCY__`
  → `write_text` 落盘 → benchmark 读取并与**屏幕捕获**读数**交叉验证**。
- 实测：`frameMs p95=87ms / median=74ms / n=100`，与屏幕捕获 p95=103ms **一致
  （in-app 是下界，符合预期）**。
- 为什么必须：16ms **低于屏幕捕获的单帧分辨率（≈17.4ms）**，应用内埋点是该目标唯一可判定来源
  （ADR-0026 Q3）。
- 交叉验证判据**可达性修正**：初版写 `timeouts === 0`，而本机实测超时恒为 3~8
  （屏幕捕获固有噪声）→ 该分支**从未执行**（空开关）→ 改为「有效样本率 ≥ 80%」，
  并把**偏差方向**落盘（超时剔除使屏幕捕获 p95 偏低 ⇒ 下界检验偏严）。

### 3. 证据护栏（新增 1 条，护栏总数 17 → 18）

- **`UPSTREAM.md` 的 CoreEditor 改动清单离线机器校验**：该清单是 re-vendor（`cp -R` 覆盖）之后
  **唯一能重放 Mellow 改动**的依据，而 re-vendor 静默丢掉这些改动**不会让任何测试变红**。
  新增 `upstream-manifest.json`（钉住 commit 的上游 199 个文件的 sha256）+ 生成器 + 护栏，
  判据双向且**离线**：哈希一致 ⇒ 不得列入「修改的文件」；哈希不同 ⇒ 必须列入；
  清单里没有 ⇒ 必须列入「新增的文件」；并校验两表的**声明条数 == 实际行数 == 推导结果**。
  **正向确认**：修改 19 / 新增 3 / 上游有而仓库无 0 / 未改动 180（19+180=199 自洽），与两张表逐项吻合。
- **夹具尺寸锁**：`5MB.md` 的字节目标必须**恰好等于**大文件阈值（这是报告里
  「恰好压线却不降级」这条反直觉结论的唯一依据）；`10MB.md` 严格大于、`1MB.md` 小于；
  且「恰好」由机制保证（断言 `genMixed` **收口到** `padToExact`）。
- 跨平台修正：内容哈希前**字节级归一化 CRLF → LF**（仓库无 `.gitattributes`，
  Windows runner 的 `core.autocrlf=true` 会让**全部 199 个文件**误报为「已改动」）。

### 4. 运行时验证（应用侧）

- 新增 `tests/e2e/spellcheck-suggestions-verify.mjs`：走**真实交互链** —— 右键 → 建议出现在菜单顶部
  → 点击建议 → 引擎 `replaceWordAtCursor` **真的替换文档** → 菜单关闭；并有**反向相位**：
  点「添加到字典」后同一词的建议区消失（证明 learn 真的写进宿主词典）。
  已做**变异验证**（建议置空 / learn 变空开关 → 各自失败在对应断言）。
- 台账 `P0-PERF-001` 的「真实待办」清单经逐项核实：3 条里 **2 条其实已完成**
  （hot-open 口径已落地并被 ADR-0026 定为判定量；探针 0/5 已由 ADR-0025 解释为设计内边界）。

## 验证

- `npm run parity`：通过（18 条契约护栏 + vendored CoreEditor 23 suites / 200 tests）
- CI（macOS / Windows / Linux）：全绿
- 每条新护栏均做**注入验证**（破坏 → 报错 → 还原 → 通过），
  且 canary 尽可能**直接测判定逻辑**而非字符串替换

## 发布说明

**保持 pre-release。** 按 ADR-0024（Accepted 2026-09-30）Q2=B1，`ux-gate` 逐项前置，
全局人工 UX Gate 会话**本身仍未完成** → 不宣称正式发布。当前 Release Gate 仍为
`NO-GO：10 项未闭环`（`PASS-E = 0/50`），阻塞原因全部是**人工 UX Gate 会话**
或**真机/平台证据**，均不可由自动化替代（`ux-gate-recorder` 只接受人工记录，
禁止伪造计时）。

本版本修复的是**构建与证据链的可信度**：此前「已实施」的结论在**源码层面成立、
交付层面不成立**——这正是本项目最贵的失效模式（记录于审计 §4.45）。
