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

- `audit-pkg-test-counts.mjs` —— **实跑 12 个包的 jest**，与 `tests/qualification/README.md` 的
  「**各包规模**」行**逐项 + 合计**对账（不符即退出码 1）。
  ⚠️ 立此工具的原因（2026-10-10，审计 §4.243）：该行是**包用例数的单一真值源**，而它**自身与现实是否一致**
  需要**实跑** —— 该文件自己把这条写成「⚠️ **仍未覆盖**：本行自身与现实是否一致（需实跑）」。
  该行**已两次过期**（2026-10-01 / 2026-10-08 各刷新一次），而**过期没有任何信号**。
  本工具把「需实跑」变成**一条命令**；⚠️ **不自动改 README**（只打印「应改成什么」，由人决定）。

- `audit-guard-bounds.mjs` —— 普查 parity 护栏里的「**防空转下限**」是否**过松**。
  ⚠️ 输出是候选：实测报 41 处，逐条读原文后**全部非缺陷** ⇒ **不要照桶机械收紧**。

- `audit-bold-pairing.mjs` —— 把 `verify-doc-code-refs.mjs` 判据 ㊵ 里那个**无依赖**的
  CommonMark 行内扫描器与**真解析器**（`packages/export` 的 `markdown-it`）逐文件交叉验证。
  ⚠️ 立此工具的原因（2026-10-10，审计 §4.246）：判据 ㊵ **不能**依赖外部包
  （`parity-guard` 两个 CI job **有意不跑 `pnpm install`**）⇒ 护栏自带扫描器，
  而**手写量具必须被交叉验证**，否则它自己就是下一个「静默失效」。
  用法：`node tests/parity/tools/audit-bold-pairing.mjs [<git-rev>]`（不带参数 = 工作区）。
  实测：工作区 **0/0**；`HEAD~1`（修复前）**136/136** —— 两侧**逐文件 0 处不一致**。

- `audit-memory-refs.mjs` —— 核对 `.workbuddy-ai/memory/` 的**交叉引用**是否仍然有效
  （`PITFALLS §4.N` / `审计 §4.N` / `skill §N` 是否仍存在）、**编号是否完整**（无重复、无缺号），
  并报出**可疑的范围端点**（写成 `§4.A–§4.B` 而 B ≠ 当前最大节号）。
  ⚠️ 记忆文件与 skill **都不在仓库内** ⇒ **CI 守不了它们**，只能靠本工具 + 人工。
  立此工具的原因（2026-10-09，审计 §4.232）：`MEMORY.md` 里「`PITFALLS.md §4.290–§4.342`」的**端点已过期**
  （PITFALLS 已到 §4.349）—— 范围端点**每加一节就漂一次**，而它**没有任何人守**。

## 判据编号是**每护栏本地**的（跨护栏会重叠）

`verify-*.mjs` 里的判据头写作 `// ── ⑮ …`，**编号是每个护栏各自从 ① 开始的** ——
所以同一个圈号在多个护栏里是**不同的判据**（例如「判据 ⑧」在 `verify-build-pipeline.mjs`
与 `verify-release-gate.mjs` 里含义完全不同）。

⇒ **引用时必须写明护栏**：写「`` `verify-xxx.mjs` 判据 N ``」，不要只写「判据 N」。
本目录的判据 ㉞（在 `verify-doc-code-refs.mjs`）机械守着这一条：护栏文件里凡引用**本文件没有的**编号，
同行必须出现护栏文件名；**本文件有的**编号按「局部优先」不要求指名。
