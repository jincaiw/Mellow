# Typora 对标台账

`typora-parity-ledger.json` 是当前对标状态的唯一机器可读入口；它不替代 PRD、Spec 或 ADR。

- 规范验收基线固定为 Typora 1.14.6；任何较新版本仅能作为 patch observation。
- 每一项必须具有唯一 `P0-*` ID、Typora 行为合同、Mellow 目标、等级、当前状态、责任包与可定位证据。
- `IMPL` / `AUTO` 只表示实现或自动化证据存在，绝不等同于体验对标完成。
- `PASS-E` 必须同时要求 macOS、Windows、Linux 真机证据与 UX Gate；验证器会拒绝缺少这些要求的记录。
- 历史 qualification 报告保留其当时版本和结论，只能被引用为证据，不参与当前状态聚合。

运行 `node tests/parity/verify-parity-ledger.mjs` 可验证台账，并输出当前状态 Dashboard。根目录 `pnpm test` 也会执行此检查。
