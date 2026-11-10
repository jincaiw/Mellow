# Mellow v1.5.36

## 本次发布

**本次含一处产品变更** —— 自 v1.5.35（2026-11-09）以来的 **6 个提交**，其中 **3 个改动交付产物**
（`apps/` / `packages/` / `tools/`）：**1 个 feat + 2 个 fix**（另有 1 个 CI 新增、1 个文档收口、
1 个测试数真值源补正）。

> 一句话：这一版把 **PDF 导出切到 HTML 打印管线**（A37 / ADR-0037 = A2），并让
> **Windows 全量 Rust 单测首次进入 CI** —— 后者在两轮实跑里连续抓出 5 个「测试把作者
> 所在平台的语义当成跨平台不变量」的隐藏缺陷，全部按平台分叉修复，**产品代码零改动**。
> **没有新增 Typora 之外的功能**（冻结条款）。

---

## 1. 新实装的 Typora 行为

| # | 行为 | 依据 | 审计 / 裁决 |
|---|---|---|---|
| 1 | **PDF 导出复用 HTML 打印管线**：`export.pdf` → `buildPrintHtml`（@page 分页 + KaTeX + Mermaid + 图片全内联）→ `printview://` 打印视图窗口 → 系统打印对话框「存储为 PDF」 | ADR-0037 = A2 | 批次 A37 / §4.386 |

- pdfmake 管线**退役为测试基线**（`createPdfBuffer` / `buildPdfDocument` 仍供单测、
  §4.252 字段普查护栏、A1 标题书签锚定），`export-collaborators.json` 的
  `pipeline-retired-to-tests` 判据禁止它被悄悄接回应用。
- ⚠️ **验收边界**：PDF 分页与大纲的 **macOS 真机实测仍未验**（ADR-0037 要求实测后方可
  回 AUTO）。本机禁跑打印探针（会假脱机到真实 EPSON 打印机，§4.354），需 CI / 隔离
  打印队列设备 —— 台账 `P0-EXPORT-001` 因此维持 **IMPL**。

## 2. 修掉的缺陷

- **webview 里「导出 HTML…」在 math 默认开时必失败**：包内 node 资产定位用裸
  `__dirname`；改为 Vite `?url` / `?raw` 注入 + `hasNodeRuntime()` 守卫（§4.385，含 4 例回归）；
- **Runtime Qualification 的 Visual golden 打印成功后不退出**：挂到 45 分钟 job 上限被
  cancel；补 `killTree` + `stderr.destroy()`（§4.384）；
- **A37 提交漏刷测试数真值源**：新增 4 例只改了 `packages/export/README.md` 的**文件数**，
  漏了 `tests/qualification/README.md`「各包规模」行的**用例数**（export 158→162、
  合计 2129→2133）与两处内联复述 ⇒ CI 首次报红，已四处同步（§4.387）；
- **`rust-check-windows` 首跑暴露 5 例 Unix 语义硬编码进单测**（§4.389 / §4.390）：
  `read_only_dir_fails_original_intact`（目录 chmod 权限位）、
  `copy_and_restore_app_dir` / `restore_single_file_app`（进程内替换 vs detached 调度）、
  `external_editor_in_place_edit_never_overwrites`（inode vs `len:mtime` 身份键）、
  `disk_full_write_fails_original_intact`（`/bin/sh` + `ulimit -f`）。全部按 `cfg` 分叉或
  标注 Unix 专属机制；**PRD §141 硬指标（Conflict / 无静默覆盖 / 原文件不动）两平台
  断言均保留，产品代码一行未改**。

## 3. 工程质量（不改变产品行为）

- **新增 `ci.yml` 的 `rust-check-windows` job**：`windows-latest` / `cargo test --locked`
  全量（lib + `file_safety_corpus` integration），镜像既有 `rust-check-macos` 的
  「不变量只存在于本地才会跑的测试里 = 没守护」判据。台账 `P0-EDITOR-005` 的
  `windows-ci` 证据通道由「仅定向子集」补齐为「全量常态验证」；
- 护栏覆盖型基线同步：`JOB_BASELINE 16→17` / `USES_BASELINE 61→64` /
  `CARGO_CMD_BASELINE 6→7`（cargo 7 条全带 `--locked`）；
- 审计 §4.387–§4.390 入账；最终 **CI run 42812667106 = success（9/9 job 全绿）**。

## 4. ⚠️ 证据等级（如实声明）

- **macOS 产物未签名、未公证**（本仓无 Apple Developer 凭据）⇒ 首次打开会遇到 **Gatekeeper 警告**，
  需在「系统设置 → 隐私与安全性」中允许，或右键 →「打开」。**Windows 产物未做代码签名**。
- **本次没有真机体验验收** —— 上述行为的证据是**单元测试 + CI 契约护栏**；
  「真机交互真的对了吗」这一层**未闭环**。
- **`PASS-E = 0/51` 与 4 项 P0 未闭环 依然成立**（`P0-EDITOR-005` / `P0-EXPORT-001` /
  `P0-PERF-001` / `P0-QA-001`，阻塞于真机运行时验证 / 人工 UX Gate / 隔离打印设备 /
  三平台性能对照）—— **正式发布是「发布状态」的变更，不是「完成度」的变更**（ADR-0031）。
- 当前状态真值源 = `tests/parity/verify-release-gate.mjs` 的输出（**NO-GO**）。
