# Mellow v1.5.33

## 本次发布

**本次含产品变更**：图片导出新增「**字号来源**」选项（`自定义字号` / `跟随编辑器字号`）。

> 一句话：补上 Typora 图片导出 `Font Size` 组的**另一半**（radio `Use theme font size`）。
> **默认值不变** ⇒ 既有用户的导出输出**逐字节不变**。

---

## 1. 补了什么（ADR-0033 裁决 = **A2**）

Typora 的图片导出 `Font Size` 组是一个 **radio**：
`0: Use custom font size`（默认）/ `1: Use theme font size`。
Mellow 此前只实现了**前半**（`export.image.fontSize`，2026-09-30 落地），**后半缺失**。

**新增**：设置 → 导出 → 「**字号来源**」
- **自定义字号**（**默认**）：使用「图片导出字号（px）」那一项 —— **与既有行为完全一致**；
- **跟随编辑器字号**：使用「编辑器」分区里的字号设置（`editor.fontSize`）。

## 2. ⚠️ 这是一处**有意的差异**（非 Typora 等价）

Typora 的该选项是「让**主题 CSS** 的字号生效」（`fontSize = void 0` 交给 CSS）。
而 Mellow 的图片导出是 **canvas 渲染**（显式 `fontFamily`），**没有主题 CSS 通道**
⇒ 无法照搬。取**最接近且可控**的等价物 = 跟随**编辑器字号**（用户可改的真实设置）。

**为什么不是「跟随主题字号」**：实测 Mellow 的主题**没有 per-theme 字号** ——
排版字号是常量（`TYPOGRAPHY_DEFAULTS.fontSize = 16`，与 `BODY_SIZE` 同值）
⇒ 「跟随主题字号」永远解析成 16 ⇒ **选项永不产生可观察差异**（假控件）。

该差异属「与 Typora 不同但有意」⇒ 已在 ADR-0033 写明并登记。

## 3. ✅ 既有行为不变（本次发布的**关键约束**）

- 新选项**默认 `custom`** ⇒ 走的仍是 `export.image.fontSize`（缺省 16）；
- `BODY_SIZE = 16` **保持原样**，既有护栏断言未动；
- ⇒ **所有既有图片导出的输出逐字节不变**。
- ⚠️ **默认值是否对齐 Typora 的 24 仍未裁**（会改变所有既有输出，面积 1.5×，
  更易触及长图保护）⇒ 须经**视觉 / 真机确认**后另裁（ADR-0033「关键风险」节）。

## 4. 护栏

`verify-settings-contract.mjs` 的图片字号段**扩展**（只锁接线与默认值，不锁表达式形态）：
schema 形态（select / **默认必须是 `custom`**）→ App 读取 `mellow.export.image.fontSizeMode`
→ 「跟随编辑器字号」必须读 `settingById('editor.fontSize')`（否则选项**静默无效**）；
并新增 **2 条 canary**（去掉 App 的读取必须被检出；默认值不得是 `followEditor`）。

i18n：zh/en 各 **4** 条新键（label / 两个选项 / description）；目录 811 → **815**。

## 5. ⚠️ 证据等级（如实声明）

- 本项的证据是**静态、可复核**：护栏锁端到端接线 + 默认值；**未在真机确认**新选项的实际导出效果
  （本环境无法做真机验证 —— 实测 `screen-timing windows` 返回 `cgWindows: []`（无屏幕录制权限）、
  `osascript` 访问 System Events 报 `-10004`（无辅助功能权限））。
- **macOS 产物未签名未公证** ⇒ 首次打开会遇到 Gatekeeper 警告。
- **`PASS-E = 0/50`、9 项 P0 未闭环依然成立** —— 本次是**补一个 parity 缺口**，不是完成度变更。
