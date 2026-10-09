# Typora 对标台账

`typora-parity-ledger.json` 是当前对标状态的唯一机器可读入口；它不替代 PRD、Spec 或 ADR。

- 规范验收基线固定为 Typora 1.14.9（build 7785）；1.14.6 仅为历史参考。
- 每一项必须具有唯一 `P0-*` ID、Typora 行为合同、Mellow 目标、等级、当前状态、责任包与可定位证据。
- `IMPL` / `AUTO` 只表示实现或自动化证据存在，绝不等同于体验对标完成。
- `PASS-E` 必须同时要求 macOS、Windows、Linux 真机证据与 UX Gate；验证器会拒绝缺少这些要求的记录。
- 历史 qualification 报告保留其当时版本和结论，只能被引用为证据，不参与当前状态聚合。

运行 `node tests/parity/verify-parity-ledger.mjs` 可验证台账，并输出当前状态 Dashboard。根目录 `pnpm test` 也会执行此检查。

## 工具（需本机装有 Typora，**不进 CI**）

`tests/parity/tools/` 下的脚本依赖本机 Typora 安装，只用于**人工复核护栏里内嵌的官方真值**，
不参与 `pnpm test` / `pnpm run parity`（CI runner 上不装 Typora）：

- `audit-typora-orphan-strings.mjs` —— 查「**Typora 到底有没有在用一个字符串**」（文案面 + 代码面双向），
  用于判「Typora 有这个功能吗」。用法：`--check "<串>"`。

- `audit-typora-preferences.mjs` —— **双向**核对偏好矩阵（`typora-preferences-matrix.json`）与
  **Typora 真正持久化的键**（`JSBridge.putSetting(...)`）：矩阵自述看不见**死键**，
  也看不见「Typora 会写、但矩阵与面板都不覆盖」的缝隙。`--write` 可把 Typora 新增的键补进矩阵。

- `audit-typora-menu-labels.mjs` —— 反查 `verify-menu-contract.mjs` §12 里内嵌的每一条
  zh/en 是否真的能在本机 `Typora.app/Contents/Resources/{Base,zh-Hans}.lproj/Menu.strings`
  中原样查到。立此脚本的原因：内嵌真值的代价是**没人能保证它真的来自官方** —— 实测抓到
  2 条「Typora en」其实是 Mellow 自己的英文值（护栏于是自己给自己盖章，永远绿）。
  每次扩充 §12 合同后都应先跑一次。

  ```bash
  node tests/parity/tools/audit-typora-menu-labels.mjs
  ```


## 其它本机工具（**不进 CI**，**不依赖 Typora**）

`tests/parity/tools/` 下还有几个**纯本机**工具：不需要 Typora，但也**不进 CI** ——
它们产出的是**候选清单**（不是判定结果），**必须人工读**：

- `audit-doc-counts.mjs` —— 普查「**活文档里多处复述的计数**」，供逐处判定「这处有判据吗」。

- `audit-guard-bounds.mjs` —— 普查 parity 护栏里的「**防空转下限**」是否**过松**。
  ⚠️ 输出是候选：实测报 41 处，逐条读原文后**全部非缺陷** ⇒ **不要照桶机械收紧**。

- `audit-memory-refs.mjs` —— 核对 `.workbuddy-ai/memory/` 的**交叉引用**是否仍然有效
  （`PITFALLS §4.N` / `审计 §4.N` / `skill §N` 是否仍存在）、**编号是否完整**（无重复、无缺号），
  并报出**可疑的范围端点**（写成 `§4.A–§4.B` 而 B ≠ 当前最大节号）。
  ⚠️ 记忆文件与 skill **都不在仓库内** ⇒ **CI 守不了它们**，只能靠本工具 + 人工。
  立此工具的原因（2026-10-09，审计 §4.232）：`MEMORY.md` 里「`PITFALLS.md §4.290–§4.342`」的**端点已过期**
  （PITFALLS 已到 §4.349）—— 范围端点**每加一节就漂一次**，而它**没有任何人守**。
