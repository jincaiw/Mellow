# P0-PERF-001 权威读数（2026-09-25）：前置条件全部满足后重测

**为什么要重测**：此前两组数字都不可用 ——
① `2026-09-23-perf-probe-root-cause-and-fix.md` 的 743.9ms 是在**输入源为简体拼音**时测的
（`inputSourceIsEnglish()` 因拼音 id `com.apple.inputmethod.SCIM.ITABC` 含 `ABC` 而误报为英文，
按键被 IME 接走）；② hot-open 首组读数来自 **09-15 的旧 `.app` 包（v1.5.9）**。
本文是**前置条件全部满足**后的读数：输入源 = ABC 键盘布局、`.app` = 当次构建的 v1.5.15、
测量时机器空载（无并行任务）。

---

## 一、前置条件的达成过程（含一处构建脚本缺陷）

### 1.1 `.app` 重建

```
bash apps/desktop/scripts/build-local.sh
  → Rust release 1m38s；Bundling Mellow.app ✓；DMG 打包失败（预期，沙箱拦截挂载卷删除）
  → ✓ Mellow.app 版本 1.5.15（2026-09-25 00:26，内层二进制与 target/release 同尺寸 19,023,280 B）
```

### 1.2 构建脚本的 Node 版本硬编码（已修 + 已加护栏）

`build-local.sh` 原先写死 `…/node/versions/22.22.2-2/bin`；本机运行时已升到 `22.22.2-3`
→ PATH 里没有 node，**失败点却落在 `./node_modules/.bin/tsc`**：

```
./node_modules/.bin/tsc: line 41: exec: node: not found
```

报错看上去像 TypeScript 问题，实际是脚本里的路径失效 —— 排查方向被完全带偏。
现改为读 `versions/current` 指针（缺失时按版本号排序取最大），并在
`tests/parity/verify-build-pipeline.mjs` 新增护栏（禁止硬编码受管 Node 版本号 + canary；
注入验证：塞回 `22.22.2-2` → 护栏抛错；还原 → 通过）。

> 附带踩到一个 bash 坑：`echo "$NODE_VER（…"` 里紧跟在变量名后的**全角括号是多字节字符**，
> bash 会把它并入变量名 → `NODE_VER\xef\xbc\x88: unbound variable`。必须写 `${NODE_VER}`。

## 二、冷启动 `open-to-editable`（5/5 有效，机器空载）

`--app both --fixtures 1MB.md,10MB.md --metrics open --runs 5 --warmup 1`

| app / fixture | median | p95 | 有效样本 | winMs | latencyMs |
|---|---|---|---|---|---|
| Typora 1MB | **455.6ms** | 561.1 | 5/5 | [487,472,397,394,378] | [75,81,58,62,76] |
| Typora 10MB | —（拒渲染） | — | **0/5** | [448,450,582,594,541] | — |
| Mellow 1MB | **461.6ms** | 477.4 | 5/5 | [306,300,339,326,318] | [166,133,138,136,143] |
| Mellow 10MB | **1681.8ms** | 1782.7 | 5/5 | [298,364,360,521,382] | [1299,1419,1276,1239,1300] |

**方差显著收紧**（对比 09-23 的负载态）：`winMs` 从 2.8× 波动降到 ~1.2×，
`latencyMs` 近乎恒定 —— 证实此前的方差主要来自**机器负载 + IME**，不是应用本身。

### 2.1 首个真正可比的点

**1MB：Mellow 461.6ms vs Typora 455.6ms → ratio 1.01（持平）。**
两侧都渲染、都有 5/5 有效样本、都在同一台机器同一输入源下测得。
分解看两者构成不同但总和相同：Mellow 窗口出现更快（300–339 vs 378–487ms）、
Typora 首键回显更快（58–81 vs 133–166ms）。

### 2.2 10MB 无基线

Typora 0/5 是**它自己不渲染**（见 `2026-09-23-typora-render-limit-2mb.md`），
不是探针问题。故 10MB 行**不存在可比比值**。

### 2.3 对 PRD 目标的如实记录

PRD 对 10MB 的目标是 1.0–1.5s；Mellow 实测 **1681.8ms**，**略超上限**。
注意该口径含进程启动与 WebView 初始化，且本机为笔记本、非空载基准机 ——
结论应为「接近但略超，需在基准机上复核」，**不是**「达标」。

## 三、hot-open（同一实例内换文档，当次构建）

`--app mellow --metrics hotopen`，目标交替投递；`.app` = v1.5.15，输入源 ABC。

### 3.1 1MB ↔ 5MB（6 轮，6/6 有效）

| 目标 | 有效样本 | total median | p95 | switchMs(中位) | echoMs(中位) |
|---|---|---|---|---|---|
| 5MB.md | 3/3 | 3180.5 | 3507.3 | 2970.4 | 167.5 |
| 1MB.md | 3/3 | 637.9 | 759.5 | 185.8 | 464.5 |

### 3.2 1MB ↔ 10MB（6 轮，6/6 有效）

| 目标 | 有效样本 | total median | p95 | switchMs(中位) | echoMs(中位) |
|---|---|---|---|---|---|
| 10MB.md | 3/3 | 2416.5 | 2432.9 | 2287.7 | 128.9 |
| 1MB.md | 3/3 | 582.6 | 626.0 | 127.1 | 467.6 |

### 3.3 ⚠️ 关键：`switchMs` **不随尺寸单调**，故不得归因于「大文件处理」

按尺寸排序：

| 目标 | switchMs(中位) |
|---|---|
| 1MB | 127.1 / 185.8 |
| **5MB** | **2970.4** |
| **10MB** | **2287.7** |

**5MB 比 10MB 更慢**。这不是噪声：旧构建（v1.5.9）下同样得到 5MB ≈ 2905/2835ms，
即**两次独立构建都复现**。按本项目既有判据（报告 §2b），
`switchMs` **不随尺寸单调 → 不得归因于大文件处理能力**。

一个**待验证的假设**（不是结论）：Mellow 可能在某个尺寸阈值之上切换到不同的渲染策略
（`packages/editor-engine/test/large-file.test.ts` 的存在提示有「大文件模式」），
使 10MB 反而比 5MB 快。需单独定位。

### 3.4 hot-open 与 cold open 是**两条不同路径**，不得合并为一个「打开成本」

- cold `open`：CLI argv → 启动时打开（Mellow 10MB 1681.8ms）
- hot-open：odoc Apple Event → 运行中实例内切换（Mellow 10MB 2287.7ms，5MB 2970.4ms）

两者尺寸不同、路径不同，**不可直接相减或相比**。方向上「运行中切换慢于冷启动」值得单独定位
（`lib.rs` 的 `RunEvent::Opened` → 前端 `mellow://open-file` 链路）。

## 四、结论

1. **P0-PERF-001 的本机侧现在有可信读数**：1MB 下 Mellow 与 Typora **持平**（1.01）。
2. **10MB 不存在可比基线**（Typora 不渲染），Mellow 绝对值 1681.8ms（略超 PRD 上限，需基准机复核）。
3. **hot-open 已落地并可复现**，但其 `switchMs` 非单调 → 尚不能作为「大文件处理能力」的证据。
4. 三项口径裁决仍未落地（见 `2026-09-23-typora-render-limit-2mb.md` §五）。

## 五、仍未解决

1. `switchMs` 非单调（5MB > 10MB）的根因定位。
2. 在**空载基准机**上复核 10MB cold open 是否稳定低于 1.5s。
3. hot-open 与 cold open 路径差异（odoc → 前端 vs CLI argv）的定位。
