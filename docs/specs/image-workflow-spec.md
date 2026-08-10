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

---

## 10. Security

Remote image:
- no arbitrary local protocol
- respect network settings

Upload key:
- OS keychain

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
