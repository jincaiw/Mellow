# File Safety Corpus — Gate 记录

> 对应 PRD §141（File Safety Corpus）、`docs/specs/document-file-safety-spec.md`、
> ADR-0009（File Safety / Atomic Save）、PRD §104（Atomic Save 保留 permissions/encoding/EOL）。

## 结论

| 硬指标 | 结果 |
|---|---|
| data loss = 0 | ✅ 通过 |
| silent overwrite = 0 | ✅ 通过 |
| Release Blocker | ✅ **0 个**（首轮 3 个已修复并回归） |

**File Safety Corpus：16/16 全绿。** 附加回归：`src-tauri` lib 单元测试 32/32 全绿。

---

## 执行方式

```sh
cd apps/desktop/src-tauri
cargo test --test file_safety_corpus   # File Safety Corpus（16 用例）
cargo test --lib                       # System Core 单元测试（32 用例，回归）
```

- 测试文件：`apps/desktop/src-tauri/tests/file_safety_corpus.rs`（16 用例）
- 只依赖 `mellow_desktop_lib::fs` 的公开原子保存管线，不依赖 Tauri 运行时。
- 环境：macOS arm64（Apple Silicon），rustc 1.96.1。

## 环境与模拟说明

| 场景 | 本机实况 | 测试手段 |
|---|---|---|
| Git checkout | 模拟 | 外部 temp+rename 替换（新 inode）→ conflict 检测 |
| VS Code 外部编辑 | 模拟 | 原地截断重写（同 inode、新 mtime）→ conflict 检测 |
| OneDrive / Dropbox / iCloud Drive | 未挂载 | 云同步「替换占位文件」语义（外部替换）→ conflict 检测 |
| SMB / NFS | OrbStack NFS 挂载为**只读** | 只读共享目录 → 写失败、原文件不动 |
| disk full | 无真实满盘 | RLIMIT_FSIZE（`ulimit -f 8`）子进程内 EFBIG，走与 ENOSPC 相同的 temp 写失败路径 |
| crash | 真实 SIGKILL | 子进程 64 MiB 写盘，8 个 kill 时机（0/1/2/5/10/20/40/80 ms） |

## 结果矩阵

| # | 场景 | 用例 | 结果 |
|---|---|---|---|
| 0 | Source Fidelity（4 编码 + CRLF/CR） | `source_fidelity_open_no_edit_save_byte_identical` | ✅ |
| 0b | 正常原子保存 + 校验 | `normal_atomic_save_succeeds_and_verifies` | ✅ |
| 1 | Git checkout | `git_checkout_external_replace_never_overwrites` | ✅ |
| 2 | VS Code 外部编辑 | `external_editor_in_place_edit_never_overwrites` | ✅ |
| 3 | OneDrive / Dropbox / iCloud | `cloud_sync_replace_never_overwrites` | ✅ |
| 4 | SMB / NFS（只读） | `network_share_read_only_fails_original_intact` | ✅ |
| 5 | read-only（只读文件） | `read_only_file_save_preserves_permissions` | ✅（已修复） |
| 6 | disk full | `disk_full_write_fails_original_intact` | ✅ |
| 7 | permission denied（目录 0555） | `permission_denied_directory_fails_original_intact` | ✅ |
| 8 | rename | `external_rename_save_to_old_path_conflicts` | ✅ |
| 9 | delete | `external_delete_save_conflicts` | ✅ |
| 10 | symlink | `symlink_save_preserves_symlink_and_updates_target` | ✅（已修复） |
| 11 | crash（SIGKILL ×8 时机） | `crash_during_save_never_partial_or_loss` | ✅ |
| 11b | crash 残留 temp 清理 | `crash_residue_temp_cleaned_on_next_save` | ✅ |
| 12 | antivirus lock / rename 被拒 | `rename_fails_original_intact_temp_cleaned` | ✅ |
| 13 | 权限保留（0600，PRD §104） | `atomic_save_preserves_owner_permissions` | ✅（已修复） |

运行结果：**16 用例，16 通过，0 失败**。

---

## 修复记录（首轮 3 个 Release Blocker）

首轮执行暴露 3 个 Release Blocker，已在 `apps/desktop/src-tauri/src/fs.rs::atomic_save`
修复并回归：

### B1. symlink 保存会销毁 symlink → 已修复

- 根因：`fs::rename(tmp, target)` 当 `target` 是 symlink 时替换的是 symlink 本身，而非目标文件。
- 修复：保存前 `fs::canonicalize(target)` 解析到真实目标，`temp` 与 `rename` 都落在真实目标上；
  返回 `path` 仍保留用户打开时的原始路径（含 symlink），symlink 保持不变、编辑写入目标。
- 验证：`symlink_save_preserves_symlink_and_updates_target` ✅（symlink 保留 + 目标内容更新）。

### B2. 只读文件保存后静默丢失只读位 → 已修复

- 根因：temp 文件以默认 mode 创建，`rename` 不继承原文件 mode。
- 修复：replace 前记录原文件权限（`metadata().permissions()`），replace 后 `set_permissions` 恢复。
- 验证：`read_only_file_save_preserves_permissions` ✅（内容更新 + mode 保持 0444）。

### B3. 保存后静默丢失权限（0600 → 0644）→ 已修复

- 根因：同 B2。
- 修复：同 B2（PRD §104 permissions preservation）。
- 验证：`atomic_save_preserves_owner_permissions` ✅（内容更新 + mode 保持 0600）。

> 修复只动了 `atomic_save`（文档保存管线），未触碰 image workflow（write_binary/move_file），
> 符合最小改动原则。权限恢复失败仅告警不破坏已落盘内容（内容正确性由 verify 兜底）。

---

## 通过项摘要（data loss / silent overwrite 证据）

- 外部修改（git checkout / VS Code / 云同步替换）全部触发 `SaveError::Conflict`，
  目标文件字节不变 → **silent overwrite = 0**。
- disk full（EFBIG）、permission denied（0555）、只读目录、rename/delete 后保存、
  rename 被拒：全部失败且原文件字节不变 → **data loss = 0**。
- crash（8 个 kill 时机）：目标文件只可能是「完整旧内容」或「完整新内容」，无半写文件；
  残留 temp 由下一次保存清理 → **data loss = 0**。

## 后续

1. 三平台（Windows/Linux 真机）重跑本 corpus —— 尤其 Windows 文件锁 / NFS 写入语义。
2. 真机 OneDrive / Dropbox / iCloud Drive / 可写 SMB·NFS 挂载后回填真实挂载用例
   （当前用语义模拟 + 只读 NFS 交集覆盖）。
3. disk full 真机满盘（物理卷 / tmpfs）回填，确认与 RLIMIT_FSIZE 模拟一致。
