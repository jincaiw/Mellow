# Codex Implementation Plan

## 1. 总原则

Codex 不按“做一个类似 Typora 的应用”大任务工作。

必须按：

```text
Spec
→ Contract
→ Tests
→ Implementation
→ Platform adapters
→ Parity QA
```

拆解。

---

## 2. Phase 0 — Repository & Runtime

### T-0001
Fork MarkEdit，保留 LICENSE/attribution。

### T-0002
建立 monorepo：
- apps/desktop
- packages/editor-core
- packages/editor-react
- packages/app-core
- packages/host-api
- packages/i18n
- tests

### T-0003
把 CoreEditor 独立成 package。

### T-0004
移除 Safari-only assumptions。

### T-0005
实现最小 Host API。

### T-0006
Tauri 2 shell。

### T-0007
Runtime Qualification harness。

### Exit
- Win/macOS/Linux 能输入中文、打开、保存
- Runtime ADR locked

---

## 3. Phase 1 — Editor Parity Core

### T-0101 Heading
### T-0102 Strong/Emphasis/Strike
### T-0103 Inline Code
### T-0104 Links
### T-0105 Lists
### T-0106 Task
### T-0107 Quote
### T-0108 Code Fence
### T-0109 Marker reveal framework
### T-0110 Composition guard
### T-0111 Undo grouping
### T-0112 Source/Live switch

### Exit
- Typora basic writing journey pass

---

## 4. Phase 2 — Rich Markdown

### T-0201 Table model
### T-0202 Table toolbar
### T-0203 Table keyboard
### T-0204 Image insert pipeline
### T-0205 Image asset strategy
### T-0206 Math
### T-0207 Mermaid
### T-0208 Footnote
### T-0209 TOC
### T-0210 Alerts
### T-0211 YAML
### T-0212 safe HTML

### Exit
- rich document parity journey pass

---

## 5. Phase 3 — Desktop Workflow

### T-0301 Tabs
### T-0302 File Tree
### T-0303 File List
### T-0304 Outline
### T-0305 Quick Open
### T-0306 Global Search
### T-0307 Recent/Pin
### T-0308 File filters
### T-0309 Command Registry
### T-0310 Command Palette
### T-0311 Slash Commands

### Exit
- folder workflow parity pass

---

## 6. Phase 4 — Clipboard / Images / UX

### T-0401 HTML paste
### T-0402 URL-on-selection
### T-0403 TSV paste
### T-0404 multi-format copy
### T-0405 image batch ops
### T-0406 Focus
### T-0407 Typewriter
### T-0408 Floating Toolbar
### T-0409 Reader
### T-0410 已移除（Split Mode 不属于 V1 范围）

---

## 7. Phase 5 — Safety

### T-0501 Document identity
### T-0502 Atomic save
### T-0503 Recovery
### T-0504 External watcher
### T-0505 Conflict compare
### T-0506 Encoding
### T-0507 EOL
### T-0508 File operation undo
### T-0509 Large File Mode

### Exit
- file safety corpus pass

---

## 8. Phase 6 — Appearance / Export / i18n

### T-0601 Theme engine
### T-0602 6 built-in themes
### T-0603 zh-CN
### T-0604 en-US
### T-0605 Settings
### T-0606 PDF
### T-0607 HTML
### T-0608 Print
### T-0609 File association

---

## 9. Phase 7 — QA

### T-0701 Typora parity checklist
### T-0702 18 golden journeys
### T-0703 30 timed tasks
### T-0704 Windows IME matrix
### T-0705 macOS IME matrix
### T-0706 Linux IME matrix
### T-0707 10MB benchmark
### T-0708 export corpus
### T-0709 clipboard cross-app
### T-0710 crash/recovery

---

## 10. Codex Task Template

每个任务必须包含：

```text
Goal
Relevant spec
Scope
Out of scope
Interfaces
Files allowed
Acceptance criteria
Tests
Performance budget
Parity reference
```

---

## 11. 禁止 Codex 的任务形式

禁止：

- “重写整个编辑器”
- “把 UI 做得像 Typora”
- “顺便优化其他平台”
- “顺便重构”
- “发现问题自行大改架构”

跨域变更必须先更新 ADR。

---

## 12. Merge Gate

PR 必须通过：

- unit
- integration
- golden
- architecture checks
- platform CI
- lint/typecheck
- relevant parity journey

涉及 Editor：
- IME regression check
- undo regression check

涉及 File：
- source fidelity
- external conflict

涉及 UI：
- keyboard
- screenshot/manual check
