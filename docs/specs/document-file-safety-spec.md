# Document & File Safety Spec

## 1. 最高原则

> 用户数据安全优先于一切体验优化。

---

## 2. Document Identity

每个打开文档使用稳定 document id。

字段：
- path
- file identity/inode where available
- encoding
- EOL
- disk mtime
- dirty
- revision
- recovery id

---

## 3. Source Fidelity

硬指标：

```text
Open
No Edit
Save
→ byte identical
```

除非用户明确：
- encoding convert
- EOL convert
- format

---

## 4. Save Pipeline

```text
validate current disk state
↓
encode
↓
write temp
↓
flush
↓
fsync
↓
atomic replace
↓
verify metadata
↓
update revision
↓
clear recovery snapshot
```

---

## 5. External Change

### local clean
- auto reload
- preserve cursor if possible

### local dirty
- never overwrite
- show:
  - Compare
  - Reload Disk
  - Keep Local

---

## 6. Recovery

Debounced snapshot:
- separate from autosave
- AppData only
- keyed by document id

On startup:
- Recover
- Compare
- Ignore

---

## 7. Crash Safety

测试：
- process kill during typing
- kill during temp write
- kill before replace
- kill after replace before state commit

---

## 8. File Operation

Delete:
- trash first

Rename/move:
- watcher aware
- update tab path
- update recent
- update image refs only if explicit rule

---

## 9. Encoding

P0:
- UTF-8
- UTF-8 BOM
- UTF-16 read

Default new:
- UTF-8 no BOM

Preserve original on save.

---

## 10. EOL

- LF
- CRLF

Preserve original by default.

---

## 11. Special Storage

测试：
- iCloud Drive
- OneDrive
- Dropbox
- SMB
- NFS
- removable drive
- symlink
- read-only
- permission denied
- disk full

---

## 12. Release Blockers

- silent overwrite
- partial save corruption
- lost recovery
- wrong encoding
- wrong EOL
- document history crossing tabs
- rename path mismatch
