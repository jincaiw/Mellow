# CONTRACT — `@mellow/extension-api`

> PRD §117.1 要求每个 package 含 `CONTRACT.md`。**本文件不复制真值**，而是声明「本包承诺什么」+
> 「**谁在执行这些承诺**」—— 与本仓「不采信 docs 自述」一致：**契约的每一条都必须有执行者**。

## 1. 职责与边界

- **属于本包**：第三方 / 内置扩展的**能力契约与权限模型** —— 清单校验、权限校验、受限能力判定。
- **不属于本包**：扩展的**执行**（`app-core` 的 `ExtensionRegistry` / `ExtensionHost`）与
  **宿主资源访问**（经 `host-api`）。

## 2. 公开接口与类型

- 入口 `src/index.ts`（**5** 个导出）：`hasPermission`、`isRestricted`、`validateManifest`、
  `validatePermissions`、`guardPermission`
- 类型面：`permissions.ts`、`types.ts`
- 跨包导入走**相对路径**（`name`/`main` 装饰性）—— 见审计 §4.95。

## 3. 不变量（每条必须有执行者）

| 不变量 | 执行者 |
|---|---|
| 权限模型与受限能力集合的语义 | `test/permissions.test.ts` |
| 裁决记录（权限面如何划定） | **ADR-0013（extension permissions）** |
| 每个扩展能力都有 `guardPermission` 守卫点 | `app-core` 的 `ExtensionHost` 实现 + 本包 `test/permissions.test.ts` |
| **核心包零平台 API** | `tests/parity/verify-adapter-contract.mjs` |

## 4. 错误语义

- `validateManifest` / `validatePermissions` 返回**校验结果**（不抛）—— 调用方据此拒绝加载并提示。
- `guardPermission` 在无权限时**返回失败**（不抛、不静默放行）。
- `isRestricted` 对**未知能力**的默认判定必须是**受限**（fail-closed），不是放行。

## 5. 性能边界

- 纯校验逻辑，无 I/O；在**扩展加载时**调用一次 ⇒ 无热路径约束。
- **不承诺**任何吞吐/延迟指标。

## 6. 禁止行为

- ❌ 让未知能力**默认放行**（必须 fail-closed）。
- ❌ 在本包内实现扩展执行或触碰宿主资源（越界）。
- ❌ 新增能力而不更新权限模型与 `permissions.test.ts`。

## 7. Typora parity reference

Typora 无扩展体系 ⇒ **无 parity 条目**（本包是 Mellow 的增量能力，PRD §119）。

## 8. golden fixtures

- 本包 `fixtures/` 为空（§117.1 的意图判，见审计 §4.100）。
- 清单/权限样本当前内联在 `test/permissions.test.ts`；一旦外置，**必须放本包 `fixtures/` 下**。

## 9. 测试入口

- `test/permissions.test.ts`
- 护栏：`verify-adapter-contract.mjs`、`verify-package-conventions.mjs`
