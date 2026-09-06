# Mellow v1.5.2

修复自动更新「检查更新失败：update check timeout」。

## 根因
- updater endpoints 一直是占位域名 `updates.mellow.app`（空响应/不可达），真机检查更新时请求挂起，15s 前端超时后报 `update check timeout`。

## 修复
- endpoints 切换为 GitHub Releases 静态清单：`https://github.com/jincaiw/Mellow/releases/latest/download/latest.json`（实测可用，含全平台签名；插件按 `platforms` 键匹配 `darwin-aarch64` / `linux-x86_64` / `windows-x86_64`）。
- 同步更新 auto-update-spec / packaging-release / qualification gate 文档。

## ⚠️ 升级须知（一次性）
更新端点编译在应用二进制内：**本版本需手动安装一次**（下载对应平台安装包覆盖安装），此后「检查更新 / 自动更新」链路正常工作，后续版本可应用内自更新。

## 其他
- 版本 1.5.1 → 1.5.2。
