# Typora 1.14.9 的渲染上限：内容 > 2,000,000 字符即拒渲染（2026-09-23）

**结论**：Typora 1.14.9（build 7785）**不渲染内容超过 2,000,000 字符的文档**。命中时它
只显示一页「该文件过大，因此无法在 Typora 中呈现」提示 + 一个 `QuickLook` 按钮，
既不渲染内容、也不可编辑。

这条事实**推翻**了台账里 10MB 量级的对比前提，也是
`2026-09-23-perf-probe-root-cause-and-fix.md` 中「Typora 侧 0/5」的真正原因
（该文原先记为「本机 SCK 捕获返回静止画面」，**该表述错误，已被本文取代**：
捕获是正常的，静止的是 Typora 自己画出来的那页提示）。

---

## 一、一级证据：Typora 自己的判定代码与文案

### 1.1 判定式（`TypeMark/appsrc/window/frame.js`）

```js
tryEnterOversize: function (e, t, n) {
  return (!File.isMac || File.bundle.filePath) && (a.bindOversizePlaceholder(), t || e.length > File.MAX_FILE_SIZE)
    ? (File.doEnterOversize(n), "")
    : (File.exitOversize(), e)
}
```

同文件内：

```js
MAX_FILE_SIZE: 2e6
```

即：当 markdown **字符串长度 > 2,000,000** 时进入 oversize 模式（返回空串，不渲染）。
`doEnterOversize` 显示 `#ty-oversize-body`（该节点定义在 `TypeMark/index.html`）。
另注 `(!File.isMac || File.bundle.filePath)`：macOS 上要求文档已有文件路径 —— 即
**未保存的新文档不会触发**，只有真实文件才会。

### 1.2 文案真值

| 位置 | 键 / 值 |
|---|---|
| `zh-Hans.lproj/Front.strings` | 键 `The file is too large to render in Typora.` → 值 `该文件过大，因此无法在 Typora 中呈现` |
| `TypeMark/index.html` | 渲染 `#ty-oversize-body` 的模板 |

## 二、实测边界（本机，整窗 SCK 截图字节数判别）

以纯 ASCII markdown（字符数 ≈ 字节数）在阈值两侧各造一个文件：

| 文件 | 内容字符数 | 整窗截图 PNG | 判定 |
|---|---|---|---|
| `1MB.md` | 1,048,576 | 467,927 B | **正常渲染**（富内容） |
| `boundary-1900000.md` | 1,900,000 | 270,186 B | **正常渲染** |
| `boundary-2100000.md` | 2,100,000 | 36,417 B | **oversize 提示页** |
| `5MB.md` | 5,242,880 | 33,627 B | oversize 提示页 |
| `10MB.md` | 10,485,760 | 33,776 B | oversize 提示页 |
| `100k-lines.md` | 5,485,326 | 34,254 B | oversize 提示页 |

截图（`tests/qualification/evidence/assets/`）：

- `2026-09-23-typora-1MB-rendered.png` —— 1MB 正常渲染（对比基准）
- `2026-09-23-typora-boundary-1900000-rendered.png` —— 阈值下侧仍渲染
- `2026-09-23-typora-boundary-2100000-oversize.png` —— 阈值上侧提示页
- `2026-09-23-typora-oversize-10MB.png` —— 10MB 提示页（原 10MB 对比的实际内容）

实测与 `MAX_FILE_SIZE = 2e6` 完全吻合：1,900,000 渲染 / 2,100,000 不渲染。

## 三、对既有结论的影响（逐条更正）

1. **台账 P0-PERF-001 的 `typoraBehavior`「同机、同文档条件下维持可编辑和可导航」
   对 >2MB 文档不成立** —— Typora 在该尺寸上既不渲染也不可编辑。该合同文本需修订
   （属合同变更，未擅自改动，见 §五）。
2. **原结论「10MB open 1109.7ms，Typora 428.1ms，2.59×」的 Typora 侧 428.1ms，
   测的是「Typora 画出『文件过大』提示页的耗时」**，与「打开并编辑 10MB 文档」不是
   同一件事。此前已因探针口径问题撤回该结论，本文给出**更根本的理由**：
   基线在该尺寸上根本没有可比的用户行为。
3. **正确表述**：对 ≥2MB 的文档，Mellow 能打开并编辑，Typora 不渲染 ——
   这是 Mellow 的**能力优势**，不是性能劣势；同时**不存在可比的比值**（Typora 侧无行为）。
4. **UX Gate 任务 30「10 MB 打开、搜索、编辑、保存」在 Typora 侧不可执行**。
   `ux-gate-recorder.mjs` 要求每个任务记录 `typora`/`mellow` 各两轮，
   而 Typora 对 10MB 只出提示页 → 该任务的 Typora 两轮**无法产生有意义记录**。
   这是门禁设计层面的冲突（见 §五）。
5. **报告生成器已修**：`run-benchmark.mjs` 新增 `TYPORA_MAX_FILE_SIZE = 2_000_000` 与
   `baselineRendersFixture()` / `ratioOrNA()`，对超限夹具把 Typora 列标注为
   `—（拒渲染）`、比值输出 `n/a（Typora 拒渲染）`，并在报告顶部给出「基线不适用」提示。
   原先报告会直接打出「10MB ratio M/T = 0.57」这类数字，属**主动误导**。
   护栏 `verify-parity-ledger.mjs` 锁死：不得把 Typora 的 median/p95 直接当分母。

## 四、护栏与注入验证

`verify-parity-ledger.mjs` 新增一节：

- 正例锁：必须声明 `TYPORA_MAX_FILE_SIZE = 2000000`；必须实现 `baselineRendersFixture`
  与 `ratioOrNA`，且 `ratioOrNA` 必须引用该常量（防判定与阈值脱钩）。
- 反例锁：不得出现 `.<median|p95|medianMB|peakMB> / (tt|ts).` 形式的裸相除。
- canary：自检反例锁本身。
- 首跑即抓到一处自身缺陷：常量写作千位分隔的 `2_000_000`，其中**连续 0 只有 3 个**，
  用 `0{5,}` 会漏判 —— 已改为 `2[_0]{6,}` 并留注释。

**注入验证**：把 `ratioOrNA(mt?.median, tt?.median, f)` 退回
`(mt.median / tt.median).toFixed(2)` → 护栏报错、EXIT≠0；还原后 EXIT=0。

## 五、需要裁决（未擅自改动）

1. **台账 `P0-PERF-001.typoraBehavior`** 的合同文本对 >2MB 不成立，应如何改写？
   （候选：限定为「≤2MB 文档」+ 明确 >2MB 时 Typora 无行为可对标。）
2. **UX Gate 任务 30** 的 Typora 侧不可执行，应如何调整？
   （候选：改为只评 Mellow 绝对指标、或把 10MB 换成 ≤2MB 的对照尺寸。）
3. **>2MB 夹具的对比口径**：Typora 侧应记为「不适用」并从比值统计中剔除，
   还是保留为「基线拒渲染」这一观察项？

在上述裁决落地前，**不得**用 >2MB 夹具产出任何「Mellow vs Typora」的比值结论。
