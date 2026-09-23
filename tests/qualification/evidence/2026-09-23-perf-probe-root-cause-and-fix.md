# P0-PERF-001 探针根因定位与修复（2026-09-23）

**结论摘要**：台账里「`startup-probe` 成功率随 app/fixture 漂移」**不是探针不稳定**，而是
两个可复现的 harness 缺陷：

1. **ROI 与捕获窗口不同源**：runner 用 `waitWindow` 的几何换算绝对像素 ROI，而那是
   窗口出现**瞬间的过渡尺寸**；施加到 SCK 实际捕获的最终窗口上会落到**空白处**。
2. **Mellow 缺 `--no-click`**：合成点击破坏 WKWebView 的 TextInput 焦点协议 → 后续
   CGEvent 按键全部丢失。

修后同一场景成功率由 **6/10 → 10/10**；Mellow 10MB 的 `open-to-editable` 首次得到
**5/5 有效**读数（median 743.9ms）。Typora 侧仍是 0/5，但根因已改为**本机 SCK 对 Typora
窗口的捕获返回静止/空白画面**（环境限制，非 harness 缺陷）。

---

## 一、症状与错误归因

`2026-09-22-perf-open-metric-validity.md` 记录了成功率漂移（Mellow 1MB 1/5、Mellow 10MB 3/5、
Typora 1MB 5/5、Typora 10MB 0/5），当时把根因列为「未隔离」。

2026-09-23 复测（`--metrics startup --runs 4`）仍复现：**1/4 失败**，且失败样本自报：

```
detectMaxDiff=0  detectFrames=458  threshold=60  calibMaxDiff=0
frontmostPid=75232  expectPid=75232      ← 前台正确
```

即：帧在到达（458 帧），但 **8 秒内 ROI 一个像素都没变**，且目标 app 确实在前台。
「焦点错」与「几何错」两种解释都能产生这个签名，必须进一步取证。

## 二、取证：ROI 落空（根因 1）

### 2.1 窗口枚举：两个来源其实一致

新增 `windows` 诊断命令（`windowList()` 与 `SCKShareableContent` 并排输出）后实测：

```
run 1  wait-window=962x965   cg=960x963@(457,30)   sck=960x963@(457,30)
run 2  wait-window=1178x786  cg=958x961@(458,31)   sck=960x963@(457,30)   ← wait-window 与两者都不符
run 3  wait-window=1180x786  cg=960x963@(457,30)   sck=962x965@(456,29)   ← 同上
run 4  wait-window=954x957   cg=958x961@(458,31)   sck=960x963@(457,30)
```

CGWindowList 与 SCK 始终一致（真实窗口 ≈960×963）。**只有 `waitWindow` 会给出
1178×786 这种值** —— 那是 Tauri 窗口出现瞬间、尚未 resize 到最终尺寸的**过渡几何**。

### 2.2 失败截图：ROI 是空白

`--snap-on-fail` 把失败时的 ROI 帧落盘（`/tmp/probe-diag/fail-5.png`）：

> 整幅纯白，仅右上角一条工具条残影。

按过渡几何 1178×786 算出的 ROI 是 `235,47,706,78`；施加到真实窗口 960×963 上，
该区域不含正文 → `detectMaxDiff=0`。**几何错**，不是焦点错。

### 2.3 修法：让 ROI 由「即将捕获的那个窗口」求得

`lib/screen-timing.swift` 新增 `resolveRoiForCapture(pid:fallback:roiFrac:)`：
先解析出**将要捕获的那个** `SCWindow`，再用它自己的 frame 乘比例求 ROI，
两个来源合一。调用方改传比例（`--roi-frac "0.2,0.06,0.6,0.10"`）。

实测（同一场景、同一机器、连续 10 次）：

| | 成功率 | ROI（逐次） | detectMaxDiff |
|---|---|---|---|
| 改前（绝对 ROI） | **6/10** | 随 `waitWindow` 漂移 | 0（失败时） |
| 改后（比例 ROI） | **10/10** | 恒为 `192,57,576,96` | 恒为 2636 |

## 三、取证：Mellow 缺 `--no-click`（根因 2）

`cmdStartupProbe` 的注释早已记载（2026-08-19 诊断）：

> `--no-click`：WKWebView（Mellow）下合成点击会破坏 WebView 焦点协议，
> 导致后续键盘事件全部丢失。

`golden-journeys.mjs` 早已对 Mellow 传 `--no-click`（第 344 行），但 **`run-benchmark.mjs`
从未传**。于是 Mellow 的每次探针都先被合成点击打断焦点，再发按键 —— 表现为
`detectMaxDiff=0` 且 `frontmostPid == expectPid`（前台对、窗口对，就是收不到输入），
且**间歇**（取决于这次点击有没有踩坏焦点）。

修法：`APPS.mellow.probeArgs = ['--no-click']`，并在 3 处 `startup-probe` +
`keypress-latency` 调用点透传 `...app.probeArgs`。

## 四、修后读数

### 4.1 Mellow 10MB（`--app both --fixtures 10MB.md --metrics open --runs 5 --warmup 1`）

```
open-to-editable: median=743.9ms p95=777.7ms（有效样本 5/5）
  分量 winMs=[233,231,284,235,235]        ← 窗口出现
       loadMs=[1075,1104,1100,1076,1107]  ← 含 waitStable 的 600ms 地板，不计入指标
       latencyMs=[511,496,494,509,475]    ← 首键回显
```

| | 2026-09-22（旧 harness） | 2026-09-23（修后） |
|---|---|---|
| Mellow 10MB median | 1299.2ms（**3/5 有效**） | **743.9ms（5/5 有效）** |
| 有效样本 | 3/5 | 5/5 |

743.9ms 落在 PRD 目标 1.0–1.5s 内。注意该值**不含** `loadMs`（`waitStable(stableMs:600)`
的结构地板，见 09-22 文档 §3.0a），因此是可比的「窗口出现 + 首键回显」。

### 4.2 Typora 10MB：仍是 0/5，但根因已变

```
detectFrames≈458（帧在到达）  calibMaxDiff=0  detectMaxDiff=0
winMs=[534,393,382,398,401]（窗口出现稳定）
```

失败截图（`/tmp/typora-diag/fail-1.png`）：ROI 带**整幅空白**（右侧一条深色滚动条）。
且 `snap` 命令对 Typora 直接报 `SCK 捕获启动失败`。

这与 `golden-journeys.mjs` 第 334–336 行的既有记载一致：

> 2026-08-22 起本机 SCK 窗口捕获流间歇故障：probe 假稳定 + detectChange 无帧
> —— 故 golden-journeys 改用 OCR 作为就绪判定通道。

**结论**：本机上 Typora 的 SCK 窗口捕获返回静止/空白画面，属**环境限制**，
非 harness 缺陷、更非 Mellow 性能结论。因此：

> **目前仍不存在任何可比的 Mellow vs Typora 10MB 结论。**
> 台账原「10MB open 2.59× 于 Typora」维持**口径无效**的更正，两个方向都不能下结论。

## 五、新增护栏（防回退）

`tests/parity/verify-parity-ledger.mjs` 新增一节（正例锁 + 反例锁 + 跨层锁 + canary）：

1. 每个 `startup-probe` 调用必须给比例 ROI（`ROI_FRAC_*`），且必须透传 `app.probeArgs`；
2. 反例锁：不得出现 `roiStr(topRoi(win))` 作为探针 ROI；
3. `APPS.mellow.probeArgs` 必须含 `--no-click`；
4. 跨层锁：helper 源码必须实现 `resolveRoiForCapture` 且支持 `--roi-frac` / `--no-click`
   （只改 runner 传参 = 参数被静默忽略）。

**注入验证**（不是「写了断言就算」）：

- 把一处 `startup-probe` 退回旧写法 → 护栏报 **5 条错误**、EXIT≠0；
- 把 `probeArgs: ['--no-click']` 改成 `[]` → 护栏报 1 条错误、EXIT≠0；
- 还原后 EXIT=0。

## 六、仍未解决（本项不得据此关闭）

1. **Typora 侧缺有效读数**：需要一条不依赖本机 SCK 的窗口就绪通道（`golden-journeys.mjs`
   已有 OCR 方案）。但把 OCR 引入 `open` 指标会**改变指标定义**（像素变化 → 内容识别），
   属于需裁决的度量变更，不得由 runner 单方面引入。
2. **hot-open 口径**：同进程内连续打开多文档，绕开启动态，才能得到纯「文档打开成本」。
3. **平台范围**：本项在方案 §8 记为「仅 macOS」，而台账 `requiredEvidence` 含
   `windows-ci`/`linux-ci`（PASS-E 需三平台）。两者不一致 → 发布门禁按状态判定为
   「MAC 仅单平台」。**该口径冲突需裁决**，本环境不擅自放宽。

因此 P0-PERF-001 **状态维持 `MAC`**：本机证据已显著增强（根因定位 + 修复 + 护栏 +
5/5 有效读数），但三平台与 `ux-gate` 未闭环。
