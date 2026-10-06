# @mellow/workspace

工作区状态（文件夹 / 文件树）。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口。契约细节见 `CONTRACT.md`（**尚未编写**，见审计 §4.100）。

## 职责

把「打开一个文件夹作为工作区」这件事建模为显式状态：工作区文件项（`WorkspaceFile`）、
工作区状态（`WorkspaceState`）、以及模型（`WorkspaceModel`）。约 72 行。

## 公开接口

`src/index.ts` 导出 **3** 个符号：

- `WorkspaceModel`
- `WorkspaceState`
- `WorkspaceFile`

## ⚠️ 当前状态：**零跨包消费者**（审计 §4.95，待裁决）

实测**无任何跨包导入**。两条处置路径（**需裁决，勿自行选**）：**接线** 或 **删包**。
该状态由 `verify-doc-code-refs.mjs` 的 `PKG_NO_CONSUMER_EXEMPT` **双向**守着
（一旦接线即报错，要求删除例外条目）。

## 依赖关系（实测）

- **依赖**：无
- **被消费**：**无**

## 测试

⚠️ **无 `test/`**（§117.1 要求）—— 已在 `verify-package-conventions.mjs` 的 `PKG_TEST_GAPS`
登记为「未执行 + 待裁决」（是否补测取决于它是接线还是删除）。
