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
- OS keychain

> **⚠️ 2026-10-01 复核：本条与实现不一致，登记为待裁决项**
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
> **处置**：属**安全设计 + 平台能力**决策，**不擅自实现**。三种走向待裁决：
> ① UI 明确提示/禁止在 URL 内放凭据；② 引入 OS keychain 存储（需先解 `extension-api` 的 V1 拒绝）；
> ③ 把本条改写为「不适用（无密钥通道）」并保留上面的明文风险说明。

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
