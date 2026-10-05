# ADR-0030 — Clipboard paste 优先级：`image payload` 与 `rich HTML` 的**处理器顺序冲突**

**Status:** **Proposed**（2026-10-05）

**关联：** `docs/specs/clipboard-smart-paste-spec.md` §3（Paste Priority）；审计 §4.72

---

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
