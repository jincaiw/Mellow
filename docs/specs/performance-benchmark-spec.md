# Performance Benchmark Spec

对应：`docs/product/Mellow-PRD-V1.2-FINAL.md` §110「性能目标」、`docs/specs/runtime-qualification-plan.md` §5 Performance。

## 1. 目的

在**同一台参考机**上，用**同一套外部测量方法**分别测量 Mellow 与 Typora 的性能指标，输出：

1. 同机对照数据（Mellow vs Typora，含比值，不只看绝对数字）；
2. PRD §110 绝对目标达标判定；
3. 发现项（大文件模式、Mermaid / 图片代价、内存、功能缺口等）。

PRD §110 明确要求：

> 不能只用绝对指标。必须同机型与 Typora 1.14.6 对照。

## 2. 参照基线

- **主基线**：Typora 1.14.6（PRD 指定）。实测版本通过环境变量 `TYPORA_APP` 指定 `.app` 路径，报告必须记录实际版本；patch 级版本差（如 1.14.9）在报告中注明，不改变结论判定逻辑。
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
- 本 spec 只约束 benchmark 方法，不约束 Typora 版本安装来源。
