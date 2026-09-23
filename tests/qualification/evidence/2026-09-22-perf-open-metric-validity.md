# P0-PERF-001 复测：`open` 指标口径有效性分析（2026-09-22）

> **后续（2026-09-23）**：本文 §5 遗留的「探针成功率漂移根因未隔离」已定位并修复，
> 见 `2026-09-23-perf-probe-root-cause-and-fix.md`。结论摘要：不是探针不稳定，而是
> ① ROI 取自 `waitWindow` 的**过渡几何**（与 SCK 实际捕获的窗口错配 → ROI 落空）、
> ② Mellow 缺 `--no-click`（WKWebView 焦点被合成点击破坏）。修后同一场景 6/10 → 10/10，
> Mellow 10MB 首次得到 5/5 有效读数（median 743.9ms）。本文其余结论仍然有效。

**结论摘要**：台账原结论「10MB open 1109.7ms，Typora 428.1ms，**2.59×**」**不能作为
「大文件处理慢」的证据**。复测显示该指标（a）对文件尺寸**非单调**，（b）对 Mellow 呈
**严格交替的双峰**（~236ms / ~1300ms），即被测的是**会话状态**而非文件打开成本。

## 一、测量条件

- 机器：Apple M4 / 16GB（同 2026-09-12 基准）
- Mellow：**按当前版本重建**（`npm run build` + `cargo build --release --features custom-protocol`，
  二进制时间 2026-09-22 23:35；此前 09-15 的旧二进制已弃用）
- Typora：1.14.9（规范基线）
- 权限自检：Accessibility ✓ / Screen Recording ✓
- 夹具：`1MB.md`（1048576 B / 8165 行）、`10MB.md`（10485760 B / 79971 行）
- 命令：`--metrics open --runs 5 --warmup 2`

## 二、原始样本（关键证据）

```
Mellow 1MB.md  = [ 978.4, 230.3,  227.6,  245.7,  250.1]
Mellow 10MB.md = [1299.7, 236.5, 1310.8,  235.0, 1299.2]
Typora 1MB.md  = [1012.2, 1029.5, 1021.8, 1047.2, 1007.6]
Typora 10MB.md = [ 418.1, 398.5,  351.4,  340.3,  424.3]
```

| fixture | Mellow median | Mellow p95 | Typora median | Typora p95 | ratio (M/T) |
| --- | --- | --- | --- | --- | --- |
| 1MB.md | 245.7ms | 978.4ms | 1021.8ms | 1047.2ms | 0.24× |
| 10MB.md | 1299.2ms | 1310.8ms | 398.5ms | 424.3ms | 3.26× |

## 三、为什么这个指标不成立

### 3.0 决定性证据：分解三个分量后真相大白

`open = (win.wallMs - t0Ms) + probe.loadMs + probe.latencyMs`

把同一批样本按分量拆开（`samplesWinMs` / `samplesLoadMs` / `samplesLatencyMs` / `samplesProbeOk`）：

| app / fixture | total（逐样本） | probe 成功数 | `loadMs` 中位 | `latencyMs` 中位 |
| --- | --- | --- | --- | --- |
| Mellow 10MB | `[1300, 237, 1311, 235, 1299]` | **3 / 5** | 604.0 | 405.6 |
| Mellow 1MB | `[978, 230, 228, 246, 250]` | **1 / 5** | 603.8 | 86.2 |
| Typora 1MB | `[1012, 1029, 1022, 1047, 1008]` | **5 / 5** | 629.8 | 55.5 |
| Typora 10MB | `[418, 398, 351, 340, 424]` | **0 / 5** | — | — |

#### (a) `loadMs` 是 600ms 硬地板 —— 已在源码层面确证

`tests/benchmark/lib/screen-timing.swift`：

```swift
func waitStable(stableMs: Double = 600, timeoutMs: Double = 15000) -> Double {
  ...
  if stable && nowMs() - lastChange >= stableMs { break }   // 连续 600ms 无像素变化才退出
  ...
  return nowMs() - start
}
```

该循环**在结构上不可能早于 600ms 返回**。所以 `loadMs` 不是「文档加载耗时」，
而是「等待画面连续 600ms 静止」的等待时长，**天然带 600ms 地板**。
实测跨应用、跨尺寸的取值带（603.8 / 604.0 / 624 / 605 / 629 / 629.8）只反映
30ms 采样抖动 —— 真实加载不可能对 1MB 与 10MB 给出同一个数。

#### (b) 总量完全由「探针这次成功没成功」决定

- Typora 10MB 之所以「快」（398ms）：探针 **0/5 成功** → 该指标静默退化为
  「窗口出现时间」（不含 600ms 地板、不含首键回显）。
- Typora 1MB 之所以「慢」（1022ms）：探针 **5/5 成功** → 额外加上了
  `loadMs + latencyMs ≈ 685ms`。
- 于是「Typora 10MB 比 1MB 快 2.6×」这一物理上不可能的反转被完整解释；
  台账原「Mellow 10MB 2.59× 于 Typora」同样只是**探针成功率差异**
  （Mellow 3/5 vs Typora 0/5），与文件尺寸无关。

#### (c) 旧实现把两种不可比的量混进同一个统计量

```js
opens.push((win.wallMs - t0Ms) + (probe.ok ? (probe.loadMs ?? 0) + probe.latencyMs : null));
```

JS 里 `number + null === number`，所以探针失败时该样本静默变成「窗口出现」，
与成功样本（含 600ms 地板 + 首键回显）**一起求中位数**。
已修：失败样本记 `null`（无效），并响亮报出失败率与有效样本数。

#### (d) 修正后的真实读数

`--runs 4 --warmup 1`（Mellow 10MB）：

```
open-to-editable: median=1355.8ms（有效样本 3/4）
⚠️ 1/4 个样本的 startup-probe 失败 → 记 null 不计入中位数
  分量 winMs=[288,291,227,290]   loadMs=[624,605,null,629]   latencyMs=[443,493,null,406]
```

即：**Mellow 10MB 的有效 open-to-editable ≈ 1356ms，落在 PRD 目标 1.0–1.5s 内**
（其中约 610ms 是 `waitStable` 地板，真实内容约 735ms）。

**Typora 10MB 的有效读数至今为空**（该轮 0/5 成功）→
**目前不存在任何可比的 Mellow vs Typora 10MB 结论**，两个方向都不能下结论。

### 3.1 Mellow 侧：严格交替的双峰（旧表述，已被 3.0 取代）

`Mellow 10MB.md` 的 5 个样本是 `1300, 236, 1311, 235, 1299` —— **严格交替**，
不是随机噪声。严格交替意味着测量值取决于**上一次启动遗留的状态**（两态循环），
而不是文件内容。任何「文件越大越慢」的解释都无法产生交替模式。

`Mellow 1MB.md` 同样呈该形态（首样本 978ms，其余稳定在 230–250ms）。

**重要**：Mellow 的「快态」约 **236ms**，**快于 Typora 的 398ms**，且远低于
PRD 目标 1.0–1.5s。因此「Mellow 10MB 打开慢」在本次复测中**不成立**；
成立的说法是「Mellow 的启动路径存在一个约 1.06s 的间歇性成本」。

### 3.2 Typora 侧：尺寸反转

`Typora 1MB.md`（1021.8ms）**慢于** `Typora 10MB.md`（398.5ms），且 5 个样本各自很紧
（不是噪声）。1MB 文件不可能比 10MB 文件慢 2.6×。这说明本指标对 Typora **也不是**
文件打开成本 —— 它同样被「该 app 在本会话中第几个被测量」这类因素支配。

### 3.3 测量式本身

```
open = (win.wallMs - t0Ms) + probe.loadMs + probe.latencyMs
```

即「窗口出现 + 首键屏幕回显」之和。它把三件不同的事相加：
进程启动、WebView/渲染初始化、文档解析与首次绘制。
「首键回显」还要求按键真的落到编辑区（`startup-probe` 默认带 clickFocus）。
因此该值**不是** `open-to-editable` 的纯文档成本，且不含任何尺寸归因。

## 四、本轮修复的**两个**测量缺陷（harness 侧）

1. **缺少预热轮**（新增 `--warmup`，默认 1）：原先首个 fixture 的首次启动吸收一次性
   成本（页缓存 / 着色器 / WebView 资源编译），后续测量实际测「缓存命中后的启动」。
   这直接制造了「越大越快」的假象。修复后 Mellow 10MB 由 1109.7ms 降至快态 ~236ms。
2. **夹具重建失败会丢弃整批数据**：`measureApp` 末尾的 `generate-fixtures.mjs` 用
   `execSync` 且未捕获 —— 它一旦失败（本环境触发 safe-delete 守卫：重建 1000 张 PNG）
   就抛出，`results/<ts>-<app>.json` **永不落盘**。实测表现为「Typora 两个 fixture 已测完、
   Mellow 一个都没跑」，连原始数据都没留下。已改为警告并继续。

## 五、仍未解决（不得据此关闭本项）

- **`startup-probe` 必须改**（两条，均已在源码层面定位）：
  1. `waitStable(stableMs: 600)` 是**结构性的 600ms 地板** —— 它测的是「画面连续静止
     600ms」，不是「文档加载完成」。应改为真正的「内容就绪」信号（例如编辑器
     caret/首行已绘制），或明确把该地板从指标里剔除。
  2. 探针成功率随 app/fixture 大幅漂移（Mellow 1MB 1/5、Mellow 10MB 3/5、
     Typora 1MB 5/5、Typora 10MB 0/5）→ 有效样本数不同时中位数不可比。
     现状已改为失败样本记 `null` + 响亮报失败率，但**根因（为何 0/5）未隔离**。
- **需要 hot-open 口径**（同进程内连续打开多文档）才能绕开启动态，得到可比的
  「文档打开成本」。
- 因此本项**状态维持 MAC**，不升 PASS-E；台账原「2.59×」表述已更正为口径无效。

## 六、对 PRD 目标的当前读数（仅供参考，非判定）

- **Mellow 10MB 有效 open-to-editable ≈ 1356ms**（3/4 有效样本），
  落在 PRD 目标 1.0–1.5s 内；其中约 610ms 是 `waitStable` 地板。
- **Mellow 10MB 窗口出现稳定 ~230ms**（另一轮 8/8 样本 228–242ms）。
- **Typora 10MB 有效读数为空**（该轮探针 0/5）→
  **目前不存在任何可比的 Mellow vs Typora 10MB 结论**。
- 台账原「10MB 打开 2.59× 于 Typora」应替换为：
  **「原口径无效（探针 600ms 地板 + 成功率漂移 + 失败样本被静默当成有效）；
  已知 Mellow 有效读数 ≈1356ms 在目标内，Typora 侧缺有效样本」**。
  真实待办只剩「修 `startup-probe`」+「补 hot-open 口径」两条，均属 harness 工作。
