# Image Workflow Spec

## 1. 目标

图片体验必须达到 Typora 水平，不仅是“能显示图片”。

---

## 2. 输入渠道

- Markdown typing
- file picker
- drag single
- drag multiple
- paste bitmap
- paste copied file
- paste URL

---

## 3. Insert Strategy

```text
Keep original
Use relative path
Copy to assets
Upload
```

默认建议：
- local document: relative path
- pasted bitmap: copy to configured asset dir

---

## 4. Asset Directory

支持：

- `./assets/`
- `./images/`
- `./${filename}.assets/`
- custom

---

## 5. Path Rules

处理：
- Chinese chars
- spaces
- `#`
- `%`
- brackets
- Windows drive
- UNC
- macOS/Linux absolute
- symlink

设置：
- ensure `./`
- URL escape
- root URL

---

## 6. Rename / Move

对单图：
- rename file
- move
- update current reference
- optional update all workspace refs P1

文档 rename：
- detect `${filename}.assets`
- ask to rename asset dir
- patch references atomically

---

## 7. Batch

P0：
- Move All
- Copy All
- Download Remote

P1：
- Upload All
- unused image cleanup
- image manager

> **⚠️ 2026-10-01 一手证据复核：P1 后两项**无一手依据**，登记为待裁决**
>
> 取本机 Typora 1.14.9 逐字核对：
> - **`Upload All` ✓ 是 Typora 的**（`Menu.strings`：`Upload All Local Images = 上传所有本地图片`；
>   自带文档 `Docs/Use Images in Typora.md` 亦引用 `Upload All Local Images`）。
> - **`unused image cleanup` 与 `image manager` 在 Typora 里找不到对应物**：
>   `Menu.strings` 的**全部 25 条**图片相关项已逐条列出（`Insert Local Images` / `Move All Images to` /
>   `Copy All Images to` / `Upload All Local Images` / `Image Tools` / `Reload All Images` /
>   `Global Image Settings` / `Zoom Image` / `Rename or Move Image to` / `Use Image Root Path` …），
>   **没有任何**「删除未引用图片 / 清理」或「图片管理器」条目；
>   Typora 自带 `Docs/` 全目录检索 `unused` **零命中**。
> - 故这两项**不是 Typora parity**，而是 **Mellow 自定增强**（或本 spec 的规格失真）。
>
> **处置**：按「先报告冲突、不擅自裁决」——**登记为待裁决**（任务 4.16），三种走向：
> ① 作为 **Mellow 自定增强**实施（需先明确产品理由，不宣称 parity）；
> ② 从本 spec 移除（保持本 spec = Typora 对标口径）；
> ③ 与已登记的 **D**（`Image Tools` 子菜单：Mellow 已由图片右键扁平入口覆盖）合并评估。
> **在裁决前不实现** —— 否则会做出一个「照 spec 正确、照 Typora 多余」的功能。

---

## 8. Broken Image

UI：
- compact placeholder
- filename/path
- retry
- reveal source

禁止自动删除 broken reference。

---

## 9. Remote Image

- lazy load
- timeout
- no silent download
- user command to localize

> **实现现状（2026-10-01）**：lazy load ✓（`img.loading = 'lazy'`，大文件模式）；
> **timeout ✓ 本轮补**（`REMOTE_IMAGE_TIMEOUT_MS`，仅远程 src）；
> no silent download ✓（默认加载但可由 `mellow.image.loadRemote` 关闭；关闭时显示占位 + 手动加载按钮）；
> user command to localize ✓（`downloadRemote` / 右键「下载」）。
>
> **timeout 为什么必须有**：只监听 `error` **不够** —— 连接被静默丢弃 / 对端不响应时，
> 浏览器既不触发 `load` 也不触发 `error`，widget 会**永远停在加载态**（空白且**连 retry 入口都没有**）。
> 超时后走**同一条 broken 路径**（compact placeholder + filename/path + retry），并中止挂起请求。
> ⚠️ **15s 是 Mellow 自定**（本节只写「timeout」，未给数值 —— 不冒充一手值）。

---

## 10. Security

Remote image:
- no arbitrary local protocol
- respect network settings

Upload key:
- **不适用（本仓无密钥通道）** —— 见下方 2026-10-01 的复核与裁决（ADR-0029 Q5 = E1）

> **⚠️ 2026-10-01 复核：本条与实现不一致**
>
> Mellow 的上传通道是 **picgo-http（本机端点 URL）/ picgo-cli（本机 CLI）/ custom-command（本机命令）**，
> **设计上没有「密钥」字段**（`ImageUploadOptions` 只有 `channel` / `httpUrl` / `command`）。
> 因此「密钥存 OS keychain」**没有落点**；且 `packages/extension-api` 明确把 `keychain` 列为
> **高危权限、V1 运行时一律拒绝**（注释原文：desktop 无实现）。
>
> **但有一个真实的安全隐患**：`image.uploadHttpUrl` 是 **text 字段**、存 **localStorage 明文**
>（`mellow.image.uploadHttpUrl`）。用户完全可能把**带凭据的 URL**（如 `https://host/upload?token=…`）
> 粘进去 → 密钥以明文落在 WebView 的 localStorage 里。
>
> **处置（2026-10-01 已裁决，ADR-0029 Q5 = E1）**：本条改写为「**不适用（无密钥通道）**」，
> 并**保留上面的明文风险说明**。
>
> 裁决依据：① 本仓上传通道**没有「密钥」字段**（`ImageUploadOptions` 只有
> `channel` / `httpUrl` / `command`）⇒ 走向②（OS keychain）**没有落点**，
> 且 `extension-api` 的 `keychain` 在 V1 **一律拒绝**；
> ② 走向①（UI 禁止在 URL 内放凭据）**做不到可靠**（无法判定一个 URL 是否含凭据），
> 且会**误伤**合法的带签名参数的端点；
> ③ 但**残余风险真实存在**（用户可能把带 token 的 URL 粘进明文 localStorage 字段）
> ⇒ 故**保留风险说明**，不以「不适用」把问题删掉。
> 若将来引入托管式上传（服务端持有凭据），需**重新裁决**并回到 keychain 方案。

---

## 11. Undo

source patch must be undoable.

filesystem move/delete:
- separate file operation undo where safe

---

## 12. Tests

24+ scenarios:
- paste
- drag
- multi
- relative
- save as
- rename
- missing
- remote
- Chinese path
- Windows/macOS/Linux
