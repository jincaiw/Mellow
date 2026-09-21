# Mellow v1.5.13

## 本次发布

- 修复 Linux IME Qualification 的 Undo 读回路径：Undo 验证不再执行 Ctrl+A/C，避免读回动作改变编辑器 selection/history 语义；改为只保存后读取验证。
- 保留 v1.5.12 的代码块 IME 坐标与 caret 修复。

## 验证

- `node --check tests/benchmark/ime-matrix-linux.mjs`
- `npm run parity`
- `git diff --check`

## 发布说明

本版本用于重新执行 Runtime Qualification。Release Gate 在 Linux IME/Undo 及其他 P0 证据闭环前保持 NO-GO，版本保持 pre-release。
