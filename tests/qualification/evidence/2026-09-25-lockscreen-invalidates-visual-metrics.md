# 锁屏/遮挡使视觉指标静默失效（2026-09-25）

**结论**：一次整批测量产出 **0/6 有效样本**（三个夹具各 0/2），失败形态是
`detectMaxDiff=0` + `calibMaxDiff=0` + `frontmostPid=451 ≠ expectPid`。
根因不是焦点、不是按键、也不是探针 —— 而是**屏幕已锁定**：

```
$ bin/screen-timing frontmost
{"bundleId":"com.apple.loginwindow","isLockScreen":true,"name":"loginwindow","pid":451}
```

锁定/屏保状态下 `loginwindow` 成为前台，**任何应用都无法被激活** →
ScreenCaptureKit 对**被遮挡**的窗口只能拿到**静止帧** → ROI 永不变化。

---

## 一、为什么这个失败极具误导性

失败提示原本写的是：

> ROI 完全无变化（按键可能未落到编辑区：检查 frontmostPid 是否等于 expectPid）

它把排查方向指向「焦点/按键」——而真实成因是「**窗口被遮挡，捕获到的是静止帧**」。
两者的症状完全一样（`detectMaxDiff=0`），但修法完全不同。
更糟的是：**没有任何东西阻止跑完并产出一份「0 个有效样本」的报告**，
读者可能把空值读成「没测」而不是「环境不满足」。

这与本项目已记录的同类陷阱同源：**harness 产出看似正常的空数据**。

## 二、修法（三层，缺一不可）

### 2.1 helper：激活后**确认**成为前台，失败即响亮失败并指名前台应用

新增 `activateAppAndConfirm(pid:attempts:)`：激活 → 确认
`NSWorkspace.shared.frontmostApplication.processIdentifier == pid` → 最多重试 3 次。
`activateAndEnsureInput` 改为以它开头，失败时：

```
目标进程 50895 未能成为前台（当前前台：loginwindow pid=451）。
SCK 对**被遮挡**的窗口只能拿到静止帧，会产出 detectMaxDiff=0 的假失败
（与「按键没进去」症状相同）。请关闭抢占焦点的窗口后重试。
```

**指名前台应用名**是关键：只报 pid 时，451 这种低编号进程无法让人联想到 loginwindow。

### 2.2 helper 新增 `frontmost` 命令

返回 `{ ok, pid, name, bundleId, isLockScreen }`；`isLockScreen` 判据为
bundleId 含 `loginwindow` 或名字为 `loginwindow`。

### 2.3 runner：开跑前**硬门禁**

`run-benchmark.mjs` 在权限自检之后立即检查，锁屏则 `process.exit(1)`：

```
✗ 当前前台是「loginwindow」（pid=451）→ 屏幕已锁定或屏保激活。
  锁定状态下任何应用都无法成为前台，SCK 只能捕获被遮挡窗口的静止帧，
  所有视觉指标都会产出 detectMaxDiff=0 的假失败。
  请解锁屏幕并关闭屏保后重跑。
```

## 三、护栏与注入验证

`verify-parity-ledger.mjs` 新增一节：

- helper 必须实现 `frontmost` 且给出 `isLockScreen`；
- helper 必须实现 `activateAppAndConfirm`，且激活失败信息必须**含「未能成为前台」**
  （即必须指名前台应用，不允许只报 pid）；
- `perf-common` 必须实现 `frontmostApp` 并调用 `frontmost`；
- `run-benchmark` 必须检查 `isLockScreen` 且**该处必须 `process.exit(1)`**；
- canary 自检。

**注入验证**：把 `if (front.isLockScreen)` 改成 `if (false)` → 护栏报 **2 条错**；还原 → 通过。

## 四、对本轮测量的影响（如实记录）

- 本轮**无法再进行视觉测量**：屏幕处于锁定状态，且我不会（也不应）去解锁。
- 此前在**解锁状态**下取得的读数仍然有效：
  `2026-09-25-perf-hot-open-authoritative.md`（冷启动各 5/5、1MB 持平 Typora）与
  `2026-09-25-hotopen-criterion-and-large-file-cliff.md`（5MB 2917ms 等）。
- 需要新读数时，须在**解锁且关闭屏保**的机器上重跑；现在跑不了会被门禁直接拒绝，
  而不是再产出一份 0 有效样本的报告。

## 五、仍未解决

1. 视觉类指标对「窗口被遮挡」整体是脆弱的：本轮的修法只覆盖了「前台不是目标」
   这一种可判定的情形；「目标在前台但被别的窗口部分遮挡」仍可能拿到局部静止帧。
2. 建议后续给探针加一条自证：**在基准帧与检测帧之间主动制造一次已知变化**
   （例如让宿主窗口重绘）以证明捕获链路是活的 —— 这能把「静止帧」从「无变化」中区分出来。
