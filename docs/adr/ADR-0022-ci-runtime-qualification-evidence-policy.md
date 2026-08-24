# ADR-0022 — Windows／Linux 以 GitHub CI Runtime Qualification 作为 V1 正式证据

**Status:** Accepted
**取代范围：** ADR-0019 §3 与 ADR-0021 中「Windows／Linux 必须以人工真机回填」的证据收集要求；不改变 Tauri 2 Runtime 决策或 Electron fallback 条款。

---

## 背景

V1 的维护环境只有 macOS。产品仍须交付 Windows、macOS、Linux 三平台，但无法持续获得可用于人工验收的 Windows／Linux 桌面机器。现有 GitHub Actions `Runtime Qualification` 已在 `windows-latest`、`ubuntu-latest`、`macos-latest` 构建 release 二进制、启动应用、验证文档打开与 10 MB 文档存活；Linux job 还配置 Xvfb 与 fcitx5 并执行中文输入矩阵。

## 决策

1. macOS 继续使用本机实机的 Typora 1.14.9 对照、中文 IME、Undo／Redo、文件回读与 UX 证据。
2. Windows 与 Linux 的 V1 Runtime Qualification 以 GitHub Actions 的同平台 runner 为正式、可复现的验收环境；每次候选提交必须通过 `Runtime Qualification` workflow。
3. Windows／Linux CI Gate 至少包含：release 构建、应用启动、Markdown 打开、10 MB 文档存活；Linux 还必须执行 fcitx5 中文输入矩阵、保存读回与 Undo 断言。任何自动化 FAIL 均阻断发布。
4. CI 的无交互桌面限制必须如实记录。它不证明物理设备上的候选窗手感，但在本 ADR 的 V1 范围内，不再要求以人工 Windows／Linux 机器补齐该项；macOS 的 Typora 对照仍是体验基线证据。

## 后果

- `tests/qualification/README.md`、运行时计划、执行包和 parity ledger 统一使用「macOS native + Windows CI + Linux CI」的证据合同。
- 只有已推送提交对应的 workflow 成功运行才可回填 Windows／Linux 状态；旧 SHA 的成功 run 不可替代当前候选提交。
- ADR-0019 的 Electron fallback 条款保持有效：任何 CI 或 macOS 实测发现 IME corruption、caret/selection blocker、剪贴板 P0 blocker、10 MB 不可编辑或明显平台分叉，都必须重新评估 Runtime。

## 相关

- ADR-0019 — Desktop Runtime 最终决策
- ADR-0021 — 三平台构建矩阵阶段记录
- `.github/workflows/runtime-qualification.yml`
