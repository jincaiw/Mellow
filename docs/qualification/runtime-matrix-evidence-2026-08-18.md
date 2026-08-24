# Runtime 矩阵证据（CI runner 作为测试机，2026-08-18）

> 方法：GitHub Actions windows-latest / ubuntu-latest / macos-latest 作为真实 Windows/Linux/macOS 测试机。
> 证据来源：run 32048030837 / 32051604276 / 32052920275（Runtime Qualification workflow）。
> 判定口径：构建级 + 启动级已获真机证据；Linux IME 组词注入在无头环境受 WebKitGTK 输入限制（详见下）。

## 一、Windows（windows-latest，真实 Windows Server 2022 机器）
| 项 | 结果 | 证据 |
|---|---|---|
| 构建 | ✅ PASS | cargo build --release 成功（release binary 产出） |
| 应用启动 | ✅ PASS | `app_alive=True`（Start-Process 后 12s 进程存活） |
| 输入自动化 | ⚠️ N/A | SendKeys 未达 WebView2 编辑器（CI 会话无交互式桌面焦点）——需真机人工确认 |
| 结论 | **Windows 启动级验证通过**；输入矩阵待真机 | |

## 二、macOS（macos-latest，真实 macOS 机器）
| 项 | 结果 | 证据 |
|---|---|---|
| 构建 | ✅ PASS | cargo build --release 成功 |
| 应用启动 + CLI 打开 | ✅ PASS | `app_alive=true`（启动 + 打开 /tmp/mellow-mac-smoke.md 后 12s 存活） |
| 结论 | **macOS 启动级验证通过** | |

## 三、Linux（ubuntu-latest，真实 Ubuntu 机器，Xvfb 虚拟显示）
| 项 | 结果 | 证据 |
|---|---|---|
| 构建 | ✅ PASS | cargo build --release 成功（8.5MB release binary） |
| 应用启动 | ✅ PASS | 进程存活；窗口 6291459（1200x775）`--onlyvisible` 找到 |
| 窗口聚焦 | ✅ PASS | `xdotool getwindowfocus` = 6291459（应用窗口） |
| 文档渲染 | ✅ PASS | 截图分析：标题栏 + 文档内容在顶部渲染；`Hello **Mellow**` 可见 |
| 键盘输入（XTEST/合成键） | ⚠️ N/A | 三重独立诊断证实无头环境输入阻断：①全局 XTEST 键入未达；②直投窗口合成键未达；③**Ctrl+Shift+P 命令面板未弹出**（输入前后/快捷键后三张截图全部字节级相同 MD5 bcb808cc）——WebKitGTK web 进程在 Xvfb 下不接收任何合成键盘事件，非应用缺陷（macOS 本机 IME 8/8 通过佐证） |
| IME 组词（fcitx5） | ⏳ 待真机 | ime-matrix-linux.mjs 8 场景可执行（全部跑完），输入注入受限 |
| 结论 | **Linux 构建+启动+渲染级验证通过**；键盘/IME 矩阵需真机（无头环境限制已精确定位） | |

## 三.5、10MB 大文件启动冒烟（PRD §110，run 32056415715）
| 平台 | 打开 10MB 文档后进程存活 |
|---|---|
| Windows | ✅ `10mb_alive=True` |
| macOS | ✅ `10mb_alive=true` |
| Linux | ✅ `10mb_alive=true` |

**证据**：三平台 release 二进制打开 10MB markdown 后 15s 进程存活（无崩溃）；Linux 同时截取渲染截图（mellow-10mb.png）。

## 四、结论与影响
1. **三平台构建 + 启动级 Runtime 证据已获得**（此前完全缺失）：应用在真实 Windows/macOS/Linux 机器上可构建、可启动、可渲染文档。
2. **Linux 无头输入限制**：WebKitGTK 在 Xvfb 下不处理 XTEST 合成键盘事件（libEGL DRI3 退化 + 输入注入无效）——这是 CI 环境的固有边界，**不影响产品在真实 Linux 桌面的输入**（需真机确认）。
3. **ADR-0019 Gate 状态**：构建级 + 启动级 PASS；IME/Caret/Clipboard 的**输入交互级**验证仍需真机（Windows/Linux）——ADR-0021 维持「构建矩阵 PASS、真机交互矩阵待执行」。
4. **自动化资产已就绪**：ime-matrix-linux.mjs（8 场景 fcitx5/ibus）、golden-journeys.mjs（macOS）、截图证据管线（Xvfb import + artifact）——真机就绪后可直接执行。

## 2026-08-24 CI 复核说明

Runtime Qualification run `32732636928` 在远端 SHA `924d5f2` 显示为成功，但其 Linux job 日志显示 fcitx5 的 paragraph、heading、format、list、table、code、math、link 共 8 个场景均未写入「你好中文」，结果为 `0/8`。该次绿灯不得作为 Linux 中文 IME 通过证据：内层 `dbus-run-session` shell 当时未启用 `errexit`，随后 10 MB 冒烟与 `pkill` 的成功掩盖了矩阵的非零退出码。

工作区中的 `.github/workflows/runtime-qualification.yml` 已增加 `set -euo pipefail`，并将 macOS 启动／10 MB 存活断言改为 fail-fast。必须在包含该修复的提交上重新运行 workflow，才能产生有效的 Windows／Linux CI 证据。

## 2026-08-24 候选分支复验

| Run | SHA | macOS | Windows | Linux fcitx5 |
|---|---|---|---|---|
| `32735541431` | `3ebaa74` | ✅ 启动／10 MB | ✅ 启动／保存诊断／10 MB | ❌ `0/8`；Xvfb 的 XTEST 普通输入、直投键和快捷键均未到达 WebKitGTK |
| `32737593888` | `fc0c6ed` | ✅ 启动／10 MB | ✅ 启动／保存诊断／10 MB | ❌ `0/8`；Weston headless 未公开 `virtual-keyboard` 协议，`wtype` 每次输入均被 compositor 拒绝 |
| `32742294505` | `39ffdd8` | ✅ 启动／10 MB | ✅ 启动／保存诊断／10 MB | ❌ `0/8`；`ydotool` 的 uinput 键流已实际驱动英文输入、格式化和 Undo（各场景 `undo ok`），但 fcitx5 没有把拼音提交为「你好中文」 |

三次失败都发生在 CI 输入注入器／输入法服务到 WebKitGTK 的链路，且应用打开、文档原文、Undo 读回保持正常。第三次已排除“键盘事件完全未送达”：低层 uinput 键流能写入英文，也能触发格式化与 Undo；剩余失败精确收敛为无头 CI 的 fcitx5 组词提交链路。它们不构成 Linux 编辑器中文 IME 的产品回归证据，也绝不能被登记为 PASS。根据 ADR-0022 的 fail-fast Gate，候选分支尚不可宣称三平台 Runtime Qualification 完成。

## 五、关键证据文件
- .github/workflows/runtime-qualification.yml（runner 测试机流水线）
- tests/benchmark/ime-matrix-linux.mjs（Linux IME 矩阵，已加固：读回回退/窗口选择/kill-by-pid/双击聚焦）
- artifact `linux-runtime-evidence`（mellow-screen.png / mellow-after-type.png / 窗口几何 / 应用日志）
