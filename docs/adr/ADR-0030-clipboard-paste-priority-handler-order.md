# ADR-0030 — Clipboard paste 优先级：`image payload` 与 `rich HTML` 的**处理器顺序冲突**

**Status:** **Accepted**（2026-10-05，裁决 **A3**）

**关联：** `docs/specs/clipboard-smart-paste-spec.md` §3（Paste Priority）；审计 §4.72 / §4.75

---

## 裁决（2026-10-05）= **A3：把顺序决策收敛到一处显式判断**

> 依据：用户 2026-09-30 的长期授权（「全部自行评估、决策、实施」，同 ADR-0024/25/26/29 的裁决）。

**关键推理：这个裁决其实不需要「真实剪贴板带哪些 MIME」的证据。**

起草时我以为裁决前必须先实测「从浏览器复制图片时剪贴板带哪些 MIME」。复核后否掉了这个前提：
**§3 的优先级 2 说的是「image/file **payload**」，不是「含 `<img>` 的 HTML」**。
⇒ **有 payload 时图片赢**是**规定行为**，与「真实剪贴板里 HTML 多不多」**无关**；
而**没有** payload 时 HTML 赢，**同样符合 §3**（那是优先级 4）。
即：**A3 让代码对「任何剪贴板内容」都遵循 §3**，不需要经验前提。
（这也解释了为什么 A2「修订 §3」不必要 —— §3 的优先级本身是自洽的。）

**实现**（`packages/editor-engine/src/smartPaste.ts`）：在 `handleSmartPaste()` 内
**显式**检查剪贴板是否带图片 payload（`items` 的 `image/*` 或 `files` 的 `image/*`），
有则 `return false` **让位**给 `image/input.ts` 的处理器。

**为什么不选 A1（把 `buildImageExtensions()` 前置）**：那是在改**全局注册顺序** ——
副作用会波及**其它**场景（例如「网页图文混排选区」原本应转 Markdown，前置后可能被图片路径抢走），
而且会让「谁优先」**继续依赖装配文件里的行号**（即本次问题的成因本身）。
A3 把决策放进**唯一相关的那一处**，并让它**可读、可测**。

**为什么不选 A2（修订 §3 让 image 让位给 HTML）**：§3 的优先级自洽（payload 比富文本更具体），
且 Typora 语义上「插入图片」也应走图片管线；没有理由为一个**实现形态问题**去改**声明**。

## 范围（如实声明）

- **只认 `image/*` payload**：那是 `image/input.ts` 唯一会消费的类型。
- **非图片的 file payload**（如从 Finder 复制 `.csv`）**不让位** —— 没有处理器消费它，
  让位只会让这次粘贴变成「什么都不发生」（比按 HTML/plain 处理更糟）。
  若将来引入文件粘贴处理器，应把该判断**收敛到同一处**（本条 ADR 的形态）。

## 验证

- **单测**：`packages/editor-engine/test/smart-paste.test.ts` 新增 **5 例** ——
  三类「让位」（`files` 带 `image/*` / `items` 带 `image/*` / 带 payload 时 **TSV 也让位**）
  + 两类**防过宽**（无 payload 时 HTML 照常转换；**非图片** payload 不让位）。**22/22 通过**。
  > ⚠️ 断言**不得**用 `event.defaultPrevented` 判定「smartPaste 是否拦截」——
  > **CM 自带的 paste 处理也会 preventDefault**（它自己插入剪贴板内容）⇒ 该量对两者都为 true。
  > 可靠判据是**文档内容**（转换发生了吗）。
- **护栏**：`tests/parity/verify-clipboard-contract.mjs` **按本裁决改写** ——
  首版锁的是「spec 声明的**有效顺序** ⇄ `index.ts` 现算的**注册顺序**」（让冲突不静默漂移，但不裁定）；
  A3 之后「谁优先」**不再依赖注册顺序** ⇒ 前提消失。
  现锁**更强的不变量**：**§3 优先级 2 必须在代码里被显式落实**
  （spec 的「落实方式（机器可读）」行 ⇄ 源码现算；去掉显式让位即失败）。

## 后果

- §3 的优先级在**任何扩展注册顺序下**都成立（消除「顺序即语义」这一隐性耦合）。
- 从浏览器「复制图片」等场景下，图片**走图片管线**（复制到资源目录 / 上传），
  不再被转成远程 `![](src)`。
- 注册顺序（`smartPaste@272` / `image@279`）**保留不变**，但**不再承载语义** ——
  护栏会把这一事实打印出来，避免读者误以为顺序无关紧要。

## 背景（原记录，保留）

## 背景

`clipboard-smart-paste-spec` §3 声明了 6 级粘贴优先级：

```
1. explicit Paste Plain
2. image/file payload      ← 关键
3. TSV table candidate
4. HTML rich content       ← 关键
5. URL-on-selection
6. plain text
```

**实现是分散在两个独立的事件处理器里的**（不是一处）：

| 优先级 | 实现位置 | 形态 |
|---|---|---|
| 1 | `smartPaste.ts` 的 `Mod-Shift-v` 键位 → `pastePlain()` | 键位命令 |
| **2** | **`image/input.ts`**（`paste` eventHandler：读 `items` 的 `image/*` 与 `data.files`） | **独立扩展** |
| 3 / 4 / 5 | `smartPaste.ts` 的 `handleSmartPaste()`（链内顺序正确） | 同一个处理器 |
| 6 | 不拦截 → 交回 CM 默认 | — |

**冲突点**：CodeMirror 的 `eventHandlers.paste` 按**扩展注册顺序**调用，**首个返回 `true` 者胜**。
而 `packages/editor-engine/src/index.ts` 的注册顺序是：

```
buildSmartPasteExtension(),   // 行 272 —— 优先级 3/4/5
...
buildImageExtensions(),       // 行 279 —— 优先级 2
```

⇒ **优先级 2 排在优先级 3/4 之后**，与 §3 声明相反。
当剪贴板**同时**含富文本与图片时（典型：从浏览器「复制图片」，剪贴板带 `text/html` 的 `<img>`
+ 图片数据），`handleSmartPaste()` 的 HTML 分支**先命中并返回 `true`**
⇒ 图片被转成 `![](src)` 的**远程链接**，**不走**「复制到资源目录 / 上传」的图片管线。

## 为什么长期没被发现

`smart-paste.test.ts` 的「P5.3 Clipboard — paste priority 链」**只覆盖 `handleSmartPaste` 链内**
（已钉住 3 > 4、4 > 5、无选区 URL 不误建链接）——
**没有任何测试覆盖「两个处理器之间」的顺序**，而这一层的胜负完全由 `index.ts` 的注册顺序决定。

## 需要的证据（裁决前）

**本环境尚未取得**：真实剪贴板在下列操作后到底带哪些 MIME ——

1. 从浏览器（Chrome/Safari）「复制图片」；
2. 从 Word / Gmail 复制**图文混排**选区；
3. 从 Finder 复制图片文件。

判据要点：**只有当 `text/html` 与图片数据同时存在时**，本冲突才会实际发生。
若实测表明常见路径下二者不同时出现，则本冲突的**实际影响面很窄**（仍应显式化，见 A3）。

## 待决选项

| 选项 | 内容 | 代价 / 风险 |
|---|---|---|
| **A1** | 把 `buildImageExtensions()` **前置**到 `buildSmartPasteExtension()` 之前 | 与 §3 一致；但图片处理器对「带图片的富文本粘贴」更激进，可能改变**其它**场景（如「网页图文混排选区」原本应转 Markdown，前置后可能被图片路径抢走） |
| **A2** | 保持现状 + **修订 §3**（把 image 降到 HTML 之后） | 需说明「为什么图片反而应让位给 HTML」—— 与 Typora 行为是否一致需一手证据 |
| **A3** | 在 `handleSmartPaste()` 里**显式**先检查 `data.files` / `items` 并**让位**（把顺序决策**收敛到一处**） | 与 §3 一致，且**不依赖注册顺序**（消除「顺序即语义」这一隐性耦合）；代价是要在两处维护同一判据（可加护栏） |

**倾向**：**A3** —— 它把「谁优先」从**扩展注册顺序**（隐式、无判据）变成**代码里的显式判断**（可读、可测）。
但**证据不足，本轮不裁**（需先有上面的 MIME 实测）。

## 后果（无论选哪个）

- §3 的「有效顺序」必须与实现一致；该一致性由护栏**双向**锁定
  （spec 的「有效顺序（机器可读）」行 ⇄ `index.ts` 的注册顺序）——
  顺序被改动而 spec 未更新 ⇒ 护栏失败。
- **本轮不调整任何行为**：按 `AGENTS.md`「如果实现与 Spec 冲突：**不要自行修改架构，先报告冲突**」，
  本 ADR 只做**记录与承载**。

## 关联

- `docs/specs/clipboard-smart-paste-spec.md` §3
- `packages/editor-engine/src/smartPaste.ts`（优先级 3/4/5）
- `packages/editor-engine/src/image/input.ts`（优先级 2）
- `packages/editor-engine/src/index.ts`（**注册顺序** —— 冲突的实际来源）
- `packages/editor-engine/test/smart-paste.test.ts`（只覆盖链内顺序）
- `docs/qualification/release-blocker-audit-2026-09-25.md` §4.72
