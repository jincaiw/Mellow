# CONTRACT — `@mellow/app-core`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：纯逻辑层 —— 文档生命周期、文件树/文件列表、大纲、快速打开、全局搜索、
  恢复快照、字数、Reader 渲染、自动保存、外部变更、扩展注册、表格模板。
- **不属于本包**：**任何平台调用**（无 `@tauri-apps/*`、无 `process.platform`）——
  平台能力一律经 `host-api` **依赖注入**；也不属于 UI（`desktop-ui`）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**124** 个导出），按模块分组见 `README.md` 的表。
- 关键类型：`DocumentService`、`EditorBridge`、`FileTreeModel`、`OutlineModel`、`SearchResultsModel`、
  `ExtensionRegistry`、`RecentFileEntry`、`WordCount`、`ReaderRenderOptions`
- 跨包导入走**相对路径**（`name`/`main` 装饰性）—— 见审计 §4.95。

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| **平台无关**：零运行时 Tauri 标识 / 零平台 API | `tests/parity/verify-adapter-contract.mjs` ① ② |
| **设置项的消费**必须与 schema 的 `applyCommand` 对应 | `tests/parity/verify-settings-contract.mjs` |
| Reader 的**断链指示**必须带非颜色线索（WCAG 1.4.1 静态代理指标） | `tests/parity/verify-no-color-only-status.mjs` |
| Reader 渲染的 HTML 与编辑器安全白名单一致 | `verify-parity-ledger.mjs`（`safeHtml` 子集判据）+ `test/reader-sanitize.test.ts` |
| 侧栏/文件树/大纲/搜索的交互契约 | `verify-sidebar-contract.mjs`、`verify-shell-typography.mjs`、`verify-shell-widgets.mjs` |
| 自动保存 / 外部变更 / 恢复 / 最终换行 / 字数 的语义 | `test/autosave` · `externalChange` · `recovery` · `finalNewline` · `wordCount` |
| 大文件模式的阈值语义（**严格大于** `>5MB` / `>50,000 lines`，PRD §109） | `verify-parity-ledger.mjs`（PRD ↔ `largeFile.ts` ↔ benchmark 三方一致） |

## 4. 错误语义

- 服务方法返回 `Result<T>`（`ok` / `err({ code, message })`），**不抛**；
  `code` 取值见 `host-api` 的 `types.ts`。
- 文件系统类失败**必须降级可继续**（例如文件树读取失败 ⇒ 空树 + 提示，而非崩溃）。

## 5. 性能边界

- `filterFileTree` / `rankQuickOpen` / `groupSearchResults` 在**输入热路径**上
  ⇒ 必须为纯函数、O(n log n) 以内，**不得**做 I/O。
- 侧栏在**大文件树**下有基准：`test/sidebar-bench.test.ts`（**实测**而非声明）。
- 大文件降级由 `largeFile.ts` 判定，阈值是**宪法条款**（PRD §109）。

## 6. 禁止行为

- ❌ 引入任何平台 API / Tauri 依赖（会被 `verify-adapter-contract.mjs` 拦下）。
- ❌ 与 `document-model` **并行演化**同一套文档字段而不决定归属（见审计 §4.95，**架构级待裁决**）。
- ❌ 把 UI 逻辑放进本包（应去 `desktop-ui`）。
- ❌ 在 Reader 渲染里只靠颜色传达状态（会被 `verify-no-color-only-status.mjs` 拦下）。

## 7. Typora parity reference

- 侧栏（文件树 / 文件列表 / 大纲 / 搜索）的行为与排版：`docs/plans/typora-parity-master-plan.md` §3 真值表
  + 本机 Typora 1.14.9 实测。
- 大文件阈值：PRD §109（`>5MB` / `>50,000 lines`，**严格大于**）。
- 文件安全语义：`docs/specs/document-file-safety-spec.md`。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- 夹具在**仓库级** `tests/fixtures/`（`markdown/` / `toc/` / `alerts/` / `footnote/` / `math/` /
  `mermaid/` / `yaml/` / `html/` / `clipboard/` / `updater/` / `ux-gate/` / `typora-parity/`）。

## 9. 测试入口

- `test/` 下 **24** 个测试文件
- 护栏：`verify-adapter-contract.mjs`、`verify-settings-contract.mjs`、`verify-sidebar-contract.mjs`、
  `verify-shell-*.mjs`、`verify-no-color-only-status.mjs`、`verify-parity-ledger.mjs`、
  `verify-package-conventions.mjs`
