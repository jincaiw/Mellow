# @mellow/app-core

应用核心逻辑（**经 `host-api` 依赖注入，平台无关**）。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口；**契约（不变量 / 错误语义 / 性能边界 / 禁止行为 / parity reference / 夹具）见同目录 `CONTRACT.md`**。

## 职责

纯逻辑层：文档生命周期、文件树/文件列表、大纲、快速打开、全局搜索、恢复快照、字数、
Reader 渲染、自动保存、外部变更、扩展注册。**不含任何平台 API 调用**（无 `@tauri-apps/*`、
无 `process.platform`、无 `navigator.platform`）—— 平台能力一律经 `host-api` 注入。

## 公开接口

`src/index.ts` 的导出**按模块分组**（下表列的是**代表**导出、**非全部**；完整清单见该文件）：

| 模块 | 代表导出 |
|---|---|
| 文档服务 | `DocumentService`、`createAppServices`、`documentSuggestedName`、`DocumentRenameService` |
| 编辑器桥 | `EditorBridge`、`createEditorBridgeFromCore`、`TextChange` |
| 文件操作历史 | `FileOpHistory`、`FileOp`、`describeOp` |
| 外部变更 | `ExternalChangeService`、`ExternalChangeDetail` |
| 恢复 | `RecoveryService` |
| 图片文件操作 | `ImageFileOpsService`、`AssetSettingProvider` |
| Reader | `renderReaderHtml`、`renderInline`、`slugifyHeading`、`ReaderRenderOptions` |
| 文档状态 | `DocumentState`、`DocumentTab`、`OpenDocumentInput`、`TabDiskState` |
| 文件树 | `FileTreeModel`、`FileTreeService`、`DEFAULT_FILE_TREE_OPTIONS`、`filterFileTree`、`sortEntries` |
| 文件列表 | `FileListModel`、`FileListService`、`DEFAULT_FILE_LIST_OPTIONS`、`titleFromMarkdown` |
| 大纲 | `OutlineModel`、`buildOutline`、`parseHeadings`、`headingOffsetForAnchor` |
| 快速打开 | `fuzzyScore`、`rankQuickOpen`、`scanQuickOpen` |
| 最近文件 / 文件夹 | `pushRecentFile`、`parseRecentFiles`、`RECENT_FILES_LIMIT`、`togglePinRecentFolder` |
| 字数 | `countWords`、`formatWordCountStats` |
| 全局搜索 | `buildSearchRegex`、`groupSearchResults`、`DEFAULT_SEARCH_EXCLUDES` |
| 扩展 | `ExtensionRegistry`、`buildExtensionContext`、`createNullExtensionHost` |
| 自动保存 | `parseAutosaveMinutes`、`autosaveIntervalMs`、`DEFAULT_AUTOSAVE_MINUTES` |
| 表格模板 | `buildGfmTable`、`TABLE_TEMPLATE_DEFAULT_ROWS`、`TABLE_TEMPLATE_MAX_COLUMNS` |

## 依赖关系（实测）

> **⚠️ 2026-10-08 更正（审计 §4.161）**：上行的**数字原写 124**，实测 `src/index.ts` 是
> **36 条 `export {}` 语句、共 130 个唯一名字** ⇒ **已改为 130**。
> ⚠️ 本包是 13 个带「导出 N 个符号」声明的 README 里**唯一**数字过期的一个（其余 12 个实测**全部正确**）。
> ⇒ 已落判据（`tests/parity/verify-package-conventions.mjs`：**凡 README 写「导出 N 个符号」，
> N 必须 == 该包 `src/index.ts` 的具名导出数**）—— 数字漂移会**硬失败**。
> 另：下表表头本就写着「**代表**导出」⇒ 它是**选摘**（57 个名字），**不是**全部 130 个（如实保留该措辞）。
>
> **⚠️ 2026-10-09 更正（审计 §4.194）**：上面的「**已改为 130**」**已被取代** ——
> 130 与 `CONTRACT.md` 的「**124**」**互相矛盾**，而**人工逐块数**（值导出 90 + type 导出 41）= **131**
> ⇒ **三个数各不相同**，且**口径本身模糊**（`export * from` 的重导出 / type-only export /
> **一行里粘连两个 export** —— 两次脚本试算都差 1）。
> ⇒ 按「**口径不确定的数字，与其写错不如不写**」：**本行与 `CONTRACT.md` 均改为「不复述数字」**
> （指向 `src/index.ts`）；判据也随之改为「**只锁包内两处一致**」（**不再与代码比对** —— 见 §4.194）。

- **依赖**：`editor-engine`、`extension-api`、`host-api`
- **被消费**：`apps/desktop`、`desktop-ui`

> 本仓跨包导入走**相对路径**（如 `../../../packages/settings/src`），
> `package.json` 的 `name`/`main` 是**装饰性的**（没人按名导入）—— 见审计 §4.95。

## 测试

`test/` 下 **25** 个测试文件，覆盖上述各模块（`autosave` / `documentState` / `fileTree` /
`outline` / `quickOpen` / `reader` / `recovery` / `wordCount` …）。

## 边界与约束

- **平台无关**：由 `verify-adapter-contract.mjs` 静态守（核心包零运行时 Tauri 标识 / 零平台 API）。
- 与 `document-model` **无导入关系**：`documentState.ts` 自带同一套字段
  —— 这是审计 §4.95 记录的**架构级待裁决项**（ADR-0008 的实现未被采用）。
