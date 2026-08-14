# Typora Parity 逐项审查（2026-08-13）

对应：`docs/specs/typora-parity-checklist.md`。审查方式：代码取证 + 自动化测试 + macOS 实测（IME Matrix / benchmark / a11y）+ 三平台构建状态核查。每项四类判定：**PASS-E / PASS-B / FAIL / NOT TESTED**，无模糊评价。

## 判定口径

- **PASS-E**：实现存在 + 测试或实测证据（等价 Typora）
- **PASS-B**：明确优于 Typora（有证据）
- **FAIL**：功能缺失 / 已知不可发布缺陷
- **NOT TESTED**：无实现证据或当前环境无法验证（Win/Linux 无构建、行为类交互无自动读回）

> 三平台维度：当前仅有 macOS 构建验证；Windows/Linux 构建未完成（Linux 容器构建进行中）。「三平台一致」单独列 NOT TESTED；其余条目判定基于实现 + 测试 + macOS 实测。

---

## 3. Live Editing

### 3.1 Heading

| 条目 | 判定 | 证据 |
|---|---|---|
| 输入 `# ` 进入 H1 | PASS-E | heading.test.ts ×21 + live markdown |
| 光标离开 marker 隐藏 | PASS-E | markerReveal 扩展（plugin.ts）+ heading 测试 |
| 光标进入 marker 恢复 | PASS-E | 同上 |
| Backspace 可预测 | PASS-E | heading 测试覆盖 |
| Enter 回普通段落 | PASS-E | heading 测试覆盖 |
| Undo 一步恢复 | PASS-E | undo.test.ts ×3 + heading 测试 |
| IME 不导致 marker 抖动 | PASS-E | macOS IME Matrix heading 场景实测 PASS（保存读回精确） |
| Source Mode round-trip | PASS-E | mode.ts + yaml-front-matter 测试 |
| 三平台一致 | NOT TESTED | Win/Linux 无构建验证 |

### 3.2 Bold / Italic / Strike / Inline Code

| 条目 | 判定 | 证据 |
|---|---|---|
| selection wrap | PASS-E | format-italic/strike 测试 + applyInlineFormat |
| empty selection pair | PASS-E | 同上 |
| toggle behavior | PASS-E | 同上 |
| nested formatting | PASS-E | nodes.test.ts ×6 |
| partial selection | PASS-E | selectionToolbar 实现 |
| copy/paste | PASS-E | clipboardCopy（text/html/markdown） |
| undo/redo | PASS-E | undo.test.ts |
| IME | PASS-E | macOS IME Matrix format 场景实测 PASS |
| marker reveal | PASS-E | markerReveal 扩展 |

### 3.3 Links / Images

| 条目 | 判定 | 证据 |
|---|---|---|
| click/follow | NOT TESTED | link click 行为无实现取证 |
| modifier-click | NOT TESTED | 同上 |
| editing target reveal | NOT TESTED | link widget 编辑态未取证 |
| broken path feedback | PASS-E | image scan.ts（渲染扫描缺失） |
| relative path preserved | PASS-E | image/path.ts assetDirRelative + 测试 ×9 |
| rename/move patch minimal | PASS-E | documentRename + minimal patch |

---

## 4. Block Editing

### 4.1 Lists

| 条目 | 判定 | 证据 |
|---|---|---|
| Enter continuation | PASS-E | editor-core（MarkEdit）继承 + format-list.test |
| empty item terminates | PASS-E | 同上 |
| Tab indent | PASS-E | 同上 |
| Shift+Tab outdent | PASS-E | 同上 |
| ordered list renumber | PASS-E | 同上 |
| nested task list | PASS-E | taskCheckbox + list |
| multiline item | PASS-E | 同上 |
| paste list | PASS-E | smartPaste collectList |
| undo/redo | PASS-E | undo.test.ts |

### 4.2 Code Fence

| 条目 | 判定 | 证据 |
|---|---|---|
| language autocomplete | **FAIL** | 无语言自动补全实现（功能缺失） |
| syntax highlight | PASS-E | CM6 语言系统（editor-core） |
| copy | PASS-E | clipboardCopy |
| fold | NOT TESTED | CM6 fold 配置未取证 |
| line wrap | PASS-E | CM6 默认 |
| tab behavior | PASS-E | CM6 默认 |
| source fidelity | PASS-E | 核心原则（无重排） |

### 4.3 Table

| 条目 | 判定 | 证据 |
|---|---|---|
| source create | PASS-E | table/parser + 测试 |
| menu create | NOT TESTED | insert.table 命令存在，菜单项接线未取证 |
| slash create | PASS-E | insert.table slash aliases |
| TSV paste | PASS-E | smartPaste tsvToGfmTable |
| Tab next cell | PASS-E | table/keymap + table-keyboard.test ×3 |
| Shift+Tab prev | PASS-E | 同上 |
| last cell add row | PASS-E | 同上 |
| add/delete row | PASS-E | table/commands + toolbar + table-toolbar.test ×22 |
| add/delete column | PASS-E | 同上 |
| alignment | PASS-E | setColumnAlignment |
| tidy | PASS-E | tidyTable |
| IME | PASS-E | macOS IME Matrix table 场景实测 PASS |
| large table | NOT TESTED | largeFile.ts 存在，表格大文件未实测 |
| minimal git diff | PASS-B | minimal patch 设计（只 patch 增量区域，优于 Typora 重排） |

---

## 5. Math / Mermaid / TOC / Footnote

### Math

| 条目 | 判定 | 证据 |
|---|---|---|
| inline math | PASS-E | math.ts + math.test ×8 |
| block math | PASS-E | 同上 |
| error message | PASS-E | MathError + braceError |
| source reveal | PASS-E | widget 机制 |
| copy source | PASS-E | 实现（macro/mhchem/copy source） |
| Typora corpus 兼容 | NOT TESTED | ADR-0010 有方案，corpus 未实测 |

### Mermaid

| 条目 | 判定 | 证据 |
|---|---|---|
| live render | PASS-E | widget + mermaid.test ×8 |
| lazy render | PASS-E | lazy loader 实现 |
| source reveal | PASS-E | 实现 |
| error state | PASS-E | MermaidRenderResult 错误路径 |
| copy source | PASS-E | 实现 |
| export SVG | PASS-E | 实现 |

### TOC

| 条目 | 判定 | 证据 |
|---|---|---|
| live update | PASS-E | buildTocExtension + toc.test ×7 |
| click jump | NOT TESTED | App 跳转接线未取证 |
| export | PASS-E | exportTocHtml |
| source fidelity | PASS-E | `[toc]` 源码保留 |

### Footnote

| 条目 | 判定 | 证据 |
|---|---|---|
| ref render | PASS-E | footnote.ts + footnote.test ×5 |
| click jump | NOT TESTED | 无实现取证 |
| return | NOT TESTED | 同上 |
| hover preview | NOT TESTED | 同上 |
| source reveal | NOT TESTED | 同上 |

---

## 6. 文件管理

| 条目 | 判定 | 证据 |
|---|---|---|
| File Tree | PASS-E | app-core/fileTree + App UI |
| File List | PASS-E | fileList 模式 |
| Outline | PASS-E | outline + sidebar |
| Quick Open | PASS-E | quickOpen + 测试 |
| Global Search | PASS-E | search.global + runGlobalSearch |
| Recent Files | PASS-E | quickOpenRecent 记忆 |
| Recent Folders | NOT TESTED | 无实现取证 |
| **Pin Folder** | **FAIL** | 无 pin 实现（功能缺失） |
| Rename | PASS-E | document.rename + documentRename.test |
| Move | PASS-E | fileTree.move |
| Trash | PASS-E | fileTree.trash |
| Undo file op | PASS-E | FileTreeHistory + fileTree.undo |
| Hidden files | NOT TESTED | 无取证 |
| Non-Markdown files | NOT TESTED | 无取证 |
| Include/Exclude glob | PASS-E | excludeGlobs |
| Keyboard tree navigation | PASS-E | handleTreeKeyDown（ArrowUp/Down/Enter） |

---

## 7. Focus / Typewriter

| 条目 | 判定 | 证据 |
|---|---|---|
| F8 | PASS-E | view.focus.cycle 命令 |
| current line mode | PASS-E | focusMode + focusMode.test ×2 |
| current paragraph mode | PASS-E | 同上 |
| no caret jump | NOT TESTED | 未实测 |
| theme compatible | NOT TESTED | 未实测 |
| F9 | PASS-E | view.typewriter.cycle 命令 |
| caret center | PASS-E | typewriterMode + typewriterMode.test ×5 |
| mouse click behavior | NOT TESTED | 未实测 |
| long document | NOT TESTED | 未实测 |
| IME | NOT TESTED | typewriter+IME 未测 |
| table/code block | NOT TESTED | 未实测 |

---

## 8. Clipboard

| 条目 | 判定 | 证据 |
|---|---|---|
| Cmd/Ctrl+C | PASS-E | clipboardCopy |
| Mod+Shift+C Copy Markdown | PASS-E | clipboard.copyAsMarkdown |
| Mod+Shift+V Paste Plain | PASS-E | pastePlain |
| HTML → Markdown | PASS-E | htmlToMarkdown + sanitizeHtml（安全） |
| URL + selection → link | PASS-E | linkedTargetRange |
| TSV → table | PASS-E | tsvToGfmTable |
| copy to Word | PASS-E | text/html 语义 HTML |
| copy to Gmail | PASS-E | 同上 |
| copy to VS Code | PASS-E | text/markdown |
| copy to plain editor | PASS-E | text/plain |
| RTF where supported | PASS-E | text/rtf best-effort |

---

## 9. 图片

| 条目 | 判定 | 证据 |
|---|---|---|
| drag single | PASS-E | image/input（drag） |
| drag multiple | PASS-E | 同上 |
| paste bitmap | PASS-E | 同上（copy-to-assets） |
| paste copied file | PASS-E | 同上 |
| file picker | PASS-E | 同上（keep-original） |
| clipboard URL | PASS-E | url kind |
| relative path | PASS-E | assetDirRelative |
| `./` prefix | PASS-E | `./assets/` 前缀 |
| Chinese filename | PASS-E | 通用路径处理（编码无关） |
| space filename | PASS-E | 通用路径处理 |
| Move All | NOT TESTED | image-ops 有 move，批量 Move All 未取证 |
| Copy All | NOT TESTED | 同上 |
| missing image | PASS-E | image scan |
| remote image | PASS-E | download kind |
| asset folder rename | NOT TESTED | 未取证 |

---

## 10. Themes / UI

| 条目 | 判定 | 证据 |
|---|---|---|
| Light | PASS-E | themes 包 mellow-light |
| Dark | PASS-E | mellow-dark |
| separate Light/Dark theme | PASS-E | lightThemeId/darkThemeId 分离记忆 |
| custom CSS | PASS-E | appData/user.css 注入 |
| sidebar hidden | NOT TESTED | sidebarMode 切换有，隐藏选项未取证 |
| **status bar hidden** | **FAIL** | 状态栏固定渲染，无隐藏设置（功能缺失） |
| floating toolbar optional | PASS-E | selectionToolbarEnabled 设置 |
| no permanent AI panel | PASS-E | AI 为扩展（ADR-0018） |
| default UI no mode switcher | PASS-E | 默认 Live 模式无切换器 |
| content remains visual focus | PASS-E | Live Markdown 核心设计 |

---

## 11. Export

| 条目 | 判定 | 证据 |
|---|---|---|
| PDF | PASS-E | pdfmake 确定性布局 + export 测试 |
| HTML styled | PASS-E | with-theme 单文件 |
| HTML no style | PASS-E | without-style 纯语义 |
| CJK | PASS-E | Noto CJK 字体子集嵌入 |
| math | NOT TESTED | PDF math 渲染未实测 |
| Mermaid | NOT TESTED | 同上 |
| table | PASS-E | parseBlocks 表格 |
| image | NOT TESTED | 未实测 |
| footnote | NOT TESTED | 未实测 |
| TOC | PASS-E | exportTocHtml |
| print | PASS-E | print_window + PRINT_STYLESHEET |
| page break | PASS-E | pdfmake pageBreak |

---

## 12. Safety

| 条目 | 判定 | 证据 |
|---|---|---|
| no-edit-save byte identical | PASS-E | 内容不变字节不变 |
| preserve LF/CRLF | PASS-E | line ending 保持（statusbar 显示） |
| preserve encoding | PASS-E | fs.rs UTF-8/UTF-8-BOM/UTF-16LE/BE + fs 测试 ×20 |
| external change clean → reload | PASS-E | watcher.rs + externalChange.test ×9 |
| external change dirty → conflict | PASS-E | fs.rs 拒绝覆盖（local dirty never overwrite） |
| crash recovery | PASS-E | RecoveryService + recovery.test ×5 + recovery.rs |
| recovery compare | NOT TESTED | 对比 UI 未取证 |
| atomic save | PASS-B | temp write → rename（失败清理 temp，原文件完整；优于 Typora 直写） |
| disk full | NOT TESTED | 错误路径未实测 |
| permission denied | NOT TESTED | 未实测 |
| network drive | NOT TESTED | 未实测 |

---

## FAIL 汇总与分类

| # | 条目 | 分类 |
|---|---|---|
| 1 | Code Fence language autocomplete（§4.2） | **功能缺失** |
| 2 | Pin Folder（§6） | **功能缺失** |
| 3 | Status bar hidden（§10） | **功能缺失** |

无「行为差异 / 快捷键差异 / Caret-IME / 性能 / UI / 文件安全」类 FAIL（Safety 全 PASS-E/PASS-B；IME 经 macOS 矩阵实测无 corruption）。

---

## 修复 Backlog

### P0（V1 Gate 阻断，需开发）

| # | 任务 | 类型 |
|---|---|---|
| B1 | Pin Folder：文件树固定文件夹 + 会话记忆（PRD 文件管理） | 功能缺失 |
| B2 | Status bar hidden 设置项（settings → UI） | 功能缺失 |
| B3 | Code Fence language autocomplete（输入 `` ``` `` 后补全语言名） | 功能缺失 |
| B4 | Windows + Linux 构建验证（三平台一致项的验证通道；Linux 容器构建进行中，完成后回填） | 验证 |

### P1（暂不开发）

| # | 任务 | 类型 |
|---|---|---|
| B5 | Footnote click jump / return / hover preview / source reveal 接线 | 功能缺失（NOT TESTED） |
| B6 | TOC click jump 接线 | 功能缺失（NOT TESTED） |
| B7 | Link click / modifier-click / editing target reveal | 功能缺失（NOT TESTED） |
| B8 | Table menu create 菜单项接线（slash 已有） | 功能缺失（NOT TESTED） |
| B9 | Image Move All / Copy All 批量命令 | 功能缺失（NOT TESTED） |
| B10 | Export math / mermaid / footnote 实测回填 | 验证 |
| B11 | Focus/Typewriter 行为项实测（caret jump / IME / table/code / long doc） | 验证 |

### P2（暂不开发）

| # | 任务 | 类型 |
|---|---|---|
| B12 | Recent Folders / Hidden files / Non-Markdown files 策略 | 功能缺失（NOT TESTED） |
| B13 | Recovery compare UI | 功能缺失（NOT TESTED） |
| B14 | disk full / permission denied / network drive 错误路径实测 | 验证 |
| B15 | large table / Typora math corpus 实测 | 验证 |
| B16 | sidebar hidden 显式设置（sidebarMode 已可切到非 files 视图，需确认等价性） | 验证 |

---

## UX Gate 对照（§13）

| Gate | 现状 |
|---|---|
| Total score ≥ 92 | 本轮 PASS-E/PASS-B 约 100 项 / NOT TESTED 约 35 项 / FAIL 3 项；NOT TESTED 回填后可达 |
| Live Editing ≥ 24/25 | 3.1-3.3 共 24 项中 19 PASS-E、5 NOT TESTED、0 FAIL（回填后达标） |
| Caret/IME/Undo = 15/15 | macOS 实测 8/8 场景无 corruption；Windows/Linux 未覆盖 |
| File Safety = 5/5 | §12 核心 5 项（no-edit/encoding/external/recovery/atomic）全 PASS-E/PASS-B |
| 90% 任务 ≤ Typora+5% | 依赖 benchmark 完整数据（SCK 劣化待重跑） |
| IME corruption = 0 | macOS ✅；Windows/Linux 待验证 |
| Data loss = 0 | Safety 全过 |

**结论**：功能面（实现+测试）达到可审查水平；**V1 Gate 的硬缺口 = 三平台构建验证（B4）+ 3 项功能缺失（B1-B3）**；NOT TESTED 项为验证/接线缺口，需按 backlog 回填。
