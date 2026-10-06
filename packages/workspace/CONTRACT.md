# CONTRACT — `@mellow/workspace`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：把「打开一个文件夹作为工作区」建模为显式状态 —— `WorkspaceFile`、
  `WorkspaceState`、`WorkspaceModel`（约 72 行）。
- **不属于本包**：目录的**读取**（`apps/desktop` 经 `host-api`）与文件树的**渲染**
  （`app-core` 的 `FileTreeModel` / `desktop-ui` 的 `FileTree`）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**3** 个导出）：`WorkspaceModel`、`WorkspaceState`、`WorkspaceFile`
- 跨包导入走**相对路径**（`name`/`main` 装饰性）—— 见审计 §4.95。

## 3. ⚠️ 当前状态：**零跨包消费者**（审计 §4.95，待裁决）

实测**无任何跨包导入**。两条处置路径（**需裁决，勿自行选**）：**接线** 或 **删包**。

| 不变量 | 执行者 |
|---|---|
| **「零消费者」这一状态必须被显式登记**（一旦接线 ⇒ 例外表双向报错） | `tests/parity/verify-doc-code-refs.mjs` 的 `PKG_NO_CONSUMER_EXEMPT` |
| **核心包零平台 API** | `tests/parity/verify-adapter-contract.mjs` |

## 4. 错误语义

- 本包为**纯数据模型**：不做 I/O ⇒ 不产生 I/O 错误。
- 未打开工作区时，`WorkspaceModel` 的状态为**空**而非 null（调用方无需判空）。

## 5. 性能边界

- 纯内存；**不承诺**任何吞吐/延迟指标。
- 文件数量级由调用方（`host-api` 的 `read_dir`）决定 ⇒ 本包不做分页/懒加载。

## 6. 禁止行为

- ❌ 在本包内做 I/O 或读取平台 API。
- ❌ 与 `app-core` 的文件树/文件列表模型**并行演化**同一职责而不决定归属（当前状态即此 —— 见 §3）。

## 7. Typora parity reference

工作区/文件夹语义对应 Typora 的「打开文件夹」，见
`docs/plans/typora-parity-master-plan.md` 的侧栏工作包。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- **无测试目录** —— 已在 `verify-package-conventions.mjs` 的 `PKG_TEST_GAPS` 登记为
  「未执行 + 待裁决」（是否补测取决于它是接线还是删除）。

## 9. 测试入口

- ⚠️ 无 `test/`（见上）。
- 护栏：`verify-doc-code-refs.mjs`（零消费者登记）、`verify-package-conventions.mjs`
