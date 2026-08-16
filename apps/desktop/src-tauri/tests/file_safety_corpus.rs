//! File Safety Corpus — PRD §141 + `docs/specs/document-file-safety-spec.md`。
//!
//! 场景（PRD §141 + 用户清单 + spec §7 crash / §11 special storage）：
//!   Git checkout / external editor (VS Code) / OneDrive / Dropbox / iCloud Drive /
//!   SMB/NFS / read-only / disk full / permission denied / rename / delete / symlink /
//!   crash / antivirus lock。
//!
//! 硬指标：data loss = 0，silent overwrite = 0。任何失败 = Release Blocker。
//!
//! 本套件只依赖 `mellow_desktop_lib::fs` 的公开原子保存管线，不依赖 Tauri 运行时，
//! 因此可在 `cargo test --test file_safety_corpus` 下独立执行。
//!
//! 环境说明（本机 macOS / CI）：
//! - OneDrive / Dropbox / iCloud Drive 未挂载 → 用「外部替换（新 inode）+ 外部原地写
//!   （同 inode、新 mtime）」模拟云同步客户端语义（这是 ADR-0009 conflict 检测的实质）。
//! - SMB/NFS：读写挂载点缺失时用等价语义（只读目录 / 外部替换）验证；本机 OrbStack
//!   NFS 挂载为只读，已用「只读目录」路径覆盖其交集。
//! - disk full：用 RLIMIT_FSIZE（`ulimit -f`）在子进程内让临时写入中途失败（EFBIG），
//!   触发与 ENOSPC 完全相同的「temp write 失败 → 原文件不动」路径。

use mellow_desktop_lib::fs::{
    atomic_save, decode, detect_eol, encode, identity_key, mtime_ms, DiskState, SaveError,
};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

// ─────────────────────────── helpers ───────────────────────────

fn scratch(tag: &str) -> PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "mellow-fs-corpus-{}-{}-{}",
        std::process::id(),
        tag,
        COUNTER.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn disk_state(path: &Path) -> DiskState {
    let meta = fs::metadata(path).unwrap();
    DiskState { mtime_ms: mtime_ms(&meta), identity_key: identity_key(&meta) }
}

fn read_bytes(path: &Path) -> Vec<u8> {
    fs::read(path).unwrap()
}

fn is_child(mode: &str) -> bool {
    std::env::var("MELLOW_FS_CORPUS_CHILD").map(|v| v == mode).unwrap_or(false)
}

/// 让 mtime 至少前进 1ms（APFS/EXT4 纳秒粒度，ms 比较必然变化）
fn bump_mtime() {
    std::thread::sleep(Duration::from_millis(8));
}

/// `atomic_save` 的 temp 命名（与 fs.rs `tmp_path_for` 一致：`.{name}.mellow-tmp`）
fn temp_for(target: &Path) -> PathBuf {
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    let name = target.file_name().and_then(|n| n.to_str()).unwrap_or("mellow-save");
    dir.join(format!(".{name}.mellow-tmp"))
}

// ─────────────────────────── 0. Source Fidelity ───────────────────────────

#[test]
fn source_fidelity_open_no_edit_save_byte_identical() {
    // Open → No Edit → Save 必须 byte identical（spec §3），覆盖 4 种编码 + CRLF/CR。
    let samples: Vec<Vec<u8>> = vec![
        b"# Title\n\nhello world\r\n".to_vec(),
        {
            let mut v = vec![0xEF, 0xBB, 0xBF]; // UTF-8 BOM
            v.extend_from_slice("# 中文\n\r\n".as_bytes());
            v
        },
        {
            let mut v = vec![0xFF, 0xFE]; // UTF-16 LE
            for u in [0x0023u16, 0x0020, 0x4E2D, 0x6587, 0x000D, 0x000A] {
                v.extend_from_slice(&u.to_le_bytes());
            }
            v
        },
        {
            let mut v = vec![0xFE, 0xFF]; // UTF-16 BE
            for u in [0x0023u16, 0x0020, 0xD83C, 0xDF89, 0x000A] {
                v.extend_from_slice(&u.to_be_bytes());
            }
            v
        },
    ];

    let dir = scratch("fidelity");
    for (i, bytes) in samples.iter().enumerate() {
        let target = dir.join(format!("f{i}.md"));
        fs::write(&target, bytes).unwrap();
        let (content, encoding) = decode(bytes);
        let _eol = detect_eol(&content); // preserve EOL：encode 不转换
        let saved = encode(&content, encoding);
        assert_eq!(&saved, bytes, "encoding/EOL roundtrip mismatch for sample {i}");
    }
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn normal_atomic_save_succeeds_and_verifies() {
    let dir = scratch("normal");
    let target = dir.join("a.md");
    fs::write(&target, b"original").unwrap();
    let before = disk_state(&target);

    let outcome = atomic_save(&target, b"new content", Some(&before)).unwrap();
    assert_eq!(read_bytes(&target), b"new content");
    assert_eq!(outcome.bytes_written, 11);
    assert!(!temp_for(&target).exists(), "temp must be cleaned");
    fs::remove_dir_all(&dir).unwrap();
}

// ─────────────────────────── 1. External Change（外部修改） ───────────────────────────

/// Git checkout：git 用 temp+rename 替换工作区文件 → 新 inode → 必须 conflict，绝不覆盖。
#[test]
fn git_checkout_external_replace_never_overwrites() {
    let dir = scratch("git");
    let target = dir.join("doc.md");
    fs::write(&target, b"old working tree").unwrap();
    let before = disk_state(&target);

    bump_mtime();
    let tmp = dir.join(".git-tmp");
    fs::write(&tmp, b"new branch content").unwrap();
    fs::rename(&tmp, &target).unwrap();

    let after_identity = identity_key(&fs::metadata(&target).unwrap());
    assert_ne!(after_identity, before.identity_key, "git checkout should change inode");

    let err = atomic_save(&target, b"local dirty edits", Some(&before)).unwrap_err();
    assert!(matches!(err, SaveError::Conflict(_)), "expected Conflict, got {err:?}");
    assert_eq!(read_bytes(&target), b"new branch content", "SILENT OVERWRITE: git content lost");
    fs::remove_dir_all(&dir).unwrap();
}

/// VS Code 外部编辑：原地截断重写 → 同 inode、新 mtime → 必须 conflict。
#[test]
fn external_editor_in_place_edit_never_overwrites() {
    let dir = scratch("vscode");
    let target = dir.join("doc.md");
    fs::write(&target, b"original").unwrap();
    let before = disk_state(&target);

    bump_mtime();
    let mut f = fs::OpenOptions::new().write(true).truncate(true).open(&target).unwrap();
    f.write_all(b"edited by vscode").unwrap();
    f.sync_all().unwrap();
    drop(f);

    let meta = fs::metadata(&target).unwrap();
    assert_eq!(identity_key(&meta), before.identity_key, "in-place edit preserves inode");
    assert_ne!(mtime_ms(&meta), before.mtime_ms, "in-place edit must change mtime");

    let err = atomic_save(&target, b"local dirty edits", Some(&before)).unwrap_err();
    assert!(matches!(err, SaveError::Conflict(_)));
    assert_eq!(read_bytes(&target), b"edited by vscode", "SILENT OVERWRITE: external edit lost");
    fs::remove_dir_all(&dir).unwrap();
}

// ─────────────────────────── 2. Cloud / Network Storage ───────────────────────────

/// OneDrive / Dropbox / iCloud Drive：同步客户端下载远端版本会「替换」占位文件（新 inode）。
/// 本机无这些挂载点 → 用其语义（外部替换）验证 conflict 检测。
#[test]
fn cloud_sync_replace_never_overwrites() {
    let dir = scratch("cloud");
    let target = dir.join("note.md");
    fs::write(&target, b"local dirty").unwrap();
    let before = disk_state(&target);

    bump_mtime();
    let tmp = dir.join(".cloud-tmp");
    fs::write(&tmp, b"remote version from cloud").unwrap();
    fs::rename(&tmp, &target).unwrap();

    let err = atomic_save(&target, b"local dirty edits", Some(&before)).unwrap_err();
    assert!(matches!(err, SaveError::Conflict(_)));
    assert_eq!(read_bytes(&target), b"remote version from cloud", "SILENT OVERWRITE: cloud version lost");
    fs::remove_dir_all(&dir).unwrap();
}

/// SMB/NFS 只读共享（本机 OrbStack NFS 为只读）：与「只读目录」同一失败路径。
/// 读写挂载点缺失时，原子保存语义与本地目录等价（temp+rename 与文件系统无关），
/// 由 `normal_atomic_save_succeeds_and_verifies` 覆盖；此处覆盖只读/拒绝写路径。
#[test]
fn network_share_read_only_fails_original_intact() {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch("nfs-ro");
        let target = dir.join("share.md");
        fs::write(&target, b"on remote share").unwrap();
        let before = disk_state(&target);

        fs::set_permissions(&dir, fs::Permissions::from_mode(0o555)).unwrap();
        let err = atomic_save(&target, b"edits", Some(&before)).unwrap_err();
        assert!(matches!(err, SaveError::Io(_)), "expected Io, got {err:?}");
        assert_eq!(read_bytes(&target), b"on remote share", "read-only share must not be written");

        fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }
}

// ─────────────────────────── 3. read-only / permission denied ───────────────────────────

/// 只读文件：保存不得静默丢掉只读位（PRD §104「保留 permissions」）。
/// 正确行为 = 要么拒绝（原文件不动），要么更新内容但保留 mode。
#[cfg(unix)]
#[test]
fn read_only_file_save_preserves_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let dir = scratch("ro-file");
    let target = dir.join("ro.md");
    fs::write(&target, b"secret").unwrap();
    fs::set_permissions(&target, fs::Permissions::from_mode(0o444)).unwrap();
    let before = disk_state(&target);

    let result = atomic_save(&target, b"new", Some(&before));
    match result {
        Err(_) => {
            // 拒绝保存：原文件与只读位完整
            assert_eq!(read_bytes(&target), b"secret");
            assert_eq!(fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o444);
        }
        Ok(_) => {
            // 保存成功：内容更新但只读位必须保留（PRD §104）
            assert_eq!(read_bytes(&target), b"new");
            assert_eq!(
                fs::metadata(&target).unwrap().permissions().mode() & 0o777,
                0o444,
                "read-only bit silently dropped on save (PRD §104 permissions preservation)"
            );
        }
    }

    fs::set_permissions(&target, fs::Permissions::from_mode(0o644)).unwrap();
    fs::remove_dir_all(&dir).unwrap();
}

/// 权限拒绝（目录不可写 0555）：temp 创建失败 → 原文件不动。
#[cfg(unix)]
#[test]
fn permission_denied_directory_fails_original_intact() {
    use std::os::unix::fs::PermissionsExt;
    let dir = scratch("perm");
    let sub = dir.join("ro");
    fs::create_dir_all(&sub).unwrap();
    let target = sub.join("a.md");
    fs::write(&target, b"keep me").unwrap();
    let before = disk_state(&target);

    fs::set_permissions(&sub, fs::Permissions::from_mode(0o555)).unwrap();
    let err = atomic_save(&target, b"new", Some(&before)).unwrap_err();
    assert!(matches!(err, SaveError::Io(_)));
    assert_eq!(read_bytes(&target), b"keep me", "permission denied must not corrupt original");

    fs::set_permissions(&sub, fs::Permissions::from_mode(0o755)).unwrap();
    fs::remove_dir_all(&dir).unwrap();
}

/// 普通文件权限（0600）保存后必须保留（PRD §104「保留 permissions」）。
#[cfg(unix)]
#[test]
fn atomic_save_preserves_owner_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let dir = scratch("perms");
    let target = dir.join("p.md");
    fs::write(&target, b"x").unwrap();
    fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).unwrap();
    let before = disk_state(&target);

    let _ = atomic_save(&target, b"y", Some(&before)).unwrap();
    assert_eq!(read_bytes(&target), b"y");
    assert_eq!(
        fs::metadata(&target).unwrap().permissions().mode() & 0o777,
        0o600,
        "owner permissions (0600) silently dropped on save (PRD §104)"
    );
    fs::remove_dir_all(&dir).unwrap();
}

// ─────────────────────────── 4. disk full ───────────────────────────

/// disk full：用 RLIMIT_FSIZE 让子进程临时写入中途失败（EFBIG，与 ENOSPC 同路径）。
/// 断言：原文件绝不损坏，残留 temp 由下一次保存清理。
#[test]
fn disk_full_write_fails_original_intact() {
    if is_child("diskfull") {
        let dir = PathBuf::from(std::env::var("CORPUS_DIR").unwrap());
        let target = dir.join("big.md");
        let size: usize = std::env::var("CORPUS_SIZE").unwrap().parse().unwrap();
        let data = vec![b'x'; size];
        match atomic_save(&target, &data, None) {
            Err(e) => {
                eprintln!("[diskfull child] expected write failure: {e:?}");
                std::process::exit(0);
            }
            Ok(_) => {
                eprintln!("[diskfull child] UNEXPECTED success (limit not enforced)");
                std::process::exit(7);
            }
        }
    }

    let dir = scratch("diskfull");
    let target = dir.join("big.md");
    fs::write(&target, b"precious original").unwrap();

    let exe = std::env::current_exe().unwrap();
    // trap 空串忽略 SIGXFSZ → write 返回 EFBIG 而非终止；ulimit -f 8 = 8×512B = 4KiB
    let script = "trap '' XFSZ; ulimit -f 8; exec \"$0\" --exact disk_full_write_fails_original_intact --nocapture";
    let status = Command::new("/bin/sh")
        .arg("-c")
        .arg(script)
        .arg(&exe)
        .env("MELLOW_FS_CORPUS_CHILD", "diskfull")
        .env("CORPUS_DIR", &dir)
        .env("CORPUS_SIZE", (8 * 1024 * 1024).to_string())
        .status()
        .unwrap();

    eprintln!("[diskfull] child status: {status:?}");
    // 原文件绝不损坏（无论子进程是被 EFBIG 正常拒绝，还是被 SIGXFSZ 终止）
    assert_eq!(read_bytes(&target), b"precious original", "disk full corrupted original");
    // 残留 temp（若有）由下一次保存清理，保存成功
    let outcome = atomic_save(&target, b"recovered", None).unwrap();
    assert_eq!(outcome.bytes_written, 9);
    assert_eq!(read_bytes(&target), b"recovered");
    assert!(!temp_for(&target).exists());
    fs::remove_dir_all(&dir).unwrap();
}

// ─────────────────────────── 5. rename / delete ───────────────────────────

/// 外部 rename：保存到旧路径 → conflict（NotFound），被 rename 走的文件内容完整。
#[test]
fn external_rename_save_to_old_path_conflicts() {
    let dir = scratch("rename");
    let target = dir.join("a.md");
    fs::write(&target, b"content").unwrap();
    let before = disk_state(&target);

    let renamed = dir.join("b.md");
    fs::rename(&target, &renamed).unwrap();

    let err = atomic_save(&target, b"edits", Some(&before)).unwrap_err();
    assert!(matches!(err, SaveError::Conflict(_)));
    assert!(!target.exists(), "must not recreate file at old path");
    assert_eq!(read_bytes(&renamed), b"content", "renamed file content lost");
    fs::remove_dir_all(&dir).unwrap();
}

/// 外部 delete：保存 → conflict（NotFound），不得静默重建。
#[test]
fn external_delete_save_conflicts() {
    let dir = scratch("delete");
    let target = dir.join("a.md");
    fs::write(&target, b"content").unwrap();
    let before = disk_state(&target);

    fs::remove_file(&target).unwrap();

    let err = atomic_save(&target, b"edits", Some(&before)).unwrap_err();
    assert!(matches!(err, SaveError::Conflict(_)));
    assert!(!target.exists(), "must not silently recreate deleted file");
    fs::remove_dir_all(&dir).unwrap();
}

// ─────────────────────────── 6. symlink ───────────────────────────

/// 通过 symlink 保存：必须保留 symlink 并更新目标，或拒绝保存。
/// 绝不把 symlink 替换成普通文件（那样编辑内容会落到错误位置，目标文件仍为旧内容）。
#[cfg(unix)]
#[test]
fn symlink_save_preserves_symlink_and_updates_target() {
    use std::os::unix::fs::symlink;
    let dir = scratch("symlink");
    let real = dir.join("real.md");
    let link = dir.join("link.md");
    fs::write(&real, b"REAL").unwrap();
    symlink(&real, &link).unwrap();

    // open via symlink：metadata 跟随 symlink → real.md 的 inode/mtime
    let before = disk_state(&link);

    let result = atomic_save(&link, b"EDITED", Some(&before));
    match result {
        Err(_) => {
            assert!(
                fs::symlink_metadata(&link).unwrap().file_type().is_symlink(),
                "refused save must keep the symlink"
            );
            assert_eq!(read_bytes(&real), b"REAL");
        }
        Ok(_) => {
            assert!(
                fs::symlink_metadata(&link).unwrap().file_type().is_symlink(),
                "SYMLINK DESTROYED: save replaced the symlink with a regular file"
            );
            assert_eq!(
                read_bytes(&real),
                b"EDITED",
                "save through symlink must update the target, not orphan edits"
            );
        }
    }
    fs::remove_dir_all(&dir).unwrap();
}

// ─────────────────────────── 7. crash ───────────────────────────

/// crash during save：SIGKILL 任意时刻，目标文件只可能是「完整旧内容」或「完整新内容」，
/// 绝不出现半写文件（data loss = 0）；残留 temp 由下一次保存清理。
#[test]
fn crash_during_save_never_partial_or_loss() {
    if is_child("crash") {
        let dir = PathBuf::from(std::env::var("CORPUS_DIR").unwrap());
        let target = dir.join("crash.md");
        let size: usize = std::env::var("CORPUS_SIZE").unwrap().parse().unwrap();
        let data = vec![b'N'; size];
        let _ = atomic_save(&target, &data, None);
        std::process::exit(0);
    }

    let exe = std::env::current_exe().unwrap();
    let size = 64 * 1024 * 1024; // 64 MiB：足够让写盘跨越多个 kill 时机
    let full_new = vec![b'N'; size];

    for delay_ms in [0u64, 1, 2, 5, 10, 20, 40, 80] {
        let dir = scratch(&format!("crash-{delay_ms}"));
        let target = dir.join("crash.md");
        let original: Vec<u8> = b"OLD-CONTENT-MARKER".to_vec();
        fs::write(&target, &original).unwrap();

        let mut child = Command::new(&exe)
            .arg("--exact")
            .arg("crash_during_save_never_partial_or_loss")
            .arg("--nocapture")
            .env("MELLOW_FS_CORPUS_CHILD", "crash")
            .env("CORPUS_DIR", &dir)
            .env("CORPUS_SIZE", size.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();

        std::thread::sleep(Duration::from_millis(delay_ms));
        let _ = child.kill(); // SIGKILL
        let _ = child.wait();

        let on_disk = read_bytes(&target);
        assert!(
            on_disk == original || on_disk == full_new,
            "crash @{}ms left partial file: {} bytes (want {} or {})",
            delay_ms,
            on_disk.len(),
            original.len(),
            full_new.len()
        );

        // 下一次保存清理残留并成功
        let ok = atomic_save(&target, b"FRESH", None).unwrap();
        assert_eq!(ok.bytes_written, 5);
        assert_eq!(read_bytes(&target), b"FRESH");
        assert!(!temp_for(&target).exists());
        fs::remove_dir_all(&dir).ok();
    }
}

/// 崩溃残留 temp（上次 crash during save）由下一次保存清理（确定性路径）。
#[test]
fn crash_residue_temp_cleaned_on_next_save() {
    let dir = scratch("residue");
    let target = dir.join("d.md");
    fs::write(&target, b"content").unwrap();

    let tmp = temp_for(&target);
    fs::write(&tmp, b"partial residue from crash").unwrap();

    let outcome = atomic_save(&target, b"fresh", None).unwrap();
    assert_eq!(outcome.bytes_written, 5);
    assert!(!tmp.exists(), "crash residue temp must be cleaned");
    assert_eq!(read_bytes(&target), b"fresh");
    fs::remove_dir_all(&dir).unwrap();
}

// ─────────────────────────── 8. antivirus lock / rename 被拒 ───────────────────────────

/// 杀毒软件锁定 / Windows 文件锁：rename 被拒（此处以「目标是目录」模拟）。
/// 断言：保存失败、原目标不动、temp 已清理。
#[test]
fn rename_fails_original_intact_temp_cleaned() {
    let dir = scratch("lock");
    let target = dir.join("a.md");
    fs::write(&target, b"keep").unwrap();
    fs::remove_file(&target).unwrap();
    fs::create_dir(&target).unwrap(); // rename(file → dir) 失败，模拟 antivirus lock

    let err = atomic_save(&target, b"new", None).unwrap_err();
    assert!(matches!(err, SaveError::Io(_)));
    assert!(!temp_for(&target).exists(), "temp must be cleaned on rename failure");
    assert!(target.is_dir(), "original (dir) must be intact");
    fs::remove_dir_all(&dir).unwrap();
}
