# Runtime Qualification Plan

## 1. 目的

决定 Mellow 是否正式锁定 Tauri 2。

核心原则：

> 体验优先于安装包体积。

---

## 2. 候选

A. Tauri 2
- Windows WebView2
- macOS WKWebView
- Linux WebKitGTK

B. Electron/Chromium
- fallback

---

## 3. 测试原型

只做最小 Editor Shell：

- MarkEdit CoreEditor
- Live heading
- bold
- list
- table
- math
- Mermaid
- clipboard
- file open/save

不要先做完整 UI。

---

## 4. 平台矩阵

### Windows
- Windows 10
- Windows 11
- x64
- Microsoft Pinyin
- Sogou Pinyin

### macOS
- Apple Silicon
- current supported macOS
- system Pinyin

### Linux
- Ubuntu LTS GNOME
- Fedora KDE/GNOME
- fcitx5
- ibus

---

## 5. 必测项目

### Input
- ASCII
- Chinese IME
- Japanese IME smoke
- emoji
- dead keys

### Caret
- click
- arrows
- word movement
- selection
- drag
- Home/End

### Composition
- heading
- bold
- list
- table
- link
- code
- math

### Clipboard
- plain
- HTML
- image
- file
- TSV

### Rendering
- CSS
- fonts
- Math
- Mermaid
- images

### System
- drag/drop
- file dialog
- open with
- print
- PDF
- zoom

### Performance
- 1 MB
- 5 MB
- 10 MB
- 100k lines

---

## 6. Tauri Pass Conditions

全部满足：

- IME corruption = 0
- no blocking caret bug
- no selection loss
- clipboard P0 complete
- PDF/print viable
- 10 MB editable
- typing P95 target met
- Linux P0 journeys pass
- no platform requires editor fork

---

## 7. Fail Conditions

以下任意一项无法在合理成本内修复：

- Linux IME unstable
- WKWebView composition regression
- WebView2 clipboard blocker
- platform-specific editor logic proliferates
- PDF/print impossible to unify
- CodeMirror behavior diverges materially

则：

> 切 Electron/Chromium。

---

## 8. Decision Deadline

必须在：
- V0.0 结束
- V0.1 完整 UI 开发开始之前

锁定。

禁止：
- V0.3 后才决定换 Runtime

---

## 9. 输出

最终形成：
- benchmark report
- platform issue list
- pass/fail table
- ADR-0002 final decision
