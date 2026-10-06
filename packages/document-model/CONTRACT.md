# CONTRACT — `@mellow/document-model`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：把「一份被打开的文档」的全部状态建模成显式对象 —— 身份（`FileIdentity`）、
  修订号、脏标记、编码（`Encoding`）、行尾（`LineEnding`）、磁盘元数据（`DiskMetadata`）、
  外部变更状态、光标/滚动状态、恢复快照。
- **不属于本包**：文档的**读写**（`apps/desktop` 经 `host-api` 的 `FileService`）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**12** 个导出）：`DocumentModel`、`DocumentSnapshot`、`RecoverySnapshot`、
  `ContentSource`、`FileIdentity`、`DiskMetadata`、`ExternalChangeState`、`CursorState`、
  `ScrollState`、`Encoding`、`LineEnding`、`detectEol`

## 3. ⚠️ 当前状态：**零跨包消费者**（架构级，待裁决）

实测**没有任何跨包导入**；而 `packages/app-core/src/documentState.ts` 有**同一套字段**且**不 import 本包**
⇒ **ADR-0008 的落地实现整体未被采用**（审计 §4.95）。

| 不变量 | 执行者 |
|---|---|
| **「零消费者」这一状态必须被显式登记**（一旦接线 ⇒ 例外表双向报错） | `tests/parity/verify-doc-code-refs.mjs` 的 `PKG_NO_CONSUMER_EXEMPT` |
| `detectEol` 的判定语义（CRLF / LF / CR / 混合） | `test/document-model.test.ts` |
| 快照不可变（`DocumentSnapshot` 为只读值对象） | 同上 |

**三条处置路径（需裁决，勿自行选）**：① 把 `app-core` 接到本包；② 删包并改 ADR-0008（或新增 ADR 说明）；
③ 明确「阶段 2 计划」并写进文档。

## 4. 错误语义

- 本包为**纯数据模型 + 纯函数**：不抛 I/O 错误（不做 I/O）。
- 非法输入（如未知编码串）⇒ 回落到默认值而非抛错。

## 5. 性能边界

- 纯内存操作；`detectEol` 为 O(n) 扫描 ⇒ **不得**在大文件每次按键时全量调用
  （调用方负责增量策略）。

## 6. 禁止行为

- ❌ 在本包内做 I/O 或读取平台 API。
- ❌ 与 `app-core/src/documentState.ts` **并行演化**同一套字段而不决定归属（当前状态即此 —— 见 §3）。

## 7. Typora parity reference

文档身份/编码/EOL/恢复语义对应 Typora 的文档模型，见
`docs/specs/document-file-safety-spec.md` 与 `docs/plans/typora-parity-master-plan.md` 的对应工作包。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- 文件安全语料在**仓库级** `apps/desktop/src-tauri/tests/file_safety_corpus.rs`（Rust 侧）。

## 9. 测试入口

- `test/document-model.test.ts`
- 护栏：`verify-doc-code-refs.mjs`（零消费者登记）、`verify-package-conventions.mjs`
