# Mellow v1.5.26

## 本次发布

**本版本不含产品行为变更** —— 继续逐节审计权威 spec：这次是 **`clipboard-smart-paste-spec`**。

> 一句话：这份 spec 声明的**粘贴优先级**里，「图片优先于富文本」这一条，
> 在实现里**完全由扩展的注册顺序决定** —— 而那个顺序**与 spec 相反**，
> 且**没有任何判据覆盖它**（测试只能覆盖链内）。

---

## 1. 最重的一处：§3 的优先级与实现「顺序相反」

§3 声明 6 级粘贴优先级：

```
1 Paste Plain → 2 image/file payload → 3 TSV → 4 HTML → 5 URL-on-selection → 6 plain
```

而实现是**分散在两个独立事件处理器**里的：

| 优先级 | 位置 | 形态 |
|---|---|---|
| 1 | `smartPaste.ts` 的 `Mod-Shift-v` → `pastePlain()` | 键位命令 |
| **2** | **`image/input.ts`** 的 `paste` handler | **独立扩展** |
| 3 / 4 / 5 | `smartPaste.ts` 的 `handleSmartPaste()`（**链内顺序正确**） | 同一个处理器 |

**冲突点**：CM 的 `eventHandlers.paste` 按**扩展注册顺序**调用、**首个返回 `true` 者胜**。
而 `packages/editor-engine/src/index.ts` 里 `buildSmartPasteExtension()`（**行 272**）
**先于** `buildImageExtensions()`（**行 279**）⇒ **优先级 2 排在 3/4 之后**。

⇒ 剪贴板**同时**含富文本与图片时（典型：从浏览器「复制图片」，带 `text/html` 的 `<img>` + 图片数据），
HTML 分支先命中 ⇒ 图片被转成远程 `![](src)`，**不走**「复制到资源目录 / 上传」的图片管线。

**为什么长期没被发现**：`smart-paste.test.ts` 的「paste priority 链」测试**只覆盖链内**
（已钉住 **3 > 4**、**4 > 5**），**没有任何测试覆盖「两个处理器之间」的顺序** ——
而那一层的胜负**只写在 `index.ts` 的行号里**。

**处置（本环境不擅自改行为）**：按 `AGENTS.md`「如果实现与 Spec 冲突：**不要自行修改架构，先报告冲突**」，
本轮**只记录 + 立载体**：**`ADR-0030`（Proposed）**，并登记进审计「待裁决项登记表」第 11 行 +
门禁 `PENDING_ADRS`（该列表**重新非空**）。裁决前需**一手证据**：真实剪贴板在
「从浏览器复制图片 / 从 Word 复制图文 / 从 Finder 复制图片」时到底带哪些 MIME。

> **倾向 A3**：把顺序决策**收敛到链内一处显式判断**（而非调整全局注册顺序）——
> 消除「顺序即语义」这一隐性耦合。但证据不足，本轮**不裁**。

## 2. 其余各节（均正向确认）

| 节 | 判定 |
|---|---|
| §2 Copy | ✅ 5 个用户命令全在；**RTF 确实实现**（`clipboardCopy.ts` 写 `text/rtf`） |
| §4 HTML → Markdown | ✅ 7 项全实现；**「sanitize before conversion」成立**（两阶段，非就地改 DOM） |
| §5 URL on Selection | ✅ 只替换 target；无选区**不**误建链接 |
| §6 TSV → Table | ✅ 且**比 spec 更严**（要求完全矩形，不一致则拒绝转换）；Undo = **一次** transaction |
| §7 Paste Plain | ✅ rich formats 在**类型层面**不可达 |
| §9 IME / Clipboard | ✅ `isComposing` 首句守卫；测试钉住「**compositionend 后生效**」 |
| §10 Security | ✅（此前已审，本轮复核仍成立） |

**§8 是一处缺口**：7 个目标应用**只自动化 1 个**（TextEdit），人工矩阵模板
`tests/qualification/clipboard-copy-cross-app.md` 的 **7 行 × 6 列全部「未测」** ⇒ **载体存在但为空**。
已如实登记，**未**假装覆盖，也**未**擅自缩减矩阵。

## 3. 新增护栏（第 19 个）

**`tests/parity/verify-clipboard-contract.mjs`** —— Clipboard 域此前**没有任何护栏**。
它**不裁定冲突**，而是把「有效顺序」从 `index.ts` **现算**出来，与 spec 的
「**有效顺序（机器可读）**」行**双向**比对：改代码不改文档 ⇒ 失败，反之亦然
⇒ **冲突不会静默漂移**。**注入验证 5/5**。

> **连带（判据真的在工作）**：门禁**正确地**抓到 `tests/qualification/README.md` 的护栏数量过期
> （**18 → 19**）并硬失败 —— 这正是「多处副本」那条判据的设计目的。

---

## 已知未闭环（保持 `NO-GO`）

- 未闭环 **9 项**，阻塞原因**全部**是**人工 UX Gate 会话**或**真机/平台证据**（`实际 PASS-E = 0/50`）。
- **待裁决**：**ADR-0030**（clipboard paste 处理器顺序）—— 本版起 `Pending decisions:` **不再为「无」**。

> ⚠️ 本版**不含产品行为变更**，未闭环项的结论**不因此改变**。

## 发布状态

**Pre-release**（ADR-0020 / ADR-0024 Q2=B1）。`finalize` 在**断言三平台制品齐全**后**自动**发布，无需人工步骤。
