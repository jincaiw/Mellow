# @mellow/extension-api

扩展 API 契约（PRD §119）。

> PRD §117.1 包规范：本文件是「这个包是什么」的入口；**契约（不变量 / 错误语义 / 性能边界 / 禁止行为 / parity reference / 夹具）见同目录 `CONTRACT.md`**。

## 职责

定义第三方 / 内置扩展的**能力契约与权限模型**：清单校验、权限校验、受限能力判定。

## 公开接口

`src/index.ts` 导出 **5** 个符号：

- `hasPermission` —— 判断扩展是否持有某权限
- `isRestricted` —— 判断能力是否属受限集
- `validateManifest` —— 校验扩展清单
- `validatePermissions` —— 校验权限声明
- `guardPermission` —— 调用前的权限守卫

## 依赖关系（实测）

- **依赖**：无
- **被消费**：`app-core`、`apps/desktop`

## 测试

- `test/permissions.test.ts` —— 权限模型

## 边界与约束

- 权限模型的裁决记录见 **ADR-0013（extension permissions）**。
- 本包是**纯契约 + 纯函数**：不执行扩展、不触碰宿主资源；执行由 `app-core` 的
  `ExtensionRegistry` / `ExtensionHost` 承担。
