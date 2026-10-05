# ADR-0031 — 发布状态转正：忽略真机 Gate 回填，**正式发布**

**Status:** **Accepted**（2026-10-05，**用户裁决**）

**取代：** ADR-0024 的 **Q2 = B1**（「保持 pre-release」）；并**终止** ADR-0020 §1「不得对外宣称为正式发布」对**后续版本**的适用。

**不取代（与发布状态正交，继续有效）：** ADR-0024 **Q1 = A3**（闭环口径）、ADR-0022（CI Runtime 证据政策）、ADR-0029 **Q3**（**名称不得宣称 `Signed`**）。

---

## 背景

ADR-0024（Accepted 2026-09-30）Q2 = B1 的理由是：本仓**当前没有 Apple 凭据**，
且**全局人工 UX Gate 会话未完成** ⇒ 保持 pre-release、`releases/latest` 不动。
此后 **v1.5.6 ~ v1.5.26 全部以 Pre-release 发布**。

ADR-0020 §1 亦规定「Mellow 当前处于 **pre-release** 状态……**不得对外宣称为正式发布**」。

**2026-10-05，用户明确指示：忽略真机 Gate 回填，正式发布。**

**先例**：ADR-0020 的「2026-09-05 更新」已记录过一次同类用户裁决 ——
v1.4.4 转正（`gh release edit v1.4.4 --latest=true --prerelease=false`），
并写明「**本更新为用户裁决优先**（同 D10 先例）」。

本 ADR 沿用该先例的**处置方式**，但按统一规则 16 以**新增 ADR** 的形式记录
（**不**改写 ADR-0020 / ADR-0024 的结论）。

## 决策

1. **发布状态转为「正式发布」**：`finalize` 以 `prerelease=false` + `make_latest=true` 收口；
   `releases/latest` 指向最新正式版本。
2. **不再以「真机 Gate 回填」为发布前置**：发布由「CI 全绿 + 制品断言通过」决定
   （ADR-0022 的证据政策不变）。
3. **不改变**闭环口径与证据政策（ADR-0024 Q1=A3 / ADR-0022）——
   正式发布**不等于**未闭环项已闭环。
4. **不改变** ADR-0029 Q3：macOS job **不得**宣称 `Signed`（本仓无凭据）。
5. **不改变 ADR-0020 §2 的「V1.0 门槛」**（PRD P0 范围 + 发布评审 18 项验收全部通过）。
   本 ADR 只终止 ADR-0020 **§1**（「不得对外宣称为正式发布」）对**后续版本**的适用。
   ⇒ 二者的区别是：**「发一个正式版本」**（本 ADR 放开）vs **「宣称 V1.0 / 与 Typora 体验一致」**
   （仍须由证据挣得，见 ADR-0015 与 master-plan §14/§15.1）。**不要混读。**

## 后果（**必须如实声明**，不得含糊）

- ⚠️ **macOS 产物未签名、未公证**（本仓无 Apple 凭据）⇒ 用户首次打开会遇到 **Gatekeeper 警告**。
  正式发布的文案**必须**写明这一点，**不得**暗示已签名或已公证。
  （护栏 `verify-parity-ledger.mjs` 的「macOS job 名不得宣称 `Signed`」继续生效。）
- ⚠️ **`PASS-E = 0/50`、未闭环 9 项、待裁决 1 项（ADR-0030）依然成立** ——
  正式发布是**发布状态**的变更，**不是完成度**的变更。
  README / 验收文档的如实表述**不因此放宽**；「与 Typora 1.14.9 核心体验一致」这类结论
  **仍须**以证据挣得（ADR-0015 / master-plan §14）。
- 未闭环项的阻塞原因（人工 UX Gate / 真机证据）**仍在**，只是**不再阻塞发布**。
- `.github/release-template.md` 首行由「Pre-release」改为正式发布表述。
- 发布收口护栏（`verify-release-gate.mjs`）的判据随之更新：
  断言 `prerelease=false` + `make_latest=true`（**取代**原先的 `prerelease=true`）。

## 落地与验证（2026-10-05 本轮实做）

- **v1.5.26 已转正**：`gh release edit v1.5.26 --prerelease=false --latest=true --notes-file <新模板渲染>`
  → 现状 `draft=false` / `prerelease=false` / **`assets=15`** / **`Latest = v1.5.26`**。
- **工作流改动已被实证**：`finalize` 里那条 API 调用（`-F prerelease=false -f make_latest=true -F draft=false`）
  以**完全相同的形态**对 v1.5.26 **幂等重放**一次 → `PATCH ok → draft=false prerelease=false`，
  状态不变 ⇒ 该调用的**参数与语义在真实 API 上成立**（不是「写进 YAML 就算接上了」）。
- **护栏判据已同步**：`verify-release-gate.mjs` 锁 `prerelease=false` + `make_latest=true`；
  **回退到 pre-release 必须走新 ADR**，不得静默改回。
- **未做（如实声明）**：**未**为本次改动单独切新版本 —— 按既有规则「diff 里无 `apps/`/`packages/` 改动
  ⇒ 新版本产出逐字节相同的制品，属过度声称」。故工作流的**完整**收口链路
  （断言 → 发布）将在**下一次含产品改动的发布**上首次整体执行。

## 关联

- ADR-0020（发布状态修正；其「2026-09-05 更新」为同类先例）
- ADR-0024（发布收口语义；**Q2=B1 被本 ADR 取代**，Q1=A3 继续有效）
- ADR-0022（CI Runtime 证据政策）
- ADR-0029（Q3：名称不得宣称 Signed）
- `tests/parity/verify-release-gate.mjs`（发布收口护栏）
- `.github/workflows/release.yml` / `.github/release-template.md`
