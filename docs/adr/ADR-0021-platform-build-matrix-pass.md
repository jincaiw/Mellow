# ADR-0021 — 三平台构建矩阵通过；真机 Runtime 矩阵待回填（ADR-0019 Gate 阶段记录）

**Status:** Accepted

## 背景
- ADR-0019 要求：三平台真机矩阵回填后视为最终确认；任一平台触发 §2 条件则切换 Electron。
- 阶段 1（优化方案）要求先完成三平台构建矩阵，再执行真机 Runtime 矩阵（IME/Caret/Clipboard/Print/10MB）。
- 历史：项目此前从未成功完成三平台构建（文档声称的 V1.0 仅 macOS 本地验证）。

## 决策与结果
### 构建矩阵（2026-08-17，GitHub Actions release.yml，全部 PASS）
| 平台 | 产物 | 结果 |
|---|---|---|
| Windows（windows-latest） | MSI + NSIS EXE + updater sig/latest.json | ✅ PASS（10m42s） |
| macOS（macos-latest） | DMG + sig（未签名：无 Apple 凭据） | ✅ PASS（7m42s） |
| Linux（ubuntu-latest） | AppImage + deb + rpm + sig | ✅ PASS（8m8s） |

- 工具链：pnpm workspace 全流程（含 vendored CoreEditor yarn 特例）在三平台验证通过。
- CI（ci.yml，ubuntu）5 job 全绿：editor-core（vendored 185+wrapper 14）、editor-engine（486）、mellow-packages（typecheck+unit）、desktop-frontend（bundle+tsc+vite）、rust-check（cargo test 37+16+4）。


### 启动级 Runtime 验证（2026-08-18，CI runner 作为测试机）
用 GitHub Actions windows-latest / ubuntu-latest / macos-latest 作为真实测试机执行 Runtime Qualification 流水线（`.github/workflows/runtime-qualification.yml`）：
| 平台 | 应用启动 | 文档渲染 | 键盘输入注入 |
|---|---|---|---|
| Windows | ✅ PASS（app_alive=True） | 未自动化 | ⚠️ SendKeys 未达 WebView2（CI 无交互桌面） |
| macOS | ✅ PASS（app_alive=true，CLI 打开） | 未自动化 | 未自动化 |
| Linux（Xvfb） | ✅ PASS（进程存活 + 1200x775 主窗口 + X 焦点确认） | ✅ PASS（截图可见文档内容） | ⚠️ WebKitGTK 在 Xvfb 下不接收 XTEST 合成键（无头环境限制，已精确定位；非应用缺陷） |

证据：`docs/qualification/runtime-matrix-evidence-2026-08-18.md` + artifact `linux-runtime-evidence`（截图/窗口几何/日志）。
**结论更新**：三平台「构建 + 启动」级 Runtime 证据已获得；IME 组词/Caret/Clipboard 的「输入交互」级验证仍需真机桌面（Windows/Linux）——ADR-0019 §2 无 FAIL，Tauri 维持锁定。

### 真机 Runtime 矩阵（待执行）
### 真机 Runtime 矩阵（待执行）
- Windows/Linux 真机（或 VM）的 IME（微软拼音/搜狗/fcitx5/ibus）、Caret/Selection、Clipboard（plain/HTML/TSV/image）、拖放、Undo、外部变更、10MB、Print/PDF、焦点——**尚未执行**（需用户提供机器，执行手册见 docs/qualification/phase1-runtime-qualification-manual.md）。
- macOS 已验部分：简体拼音 8/8（历史矩阵）；日文输入源与 typing P95（ABC）待补。
- 结论：ADR-0019 §2 触发条款在构建层面**无 FAIL 记录**；Tauri 维持锁定。真机矩阵回填后本 ADR 更新为最终确认，或触发 §2 切换流程。

## 后果
1. 三平台安装包可由 release.yml 一键产出（workflow_dispatch 或 v* 标签）。
2. 阶段 2+（UI/Parity）可继续推进；真机矩阵不阻塞 UI 开发，但阻塞「V1.0 正式发布」结论。
3. 若真机矩阵出现 §2 条件 → 按 ADR-0019 预演路径切换 Electron，并新增 ADR 记录。

## 相关
- ADR-0019（Runtime 最终决策）、ADR-0020（pre-release 状态修正）
- docs/qualification/phase1-runtime-qualification-manual.md
- .github/workflows/release.yml、ci.yml