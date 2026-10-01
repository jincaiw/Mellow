# Mellow v1.5.24

## 本次发布

**本版本不含产品行为变更** —— 继续逐节审计权威 spec：这次是 **`ime-test-plan`**。

> 一句话：这份 spec 声明了两张验证矩阵（**6 个输入法** × **8 类基础输入**），
> 而实测下来 —— **6 个输入法只有 1 个在 CI 内常态覆盖**、**8 类基础输入只覆盖 2 类**；
> 更关键的是：**这两张矩阵在两处载体里都没有被枚举**，只写在散文里。

---

## 1. 正向确认（先记「有载体的那两节」，避免下轮重复查）

| 节 | 声明 | 载体 | 判定 |
|---|---|---|---|
| §1 | 「中文 IME 是 V1 Release Gate」 | 台账 **`P0-EDITOR-004`**（capability = 「IME 与 Undo / Redo」），`requiredEvidence` **含 `ux-gate`** ⇒ 不得以 AUTO 收口 | ✅ 有载体 |
| §7 | 「IME 不允许只靠自动化测试通过」 | `ux-gate-recorder` 的 `caretImeUndo`（**15 分**）+ **强制** `imeCorruption === false`，门槛「Caret/IME/Undo = 15/15」 | ✅ 有载体 |
| §8 | 4 条禁令（丢字/重复/blocker caret/undo corruption）⇒ 禁止发布 | 由 `P0-EDITOR-004` 的证据覆盖（矩阵逐场景断言） | ✅ |
| §6 | debug 可记录；release 不收集用户文本 | `composition.ts` 存在；**无**专门日志设施 | ✅ 平凡成立（但隐私条款**无护栏**，已注明） |

## 2. 实测出的两处缺口

**§2「平台 × 输入法」——6 个输入法，只有 1 个在 CI 内常态覆盖：**

| 平台 | 输入法 | 载体 | 在流水线里跑吗 |
|---|---|---|---|
| Windows | Microsoft Pinyin / Sogou Pinyin | **无** | — |
| macOS | 系统简体拼音 | `tests/benchmark/ime-matrix.mjs` | **否**（本地工具，需 System Events 权限） |
| macOS | 五笔 Wubi | **无** | — |
| Linux | fcitx5 | `tests/benchmark/ime-matrix-linux.mjs` | **是**（每次发版） |
| Linux | ibus | runner **支持** `--im=ibus`，**从未跑过** | 否 |

⇒ **4 个输入法零覆盖**。

**§3「基础输入」——8 类只覆盖 2 类：**

- 已覆盖：`continuous sentence`、`candidate selection`；
- **零覆盖 6 类**：`punctuation` / `mixed Chinese/English` / `emoji` /
  **`backspace during composition`** / **`arrow during composition`** / **`cancel composition`**。
- ⚠️ 后 3 类（组合中退格 / 方向键 / 取消组合）恰是 **IME 缺陷高发路径**。

## 3. 真正的缺口：验证范围**只写在散文里**

- **自动化**：Linux 矩阵的 8 个场景是 **§4 的「节点」维度**，**不是 §3 的「基础输入」维度**；
- **人工**：`ux-gate-recorder` 的 **30 个任务里没有任何一项提到输入法** ——
  它只提供评分与一个布尔字段。

⇒ 「用什么输入法、测哪几类基础输入」**没有任何载体** —— 与 `settings.open` 的理由只写在代码注释里**同型**。

## 4. 本次做了什么

1. **spec §1–§7 逐节补上如实的覆盖实测**（含上面两张表），使权威层不再暗示不存在的覆盖；
2. **把「矩阵覆盖了 §4 的哪 8 个节点」变成机器可读** ——
   此前它只存在于矩阵源码的 `SCENARIOS`，而**同一件事的第三个副本**还在 RQ 注释的「8 场景 IME 矩阵」里；
3. **新护栏**（`verify-runtime-qualification-workflow.mjs`）：
   **spec 的覆盖清单 ⇄ 矩阵 `SCENARIOS` ⇄ RQ 注释的场景数，三处双向一致**。
   **注入验证 7/7**（矩阵增删场景 / spec 多声明 / spec 漏声明 / RQ 数字漂移 / 锚点消失 / 无变异对照）。

## 5. 明确**没有**做的（登记为缺口，不假装已做）

- **未**给 §3 的 6 类基础输入补自动化场景。理由：它们要跑在 Linux 容器 / runner 上，
  **本机无法验证**；而「写进 YAML 就算接上了」是本仓反复踩过的坑。
  正确做法是**单独一轮**：加场景 → **派发实跑** → 逐场景读日志确认。
- **未**扩张人工 Gate 的任务清单（加输入法项会改变人工会话的负担）—— 属**流程裁决**，需单独决定。

---

## 已知未闭环（保持 `NO-GO`）

- 未闭环 **9 项**，阻塞原因**全部**是**人工 UX Gate 会话**或**真机/平台证据**（`实际 PASS-E = 0/50`）。
- **待裁决**：无。

> ⚠️ 本版**不含产品行为变更**，未闭环项的结论**不因此改变**。

## 发布状态

**Pre-release**（ADR-0020 / ADR-0024 Q2=B1）。`finalize` 在**断言三平台制品齐全**后**自动**发布，无需人工步骤。
