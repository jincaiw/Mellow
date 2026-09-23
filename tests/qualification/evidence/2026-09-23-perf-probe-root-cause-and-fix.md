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

#### 4.1a 该指标**有效但 run 间方差大**（不得把单次中位数当定论）

同日另一轮 `--fixtures 1MB.md,10MB.md --runs 3 --warmup 1`（机器同时在跑其他任务）：

```
10MB.md  median=1586.4ms p95=1616.6ms（有效样本 3/3）
  分量 winMs=[220,246,235]  loadMs=[603,626,630]  latencyMs=[1397,1314,1351]
1MB.md   median=386.6ms  Typora 452.8ms  ratio 0.85（两侧均有效，可比）
```

两轮对比：`winMs` 稳定（233–284 vs 220–246），**`latencyMs` 从 ~500ms 漂到 ~1350ms**。
即方差几乎全部落在「首键回显」分量。原因待查（可能是按键落在渲染尚未完成的时刻，
也可能与机器负载有关）。**结论**：修后的指标已做到「每个样本都有效」，但
**绝对值仍需多轮取中位数、并在报告里保留分量**，单轮数字不足以作为判定。
`1MB.md` 那一行是修后**第一个真正可比的点**（两侧都渲染）：Mellow 386.6ms vs
Typora 452.8ms，ratio 0.85。

### 4.2 Typora 10MB：仍是 0/5 —— 真正原因是**基线不渲染该文档**

```
detectFrames≈458（帧在到达）  calibMaxDiff=0  detectMaxDiff=0
winMs=[534,393,382,398,401]（窗口出现稳定）
```

> **⚠️ 更正（同日稍后）**：本文初稿把此现象记为「本机 SCK 对 Typora 窗口的捕获返回
> 静止/空白画面」，**该归因错误**。整窗截图证明 Typora 的捕获完全正常 ——
> 静止的是 **Typora 自己画出来的那页提示**：
>
> > ⚠️ 该文件过大，因此无法在 Typora 中呈现　[QuickLook]
>
> 即 Typora 1.14.9 **不渲染内容超过 2,000,000 字符的文档**
> （`frame.js` 的 `tryEnterOversize` 判定 `e.length > File.MAX_FILE_SIZE`，
> 且 `MAX_FILE_SIZE: 2e6`；实测边界 1,900,000 渲染 / 2,100,000 不渲染）。
> 详见 `2026-09-23-typora-render-limit-2mb.md`。
>
> 因此 ROI 全白、`calibMaxDiff=0`、`detectMaxDiff=0` 都是**必然结果**：
> 那个区域本来就没有可编辑内容，探针当然测不到「首键回显」。

**结论（修正后）**：10MB 夹具上 Typora **没有可比的用户行为** ——
它既不渲染也不可编辑，其「428ms」只是画出提示页的耗时。
对 ≥2MB 的文档，Mellow 能打开并编辑、Typora 不能，这是 Mellow 的**能力优势**，
且**不存在可比的比值**（不是「Mellow 慢 2.59×」）。
台账原「10MB open 2.59× 于 Typora」的更正理由由此从「口径无效」升级为
「**基线在该尺寸上无行为可对标**」。

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

1. **Typora 侧无有效读数，且这不是 harness 问题**：Typora 1.14.9 不渲染 >2,000,000
   字符的文档（见 `2026-09-23-typora-render-limit-2mb.md`）。因此 >2MB 夹具上
   **不存在可比的基线行为**；报告已改为标注 `—（拒渲染）` 并输出 `n/a`，
   护栏禁止把 Typora 的 median/p95 直接当分母。台账 `typoraBehavior` 的合同文本与
   UX Gate 任务 30 因此需要修订 —— **属合同/门禁变更，需裁决，本环境不擅自改**。
2. **夹具生成曾是非原子的（已修）**：`generate-fixtures.mjs` 原先**先 rmSync 掉全部夹具
   再重新生成**，中途失败（实测沙箱下写 1000 张 PNG 被拒）即**整体丢失**且无提示 ——
   表现为 runner 在 Typora 那一轮重建失败后，Mellow 那一轮两个夹具被
   「跳过（夹具缺失）」，整批测量静默空跑。已改为写 `.staging/` 全部成功后再
   `renameSync` 搬入；实测注入「生成中途失败」后旧夹具 8 个 .md + assets 原样保留。
3. **hot-open 口径**：机制已确认可行、但需改 harness 启动方式：Mellow 侧
   `apps/desktop/src-tauri/src/lib.rs:346` 已实现 `RunEvent::Opened { urls }` →
   把文件投递给**当前聚焦窗口**（`mellow://open-file`），实测 `open -a Mellow.app <file>`
   可向运行中实例投递（pid 不变、整窗截图哈希改变，确认内容真的切换）；但投递依赖
   LaunchServices 路由，**必须以 `.app` 包启动**，而当前 benchmark 直接 spawn
   `target/release/mellow-desktop`（裸二进制）。故 hot-open 需先把 benchmark 的启动
   目标换成 `Mellow.app`，再新增一条 helper 命令（由 helper 自己触发 open、测
   「内容切换」与「首键回显」两个分量 —— 触发必须留在 helper 内，否则 execFileSync
   的同步模型会在触发与测量之间丢掉切换瞬间）。
3. **平台范围**：本项在方案 §8 记为「仅 macOS」，而台账 `requiredEvidence` 含
   `windows-ci`/`linux-ci`（PASS-E 需三平台）。两者不一致 → 发布门禁按状态判定为
   「MAC 仅单平台」。**该口径冲突需裁决**，本环境不擅自放宽。

因此 P0-PERF-001 **状态维持 `MAC`**：本机证据已显著增强（根因定位 + 修复 + 护栏 +
5/5 有效读数），但三平台与 `ux-gate` 未闭环。
