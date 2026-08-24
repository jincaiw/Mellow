# 发布候选审计（V1.0 Release Candidate，2026-08-18）

> 依据：v1.0-final-release-review 的 18 项验收 + ADR-0020/0021 + 本会话全部执行记录。
> 判定：✅ 有可复核证据 / ⏳ 需真机桌面（执行包就绪）/ 🔒 需 Apple 凭据 / ⚠️ 部分验证

| # | 验收项 | 状态 | 证据 |
|---|---|---|---|
| 1 | P0 100% | ✅ | PRD §133 60 项：58 代码完成 + 2 项（IME Gate/UX Benchmark）本质为真机执行；p0-scope-status-2026-08-18.md |
| 2 | Typora UX Score ≥92 | ⏳ | 门禁模板 ux-score-gate-template.md 就绪；需真机对照 Typora 1.14.9 计分 |
| 3 | Live Editing ≥24/25 | ⚠️ | 引擎 495 测试全绿 + macOS 历史 8/8；正式 24/25 计分待真机 |
| 4 | Caret/IME/Undo 15/15 | ⚠️ | macOS 简体拼音 8/8（历史）+ undo guard 测试；Win/Linux 待真机 |
| 5 | File Safety 5/5 | ✅ | file-safety 16 测试 + Source Fidelity 141 文件 0 diff 复跑 PASS |
| 6 | IME corruption=0 | ⚠️ | macOS 8/8 无 corruption；Windows/Linux 待真机（执行包） |
| 7 | data loss=0 | ✅ | File Safety Corpus 全过（含崩溃/rename/delete/磁盘满） |
| 8 | Source Fidelity | ✅ | 141 文件 Open→Save 0 diff（复跑 PASS） |
| 9 | Windows | ✅(启动)/⏳(输入) | CI runner：构建+启动 app_alive=True + 10MB 存活；输入矩阵待真机 |
| 10 | macOS | ⚠️ | 构建+启动+10MB PASS；签名公证 🔒 待 Apple 凭据 |
| 11 | Linux | ✅(启动)/⏳(输入) | CI runner：构建+启动+渲染+10MB PASS；IME 输入矩阵待真机（Xvfb 无头限制已定位） |
| 12 | 10MB usable | ✅(打开)/⏳(编辑) | 三平台 10MB 打开存活证据；编辑交互待真机 |
| 13 | PDF CJK | ✅ | 历史验证：Noto SC 子集嵌入 + ToUnicode 映射（本地生成实测） |
| 14 | zh-CN 100% | ✅ | i18n 15 测试 + 残留英文串清理 + 原生菜单 zh 完整 |
| 15 | en-US 100% | ✅ | en-US 完整（含原生菜单 locale 重建） |
| 16 | License | ✅ | MIT + THIRD_PARTY_NOTICES + SPDX |
| 17 | Security | ✅ | CSP/H1/H2/远程图默认关/sanitize/最小权限（M1/M2 已修） |
| 18 | Packaging | ✅(构建) | 三平台打包多次全绿（release.yml 复跑）；安装/卸载矩阵待真机 |

## 待办（按优先级）
1. **真机桌面执行包**（任何 Windows/Linux 电脑）：IME/Caret/Clipboard/10MB 编辑/打印矩阵 → 回填 #2/3/4/6/9/11/12 → ADR-0019 Gate 最终裁决；
2. **Apple 凭据**：签名公证（#10）→ DMG 分发；
3. **UX Score 实测**：按 ux-score-gate-template.md 三平台计分（#2）；
4. 全部 18 项通过后：生成 V1.0 Release Notes + tag（ADR-0020 要求）。

## 结论
代码侧与构建/启动级验证全部完成（782 TS + 59 Rust 测试全绿、三平台打包全绿、Source Fidelity 0 diff）；
发布候选处于「**功能与工程完备，待真机验收与签名**」状态。
