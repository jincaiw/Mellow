# @mellow/document-model

文档模型（ADR-0008 / ADR-0009：identity / revision / dirty / encoding / EOL / disk / file-identity / recovery）。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口。契约细节见 `CONTRACT.md`（**尚未编写**，见审计 §4.100）。

## 职责

把「一份被打开的文档」的全部状态建模成一个显式对象：身份（`FileIdentity`）、修订号、
脏标记、编码（`Encoding`）、行尾（`LineEnding`）、磁盘元数据（`DiskMetadata`）、
外部变更状态、光标 / 滚动状态、恢复快照。

## 公开接口

`src/index.ts` 导出 **12** 个符号：

`DocumentModel`、`DocumentSnapshot`、`RecoverySnapshot`、`ContentSource`、
`FileIdentity`、`DiskMetadata`、`ExternalChangeState`、`CursorState`、`ScrollState`、
`Encoding`、`LineEnding`、`detectEol`

## ⚠️ 当前状态：**零跨包消费者**（审计 §4.95，架构级待裁决）

实测：**没有任何跨包导入**。而 `packages/app-core/src/documentState.ts` 有**同一套字段**
且**不 import 本包** ⇒ **ADR-0008 的落地实现整体未被采用**。

三条处置路径（**需裁决，勿自行选**）：
1. 把 `app-core` 接到本包（大改）；
2. 删包并改 ADR-0008（或新增 ADR 说明）；
3. 明确「阶段 2 计划」并写进文档。

该状态由 `verify-doc-code-refs.mjs` 的 `PKG_NO_CONSUMER_EXEMPT` **双向**守着
（一旦接线即报错，要求删除例外条目）。

## 依赖关系（实测）

- **依赖**：无
- **被消费**：**无**

## 测试

- `test/document-model.test.ts`
