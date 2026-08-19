# Golden Journeys 验收报告（2026-08-19，阶段 1 真实功能验收）

> 对应 `docs/plans/typora-deep-parity-plan.md` 阶段 1（真实功能验收）。
> 基线：2026-08-13 首轮报告（18 项 PASS/PASS-E、j18/j19 FAIL、j3 NOT TESTED）。
> 本轮：9 条自动化 journey 真机复跑全 PASS + PASS-E 代码级证据复核 + 回归门禁全绿。

## Journey 矩阵（20 项终态）

| # | Journey | 状态 | 证据（2026-08-19） | 备注 |
|---|---------|------|--------------------|------|
| 1 | Latin input | **PASS** | 自动化复跑（release .app 真机） | 无 |
| 2 | Chinese IME | **PASS** | 自动化复跑（`select-input` 前置切拼音，消除手动依赖） | 无 |
| 3 | Japanese IME | NOT TESTED | — | 环境无日文输入源（沿用基线标注） |
| 4 | selection + bold | **PASS** | 自动化复跑 + engine format 套件 | 基线 PASS-E → 自动化 |
| 5 | marker reveal | PASS | heading.test 21 + IME Matrix 实测（基线证据，无相关改动） | 无 |
| 6 | bold（selectionToolbar） | PASS-E | format-bold/italic/strike + selectionToolbar（本轮 103 测试复核全绿） | 无 |
| 7 | list | **PASS** | 自动化复跑（打开后光标在行首 → Cmd+→ 移行尾再 Enter，行为正确） | 基线竞态已消除 |
| 8 | table | **PASS** | 自动化复跑（Tab 导航不改源码，minimal patch） | **优于 Typora**（Typora 保存重排） |
| 9 | math | **PASS** | 自动化复跑（fidelity） | 无 |
| 10 | Mermaid | **PASS** | 自动化复跑（fidelity） | 无 |
| 11 | image paste | PASS-E | image-input + image-ops（本轮复核全绿） | 剪贴板位图无法自动读回 |
| 12 | HTML clipboard | PASS-E | smart-paste（htmlToMarkdown + sanitizeHtml）本轮复核全绿 | 无 |
| 13 | TSV paste | PASS-E | smart-paste（tsvToGfmTable）本轮复核全绿 | 无 |
| 14 | drag/drop | PASS-E | image-input drag 逻辑 + 测试本轮复核全绿 | CGEvent drag 不可靠 |
| 15 | undo | **PASS** | 自动化复跑（4×Cmd+Z 覆盖 SE 输入事务分组） | 无 |
| 16 | external change | PASS-E | externalChange 9 + fs:: 20（含 `external_change_conflict_never_overwrites`）本轮复核全绿 | 无 |
| 17 | 10 MB | **PASS** | 自动化复跑（startup-probe `--no-click` 消除误报；math.ts O(n²) 修复后加载 ~1.6s） | **优于 Typora**（30s 未稳定渲染） |
| 18 | print | **PASS（已修）** | `file.print` 命令 + Cmd/Ctrl+P（App.tsx RC F2） | 基线 FAIL → 接线修复 |
| 19 | PDF export | **PASS（已修）** | `export.pdf` 命令 + 文件菜单「导出 PDF…」 | 基线 FAIL → 接线修复 |
| 20 | accessibility focus | PASS | a11y phase 证据（基线，无相关改动） | 无 |

**汇总：19/20 达标（9 条自动化真机 PASS + 8 项 PASS-E 证据复核 + j18/j19 修复验证 + j5/j20 基线 PASS）；1 项 NOT TESTED（j3，环境缺日文输入源）。**

## 本轮修复清单

产品级（影响真实行为）：

1. **CRLF Source Fidelity bug**：CoreEditor 对无换行文档默认回退 CRLF，导致 LF 文档保存被改写 → `editor-core.open()` 增加 `lineBreak` 参数（`setDefaultLineBreak`），App.tsx 全部 `host.open` 调用传递文档元数据 eol；editor-core 测试 16 → 17。
2. **j18 打印接线**：`file.print` 命令（Cmd/Ctrl+P）→ `print_window` invoke，fallback `window.print()`。
3. **j19 PDF 导出接线**：`export.pdf` 命令 + 文件菜单项 + i18n（成功/失败 toast）。
4. **10MB 白屏**（阶段 0 延续）：math.ts `parseMathSpans` O(n²) → 单遍行级扫描（j17 前置条件）。

Harness 级（自动化基础设施，不改产品）：

5. 移除 `focus-type` 合成点击 —— 合成鼠标点击破坏 WKWebView 焦点协议，键盘事件丢失（j1/j2/j4/j7 输入失败根因）。
6. `startup-probe --no-click`（screen-timing.swift）—— j17 误报根因同上。
7. `select-input.swift`（Carbon TIS）—— j2 拼音输入源精确前置切换。
8. j7 光标位置补偿（Cmd+→ 行尾）与 j15 4×Cmd+Z（SE 输入事务分组）。

## 回归门禁（全绿）

| 门禁 | 结果 |
|------|------|
| TS 单元测试（pnpm -r test） | **790 通过**：engine 495 / app-core 131 / export 46 / host-api 38 / document-model 26 / i18n 15 / editor-core 17 / settings 8 / themes 8 / commands 6 |
| Rust 测试（cargo test） | **59 通过**：lib 39 + file safety 16 + updater 4 |
| E2E 冒烟（tests/e2e/smoke.mjs，白屏防线） | **10/10**（React 挂载 / iframe 就绪 / 零语法错误 / 引擎安装 / 输入闭环 / marker 隐藏 / 零页面与控制台错误） |
| Source Fidelity（run-source-fidelity-corpus.sh） | **145 文件 Open→Save 0 diff**（字节级一致；含 BOM/CRLF/CR/大文件） |
| desktop tsc --noEmit | 通过 |
| Golden Journeys 自动化（macOS 真机 release） | **9/9 PASS**（j1/j2/j4/j7/j8/j9/j10/j15/j17） |

## 平台记录

- **macOS**：真机验收完成（上述全部证据）。
- **Windows / Linux**：自动化 journey runner（xdotool 路径）待真实桌面环境回填（沿用 `real-desktop-execution-bundle.md` 执行包计划；j3 日文 IME 同此批次）。
