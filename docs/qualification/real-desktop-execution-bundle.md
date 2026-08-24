# 桌面执行包（Phase 1 输入交互矩阵）

> 目的：完成 Runtime Qualification 矩阵。macOS 使用实机；Windows／Linux 使用 GitHub Actions CI（ADR-0022）。
> CI runner 已证明：三平台构建+启动+渲染 PASS（见 runtime-matrix-evidence-2026-08-18.md）；
> Windows／Linux 的正式证据只能来自 GitHub Actions（ADR-0022）。无头 CI 的输入注入限制必须如实记录；它既不能被当作产品通过，也不能被误判为产品回归。
> 对照基线：Typora 1.14.9（build 7785，可选，用于效率对照）。
> 版本说明：报告必须记录实际 Typora 版本；1.14.6 仅可作为历史参考。

## 一、需要的环境
- macOS 桌面（本机可复现）；
- GitHub Actions：`windows-latest` 与 `ubuntu-latest`（由 `Runtime Qualification` workflow 提供）。

## 二、安装 Mellow
从 GitHub Releases 或 CI artifact 下载安装包：
- Windows：`mellow-windows` artifact → MSI 或 NSIS EXE 安装
- Linux：`mellow-linux` artifact → 安装 .deb（Ubuntu/Debian）或 .rpm（Fedora）或直接运行 AppImage

## 三、一键执行矩阵

### 3.1 Linux（GitHub Actions：Xvfb + fcitx5）—— 中文 IME 矩阵（8 场景，自动断言）
```bash
# workflow 已安装依赖；以下仅用于在 Linux CI job 内复现
sudo apt install -y xdotool xclip fcitx5 fcitx5-chinese-addons fonts-noto-cjk   # Ubuntu/Debian
# 或：sudo dnf install -y xdotool xclip fcitx5 fcitx5-chinese-addons            # Fedora

# 克隆仓库（或仅复制 harness）
git clone https://github.com/jincaiw/Mellow.git && cd Mellow

# 配置 fcitx5 拼音（默认输入法）
mkdir -p ~/.config/fcitx5
cat > ~/.config/fcitx5/profile <<'EOF'
[Groups/0]
Name=Default
Default Layout=us
DefaultIM=pinyin

[Groups/0/Items/0]
Name=keyboard-us
Layout=

[Groups/0/Items/1]
Name=pinyin
Layout=
EOF

# 启动 fcitx5 后执行矩阵（CI 使用 DISPLAY=:99）
export DISPLAY=:99 GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx
node tests/benchmark/ime-matrix-linux.mjs --im=fcitx5

# 预期输出：8/8 场景通过（你好中文 各出现 1 次 + undo 干净）
```

### 3.2 Windows（GitHub Actions）
`windows-latest` job 负责 release 构建、应用启动、Markdown 打开和 10 MB 文档存活。该 job 是 Windows V1 Runtime 的正式 Gate；Save SendKeys 是无交互桌面下的诊断，不可将其读回结果冒充为输入交互验证，也不会再要求人工 Windows 机器补测。

### 3.3 macOS（可选补测）
```bash
node tests/benchmark/ime-matrix.mjs          # 简体拼音（System Events）
node tests/benchmark/golden-journeys.mjs     # Golden Journeys（记录实际 Typora 1.14.9 版本）
```

截至 2026-08-24，本机对隔离 release bundle 的 Golden Journey 已复验：Latin input、中文 IME、选区加粗、列表续写、表格 Tab 导航、Undo、数学与 Mermaid 源码保真通过。此前出现的 Latin 输入为空已由编辑事件桥接闭环修复。日文 IME（Journey 3）曾出现偶发截断；修复候选态期间桌面壳跨 WebView 同步后，新 release 对逐键输入 `nihongo` + Enter 的保存读回连续 3 次均含「にほんご」或「日本語」，且 Journey 15 Undo 复验通过。该项保留为兼容性观察；按 2026-08-24 产品决策，它不属于 V1 的语言支持范围或 Gate。Windows/Linux 中文输入法及完整 UX Gate 尚未取得证据，ADR-0019 Gate 仍不得关闭。

同日完整回归（隔离 release、单次连续执行 Journey 1、2、3、4、7、8、9、10、15、17）全部通过：Latin、中文 IME、日文 IME（兼容性观察）、选择加粗、列表 Enter、表格 Tab、数学/ Mermaid 源码保真、Undo、10 MB 编辑保存均为 PASS。10 MB 本轮 `editable=621 ms`、`editSave=5779 ms`。该结果是 Mellow 自身 macOS 回归证据；Typora 1.14.9 的并行 UX 计分仍须在得到关闭现有 Typora 进程的明确授权后执行，Windows/Linux 真机矩阵亦未替代。

10 MB Golden Journey 已升级为「OCR 稳定渲染 → 移至文末并收起选择 → 键入 `z` → Cmd+S → 磁盘读回」完整路径。2026-08-24 的隔离 release 连续 2 次通过：可编辑探测分别为 607.2 ms、611.8 ms（低于 1–1.5 s 目标），总旅程为 7.359 s、6.645 s，编辑与保存读回为 5.833 s、5.538 s。此前一次“仅渲染”及一次首键替换初始选择的 runner 伪影均不作为证据。该项可记为 macOS 已验；Windows/Linux 与完整 N=5 性能报告尚未取得证据，仍不得关闭跨平台性能 Gate。

同日，在用户明确关闭 Typora 后，以 `--app=both --close-existing-typora --journey=1,2,3,4,7,8,9,10,15,17` 执行了同一份临时文件的双端对照，runner 已确认 Typora 为 1.14.9（build 7785）。两端均通过 Latin input、中文 IME、选区加粗、列表 Enter 续写、表格 Tab 导航、数学／Mermaid 源码保真及 Undo。日文 IME 因本机未启用日文罗马字输入源而在两端均为 SKIP；它现为非阻断性兼容性观察。10 MB 文件上，Mellow 完成编辑、保存和读回（总旅程 9.094 s，编辑与保存 5.366 s）；Typora 在 200.753 s 后提示“该文件过大，无法呈现”。后者是 Typora 的产品边界，不是 Mellow 失败，Mellow 在该项为更优实现。此对照只补强 macOS 证据，不能替代 Windows/Linux 真机矩阵或 UX Gate。

## 四、结果回填
1. 把结果写入 `docs/qualification/runtime-matrix-{platform}-2026-08-*.md`（模板见 phase1 手册 §3）；
2. 汇总到 `tests/qualification/README.md`；
3. 提交后由维护者更新 ADR-0019 Gate 裁决（全过 → Tauri 最终锁定；任一 FAIL → 切换 Electron 评估）。

## 五、已知边界（CI 已定位）
- Linux 的 Xvfb/WebKitGTK 不接收 XTEST 合成键；候选 run `32735541431` 的 8 个 fcitx5 场景均为 `0/8`，且 ASCII／快捷键诊断同样未送达编辑器。Weston headless + `wtype` 的候选 run `32737593888` 也失败，因为 Weston 未公开 `virtual-keyboard` 协议。最新的 uinput／`ydotool` run `32742294505` 已可写入英文并触发格式化、Undo，却仍无法让 fcitx5 将拼音提交为「你好中文」（`0/8`）。三者均为 CI 输入适配器／输入法服务链路限制，Linux IME Gate 仍为未通过；
- Windows CI 无交互桌面，SendKeys 未达 WebView2，因此其保存读回仅作诊断，不能替代输入交互证明。

## 六、耗时估计
- Linux 自动矩阵：约 10 分钟（8 场景）；
- Windows CI 冒烟：约 10 分钟；
- macOS 补测：约 30 分钟。
