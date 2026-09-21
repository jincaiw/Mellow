# Mellow v1.5.11

## 本次发布

- 修复 Linux Runtime Qualification IME 矩阵的代码块场景坐标：根据 Linux 诊断截图，编辑器代码行约在 y=195，旧探针 y=110 点击到空白工具栏。
- 修复 IME 矩阵 Undo 前焦点恢复：readBack 的 Ctrl+A/C + Ctrl+S 后重新聚焦编辑器并将 caret 放到文末，避免 X11/WebKit 将 Ctrl+Z 留在窗口 chrome。
- 保持 v1.5.10 的全部功能与 parity 改动。

## 验证

- `node --check tests/benchmark/ime-matrix-linux.mjs`
- `git diff --check`
- `npm run parity`

## 发布说明

本版本用于重新执行跨平台 Runtime Qualification。发布状态由 Windows、macOS、Linux 运行时矩阵结果决定；在 Linux IME/Undo 闭环前保持 pre-release，不标记稳定 Latest。
