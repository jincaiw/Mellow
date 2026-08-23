# 真机桌面执行包（Phase 1 输入交互矩阵）—— 在任何 Windows/Linux 桌面机器上执行

> 目的：完成 ADR-0019 Gate 所需的「输入交互」级矩阵（IME 组词 / Caret / Clipboard / 10MB / 打印）。
> CI runner 已证明：三平台构建+启动+渲染 PASS（见 runtime-matrix-evidence-2026-08-18.md）；
> 输入注入在无头 CI 环境受限，需真实桌面会话。本包让任何普通电脑即可执行。
> 对照基线：Typora 1.14.6（可选，用于效率对照）。
> 版本说明：任何 1.14.9 及以上实测结果须注明为 patch observation，不得改写本执行包的规范基线。

## 一、需要的机器
- Windows 10/11 桌面（1 台）：微软拼音 / 搜狗输入法
- Linux 桌面（1 台，Ubuntu LTS 或 Fedora）：fcitx5 或 ibus
- （macOS 已验 8/8；可跳过或补日文/五笔）

## 二、安装 Mellow
从 GitHub Releases 或 CI artifact 下载安装包：
- Windows：`mellow-windows` artifact → MSI 或 NSIS EXE 安装
- Linux：`mellow-linux` artifact → 安装 .deb（Ubuntu/Debian）或 .rpm（Fedora）或直接运行 AppImage

## 三、一键执行矩阵

### 3.1 Linux（fcitx5/ibus）—— IME 组词矩阵（8 场景，自动断言）
```bash
# 前置：安装依赖
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

# 启动 fcitx5 后执行矩阵（DISPLAY 指向真实桌面 :0）
export DISPLAY=:0 GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx
# 将 harness 中的 DISPLAY=:99 改为 :0，release binary 路径改为安装后的可执行文件
node tests/benchmark/ime-matrix-linux.mjs --im=fcitx5

# 预期输出：8/8 场景通过（你好中文 各出现 1 次 + undo 干净）
```

### 3.2 Windows —— 手动矩阵（自动化 runner 不存在，按清单执行）
按 `docs/qualification/phase1-runtime-qualification-manual.md` §2 逐项执行并记录：
- I1-I11 IME（微软拼音/搜狗：输入/标题/列表/表格/代码/链接/公式/undo）
- C1-C7 Caret/Selection（点击/方向键/Shift/双击/拖选/Home-End）
- P1-P6 剪贴板（纯文本/富文本/HTML→MD/TSV→表/位图/文件）
- D1-D2 拖放、U1-U5 Undo/外部变更/10MB、O1-O3 打印/PDF/HTML、A1-A2 焦点

### 3.3 macOS（可选补测）
```bash
node tests/benchmark/ime-matrix.mjs          # 简体拼音（System Events）
node tests/benchmark/golden-journeys.mjs     # Golden Journeys（记录实际 Typora 版本；1.14.9 仅作 patch observation）
```

## 四、结果回填
1. 把结果写入 `docs/qualification/runtime-matrix-{platform}-2026-08-*.md`（模板见 phase1 手册 §3）；
2. 汇总到 `tests/qualification/README.md`；
3. 提交后由维护者更新 ADR-0019 Gate 裁决（全过 → Tauri 最终锁定；任一 FAIL → 切换 Electron 评估）。

## 五、已知边界（CI 已定位）
- Linux 无头（Xvfb）下 WebKitGTK 不接收 XTEST 合成键 → 必须在真实桌面会话执行；
- Windows CI 无交互桌面，SendKeys 未达 WebView2 → 必须在真实桌面会话执行。

## 六、耗时估计
- Linux 自动矩阵：约 10 分钟（8 场景）；
- Windows 手动矩阵：约 1-2 小时；
- macOS 补测：约 30 分钟。
