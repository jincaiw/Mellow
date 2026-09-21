# Mellow v1.5.12

## 本次发布

- 修复 Linux Runtime Qualification IME 矩阵的代码块场景：点击代码行后不再用 Ctrl+End 把 caret 移到围栏外，确保拼音提交发生在代码块内。
- 保留上一轮的 Linux IME readBack 后重新聚焦修复，避免 X11/WebKit 焦点停留在窗口 chrome 导致 Undo 假失败。
- 保持 v1.5.11 的全部功能与 parity 改动。

## 验证

- `node --check tests/benchmark/ime-matrix-linux.mjs`
- `git diff --check`
- `npm run parity`

## 发布说明

本版本用于重新执行 Runtime Qualification。Linux code 与 paragraph 场景通过后，再评估是否可提升为稳定发布；在 P0 Release Gate 全部闭环前保持 pre-release。
