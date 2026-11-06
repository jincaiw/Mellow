# ADR-0038 — 拼写检查的**语言 / 词典**能力：用**系统**拼写检查，还是复刻 Typora 的**语言包管理**？

**Status:** **Accepted**（2026-11-03，**用户裁决**）—— 裁决 = C（见文末「六、裁决」节）。

> **本 ADR 为什么是 Proposed**：两条路都会**改变用户可见行为**（是否出现「选择语言 / 下载词典」入口、
> 「代码 / 链接内是否检查」的默认值），属**产品取舍**；而 B 路还要新增一个**词典下载子系统**
> （网络 + 磁盘 + 状态机 + 三平台词典源），面积远超「补一个开关」。

---

## 一、背景：一手证据（本机 Typora 1.14.9 / 7785）

`/Applications/Typora.app/Contents/Resources/zh-Hans.lproj/Front.strings`（**UTF-16LE**）实测含 **10 条**：

| key | zh-Hans |
|---|---|
| `Select Spell Check Language` | 选择拼写检查语言 |
| `Disable Spell Check` | 不使用拼写检查 |
| `Install Language Support` | 安装该语言的拼写检查支持 |
| `Install dictionary file only for Typora` | 安装仅适用于 Typora 的拼写检查支持 |
| `Download dictionary file for %@` | 下载针对 %@ 的拼写检查支持包 |
| `Spell Check (%@ downloading)` | 拼写检查 (%@ 下载中) |
| `Spell Check (%@ unavailable)` | 拼写检查 (%@ 不可用) |
| `Dictionary file is missing to enable spellcheck support for %@.` | 拼写检查: 缺少对于 %@ 的字典文件。 |
| `(Default spell check option)` | (默认的拼写检查选项) |
| `Failed to load spellcheck module` | 拼写检查加载失败 |

⇒ Typora 的模型是「**按语言下载 / 安装 / 切换词典**，并有**显式状态提示**」
（downloading / unavailable / missing / failed）。这**不是**「一个开关」，而是一个**词典生命周期**。

⚠️ **取证方法**（可复现）：该 `.strings` 是 UTF-16LE；用 UTF-8 读会得到乱码并误判「0 命中」
（本仓的 `audit-typora-orphan-strings.mjs` 的**文案面**是 `Base.lproj` 的英文，**看不到** zh-Hans）。

## 二、背景：Mellow 现状（2026-10-12 实测）

- **契约**：`packages/host-api/src/host.ts` 声明 `SpellcheckService`
  （`available` / `suggest` / `learn` / `unlearn` / `hasLearned` / `checkDocument`）；
- **实现**：`apps/desktop/src-tauri/src/spellcheck.rs`（**6 个命令**）——
  macOS 走**系统 `NSSpellChecker`**（**词典与语言由 OS 提供**）；非 macOS `available=false`（ADR-0016）；
- **装配**：`apps/desktop/src/host/spellcheck.ts`（含可用性缓存 `primeSpellcheckAvailability()`）；
- **消费**：右键**建议列表**（经 `dispatchCommand(id, payload)`）+ `edit.spelling.learn/unlearn/checkDocument`；
- **证据**：`tests/e2e/spellcheck-suggestions-verify.mjs`（**7/7**，含反向相位）+ `ci.yml` 的 `rust-check-macos`；
- **代码区排除**：**已实现** —— `packages/editor-engine/src/inlineCodeAttrs.ts` 给行内码设
  `spellcheck=false`，块级码由 CoreEditor 的 `codeBlockStyle` 承担；**但无「开关」**（无条件排除）。

⇒ 台账 `P0-EDITOR-005` 因此已是 **`IMPL`**（`blockedBy: runtime-verification-pending`，只剩**真机三平台证据**）。

## 三、登记现状（本 ADR 要补的那一半）

- 偏好矩阵三条 `gap` 的说明**都引用**「依赖 `host-api` 的拼写词典能力（`P0-EDITOR-005`）」——
  而该能力**已落地** ⇒ **理由已过期**：
  - `presetSpellCheck`（本 ADR 的主要对象）· `spellcheckForCodeAndLink` · `autoCorrectMisspell`；
- **D 表 / PRD / 审计「待裁决项登记表」均无**该裁决 ⇒ 它是**未登记的待裁决项**。

## 四、选项

| # | 方案 | 用户可见变化 | 成本 | 本机可验证 |
|---|---|---|---|---|
| **A** | **维持系统拼写检查**：登记为**平台惯用等价物**（D 表加一行），**不改代码** | 无 | 0 | ✅ |
| **B** | **复刻语言包管理**：自建词典下载 / 安装 / 切换 + 四态提示 UI | 新增设置区；首次使用需下载 | **高**（网络 + 磁盘 + 状态机 + 三平台词典源） | ⚠️ 部分 |
| **C** | **折中**：只读展示「当前语言」+「打开系统拼写设置」入口；并给**代码 / 链接内检查**加**开关** | 新增 1–2 个设置项 | 低 | ✅ |

### 各选项的已知事实（供裁决）

- **A** 的依据：macOS 的 `NSSpellChecker` **本来就**用 OS 词典与 OS 语言列表 ——
  「选语言」在 macOS 上的**惯用位置是系统设置**，而不是应用内。Mellow 的 `available()`
  已能在不可用时**优雅降级**（不显示拼写区，避免「点了没反应」）。
- **B** 的依据：Typora 是**跨平台**且**自带**词典体系（不依赖 OS），所以它必须有这套 UI；
  它还有 4 个**状态**（下载中 / 不可用 / 缺词典 / 加载失败）需要**呈现**。
- **C** 的依据：`spellcheckForCodeAndLink` 与 `autoCorrectMisspell` 是**独立于 A/B** 的两条小缺口
  （见下），可先单独裁决/实施。
- ⚠️ **`autoCorrectMisspell` 的实测结论**（`P0-EDITOR-005` 已记录）：其所需的
  `setAutomaticSpellingCorrectionEnabled` **在 `objc2-app-kit` 0.3.2 的 `NSSpellChecker` 绑定中不存在**，
  且它作用于 `NSTextView`、**对 WKWebView 的拼写检查无效** ⇒ 加上去只会是**空开关**。
  ⇒ 该条**不是「未做」**，而是**不可实现** —— 它的**正确状态**（`gap` / `deliberate` / `not-applicable`）
  **也属本 ADR 的裁决范围**。

## 五、机器可读化（本 ADR 顺带补上的那一半）

- 矩阵 `presetSpellCheck` 的 `disposition` 由 `{kind:'gap', ref:'P0-EDITOR-005'}` 改为
  **`{kind:'undecided', ref:'ADR-0038'}`** —— 该项已是 `IMPL`，「等 `host-api`」**不再是真实原因**；
  剩下的**是决策**（门禁的 `resolvesRef('undecided', …)` 会断言本 ADR **仍为 Proposed**）；
- 审计「待裁决项登记表」**新增一行（第 21 行）**，载体 = 本 ADR；
- 门禁 `PENDING_ADRS` 增列本 ADR ⇒ 门禁的 `Pending decisions:` 会列出它。

## 六、裁决

**裁决 = C**（折中：**只读展示「当前语言」+「打开系统拼写设置」入口 + 给「代码/链接内拼写检查」加开关**，
开关**默认关** = 对齐 Typora 的 `spellcheckForCodeAndLink` 默认 `false` 与 Mellow 现状
「无条件排除代码/链接」）—— 用户 2026-11-03 拍板（最终对标轮）。

- **施工批次 A38**：设置页拼写区加「当前语言（只读）」+「打开系统设置…」按钮（macOS 深链
  `x-apple.systempreferences:` 走 Rust Adapter；Win/Linux 隐藏该区或降级，沿用 `available()` 门）；
  新增 `editor.spellcheckForCodeAndLink`（默认 `false`）接线 `inlineCodeAttrs.ts` /
  CoreEditor `codeBlockStyle` 的排除逻辑（开关关 = 现行无条件排除不变 ⇒ **默认行为不变**）。
- ⚠️ `autoCorrectMisspell` **维持不可实现**的登记（`objc2-app-kit` 0.3.2 无该 API 且对 WKWebView 无效，
  见本文「各选项的已知事实」）⇒ 加上去只会是**空开关**，**不**随 C 实施。

以下 1–5 为裁决同步清单的执行记录（2026-11-03）：

1. ✅ 状态已改 `Accepted`，本节目绑选项 C（其余部分未改写）；
2. ✅ 门禁清单与登记表第 21 行已同步；
3. ✅ 矩阵 `presetSpellCheck` 的 `disposition` 已改 `{ kind:'deliberate', ref:'D-AW' }`
   （「用系统拼写检查 + 平台惯用入口」= 有意差异；「implemented + 实现」留给 A38 落地时按真实状态再改）；
4. ✅ `spellcheckForCodeAndLink`：`status` 维持 `gap`、`blockedBy` 改 `not-implemented`
   （裁决已给出，施工批次 A38 可自主实施）；`autoCorrectMisspell`：维持 `gap` + `not-implemented`
   （按上文**不可实现**结论，实装批次**不**含它；若未来平台 API 到位再重开）；
5. 不适用（未选 A）；D 表新增 **`D-AW`** 登记「系统拼写检查 = 平台惯用等价物」的有意差异，
   §7 4.2 行已由 A38 批次改写。

---

## 七、执行记录（2026-11-06，批次 A38）

裁决 C 已落地。落点与证据（详见 master-plan **D-AW** 行的施工记录）：

- **开关** `editor.spellcheckForCodeAndLink`（默认 `false` ⇒ 默认行为与开关引入前**逐字一致**）：
  行内侧 = `inlineCodeAttrs.ts` 构建装饰时 copy-then-delete `spellcheck` 键（`INLINE_CODE_ATTRIBUTES`
  字面量不动，护栏 INLINE↔BLOCK 文本比对仍过）；块内侧 = `spellcheckScope.ts` ViewPlugin 幂等同步
  wrapper 的 `spellcheck` 属性，生效值 = 开关 ∧ 全局拼写偏好（纯函数 `blockWrapperSpellcheckAttr`）；
  链接侧**天然成立**（此前从未排除链接 ⇒ 开关对链接是 no-op，与 Typora 语义一致）。
- **只读语言展示**：`spellcheck_language` Rust 命令（`NSSpellChecker.language()`）⇒ 面板行；
  **刻意不入 settings schema**（系统状态而非用户设置；值型必须有 storageKey —— 护栏规则 D，
  先例 = 已裁撤的 `ai.panel`）。
- **系统设置入口**：自定义命令 `open_system_spell_settings`（NSWorkspace 深链
  `x-apple.systempreferences:com.apple.Keyboard-Settings.extension`）。⚠️ 不走 opener 插件
  `openUrl`：其权限只放 `mailto/tel/http(s)`，自定义 scheme 会被 ACL 拒 —— 属 Adapter 面，合规。
- **验证**：`packages/editor-engine/test/spellcheck-scope.test.ts`（6）＋
  `apps/desktop/src-tauri` cargo 测试（深链/语言命令/退出策略三分支）＋
  `tests/e2e/a38-spellcheck-scope-verify.mjs`（17 例：面板三行、live apply 全链
  「开 ⇒ 行内码真的丢 spellcheck」、降级文案）。
- ⚠️ **本轮附带抓到的面板级缺陷**（已修，`SettingsPanel.tsx`）：受控 checkbox 的 onChange 只写
  localStorage + applySetting，而**纯引擎推送型**开关不 bump 任何 React state ⇒
  React `restoreControlledState` 把勾选**弹回**，用户看到「点了自己跳回去」。e2e 探针（断言视觉态，
  非仅存储值）当场暴露 —— 旧探针全按 localStorage 判，故此缺陷从未被捕获。
