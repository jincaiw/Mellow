<!-- fixture: mixed-document.md — 综合文档（仿真实写作场景，供集成/性能测试） -->

# Mellow 开发基线

## 概述

Mellow 是以 **MarkEdit** 为底座重构的跨平台 Markdown 桌面编辑器，目标是 *Typora 级* 体验。

## 核心原则

1. Markdown 纯文本是唯一真源
2. ~~私有富文本模型~~ 不允许
3. `CodeMirror 6 + Lezer` 是编辑器核心

> 平台差异只能存在于 Adapter / Native Enhancement。

## 表格示例

| 阶段 | 内容 | 状态 |
|:-----|:-----|:----:|
| Phase 0 | Runtime 基线 | ✅ |
| Phase 1 | Editor Parity Core | 🔄 |
| Phase 2 | Rich Markdown | ⏳ |

## 代码示例

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

## 引用

> Mellow 首先是一款 Typora 级 Markdown 编辑器，然后才是一款跨平台平台。

## 任务清单

- [x] 保留 MarkEdit CoreEditor
- [ ] 完成三平台 Runtime Qualification
- [ ] 默认简体中文 i18n

## 结尾

- 更多信息见 [PRD](../product/Mellow-PRD-V1.2-FINAL.md)
- 架构见 [architecture](../../docs/architecture/README.md)
