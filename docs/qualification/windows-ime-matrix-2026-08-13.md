# Windows IME Matrix（2026-08-13）

对应：`docs/specs/ime-test-plan.md`（Windows：Microsoft Pinyin / Sogou Pinyin）。

## 环境结论

**本机无可用 Windows 运行环境**，真实输入法 Matrix **未能执行**：

- macOS 宿主（Apple M4），Parallels Desktop 26.2 已安装，含 `Windows 11.pvm` / `Windows 11 (1).pvm`；
- 但 `Windows 11.pvm` config 无效（`prlctl start` → *configuration file is invalid*，`config.pvs` 与当前 Parallels 版本不兼容，backup 恢复无效）；`Windows 11 (1).pvm` 未注册；
- 即使 VM 可用，真实 IME 候选窗（TSF）**无法程序化驱动**，按 ime-test-plan §7 必须人工在 Windows 真机执行。

→ 按计划执行路径改为：**自动化部分本地/CI 验证（PASS），真实输入法部分 NOT TESTED（阻塞：无 Windows 环境）**。

## 自动化验证（PASS，CI 检查点）

`packages/editor-engine` jest 全套 **430 测试通过**（含 IME Composition Guard 4 项）：

| Guard 测试 | 覆盖（ime-test-plan §5） | 结果 |
|---|---|---|
| 合成期间 caret 移动不触发重算（渲染冻结） | no caret jump / no marker hide | ✅ PASS |
| 合成期间 doc 变化只映射 decoration 位置 | no lost char / no duplicated char（decoration 一致性） | ✅ PASS |
| Escape 兜底结束合成（compositionend 丢失） | no unexpected marker hide | ✅ PASS |
| **合成结束后 Undo 不破坏文本与 marker（新增）** | **no undo corruption** | ✅ PASS（本次新增，`history()` 栈 + composition 后 undo 恢复原文） |

Composition Guard 应用范围：plugin / selectionToolbar / clipboardCopy / focusMode / math / slashCommands / typewriterMode（7 处 `isComposing()` 冻结）。

**CI**：`.github/workflows/ci.yml` → `editor-engine` job 在每次 push/PR 执行 `npm test`（含 ime.test.ts，jsdom 环境）；`app-core` job 执行 104 测试。真实平台 IME 仍需人工（§7）。

## Node Matrix（真实输入法 × Windows）

| Node | Microsoft Pinyin | Sogou Pinyin |
|---|---|---|
| paragraph | NOT TESTED | NOT TESTED |
| heading | NOT TESTED | NOT TESTED |
| bold | NOT TESTED | NOT TESTED |
| italic | NOT TESTED | NOT TESTED |
| strike | NOT TESTED | NOT TESTED |
| inline code | NOT TESTED | NOT TESTED |
| link | NOT TESTED | NOT TESTED |
| image alt | NOT TESTED | NOT TESTED |
| list | NOT TESTED | NOT TESTED |
| task | NOT TESTED | NOT TESTED |
| quote | NOT TESTED | NOT TESTED |
| code fence | NOT TESTED | NOT TESTED |
| table | NOT TESTED | NOT TESTED |
| inline math | NOT TESTED | NOT TESTED |
| block math | NOT TESTED | NOT TESTED |
| Mermaid source | NOT TESTED | NOT TESTED |
| YAML | NOT TESTED | NOT TESTED |
| search | NOT TESTED | NOT TESTED |
| rename | NOT TESTED | NOT TESTED |
| command palette | NOT TESTED | NOT TESTED |
| slash menu | NOT TESTED | NOT TESTED |

## 必须验证项（ime-test-plan §5 / §8）

| 项 | 自动化代理 | 真实平台 |
|---|---|---|
| 丢字 lost char | ✅ PASS（composition 事务一致性测试） | NOT TESTED |
| 重复 duplicated char | ✅ PASS | NOT TESTED |
| Caret blocker | ✅ PASS（渲染冻结 + Escape 兜底） | NOT TESTED |
| Undo corruption | ✅ PASS（本次新增 undo 回归测试） | NOT TESTED |
| premature slash commit | ✅ PASS（slashCommands `isComposing` 守卫） | NOT TESTED |
| unexpected marker hide | ✅ PASS | NOT TESTED |
| full editor remount | ✅ PASS（无 remount 代码路径） | NOT TESTED |

## Gate（§8）

- 自动化部分：**无丢字/重复/caret blocker/undo corruption 复现**（430 测试，CI 持续检查）；
- 真实输入法部分：**未完成 → V1 Windows Gate 保持未解锁**；需 Windows 真机（Microsoft Pinyin + Sogou）人工执行本 Matrix 后回填。
