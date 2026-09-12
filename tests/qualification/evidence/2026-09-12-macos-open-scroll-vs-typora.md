# Mellow vs Typora Performance Benchmark

- 日期：2026-09-12T09:07:59.750Z
- 机器：Apple M4 / 16GB / 26.6.2 (arm64)
- Mellow commit：`079cd5d`（工作区有未提交改动）
- Mellow 构建：release（cargo build --release）
- Typora 版本：1.14.9（规范验收基线 1.14.9 ✓）
- 输入法：ABC（英文）✓
- 权限：Accessibility ✓ / Screen Recording ✓
- 重复次数：open/startup N=3，typing 100 键/次

## 测量口径
- **startup**：冷启动（`_blank.md`）→ 窗口出现 → 首个合成按键屏幕回显，总耗时；
- **open-to-editable**：冷启动带夹具文件 → 窗口出现 → 首键回显，总耗时；PRD 目标（1MB ≤250ms / 10MB ≤1.0–1.5s）为「热打开」口径，冷启动口径通常更高，判定仅供参考；
- **typing P95**：按键→屏幕回显 P95；PRD 普通 <16ms / Large <32ms；
- **scroll**：合成滚动期间帧间隔 P95 / 平均 fps / 掉帧（>33.4ms 间隔）数；
- **save**：Cmd+S → mtime 变化耗时；
- **memory**：主进程 RSS（打开后采样中位数/峰值）；
- **search**：Cmd+F → 键入 → find bar 首帧变化；Mellow 文档内查找（@codemirror/search）已实现。

## 1. startup（blank 冷启动 → 可编辑，ms）

| app | median | p95 | min | max | n |
|---|---|---|---|---|---|
| Typora | — | — | — | — | 0 |
| Mellow | — | — | — | — | 0 |

PRD 目标：P95 ≤ 1.2s to editable。

## 2. open-to-editable（ms）

| fixture | Mellow median | Mellow p95 | Typora median | Typora p95 | ratio med (M/T) | PRD 目标（热打开口径，参考） |
|---|---|---|---|---|---|---|
| 1MB.md | 1289.2 | 1306.4 | 1326.9 | 1347.3 | 0.97 | ≤250ms |
| 10MB.md | 1109.7 | 1545.8 | 428.1 | 500.2 | 2.59 | 1.0–1.5s |

## 3. typing P95（按键→回显，ms）

| fixture | 模式 | Mellow P95 | Mellow median | Typora P95 | Typora median | ratio P95 (M/T) | PRD 目标 | 达标 |
|---|---|---|---|---|---|---|---|
| 1MB.md | 普通 | — | — | — | — | — | <16ms |  |
| 10MB.md | Large | — | — | — | — | — | <32ms |  |

## 4. scroll

| fixture | Mellow p95帧(ms) | Mellow fps | Mellow 掉帧 | Typora p95帧(ms) | Typora fps | Typora 掉帧 |
|---|---|---|---|---|---|---|
| 1MB.md | 18.4 | 57.6 | 0 | 18.9 | 57.8 | 0 |
| 10MB.md | 19.0 | 57.3 | 0 | 18.5 | 57.7 | 0 |

## 5. search

| fixture | Typora（Cmd+F 文档内查找，ms） | Mellow |
|---|---|---|
| 1MB.md | — | — |
| 10MB.md | — | — |

> Mellow 文档内查找（Cmd+F）已实现（@codemirror/search，2026-08-16）；此处 ROI 口径仅测侧边栏全局搜索（Rust streaming），与 Typora 文档内查找不同不可比。

## 6. save（Cmd+S → mtime 变化，ms）

| fixture | Mellow | Typora |
|---|---|---|

## 7. memory（主进程 RSS，MB）

| fixture | Mellow median | Mellow peak | Typora median | Typora peak | ratio med (M/T) |
|---|---|---|---|---|---|

## 8. 发现项

- Mellow 文档内查找（Cmd+F）已实现（2026-08-16）；search 指标 ROI 口径待适配 CM 查找面板。
- 大文件模式（>5MB 或 >50,000 行触发）影响 10MB / 100k-lines 的打开与输入路径。
- PRD「open-to-editable ≤250ms」为热打开口径；本 benchmark 采用冷启动口径（公平对比所需），绝对值解读需注意。

## 原始数据

- `2026-09-12T09-04-16-Typora.json`
- `2026-09-12T09-04-16-Mellow.json`
