# ADR-0020 — 版本发布状态修正（V1.0 → pre-release）

**Status:** Accepted

## 背景

- `docs/qualification/v1.0-final-release-review-2026-08-16.md` 第三轮以 macOS 已验证据与**自评 UX Score 94/100** 宣布「V1.0 正式发布（macOS 已验证）」。
- 该评审自身第一、二轮结论均为「不发布」；第三轮评分不是 PRD §131/§132 要求的 Typora 对照实测，且明确含「Windows/Linux 无真机」「未签名未公证」「typing 测径缺失」等 NOT TESTED 项。
- Windows/Linux 从未真机构建与验证：无 IME 矩阵、无安装矩阵、无运行证据（ADR-0019 §3 要求的真机回填未完成）。
- 仓库元数据仍停留在 V0.0：README 标题「V0.0 Runtime Qualification 技术准备」、`apps/desktop/index.html` 标题「Mellow V0.0 — Runtime Qualification Shell」、`capabilities/default.json` 描述「Mellow V0.0 default capabilities」；packages 版本 0.1.0/0.2.0 与宣称的 1.0.0 不一致。

## 决策

1. Mellow 当前处于 **pre-release** 状态；「V1.0 已发布」仅指 macOS 本地构建验证，**不得对外宣称为正式发布**。
2. 真实 V1.0 发布门槛 = PRD §133 P0 范围 + 发布评审 18 项验收全部通过，包含：三平台真机矩阵、UX Score≥92 对照实测、30 任务效率 Gate、macOS 签名公证、Source Fidelity / File Safety / IME 全绿。
3. 仓库元数据与代码状态保持一致：README 如实描述现状；应用与 bundle 标题去掉 V0.0 占位；packages 版本统一 0.x。
4. 保留 git tag `v1.0.0` 作为历史里程碑标记，文档声明其为 pre-release，不代表正式发布。
5. 后续按 ADR-0019 §2/§3 执行三平台真机 Gate，结果与 Tauri/Electron 裁决写入 ADR-0021。

## 后果

- 任何发布材料不得引用「V1.0 正式发布（macOS 已验证）」作为完成证据。
- 阶段 0-5 的实施以本 ADR 为准绳；阶段 5 发布评审 18 项全 PASS 后，追加 ADR 记录正式 V1.0。
- 现有测试与功能代码不受影响；本 ADR 只修正状态叙事与元数据。

## 相关

- `docs/qualification/v1.0-final-release-review-2026-08-16.md`
- ADR-0019（Runtime 最终决策，§3 真机回填前置）
- PRD §133（P0 范围）、§131/§132（UX Score / 任务效率 Gate）
