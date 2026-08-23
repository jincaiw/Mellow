# 阶段 1 三平台真机 Runtime Qualification 执行手册

> 依据：PRD §111/§112、ADR-0019 §2/§3、docs/specs/runtime-qualification-plan.md、docs/plans/typora-parity-master-plan.md §12。
> 目的：决定 Tauri 2 是否正式锁定；任何 FAIL 触发 ADR-0019 §2 → 切换 Electron。
> 状态：⏳ 待真机执行（Windows/Linux 需用户提供真机/VM；macOS 本机可执行）。

## 0. 前置
- 从 CI Release Packaging 产物下载安装包：Windows（MSI + NSIS）、Linux（AppImage + deb + rpm）、macOS（DMG）。
- 每台测试机记录：OS 版本（Win10/11、Ubuntu LTS/Fedora、macOS 版本）、CPU 架构、IME 输入法版本（微软拼音/搜狗/简体拼音/五笔/fcitx5/ibus）、WebView 版本（WebView2 / WebKitGTK / WKWebView）。
- 对照基线：Typora 1.14.6（安装于同一机器，用于行为对照）。
- 测试素材：tests/fixtures/（1MB.md、5MB.md、100k-lines.md、large-table.md、100-mermaid.md、1000-images.md 等）。


## 0.5 一键执行命令速查（自动化 runner）

### macOS（需 GUI 会话 + 辅助功能权限）
```bash
# IME 矩阵（System Events 输入；简体拼音）
node tests/benchmark/ime-matrix.mjs
# Golden Journeys（需 Typora 对照安装；实际版本须记录，1.14.9 仅为 patch observation）
node tests/benchmark/golden-journeys.mjs --app=mellow
# 性能对照（screen-timing 需屏幕录制权限）
node tests/benchmark/run-benchmark.mjs
```

### Linux（容器或真机：需 xdotool + xclip + fcitx5/ibus）
```bash
# IME 矩阵（fcitx5；ibus 用 --im ibus）
node tests/benchmark/ime-matrix-linux.mjs --im fcitx5
node tests/benchmark/ime-matrix-linux.mjs --im ibus
# 素材生成（大文件等）
node tests/benchmark/generate-fixtures.mjs
```

### Windows（无自动化 runner —— 手动执行 §2 矩阵，按 I1-I11/C1-C7/P1-P6/D1-D2/U1-U5/O1-O3/A1-A2 逐项记录）

### 结果回填
- 每平台完成后把结果表写入：docs/qualification/runtime-matrix-{platform}-*.md；
- 汇总到 tests/qualification/README.md Pass/Fail 表；
- IME corruption ≠ 0 等任一 §2 触发条件 → 记录并启动 ADR-0019 §2 切换评估（ADR-0022 记录裁决）。
## 1. 安装矩阵（每平台）
| 步骤 | 通过标准 | 结果 |
|---|---|---|
| 安装包可安装（MSI/NSIS/deb/rpm/AppImage/DMG） | 无错误，快捷方式/菜单项出现 |  |
| 启动应用 | 窗口出现，编辑器可输入 |  |
| .md 文件关联注册 | 双击 .md 用 Mellow 打开 |  |
| 卸载 | 完整卸载无残留 |  |

## 2. Runtime 矩阵（每平台 × 每输入法）
执行每个场景，记录：PASS / FAIL + 截图或日志。任何「IME 丢字/重复」= 一票否决（ADR-0019 §2）。

### 2.1 输入（IME）
| # | 场景 | 通过标准 |
|---|---|---|
| I1 | 英文（Latin）连续输入 100 字符 | 无丢字/重复/顺序错乱 |
| I2 | 中文全拼输入「今天天气很好」 | composition 期间无 marker 抖动，提交后无重复 |
| I3 | 中文输入中插入格式化（输入中按 Cmd/Ctrl+B 无效或安全） | 无文本损坏 |
| I4 | 在标题行输入中文（`## 中文标题`） | marker reveal 不干扰 IME |
| I5 | 在列表项输入中文 | 同上 |
| I6 | 在表格单元格输入中文 | 同上 |
| I7 | 在代码块/行内代码输入 | 无自动格式化 |
| I8 | 在链接/图片 alt/数学公式中输入中文 | 同上 |
| I9 | 日文 IME smoke（如有输入源） | 无 corruption |
| I10 | Emoji 输入 | 正常 |
| I11 | Dead keys（如 Linux compose key） | 正常 |

### 2.2 Caret / Selection
| # | 场景 | 通过标准 |
|---|---|---|
| C1 | 鼠标点击定位 | 无偏移 |
| C2 | 方向键逐字符移动 | 无跳跃 |
| C3 | Shift+方向键选择 | 正确 |
| C4 | 双击选词 / 三击选段 | 平台惯例 |
| C5 | 拖拽选择 | 正常 |
| C6 | Home/End（平台惯例） | 正常 |
| C7 | 格式化切换时 Caret 不跳（bold/heading 应用/撤销） | 无回归 |

### 2.3 剪贴板
| # | 场景 | 通过标准 |
|---|---|---|
| P1 | 复制普通文本 → 粘贴纯文本应用（Notepad/TextEdit） | 纯文本正确 |
| P2 | 复制 → 粘贴到 Word/Gmail（rich） | HTML 富文本正确 |
| P3 | 浏览器复制富文本 → Mellow 粘贴 | 转 Markdown |
| P4 | 表格复制（TSV）→ Mellow 粘贴 | 转 GFM 表格 |
| P5 | 截图粘贴（剪贴板位图） | 保存到 assets 并插入引用 |
| P6 | 复制文件粘贴 | 拷贝文件并插入 |

### 2.4 拖放
| # | 场景 | 通过标准 |
|---|---|---|
| D1 | 拖入单个 .md | 打开文档 |
| D2 | 拖入图片（单/多张） | 按图片策略插入 |

### 2.5 Undo / 文件
| # | 场景 | 通过标准 |
|---|---|---|
| U1 | 输入→Undo→Redo 各 20 步 | 无损坏 |
| U2 | IME 输入后 Undo | 一次动作一次撤销 |
| U3 | 外部编辑文件（干净） | 自动重新加载 |
| U4 | 外部编辑（dirty） | 冲突对话框三选项可用 |
| U5 | 打开 10MB / 100k 行文件 | 可编辑、可搜索、可保存 |

### 2.6 输出
| # | 场景 | 通过标准 |
|---|---|---|
| O1 | Cmd/Ctrl+P 打印 | 系统打印对话框，排版正确 |
| O2 | 导出 PDF（中文 + 图片 + 表格 + 数学 + Mermaid） | CJK 无乱码，三平台排版一致 |
| O3 | 导出 HTML | 可打开 |

### 2.7 焦点 / 无障碍
| # | 场景 | 通过标准 |
|---|---|---|
| A1 | Tab 遍历 UI | 焦点可见 |
| A2 | 编辑器中 Esc/方向键 | 正常 |

## 3. 结果回填
- 每平台完成后把结果表写入本仓库：docs/qualification/runtime-matrix-windows-2026-08-*.md（同名 linux/macos），并在 tests/qualification/README.md 更新 Pass/Fail 汇总。
- 任一平台出现：IME corruption ≠ 0、caret blocker、剪贴板 P0 不可修复、10MB 不可编辑、WebKitGTK 渲染实质分叉 → **立即记录并启动 ADR-0019 §2 切换评估**（新增 ADR-0021 记录裁决）。
- 三平台全 PASS → ADR-0021 记录 Tauri 正式锁定，阶段 2+ 继续。

## 4. 本手册更新记录
- 2026-08-17：创建（阶段 1 执行手册）。
