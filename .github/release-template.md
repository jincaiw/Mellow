> **正式发布**（ADR-0031，2026-10-05 用户裁决：忽略真机 Gate 回填，转正式发布；取代 ADR-0024 Q2=B1）

Mellow `__TAG__` — 以 Typora 1.14.9（build 7785）体验为基线的 Markdown 编辑器。本版本 Notes 由 Release 流水线在三平台构建通过后自动填充。

## ⚠️ 安装前请读（如实声明）

- **macOS 产物未签名、未公证**（本仓当前**无 Apple Developer 凭据**）⇒ 首次打开会遇到
  **Gatekeeper 警告**，需在「系统设置 → 隐私与安全性」中允许，或右键 →「打开」。
- **Windows 产物未做代码签名**（未配置证书）。
- **Linux** 产物为 AppImage / deb / rpm，无签名要求。
- 上述状态**不随本版本转正而改变** —— 正式发布是**发布状态**的变更，**不是**「已签名」或「完成度」的变更。

## 📦 安装与更新

- 三平台安装包见下方 Assets：macOS DMG / Windows MSI + NSIS + 便携版 zip / Linux AppImage · deb · rpm。
- 应用内更新器经 `latest.json` 分发（Tauri updater 签名齐全 —— 指 **updater 的更新包签名**，与上文的**平台代码签名**是两件事）。
- `releases/latest` 指向本版本（ADR-0031 起，正式发布不再保留 pre-release 通道）。

## 📝 变更（自动生成，自上一发布 tag 起）
