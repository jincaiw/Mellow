# @mellow/editor-engine — Mellow Live Markdown Engine

第一阶段（Phase 1）：**Marker Reveal**（Heading / Bold / Italic / Strike / Inline Code）。

严格遵循 `docs/specs/live-markdown-engine-spec.md`。

## 原理

- **Markdown Text 是唯一真源**：引擎只做视觉隐藏（`Decoration.mark` + CSS `font-size: 0`），从不修改文档文本；
- **基于 Lezer 语法树**：直接使用语法树原生 marker 子节点（`HeaderMark` / `EmphasisMark` / `StrikethroughMark` / `CodeMark`）；
- **Reveal Policy（spec §5）**：caret 或 selection 与内容节点相交 → source（显示全部 marker）；否则 → rendered（隐藏）；
- **Composition Guard（spec §6）**：compositionstart → compositionend 期间只映射 decoration 位置，不重建；
- **增量渲染（spec §3/§20）**：只遍历视口内语法树，只在 doc/selection/viewport 变化时重算；
- **不重建 EditorView**：ViewPlugin + decorations 更新。

## 注入方式（不修改 vendored CoreEditor）

引擎通过 CoreEditor 官方扩展 API 注入：

```js
MarkEdit.addExtension(MellowEngine.install());
```

- 运行时通过 `window.require('@codemirror/view')` 获取 CM6 模块，与编辑器**同一实例**（扩展兼容要求）；
- 宿主集成：`apps/desktop/scripts/build-editor-bundle.mjs` 在构建 editor bundle 时复制 `dist/` 并注入 loader。

## 构建与测试

```sh
npm run build     # tsc → dist/（宿主构建时会自动复制 + 补 .js 扩展名）
npm test          # jest（jsdom + 真实 CM6）
```

## 测试覆盖（29 用例）

| 维度 | 覆盖 |
|---|---|
| markers | Lezer 节点常量、heading marker 范围（`# ` 含空格） |
| reveal | idle / caret-before / caret-inside / caret-after / selection（partial/marker/外） |
| IME | 合成期间冻结、合成结束恢复、Escape 兜底 |
| undo/redo | 文本还原、marker 不进入历史、selection 不进入历史 |

## 边界语义

- caret 在节点边界（from / to）内 → source（与 Typora 一致：光标紧贴闭合 marker 时显示）；
- 节点外（from-1 / to+1）→ rendered；
- 无法识别/partial parse 节点 → source（安全 fallback）。

## 后续阶段

- Phase 2：Lists / Blockquote / Links / Images
- mixed 状态（caret 只显示相邻 marker）
- Source Mode 联动（spec §5.5）
- 用户设置 always show markers（spec §5.6）
