# Mellow Performance Benchmark

同机对照 Typora 的性能基准（规范见 `docs/specs/performance-benchmark-spec.md`，目标见 PRD §110）。

## 前置条件

1. **权限**（一次性）：为编译产物 `bin/screen-timing` 在「系统设置 → 隐私与安全性」授予：
   - **辅助功能**（Accessibility）：合成键盘 / 滚动事件需要；
   - **屏幕录制**（Screen Recording）：ScreenCaptureKit 帧捕获需要。
   若重新编译了 `bin/screen-timing`，macOS 可能要求重新授权。
2. **输入法**：切换为英文（ABC）。typing 测试依赖 keycode 直出字符。
3. **Typora**：`/Applications/Typora.app`（版本经 `TYPORA_APP` 环境变量可覆盖）。
4. **Mellow**：`apps/desktop` release 构建（含 CLI 打开支持）：

   ```bash
   cd apps/desktop && npm run tauri build
   ```

5. **夹具**（确定性生成）：

   ```bash
   cd tests/benchmark && node generate-fixtures.mjs
   ```

## 运行

```bash
cd tests/benchmark
# 全量（两 app × 7 夹具 × 7 指标，约 30–60 分钟）
node run-benchmark.mjs --app both --all

# 指定范围
node run-benchmark.mjs --app typora --fixtures 1MB.md,10MB.md --metrics open,typing --runs 3
node run-benchmark.mjs --app mellow --metrics startup
```

参数：

| 参数 | 默认 | 说明 |
|---|---|---|
| `--app` | `both` | `typora` / `mellow` / `both` |
| `--fixtures` | 7 个夹具 | 逗号分隔 |
| `--metrics` | `open` | `startup,open,typing,scroll,search,save,memory`（`--all` 全选） |
| `--runs` | 5 | open/startup 重复次数 |
| `--keystrokes` | 100 | typing 按键数 |
| `--typora` / `--mellow` | 默认路径 | 覆盖被测二进制 |

## 输出

- `results/<ts>-<app>.json`：原始数据（每个按键延迟、每次 open 样本、RSS 采样、帧时间戳）；
- `reports/<ts>-mellow-vs-typora.md`：对照报告（Mellow / Typora / 比值 / PRD 达标判定 / 发现项）。

## 测量口径（与 Typora 完全一致的路径）

统一外部测量：CGEventPost 合成事件 + ScreenCaptureKit 窗口 ROI 捕获 + 像素变化检测（含光标闪烁自动校准与渲染稳定等待）。**不做 in-app 插桩**，Mellow 与 Typora 走同一测量代码。

- `startup`：`_blank.md` 冷启动 → 窗口出现 → 首键回显；
- `open-to-editable`：冷启动带夹具 → 窗口出现 → 渲染稳定（loadMs）→ 首键回显；
- `typing P95`：N 键逐键「按键 → 回显」延迟的 P95（普通 <16ms / Large <32ms）；
- `scroll`：合成滚动期间帧间隔 P95 / fps / 掉帧；
- `search`：Cmd+F → 键入 → find bar 首帧变化（Mellow 无文档内查找 → N/A + 功能缺口发现项）；
- `save`：Cmd+S → mtime 变化（测试前制造修改：无变更时 Typora 跳过写盘）；
- `memory`：主进程 RSS（打开后采样中位数 / 峰值）。

## Sidebar 计时微任务（P3.10）

Sidebar 纯逻辑微任务的单元级计时基准（jest + ts-jest），与上文 CGEvent 真机外部测量**分层互补**：
微任务验证「10k/1000/1万 量级不阻塞」（V4 计划 3.2/3.10 Exit Gate），真机基准负责端到端
「Mellow vs Typora」对照。微任务随 `pnpm test` 强制执行；真机基准需手动运行。

| ID | 位置 | 任务 | 宽松预算 |
|---|---|---|---|
| T1 | app-core `test/sidebar-bench.test.ts` | filterFileTree 10k 节点过滤 | 1000ms |
| T2 | 同上 | filterFileList 10k 条目过滤 | 500ms |
| T3 | 同上 | FileTreeModel.flatten 10k 展开树 | 500ms |
| T4 | 同上 | FileListModel.navigate 10k down 全遍历 | 10000ms |
| T5 | 同上 | PageUp/PageDown ×1000 整页移动 | 2000ms |
| T6 | 同上 | OutlineModel.navigate 1000 行 ×1000 键 | 2000ms |
| T7 | 同上 | OutlineModel.collapseAll 1000 行 | 200ms |
| T8 | 同上 | SearchResultsModel 结果流式增长/收缩导航 | 1000ms |
| T9 | 同上 | SearchResultsModel.navigate 10k ×10k | 500ms |
| T10 | 同上 | matchSearchLine 1 万行 | 1000ms |
| T11 | 同上 | groupSearchResults 1 万匹配 → 500 组 | 1000ms |
| T12 | desktop-ui `test/virtual-bench.test.ts` | buildOffsets 10k 随机行高 + findRange ×1000 | 200ms / 500ms |

运行方式：

```bash
pnpm --filter @mellow/app-core test -- sidebar-bench
pnpm --filter @mellow/desktop-ui test -- virtual-bench
```

数据为确定性伪随机（seed 固定）；预算为实测的 ≥10×，超预算即失败；每个任务 console.log 实测耗时。

## 已知问题

- ScreenCaptureKit 偶发启动失败 / 无帧（已内置重试与渲染稳定等待，个别夹具个别轮次可能出现 FAIL / 超时，报告与 JSON 中可见）；
- 像素级测量包含合成器延迟（两侧一致，比值有效）；
- 测量期间请勿操作鼠标键盘（合成事件会被真实输入干扰），并保持前台窗口稳定。
