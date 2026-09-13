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

- `audit-typora-menu-labels.mjs` —— 反查 `verify-menu-contract.mjs` §12 里内嵌的每一条
  zh/en 是否真的能在本机 `Typora.app/Contents/Resources/{Base,zh-Hans}.lproj/Menu.strings`
  中原样查到。立此脚本的原因：内嵌真值的代价是**没人能保证它真的来自官方** —— 实测抓到
  2 条「Typora en」其实是 Mellow 自己的英文值（护栏于是自己给自己盖章，永远绿）。
  每次扩充 §12 合同后都应先跑一次。

  ```bash
  node tests/parity/tools/audit-typora-menu-labels.mjs
  ```

