# 总体架构

> 来源：MarkEdit 上游 `81da2a20` 全量分析（2026-08）。约束：PRD §0.1/§0.2/§113 + ADR-0001/0004/0007/0017。

## 四层结构

```
┌──────────────────────────────────────────────────────────────┐
│ CoreEditor/  TypeScript · CodeMirror 6 + Lezer（WebView 内）   │
│   modules/  commands·input·selection·history·search·toc·link  │
│             ·task·table·completion·snippets·frontMatter...    │
│   styling/  markdown.ts·matchers/lezer.ts·nodes/*（12 节点）   │
│   api/      MarkEdit 全局对象 + extension API                 │
│   bridge/   native/*（→宿主） web/*（←宿主）                   │
└──────────────────────────┬─────────────────────────────────────┘
        window.webkit.messageHandlers.bridge（Promise IPC）
┌──────────────────────────▼─────────────────────────────────────┐
│ MarkEditKit/  Swift · WebView 桥（EditorMessageHandler/       │
│               WebBridge*/NativeModule*，ts-gyb 生成）          │
└──────────────────────────┬─────────────────────────────────────┘
┌──────────────────────────▼─────────────────────────────────────┐
│ MarkEditCore/  Swift · 共享模型（EditorConfig/IndexHtml/      │
│                 SharedTypes/BridgeMessage）                    │
└──────────────────────────┬─────────────────────────────────────┘
┌──────────────────────────▼─────────────────────────────────────┐
│ MarkEditMac/  Swift · AppKit 桌面壳（22,940 行）                │
│   Editor/  Document·ViewController·WebView                    │
│   Main/ Panels/ Settings/ Shortcuts/ Updater/ Scripting/      │
│   Modules/ SharedUI·TextBundle·Statistics·FileVersion...      │
└────────────────────────────────────────────────────────────────┘
```

## Mellow 双核心（PRD §0.2）

```text
┌─────────────────────────────┐
│ TypeScript Editor Core      │  输入/Selection/Undo/AST/Decoration
│ MarkEdit CoreEditor + CM6   │
└──────────────┬──────────────┘
               │ Typed Host API（PRD §116）
┌──────────────▼──────────────┐
│ Rust System Core            │  File/Watch/Search/Recovery/Export
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│ React Desktop UI            │  Tabs/Sidebar/Settings/Palette
└─────────────────────────────┘
```

## 五层边界（PRD §113.1）

| 层 | 内容 | 平台相关 |
|---|---|---|
| L1 Product Contract | journey/commands/shortcuts/settings/file 语义/export/i18n | 否 |
| L2 Editor / UI | Markdown 编辑、Live rendering、tabs、search、reader | 否 |
| L3 System Core | File/Watch/Search/Recovery/Export/Settings/Security | 否（Rust） |
| L4 Platform Adapter | 文件选择器、系统菜单、分享、Open With | **是** |
| L5 Native Enhancement | Quick Look/Explorer/XDG、平台安全 API | **是** |

平台差异只允许出现在 L4/L5（ADR-0016；AGENTS.md 统一规则 11）。

## 现状（2026-08 基线）

- CoreEditor vendored（只读）✅；editor-engine（marker reveal Phase 1）✅
- Tauri 2 + React 最小壳 ✅；Host Adapter 仅 fs/bridge（其余服务缺口见 host-adapter.md）
- Swift 层（28,781 行）为迁移对象，未开始 Desktop Runtime 迁移
