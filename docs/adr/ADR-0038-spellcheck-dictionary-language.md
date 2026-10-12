# ADR-0038 — 拼写检查的**语言 / 词典**能力：用**系统**拼写检查，还是复刻 Typora 的**语言包管理**？

**Status:** **Proposed**（2026-10-12）—— 待裁决。

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

（待裁决。）裁决后必须同步：

1. 本文件顶部状态改为 `Accepted`，并在此写明所选选项（**不改写本文其余部分** —— ADR 只追加）；
2. 门禁 `PENDING_ADRS` → `DECIDED_ADRS`；审计登记表第 21 行的「处置」；
3. 矩阵 `presetSpellCheck` 的 `disposition`（A ⇒ `deliberate` + D 表行；B/C ⇒ `implemented` + 实现）；
4. 若选 C：`spellcheckForCodeAndLink` 与 `autoCorrectMisspell` 的 `status` / `disposition` 同步；
5. 若选 A：在 master-plan §12 D 表加一行（登记「用系统拼写检查」这个**有意差异**），
   并在 §7 的 4.2 行写明「语言/词典 = 平台惯用等价物」。
