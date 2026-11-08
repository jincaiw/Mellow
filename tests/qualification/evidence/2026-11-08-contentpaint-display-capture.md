# contentpaint：显示器级捕获让「冷启动何时画出内容」从不可观测变为可观测（2026-11-08）

> 归属：`P0-PERF-001`（`blockedBy: perf-harness-pending`）。
> 本文记录**量具**（`tests/benchmark`）的改造与实测，**不改变**任何台账状态码：
> 本项仍为 `MAC`，发布门禁仍 **NO-GO**（4 项环境/人工阻塞未变）。
> `contentpaint` 是**诊断量**，不是 PRD 判定量（ADR-0026 的判定量是 `hotopen.switchMs`）。

## 一、要解决的事实

`loadMs` 来自 `startup-probe` 的 `waitStable(stableMs: 600)`：该循环要求 ROI
「连续 600ms 无像素变化」才返回，**结构上不可能早于 600ms 返回**（实测跨应用、跨尺寸恒落
603.8–629.8ms）。它测的是「等待画面静止」，**从未测到内容绘制的时刻**。

2026-10-01 的 A/B 实测已证明「改返回值（`return lastChange - start`）」不可行 ——
8 个样本全部退化为 `0`（`0 changed`）。当时的结论是：真实修法必须是
**把观测窗口前移到应用启动之前**，属 harness 时序重排；而 spec 判定其成本高于收益
（`loadMs` 已被护栏排除在所有 PRD 判定之外），故记为「**未采用**」。

本轮把这个「未采用」的路径做完了，理由不是 `loadMs` 变成判定量（它没有），
而是**冷启动里「内容何时画出」本身是 P0 项证据链上唯一空白的观测**：
在此之前，仓库里没有任何机器读数回答过这个问题。

## 二、设计：探针先开流，再由探针启动应用

窗口级捕获（`SCContentFilter(desktopIndependentWindow:)`）**结构上**做不到在窗口创建前开流 ——
它必须先拿到窗口对象。Mellow 的窗口创建极快（实测 helper 接入时窗口已存在，
`流→窗口 = 35–65ms`），因此旧形态（runner 先启动、helper 再接入）**必然错过首绘**。

改为**显示器级**捕获（`SCContentFilter(display:excludingWindows:[])`），并新增
`startup-watch --launch-bin PATH [--launch-arg A]...`：探针先建流、确认首帧，
再用 `Process.run()` 启动被测应用。这样捕获覆盖**进程启动全过程**。

```bash
bin/screen-timing startup-watch \
  --launch-bin <app 二进制> --launch-arg <夹具> \
  --roi-frac 0.05,0.10,0.90,0.80 --min-frac 0.001 \
  --timeout 12000 --stable-ms 400 --activate
```

ROI 表达为**窗口内比例**（不是绝对像素），在窗口出现后按窗口几何 × 显示缩放映射到显示像素。

## 三、三个实测缺陷（都是「量具骗过自己」，且都有可复现症状）

### 3.1 `CVPixelBuffer` 被缓冲池复用 → 帧对比变成自比较

初版把上一帧的 `CVPixelBuffer` 保存下来做下一帧对比。SCK 从**固定大小的缓冲池**复用 buffer，
下一次回调会覆写上一次保存的那个 —— 于是「上一帧 vs 当前帧」实际是「当前帧 vs 当前帧」。

- 症状：`framesInRoi=574, changedFrames=0, maxFrac=0`
- 修法：回调内立刻把 ROI 采样点（step=4 网格、BGRA 四通道）复制进独立堆数组，
  与 buffer 生命周期解耦（`roiSnapshot` / `roiSampleDiff`）

### 3.2 ROI 按「过渡几何」计算 → 落在最终窗口之外

Tauri 主窗先以过渡尺寸出现（实测 `1178×786`），随后 resize 到最终尺寸（`960×963`）。
按过渡几何算出的 ROI 施加到最终窗口上会落到空白处。

- 症状：`detectMaxDiff=0`，失败截图整幅纯白（仅右上角一条工具条残影）
- 修法：**每轮 poll 都重新读窗口几何**（不只首次），几何变化超过 2pt 就更新 ROI

### 3.3 几何抖动清空基线 → 正文绘制被吞掉（本轮新发现）

补上 3.1/3.2 后仍出现**读数不可复现**：同一场景一次 `maxFrac=0.0062`（只剩光标/工具条），
另一次 `maxFrac=0.4064`。加入诊断输出（`winFrameChanges` / `topFracs`）后定位：

```
winFrameChanges: [[+1264ms, 1178, 786], [+1291ms, 960, 963]]
topFracs:        [[+1718ms, 0.4064]]
```

启动期间窗口几何**抖一下再回来**（间隔 31ms）。旧实现在几何变化时**清空全局基线**，
若正文绘制落在抖动之后的第一帧，那一帧没有可比的基线 → **整段大变化被丢弃**。
小变化（光标闪烁）随后才被记成「首个变化」。

- 修法：基线**按几何分桶**（键 = 取整的 x,y,w,h，上限 8 桶）。跨几何的帧对由桶天然隔离，
  回到旧几何时仍可与抖动前的帧比较。

修后 4 次连测：`maxFrac` 恒为 **0.40642**，`changedFrames` 恒为 2，无一次落入小变化形态。

## 四、实测（本机 Apple M4 / 16GB / macOS 27.0.1，Typora 1.14.9）

命令：`node run-benchmark.mjs --app both --metrics contentpaint --runs 3 --warmup 1`
（夹具 `1MB.md`；Mellow 为 `cargo build --release --features custom-protocol` 构建）

原始数据：`tests/benchmark/reports/2026-11-08T11-57-11-mellow-vs-typora.md`
（`results/2026-11-08T11-57-11-{mellow,typora}.json`；`results/` 与 `reports/` 不入库）

| app | 启动→首变化 median | 启动→最大变化 median | 启动→稳定 median | maxFrac（中位） | 流→窗口 median | 有效样本 |
|---|---|---|---|---|---|---|
| Mellow | 1392.0 | 1605.4 | 2005.4 | 0.4064 | 203 | 3/3 |
| Typora | 1438.6 | 1438.6 | 2143.4 | 0.3274 | 365 | 3/3 |

单样本（Mellow，4 次独立连测）：

| 启动→首变化 | 启动→最大变化 | maxFrac | changedFrames |
|---|---|---|---|
| 1466.6 | 1667.5 | 0.40642 | 2 |
| 1544.2 | 1808.9 | 0.40642 | 2 |
| 1540.8 | 1750.2 | 0.40642 | 2 |
| 1638.1 | 1909.0 | 0.40642 | 2 |

**怎么读**：两侧「启动→首变化」都在 1.4s 量级，「启动→最大变化」在 1.4–1.9s。
Mellow 的**窗口出现**比 Typora 早（203 vs 365ms），但正文绘制时刻相当 ——
即 Mellow 的启动成本更多落在「窗口已出现、内容尚未绘出」这段，而不是窗口创建。
这**不构成 PRD 判定**（判定量是 `hotopen.switchMs`），只是首次可观测的事实。

## 五、顺带修掉的一处构建陷阱（不是产品缺陷）

本轮先观察到「release 二进制启动后编辑区整片空白」，并一度怀疑产品回归。实为构建方式错误：

- `apps/desktop/src-tauri/Cargo.toml` 的 `custom-protocol` feature 是 `tauri/custom-protocol` 的显式转发；
  **只有带该 feature 构建才会把 `frontendDist` 嵌入二进制**，否则运行时会去请求 `devUrl`
  （`http://localhost:1420`）→ 无 dev server 时白屏。
- 错误命令：`cargo build --release`
- 正确命令：`cargo build --release --features custom-protocol`
- 判据：`strings -a <binary> | grep -o 'index-[A-Za-z0-9_-]*\.js'` 应能查到 `dist/index.html` 引用的那个
  chunk（错误构建时为空）。

修正后截图确认正文正常渲染（标题、列表、引用块、代码块、表格均在）。

## 六、边界（如实声明）

1. **不是 PRD 判定量**：本节数字不进入任何达标/未达标判定；`P0-PERF-001` 的状态码、
   `blockedBy`、发布门禁结论均未改变（仍 `MAC` / `perf-harness-pending` / NO-GO）。
2. **单平台**：只有 macOS 读数，无 Windows / Linux 证据。
3. **单夹具**：只测 `1MB.md`（Typora 对 >2,000,000 字符不渲染，大尺寸无基线可比）。
4. **`loadMs` 仍在**：`startup` / `open` 两处照旧落盘 `loadMs` 与其诊断行 —— 本轮**没有删除**
   它，也没有把它改成「内容就绪」；`contentpaint` 是**另加**的观测，不是替换。
5. **`--pid` 形态不可用**：只保留 `--launch-bin` 形态作为有效样本来源；`--pid` 形态保留
   以便调试，但样本不计入统计（runner 以 `launchedPid > 0` 判定）。
6. **合成事件未参与**：本指标不含任何键盘注入，因此不触碰 IME / 用户文件相关约束。

## 七、改动文件

- `tests/benchmark/lib/screen-timing.swift`：新增 `DisplayProbe`（显示器级捕获、按几何分桶的
  基线、`winFrameChanges` / `topFracs` 诊断）、`roiSnapshot` / `roiSampleDiff`、
  `startup-watch --launch-bin / --launch-arg / --activate`
- `tests/benchmark/run-benchmark.mjs`：新增 `contentpaint` 指标与报告 §2e
- `tests/benchmark/README.md`：指标清单与口径说明
