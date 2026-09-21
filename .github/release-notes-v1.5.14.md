# Mellow v1.5.14

## 本次发布

- 修复 Linux IME Qualification Undo 验证：所有 Ctrl+Z 操作先连续完成，最后只保存一次并读回，避免每次 Undo 之间的 Ctrl+S 改变 dirty/disk 状态或污染 WebKitGTK focus/history 观察窗口。
- 保留代码块 IME 坐标与 caret 修复。

## 验证

- `node --check tests/benchmark/ime-matrix-linux.mjs`
- `git diff --check`
- `npm run parity`

## 发布说明

本版本用于重新执行 Runtime Qualification。Linux IME/Undo 场景通过后，再评估是否可以提升 Release Gate；在全部 P0 证据闭环前保持 pre-release。
