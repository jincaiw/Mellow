# Performance Benchmark Spec

对应：`docs/product/Mellow-PRD-V1.2-FINAL.md` §110「性能目标」、`docs/specs/runtime-qualification-plan.md` §5 Performance。

## 1. 目的

在**同一台参考机**上，用**同一套外部测量方法**分别测量 Mellow 与 Typora 的性能指标，输出：

1. 同机对照数据（Mellow vs Typora，含比值，不只看绝对数字）；
2. PRD §110 绝对目标达标判定；
3. 发现项（大文件模式、Mermaid / 图片代价、内存、功能缺口等）。

PRD §110 明确要求：

> 不能只用绝对指标。必须同机型与 Typora 1.14.9 对照。

## 2. 参照基线

- **主基线**：Typora 1.14.9（build 7785）。实测版本通过环境变量 `TYPORA_APP` 指定 `.app` 路径，报告必须记录实际版本；1.14.6 仅可作为历史对照记录，不改变当前结论判定逻辑。
- **被测对象**：Mellow `apps/desktop` release 构建（`cargo build --release`），报告记录被测 commit hash 与工作区脏树状态。
- **公平性**：两个应用均以 release 形态、冷启动方式、相同窗口尺寸测量；所有指标走完全相同的测量路径（见 §6）。

## 3. 测试环境

- 参考机规格（CPU / 内存 / macOS 版本 / 架构）由 runner 自动采集写入报告。
- 需要两个系统权限，均由编译后的 Swift helper 进程持有：
  - **辅助功能（Accessibility）**：合成键盘 / 滚动事件（CGEventPost）需要；
  - **屏幕录制（Screen Recording）**：ScreenCaptureKit 帧捕获需要。
- 首次运行须在「系统设置 → 隐私与安全性」中为 helper 授权；runner 启动时自检，缺失则给出明确指引并中止。

## 4. 夹具规格

夹具由 `tests/benchmark/generate-fixtures.mjs` **确定性生成**（固定 seed，内容可复现），产物写入 `tests/benchmark/fixtures/`（gitignore），`manifest.json` 记录每个文件的 sha256、字节数、行数。

| 夹具 | 规格 | 说明 |
|---|---|---|
| `1MB.md` | 恰好 ~1 MiB（1,048,576 B）散文 markdown | 混合标题 / 段落 / 列表 / 代码块 / 行内代码 / 链接，含 Latin + CJK 文本 |
| `5MB.md` | ~5 MiB，同上混合结构 | 恰好处于大文件字节阈值边界（阈值 >5MB 才触发，5MB 不触发） |
| `10MB.md` | ~10 MiB，同上混合结构 | 触发大文件模式（>5MB） |
| `100k-lines.md` | 100,000 行（混合内容） | 触发大文件模式（>50,000 行） |
| `large-table.md` | 单张大表（600 行 × 8 列 ≈ 4,800 cell） | 表格解析 / 渲染压力 |
| `100-mermaid.md` | 100 个 Mermaid 代码块（flowchart + sequenceDiagram 混合） | Mermaid 渲染压力（< 阈值，不触发大文件模式 → 全量渲染） |
| `1000-images.md` | 1000 个相对路径图片引用 + 真实 1×1 PNG 资产 | 图片加载 / 渲染压力（两侧均真实加载） |

## 5. 指标定义

| 指标 | 定义 | 单位 | PRD 目标 |
|---|---|---|---|
| `startup` | 冷启动（无文件）：进程 launch → 窗口出现（CGWindowList）→ 首个合成按键产生屏幕回显 | ms | P95 ≤ 1.2s |
| `open-to-editable` | 带文件 launch → 首个合成按键产生屏幕回显 | ms | 1MB ≤ 250ms；10MB ≤ 1.0–1.5s |
| `typing P95` | 100 次合成按键（间隔 100ms），每次「按键 → 屏幕回显首帧」延迟，取 P95 | ms | 普通 < 16ms；Large < 32ms |
| `scroll` | 合成滚动事件驱动，帧间隔 P95 / 平均 fps / 掉帧数 | ms, fps | 参考（无硬目标） |
| `search` | Typora：Cmd+F 文档内查找「查询键入 → 命中高亮首帧」；Mellow：无文档内查找时记 N/A 并作为功能缺口发现项，另测侧边栏全局文件搜索作参考数据点 | ms | 参考 |
| `save` | Cmd+S → 文件 mtime 变化耗时（测试前将 mtime 拨老，隔离自动保存干扰） | ms | 参考 |
| `memory` | 进程 RSS：baseline（空文档）与各夹具打开后的采样（中位数 / 峰值） | MB | 参考 |

**P95 计算**：startup / open-to-editable / save 为多次运行（N=5）样本的 P95；typing 为按键样本（N=100）的 P95。样本量参数化，报告中注明。

## 6. 测量方法（统一外部测量）

核心原则：**对 Mellow 与 Typora 使用完全相同的测量路径**，不做 in-app 插桩（Typora 不可插桩，插桩会破坏可比性）。

组件（`tests/benchmark/`）：

- `screen-timing.swift` → 编译为 `ScreenTiming` helper：
  - 合成事件：`CGEventPost`（键盘按键、滚动）；
  - 帧捕获：`ScreenCaptureKit` 窗口区域流，逐帧时间戳；
  - 像素变化检测：ROI 区域 diff，返回「事件时间 → 变化帧时间」延迟；
  - 窗口检测：`CGWindowListCopyWindowInfo`（出现 / 尺寸 / 归属进程）。
- `perf-common.mjs`：进程启动（kill 残留实例 → launch）、mtime 轮询、RSS 采样（`ps`）、结果聚合（P95 / 中位数 / 均值）、报告渲染。
- `run-benchmark.mjs`：参数化（`--app` / `--fixtures` / `--metrics` / `--runs` / `--keystrokes`），输出 JSON 结果 + Markdown 报告。

前置状态收敛（两侧一致）：

- 关闭自动更新 / 会话恢复 / 最近文件重开（Typora 用 `defaults` 锁定，Mellow 清 localStorage 会话）；
- 关闭系统省电干扰，同一显示器 / 分辨率；
- 每次启动前 kill 残留进程，等待系统静默 2s。

## 7. 运行矩阵

| 指标 | 夹具 |
|---|---|
| `startup` | （空文档） |
| `open-to-editable` | 全部 7 个 |
| `typing P95` | 1MB（普通）、5MB（边界）、10MB + 100k-lines（Large） |
| `scroll` | 1MB、10MB、100k-lines、large-table |
| `search` | 1MB、10MB（Typora 文档内查找；Mellow N/A + 全局搜索参考） |
| `save` | 1MB、10MB、100k-lines |
| `memory` | 全部 7 个 |

默认重复次数 N=5（typing 每次 100 键）。

## 8. 报告格式

`tests/benchmark/reports/<YYYY-MM-DD>-<mellow-commit>-<typora-version>.md`：

1. 环境头：机器规格、macOS 版本、Mellow commit + 脏树、Typora 实际版本、构建类型、权限状态；
2. 每指标对照表：夹具 ×（Mellow、Typora、比值 M/T、PRD 目标、达标判定）；
3. 分析：比值解读、大文件模式影响、Mermaid / 图片 / 大表代价、内存对比、功能缺口（如文档内查找）；
4. 原始 JSON 结果文件路径。

## 9. 已知限制

- 像素级测量包含合成器延迟（对两侧一致，比值仍然有效）；
- 屏幕捕获帧率受显示器刷新率上限约束（P95 的下限分辨率约为 1 帧）；
- Typora 版本差（1.14.6 → 1.14.9）为 patch 级，报告注明；
- 本 spec 只约束 benchmark 方法，不约束 Typora 版本安装来源；
- **Input 16ms 目标在本 harness 上原理性不可判定**：16ms < 单帧 17.4ms，
  屏幕捕获的 P95 分辨率下限约为 1 帧。这是**量具上限**，不是「暂时没测」——
  禁止用「放宽断言」或「换单位」让它显示达标（见下「待办工作项」）。

## 10. 待办工作项

> 来源：**ADR-0026 Q3 = B1（Accepted 2026-09-30）** —— 接受「本 harness 不可判定」，
> 换测量方法（应用内埋点）**作为独立工作项排期**，不在该 ADR 内决定实现。

| # | 工作项 | 验收标准 | 状态 |
|---|---|---|---|
| W-PERF-1 | **应用内埋点**：在编辑器 input 路径埋点，直接测按键 → 回显的端到端延迟 | 能在 1MB / Large 夹具上给出 P95，且与屏幕捕获读数在**可判定区间**内一致（交叉验证）；16ms 级目标由此可判 | **引擎侧已落地（2026-09-30）；harness 读数出口待做** |
| W-PERF-2 | **`hotopen` 口径落地**：按 ADR-0026 Q1/Q2=A1，报告以 `hotopen.switchMs` 作为 1MB/10MB 目标的判定量 | 报告明确标注「判定量 = switchMs」，并说明它只测「顶部带首次实质变化」 | **已完成（2026-09-30）**：PRD 目标列已从 §2 冷启动表**移到 §2d hot-open 表**，并新增「达标（按 switchMs）」列（1MB ≤250ms；10MB 取上界 ≤1.5s；无有效样本记 N/A）；护栏三条断言锁「目标与判定口径必须同表」。报告 §2d 已写明  |
| W-PERF-3 | **startup-probe 修复**：`loadMs` 的 600ms `waitStable` 地板 + 探针成功率漂移 | 改为真正的「内容就绪」信号；报告给出有效样本数与探针失败率（已有部分实现） | **诊断（2026-09-30）+ 实测判定（2026-10-01）**：原定「一行级修法」**经本机实测不可行**（改后 8 个样本 `loadMs` 恒为 **0**）；**已改为「保留原读数 + 逐样本诊断」**（见下「实施记录」）。**真实修法 = 显示级捕获 / 观测窗口前移（harness 时序重排）—— 未采用，理由见下** |

> **口径唯一声明处**：PRD §110 目标 ↔ benchmark 指标的映射以 **ADR-0026** 为唯一声明处，
> 本 spec 与报告各节**引用**之，不各自推断。

### W-PERF-1 进度（2026-09-30）

**为什么必须应用内埋点**：PRD §110 的 Input 目标（普通键 < 16ms）**在屏幕捕获上原理性不可判定** ——
16ms 小于单帧（60Hz ≈ 16.7ms），而屏幕捕获的 P95 分辨率下限约为 1 帧（见 §9）。
这不是「暂时没测」，是**量具上限**。

**引擎侧已落地**（`packages/editor-engine/src/inputLatency.ts`，已接入 `install()` 的扩展链与 API 链）：

一次按键测**两个边界**，**分开报**（只报一个都会被误读）：

| 字段 | 终点 | 含义 |
|---|---|---|
| `dispatchMs` | 该按键引起的文档变更**已提交**（CM 事务完成） | **应用自身可控**的成本 |
| `frameMs` | 该变更后的**第一个动画帧**（rAF） | 含排版 + 帧边界，**与 16ms 目标同一量纲** |

> **为什么必须分开**：只报 `dispatchMs` 会得到亚毫秒级读数，读者会以为「轻松达标」——
> 而它不含排版与帧边界；只报 `frameMs` 则无法区分「应用慢」与「帧率所限」。
> 两者之差 ≈ 排版 + 帧边界。**不含**合成器提交与屏幕呈现（那部分只能由屏幕捕获观测），
> 故本读数相对屏幕捕获是**下界**：in-app ≤ 屏幕捕获。
>
> **不测**：IME 合成期的按键（`isComposing`）—— 合成期的「按键」不是「字符回显」，
> 混入会把中文输入误算成慢。

**读数出口**：`window.__MELLOW_INPUT_LATENCY__`（`report()` / `reset()`），
经 `install()` 自动注册；已由单测断言「真的被装上」（本项目反复出现「已实现 ≠ 有消费方」，
故把接线做成机器可核对的事实）。

**仍待做（需要能驱动应用的环境）**：
1. **harness 读数出口**：让 benchmark 能在跑完 typing 段后取走 `report()` 并写入结果 JSON
   （需宿主/Rust 或 e2e 通道）；
2. **交叉验证**：同一次 typing 跑动里，断言 `in-app frameMs P95 ≤ 屏幕捕获 P95`，
   且差值落在可解释范围（≈ paint + present）—— 这条是 W-PERF-1 的**验收条件**，
   不能只报应用内读数就宣称「16ms 目标可判」。

### W-PERF-3 诊断（2026-09-30，代码级）

**结论先说：600ms 地板不是 bug，是「等待画面静止」语义的固有成分。**
`lib/screen-timing.swift` 的 `waitStable(stableMs: 600)`：

```swift
let start = nowMs(); var lastChange = start; var prev: CVPixelBuffer?
while nowMs() - start < timeoutMs {
  if let cur = latest { if let p = prev {
    if pixelDiffSampled(p, cur) < 24 { stable = true } else { changed = true; lastChange = nowMs() }
  }; prev = cur }
  if stable && nowMs() - lastChange >= stableMs { break }
  Thread.sleep(forTimeInterval: 0.03)
}
return nowMs() - start          // ← 返回「总等待」，不是「内容就绪时刻」
```

若应用在 100ms 内就画完，之后屏幕静止 → `lastChange` **停在 `start`** →
循环必然等满 600ms 才退出。这解释了实测跨应用/跨尺寸取值带仅 **603.8–629.8ms**：
它测的是「等待画面静止」，**不是文档加载耗时**。

**最小修法（一行级，改返回量而非改判据）**：`return lastChange - start`
—— 即返回「**最后一次内容变化**的时刻」。判据（连续 600ms 无变化）不变，
只是不再把 600ms 的确认窗口计入读数。

> ### 🔴 2026-10-01 实测：**上述「一行级修法」不可行**（已回退）
>
> 本机**权限齐备**（`screen-timing check` → `accessibility:true, screenRecording:true`）、
> helper 与 release 构建都在 → **这不是「不能验证」，而是「验证后发现修法本身不成立」**。
>
> **A/B 实测**（`run-benchmark.mjs --metrics open`）：
>
> | 版本 | 夹具 / 应用 | `loadMs` 读数 |
> |---|---|---|
> | 改前（`return nowMs() - start`） | 1MB / Typora | **[631, 631]** |
> | 改前 | 1MB / Mellow | **[633, 629]** |
> | 改后（`return lastChange - start`） | 1MB / Typora | **[0, 0]** |
> | 改后 | 1MB / Mellow | **[0, 0]** |
> | 改后 | **10MB / Mellow** | **[0, 0]** |
>
> **改后每一个样本的 stderr 都是 `0 changed`** —— 即整个 600ms 窗口内**一次显著变化都没观察到**，
> 于是 `lastChange` 停在 `start` → **恒为 0**。
>
> **结论：这条修法把「恒 ~600ms 的地板」换成了「恒 0」，后者更糟** ——
> 0 读起来像「瞬时加载」，而它同样**不是在测加载**。
>
> **根因（比本节的诊断更锐利）**：`waitStable` 是在**窗口已被绘制之后**才被调用的
> （调用序：窗口检测 → `waitStable`），此时**没有任何后续变化可观察**。
> 600ms 的地板从来不是在测加载，**`lastChange` 同样不能**。
>
> **真实修法**：把**观测窗口前移到打开之前**（在 launch / open 之前就开始帧流），
> 属 **harness 时序重排**，不是改返回值 —— 故本轮**不做**（需重排 run-benchmark 的测量序列）。
>
> **附加证据（值得记）**：10MB 的真实代价体现在 **`latencyMs ≈ 1.4s`**（首键回显：
> `[1418, 1339]`），而**不是** `loadMs` —— 说明「加载代价」这个量在当前 harness 里
> 实际上由 `latencyMs` 承载。
>
> **处置**：源码与**已授权二进制**均已回退（回退后复测读数恢复 **613–629ms**，环境复原）。

### W-PERF-3 实施记录（2026-10-01，本机实测后）

**做了什么（保留原读数 + 让限制自证）**：

1. **不动 `loadMs` 的语义**（仍是「等待画面静止」）—— 因为改成 `lastChange` 会退化为恒 0（上面实测）。
2. `waitStable` 新增**观察统计**并在每样本报出：
   - `stableFramesSeen`：窗口内收到的帧数；
   - `stableChangedFrames`：窗口内**显著变化**的帧数；
   - `stableFirstChangeMs`：首次显著变化距窗口起点的 ms（**-1 = 一次都没观察到**）。
3. 三者进入 `results/*.json`（`samplesStableChangedFrames` / `samplesStableFirstChangeMs`）
   并**打印在报告 `loadMs` 行下方**：`↳ 该窗口内观察到的显著变化帧数=[0]（全 0 ⇒ 窗口在 waitStable
   开始前已绘制完成，loadMs 不是加载耗时）`。
4. **护栏**：`verify-parity-ledger` 新增两条断言 —— ① `run-benchmark` 必须逐样本落盘变化帧数；
   ② 报告打印 `loadMs` 处必须伴随该诊断行（均**在字符串字面量里**，写注释不算）+ canary。

**为什么不做真正的修法（显示级捕获 / 观测窗口前移）**：

- 它要求把 SCStream 从「窗口级」换成「显示级」（窗口出现前就开流），并引入
  **窗口坐标 → 显示坐标 + 点/像素缩放**的映射 —— 这正是「量具骗过自己」的高风险区；
- 而它的产出 `loadMs` **已被护栏排除在所有 PRD 判定之外**（`open-to-editable = winMs + latencyMs`），
  **只是诊断量**；
- 10MB 的真实代价也已由 `latencyMs ≈ 1.4s` 承载。
- → **收益（让一个诊断量可解释）小于成本（显示级捕获的坐标/缩放正确性风险）**。
  **未采用**，但**路径明确、环境已验证可用**（`screen-timing check` 全绿），
  若将来需要把「内容就绪」作为**判定量**，应从这里入手 —— 那时它的成本才有对应收益。

> ⚠️ **不得**把本节读成「W-PERF-3 已完成」：`loadMs` 仍是 600ms 稳定窗口，
> 只是现在**每个样本都能自证为什么**。真正的「内容就绪」信号**仍未实现**。

> ⚠️ **为什么原先没有直接改**：改的是**量具**，而验证它必须真机跑屏幕捕获
> （Screen Recording 权限 + Typora/Mellow 双应用）。**盲改量具**正是
> 「量具骗过自己」的典型风险，且它产出的是 P0 项（`P0-PERF-001`）的证据。
> **本轮已把「必须真机验证」这一步做掉**，并据此判定修法不成立（见上）。

**验收标准（改完后必须同时满足）**：
1. 同一夹具重复跑，`loadMs` 不再出现 ~600ms 的常量下限；
2. 与 `openToEditable`（= 窗口出现 + 首键回显，**不含** `loadMs`）的差值不再恒为 ~600ms；
3. 报告里 `loadMs` 仍**不得**进入任何 PRD 判定（见下）。

**已做（本轮，可验证）**：把「`loadMs` 不得被当作业务指标」从**注释约定**升级为**护栏**——
`verify-parity-ledger` 现断言：① `opens.push(` 语句不得含 `loadMs`；② `vals.push(` 语句不得含 `loadMs`；
③ 报告打印 `loadMs` 处必须带「等待画面静止 / **不是文档加载耗时**」标注，
且该标注必须在**字符串字面量**里（断言跑在 stripComments 之后的代码上，只写注释不算）。
注入验证：删标注 → 报错；把 `loadMs` 加回 open 指标 → 报错。

