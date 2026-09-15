# Mellow v1.5.9

v1.5.8 之后的对标收口版本：**把 Typora 偏好面板里尚未落地的几项逐个对齐**（一手证据驱动），
并修复一处**持续 6 次的 CI 红灯**（根因是本地校验链漏了渲染层的 lint/test）。

## 新增

- **Tab 键缩进可配置（G7-EDIT-13）**。Typora「默认缩进」默认 **2 空格**、「使用Tab」默认关闭；
  Mellow 此前从未设置 `tabKeyBehavior`，一直落到引擎默认 `insertTab` ——
  **Tab 会插入裸制表符**，而行首制表符在 CommonMark 里是**缩进代码块**，属真实隐患。
  现新增设置（2 空格 / 4 空格 / 使用 Tab），默认 2 空格，与 Typora 一致。
- **「匹配 Markdown 字符」独立开关（G7-EDIT-12 收尾）**。Typora 的括号/引号配对
  （`noPairingMatch`）与 Markdown 字符辅助（`autoPairExtendSymbol`）是**两个互不包含**的开关，
  Mellow 此前用一个 `autoCharacterPairs` 兼管。现拆为独立设置，**默认关闭**（对齐 Typora），
  因此不改变任何既有行为。
- **「首行缩进」（G7-EDIT-15）**。新增设置（默认关闭，与 Typora 一致）；只作用于普通段落首行，
  列表 / 引用 / 代码块不叠加。
- **「导出时保留单换行符」（G7-FEAT-13）**。Mellow 的 Enter 产**单个 `\n`**，而 CommonMark 把段内
  单换行渲染为空格 —— 此前「编辑器里看到的换行在导出件里消失」。现同时作用于 **HTML 与 PDF
  两条导出管线**（默认关闭，与 Typora 的 `preLinebreakOnExport` 一致；对硬折行的源文件更安全）。
- **「保存时在文末添加空行」（G7-FEAT-12）**。语义与 Typora 一致：**只在缺失时追加**、
  跟随文档 EOL、**从不删除**已有换行（默认关闭）。

## 修复

1. **Reader 折叠段内单换行，与编辑器及 Typora 都不一致（G7-EDIT-14）**。
   实测：`a\nb` 渲染为 `<p>a b</p>`（折叠），而 `> a\n> b` 却是 `<blockquote>a<br>b</blockquote>`
   —— Reader **自身就不一致**。而 Typora 的「Preserve single line break」**默认勾选**。
   现段落与引用共用同一渲染路径，单换行一律保留为 `<br>`，并保留跨行行内标记
   （如跨软换行的粗体不被切断）。
2. **CI 连续 6 次 failure（本次发布的前置修复）**。失败点全部在 `Vendored CoreEditor (yarn)`
   这一步的 ESLint：`closeBrackets` 变成未使用导入、`autoCharacterPairs` 变成未使用变量、
   `firstLineIndent` 的可空布尔条件。根因是**本地校验链漏跑渲染层的 lint/test**（只跑了 `tsc`）。

## 质量基建

- 新增 `tools/check-vendored-editor.mjs` 并接入 `npm run parity` / `npm test`：
  把 CI `editor-core` job 的 **eslint + jest** 带到本地门禁。
  在 CI 的 parity job（刻意不装依赖）中会**响亮地 SKIP** 并指名缺失的二进制，
  避免「半装依赖」被静默跳过。
- 新增运行时验证脚本（真实 bundle / iframe）：
  - `tests/e2e/tab-indent-verify.mjs`（5 条）：含**反例** —— 证明引擎的 `indentUnit` facet
    在 Mellow **无消费方**（三档取值行为完全一致），若当初用它实现该设置会做出**空开关**。
  - `tests/e2e/first-line-indent-verify.mjs`（7 条）：普通段落首行 2em、第二行不缩进、
    列表/引用/代码块不叠加、开关双向切换。
  - `tests/e2e/markdown-syntax-pairs-verify.mjs`（3 条）：默认关闭时选区输入 `*` 只插入该字符，
    开启后包裹为 `*abc*`，再关闭后回到只插入字符。

## 护栏

- `verify-settings-contract.mjs` 扩充 ⑨⑩⑪⑫ 四节 + ⑧ 节补强，逐层锁死上述设置：
  默认值 / App 启动恢复与 live apply / `editor-core` 白名单 / bridge 消息 / compartment 装配，
  并锁**不变量**（如「任何 `documents.save(...)` 都不得绕过文末换行变换」、
  「App 侧两条导出路径都必须下发保留换行设置」）+ 注入 canary。
- `verify-shell-typography.mjs` 新增专节锁 Reader 软换行行为。
- **锁反例**：把「为什么不能这样做」写进断言（如「不得用 `setIndentUnit` 实现缩进设置」
  「Markdown 字符辅助不得再复用 `autoCharacterPairs`」），比只锁「应该这样做」更能防回退。

## 已知未闭环（Release Gate 仍 NO-GO）

P0-EDITOR-004（原生 IME）、P0-PERF-001（性能）、P0-PLATFORM-001（三平台 Runtime）、
P0-QA-001（UX Score / 30 任务）、P0-EDITOR-005（拼写词典，需 host-api）、
P0-LAYOUT-002（三平台视觉 Golden）—— 均依赖真机 / CI / host-api，本环境无法闭环。

按 ADR-0020（2026-09-05 用户裁决）：「**CI 绿即正式发布**」，残余真机 Gate 转为发布后跟踪项。
