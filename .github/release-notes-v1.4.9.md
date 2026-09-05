# Mellow v1.4.9 —— 自动升级（对标 anySSH updater 模式）

在既有安全更新底座（签名校验 / 渠道 / 回滚）上，对齐 anySSH 的更新体验三件套：

## 自动检查 + 自动安装

- 新增设置「自动下载并安装更新」（默认关闭，显式开启）：启动/定时检查发现新版本后，静默完成 rollback 备份 → 下载（Rust 侧 minisign 签名校验）→ 安装并重启进入新版本。
- 关闭时保持原有行为：发现新版本展示更新条（立即更新 / 稍后）。

## 跳过此版本

- 更新条新增「跳过这个版本」：记录版本号，本次安装周期内启动/定时检查不再打扰；设置页「立即检查更新」仍会展示。

## release 构建守卫

- 新增 Rust 命令 `is_release_build`：debug/dev 构建绝不执行应用内自更新（防止把 release 包覆盖到运行中的二进制上造成损坏）；手动「立即更新」在开发版同样被拦截并提示。
- Windows 便携版维持既有降级提示（应用内更新不可用）。

## 质量门禁

- apps/desktop tsc / vite build 全绿；Rust cargo fmt + clippy 通过（含 updater_safety 签名/下载校验测试）。
- settings/i18n jest 全绿；12 项 parity 护栏全绿（settings 合同新增 autoInstall + 守卫断言）；smoke e2e 全绿。

## 升级路径说明

- v1.4.8 及更早版本收到本版更新时仍走「手动确认安装」；从 v1.4.9 起开启「自动下载并安装更新」后即可全自动升级。
