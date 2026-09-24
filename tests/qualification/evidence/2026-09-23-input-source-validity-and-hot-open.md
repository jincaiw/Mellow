# 输入源有效性缺陷（IME 误报为英文）+ hot-open 口径落地（2026-09-23）

> **后续（2026-09-25）**：本文 §3.3 的 hot-open 读数来自旧 `.app` 包（v1.5.9），
> §4 的冷启动读数在负载态下测得。前置条件全部满足后的**权威读数**见
> `2026-09-25-perf-hot-open-authoritative.md`：1MB 下 Mellow 461.6ms vs Typora 455.6ms
> （**持平，ratio 1.01**）；hot-open 的 `switchMs` **不随尺寸单调**（5MB 2970ms > 10MB 2288ms），
> 故不得归因于大文件处理。**本文的根因分析与修复仍然有效**，其中的 ms 数值以 09-25 文为准。

**结论摘要**：本轮发现 benchmark 的**有效性前置检查本身是坏的** ——
`inputSourceIsEnglish()` 对本机实际状态**恒返回 true**，而实际输入源是简体拼音。
后果：合成按键落到 IME 上弹出候选窗，而不是回显文本；
`startup` / `open` / `typing` / `search` 的「首键回显」分量测的是
**「IME 候选窗出现的耗时」**，数字看着正常却不可用。

同时落地了 2026-09-22 文档列出的最后一项待办：**hot-open 口径**
（同一实例内换文档，绕开进程启动与 WebView 初始化）。

---

## 一、根因：`SCIM.ITABC` 字面量里含 `ABC`

### 1.1 旧实现

```js
// perf-common.mjs（旧）
export function inputSourceIsEnglish() {
  const out = spawnSync('defaults', ['read', 'com.apple.HIToolbox', 'AppleSelectedInputSources'], …);
  return /ABC|U\.S\.|English/.test(out.stdout) && !/Pinyin|Chinese|Wubi|ABC.*Chinese/.test(…);
}
```

两处缺陷叠加：

1. `AppleSelectedInputSources` 是**已启用输入源列表**，不是**当前**输入源；
2. 判据是 ASCII 关键词正则 —— 而简体拼音的输入源 id 是
   **`com.apple.inputmethod.SCIM.ITABC`**，其中 `ITABC` 的末尾就是 **`ABC`**。

于是该函数对本机状态**恒为 true**。实测：

```
$ defaults read com.apple.HIToolbox AppleSelectedInputSources
( { "Bundle ID" = "com.apple.inputmethod.SCIM";
    "Input Mode" = "com.apple.inputmethod.SCIM.ITABC";
    InputSourceKind = "Input Mode"; } )
$ 旧判定的正则1（/ABC|U\.S\.|English/）→ true      ← 命中 "IT**ABC**"
```

### 1.2 权威值（新增 helper 命令 `current-input`，走 TIS API）

```json
{"id":"com.apple.inputmethod.SCIM.ITABC","name":"Pinyin – Simplified",
 "type":"TISTypeKeyboardInputMode","isKeyboardLayout":false,"isAsciiCapable":false}
```

`isKeyboardLayout=false` 才是可靠判据（`TISTypeKeyboardLayout` = 无 IME 干扰）。

### 1.3 后果取证

`hot-open-probe` 的失败截图（ROI = 窗口顶部 10% 带）显示的不是文档，而是
**中文输入法候选窗**：

> `3 阿　4 钢　5 嗄　6 呵　7 腌　8 听`

即 `postKey(0x00)`（'a'）被拼音 IME 接走，弹出候选窗。
由此产生的连锁现象：

- **hot-open 第 2、3 轮必失败**（候选窗盖住 ROI → `detectMaxDiff=0`），
  切到 ABC 后同一脚本 **3/3 全成功**；
- **冷启动 `open` 的绝对值不可信且方差极大**：同机同一夹具（Mellow 10MB）
  三轮中位数分别为 **743.9 / 1586.4 / 2098.3 ms**，差异几乎全在 `latencyMs` 分量。

> 因此**本轮之前所有以「首键回显」为基础的数字都作废**，
> 包括 `2026-09-23-perf-probe-root-cause-and-fix.md` §4.1 的 743.9ms。

## 二、修复（三层，缺一不可）

### 2.1 判定改权威源

`perf-common.mjs` 新增 `currentInputSource()`（调 helper 的 `current-input`），
`inputSourceIsEnglish()` 改为要求 **`isKeyboardLayout === true`**。

### 2.2 门禁由「仅警告」升级为「拒绝执行」

`run-benchmark.mjs` 声明 `KEYSTROKE_METRICS = ['startup','open','typing','search','hotopen']`，
命中且输入源非键盘布局时：**先尝试自动切到 ABC**（调既有 `bin/select-input`，可逆），
仍失败则打印当前输入源名/类型并 `process.exit(1)`。
原先只 `console.warn` 放行 —— 于是产出的是「候选窗耗时」。

### 2.3 **每次探针在 `activateApp` 之后重新断言**

macOS **按应用记忆输入源**：实测在 runner 启动时断言为 ABC，
**激活 Typora 后变回「Pinyin – Simplified」**。故只在 runner 里断言一次不够。

helper 新增 `ensureAsciiInputSource()` / `currentIsKeyboardLayout()` /
`activateAndEnsureInput(pid:ensureAscii:)`；`cmdStartupProbe`、`cmdKeypressLatency`、
`cmdHotOpenProbe` 一律改走它，不再裸调 `activateApp`；调用方传 `--ensure-ascii`
（runner 侧统一由 `ENSURE_ASCII` 常量追加到每个合成按键类探针）。

## 三、hot-open 口径落地

### 3.1 机制（先验证再实现）

- 触发通道：`open -a <Mellow.app> <file>` 走 odoc Apple Event，
  由 Mellow 的 `RunEvent::Opened`（`lib.rs:346`）投递给当前聚焦窗口。
  实测：**pid 不变**（单实例保持）、整窗截图哈希改变（内容确实切换）。
- 触发**必须**留在 helper 内（新增 `hot-open-probe`）：runner 用 `execFileSync`
  同步调 helper，若先触发再调，helper 启动时切换瞬间已被错过。

### 3.2 指标定义

```
hot-open-to-editable = switchMs（触发 open → 画面首次变化）
                     + echoMs  （首键 → 屏幕回显）
settleMs = waitStable 的 600ms 地板，**不计入**（与 open 指标同契约，单独落盘）
```

### 3.3 实测（Mellow，1MB ↔ 5MB，3 轮，**3/3 有效**）

| 轮 | 目标 | switchMs | echoMs | totalMs | settleMs |
|---|---|---|---|---|---|
| 1 | 5MB | 2905.9 | 460.2 | 3366.0 | 622.9 |
| 2 | 1MB | 90.3 | 284.8 | 375.1 | 605.8 |
| 3 | 5MB | 2835.2 | 447.8 | 3282.9 | 630.3 |

**首个尺寸可归因的「文档打开成本」读数**：切到 5MB ≈ 2.84–2.91s，
切到 1MB ≈ 0.09s —— 差异全在 `switchMs`（即新文档开始呈现的时间），
`echoMs` 稳定在 0.28–0.46s。

> ⚠️ **本组读数来自旧构建**：本机 `.app` 是 2026-09-15 的 v1.5.9，
> 而裸二进制是 2026-09-22 构建。runner 已加**包陈旧告警**（`.app` 早于二进制即
> 响亮警告「本段读数来自旧构建」）。要作为当前提交的结论，须先重建包。

## 四、ABC 输入源下的冷启动读数（替换作废数字）

`--app both --fixtures 1MB.md,10MB.md --metrics open --runs 3 --warmup 1`：

| app / fixture | median | 有效样本 | winMs | latencyMs |
|---|---|---|---|---|
| Mellow 1MB | 595.6ms | 2/3 | [1247, 903, 439] | [null, 155, 157] |
| Mellow 10MB | 2098.3ms | 3/3 | [1061, 610, 474] | [1535, 1349, 1624] |
| Typora 10MB | —（拒渲染） | 0/3 | [653, 481, 595] | — |

**注意**：`winMs` 本身在 439–1247ms 之间波动（窗口出现时间），说明测量时机器有负载
（本轮并行跑了多次应用启动）。因此**这组数字不是定论**，仅说明「ABC 下的读数与
IME 下的不可混用」。Typora 10MB 仍为「拒渲染」（见
`2026-09-23-typora-render-limit-2mb.md`）。

## 五、新增护栏（`verify-parity-ledger.mjs`）

1. `perf-common` 必须实现 `currentInputSource` 且调用 helper 的 `current-input`；
   判定必须落在 `isKeyboardLayout` 上；
   **反例锁：不得再出现 `AppleSelectedInputSources`**（拼音 id 含 `ABC` 会误报）。
2. `run-benchmark` 必须声明 `KEYSTROKE_METRICS`，且该处必须 `process.exit(1)`（硬失败，非警告）。
3. `hotopen` 指标与 `hot-open-probe` 必须存在；helper 必须实现 `hot-open-probe`、
   `current-input`、`ensureAsciiInputSource`；
   **反例锁：三个合成按键命令必须走 `activateAndEnsureInput`，不得裸调 `activateApp`**。
4. canary 自检各条规则。

**首跑即抓到自身缺陷**：护栏把 `perf-common` 里**我自己的解释性注释**（为说明
「为什么不能用旧键名」而写了 `AppleSelectedInputSources`）当成违规 →
必须**先 `stripComments` 再断言**（与本文件早先 `benchCode` 的处理同理）。

## 六、仍未解决

1. **hot-open 需要新鲜 `.app`**：当前读数来自 09-15 的包；须重建包后复测。
2. **冷启动读数的机器负载**：本轮 `winMs` 波动 2.8×，需在空载机器上复测。
3. 台账 `P0-PERF-001.typoraBehavior` 对 >2MB 不成立、UX Gate 任务 30 在 Typora 侧
   不可执行、>2MB 夹具对比口径 —— 三项仍需裁决（见
   `2026-09-23-typora-render-limit-2mb.md` §五）。
