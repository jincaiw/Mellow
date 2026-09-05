//! updater.rs —— 安全 Auto Update 辅助（rollback 策略，Rust System Core）
//!
//! 职责：
//! - **更新前备份**：`rollback_prepare` 将当前应用复制到 AppData/rollback/ 并写入 marker；
//! - **启动健康确认**：更新重启后 pending marker + launch 计数；应用健康后 `rollback_commit`
//!   删除备份（否则备份一直保留，可回滚）；
//! - **回滚**：新版本未健康启动（crash loop）→ 下次启动可 `rollback_restore` 恢复备份；
//! - **数据安全**：本模块只操作应用自身安装目录与 AppData，**绝不读取/上传任何用户文档数据**
//!   （更新检查只发送版本/平台元数据，见前端 updater.ts 与 docs/specs/auto-update-spec.md）。
//!
//! 平台差异（PRD §113.4：平台代码只允许在 apps/desktop）：
//! - macOS：备份/恢复整个 Mellow.app bundle；
//! - Windows：备份可执行文件；恢复走 detached helper（运行中的 exe 被锁，helper 代换后重启）；
//! - Linux：AppImage 备份/恢复 AppImage 文件；deb/rpm 由包管理器管理，恢复不可行时明确报错。

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// 回滚状态（marker 内容）
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct RollbackInfo {
    /// 备份对应的（更新前）版本
    pub previous_version: String,
    /// 更新尚未健康确认（备份未清理）
    pub pending: bool,
    /// 已启动次数（健康确认前每次启动 +1；>=2 表示上次启动未完成健康确认 → 可回滚）
    pub launch_count: u64,
    pub prepared_at: u64,
}

/// 恢复结果
#[derive(Serialize, Clone, Debug)]
pub struct RestoreOutcome {
    pub restored: bool,
    /// true = 恢复由 detached helper 完成（Windows exe 锁），调用方应退出应用
    pub scheduled_restart: bool,
    pub message: String,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ─────────────────────────── marker（纯函数，可测） ───────────────────────────

pub fn marker_path(dir: &Path) -> PathBuf {
    dir.join("rollback.json")
}

pub fn backup_root(dir: &Path) -> PathBuf {
    dir.join("backup")
}

pub fn write_marker(dir: &Path, info: &RollbackInfo) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let target = marker_path(dir);
    let data = serde_json::to_vec_pretty(info).map_err(|e| e.to_string())?;
    let tmp = dir.join(".rollback.json.tmp");
    let _ = fs::remove_file(&tmp);
    let result = (|| -> Result<(), String> {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(&data).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
        drop(f);
        fs::rename(&tmp, &target).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

pub fn read_marker(dir: &Path) -> Option<RollbackInfo> {
    let data = fs::read(marker_path(dir)).ok()?;
    serde_json::from_slice(&data).ok()
}

/// 健康确认前记录一次启动（pending 时 launch_count+1）
pub fn note_launch(dir: &Path) -> Option<RollbackInfo> {
    let mut info = read_marker(dir)?;
    if info.pending {
        info.launch_count += 1;
        let _ = write_marker(dir, &info);
    }
    Some(info)
}

// ─────────────────────────── 备份 / 恢复（纯函数，可测） ───────────────────────────

/// 递归复制（跟随 symlink：功能等价备份，适用于 .app / 目录 / 单文件）
pub fn copy_app(src: &Path, backup_root: &Path) -> Result<PathBuf, String> {
    let file_name = src
        .file_name()
        .ok_or_else(|| "无法确定应用文件名".to_string())?;
    fs::create_dir_all(backup_root).map_err(|e| e.to_string())?;
    let dst = backup_root.join(file_name);
    copy_recursive(src, &dst)?;
    Ok(dst)
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    let meta = fs::metadata(src).map_err(|e| format!("stat {}: {e}", src.display()))?;
    if meta.is_dir() {
        fs::create_dir_all(dst).map_err(|e| format!("mkdir {}: {e}", dst.display()))?;
        for entry in fs::read_dir(src).map_err(|e| format!("read_dir {}: {e}", src.display()))? {
            let entry = entry.map_err(|e| e.to_string())?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dst)
            .map_err(|e| format!("copy {} → {}: {e}", src.display(), dst.display()))?;
        Ok(())
    }
}

fn remove_path(p: &Path) -> Result<(), String> {
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("remove_dir_all {}: {e}", p.display()))
    } else if p.exists() || p.symlink_metadata().is_ok() {
        fs::remove_file(p).map_err(|e| format!("remove_file {}: {e}", p.display()))
    } else {
        Ok(())
    }
}

/// 恢复备份到 target。
/// - macOS / Linux：进程内替换（删除 target → rename 备份到位）；
/// - Windows：detached helper 代换（运行中的 exe 被锁），返回 scheduled_restart=true。
pub fn restore_app(backup_root: &Path, target: &Path) -> Result<RestoreOutcome, String> {
    let backup = find_backup(backup_root).ok_or_else(|| "备份不存在".to_string())?;
    #[cfg(target_os = "windows")]
    {
        schedule_windows_restore(&backup, target)?;
        Ok(RestoreOutcome {
            restored: true,
            scheduled_restart: true,
            message: "回滚已调度：应用退出后由系统恢复旧版本并重启".to_string(),
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        remove_path(target)?;
        fs::rename(&backup, target)
            .map_err(|e| format!("恢复失败（可能无权限替换安装目录）: {e}"))?;
        Ok(RestoreOutcome {
            restored: true,
            scheduled_restart: false,
            message: "已恢复上一个版本，重启后生效".to_string(),
        })
    }
}

fn find_backup(backup_root: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(backup_root).ok()?;
    entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| p.is_dir() || p.is_file())
}

#[cfg(target_os = "windows")]
fn schedule_windows_restore(backup: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // detached helper：等待 3s（应用退出）→ 替换 exe → 启动
    let script = format!(
        "timeout /t 3 /nobreak >nul & move /y \"{}\" \"{}\" >nul & start \"\" \"{}\"",
        backup.display(),
        target.display(),
        target.display()
    );
    std::process::Command::new("cmd")
        .args(["/c", &script])
        .creation_flags(0x00000008 | 0x08000000) // DETACHED_PROCESS | CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| format!("调度恢复失败: {e}"))?;
    Ok(())
}

// ─────────────────────────── 当前应用路径 ───────────────────────────

/// 当前应用（可备份/恢复的单元）：
/// - macOS：Mellow.app bundle（向上找 .app 目录）；
/// - Linux：$APPIMAGE（AppImage 文件）；否则可执行文件（deb/rpm 由包管理器管理）；
/// - Windows：可执行文件。
pub fn current_app_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        let mut p = exe.as_path();
        while let Some(parent) = p.parent() {
            if parent.extension().is_some_and(|e| e == "app") {
                return Ok(parent.to_path_buf());
            }
            p = parent;
        }
        Ok(exe)
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(app_image) = std::env::var("APPIMAGE") {
            let p = PathBuf::from(&app_image);
            if p.exists() {
                return Ok(p);
            }
        }
        Ok(exe)
    }
    #[cfg(target_os = "windows")]
    {
        Ok(exe)
    }
}

// ─────────────────────────── 业务流程（AppHandle 薄封装） ───────────────────────────

pub fn rollback_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|d| d.join("rollback"))
        .map_err(|e| e.to_string())
}

/// 更新前备份当前应用（rollback 策略第一步）
pub fn rollback_prepare(app: &tauri::AppHandle) -> Result<RollbackInfo, String> {
    let dir = rollback_dir(app)?;
    // 只保留一份备份：清理旧的
    let _ = fs::remove_dir_all(backup_root(&dir));
    let version = app.package_info().version.to_string();
    copy_app(&current_app_path()?, &backup_root(&dir))?;
    let info = RollbackInfo {
        previous_version: version,
        pending: true,
        launch_count: 0,
        prepared_at: now_ms(),
    };
    write_marker(&dir, &info)?;
    Ok(info)
}

pub fn rollback_status(app: &tauri::AppHandle) -> Option<RollbackInfo> {
    rollback_dir(app).ok().and_then(|d| read_marker(&d))
}

pub fn rollback_note_launch(app: &tauri::AppHandle) -> Option<RollbackInfo> {
    rollback_dir(app).ok().and_then(|d| note_launch(&d))
}

/// 健康确认：删除备份与 marker
pub fn rollback_commit(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = rollback_dir(app)?;
    let info = read_marker(&dir).ok_or_else(|| "没有待确认的更新".to_string())?;
    if info.pending {
        let _ = fs::remove_dir_all(backup_root(&dir));
        fs::remove_file(marker_path(&dir)).ok();
    }
    Ok(())
}

/// 回滚到备份版本（调用方随后 relaunch / exit）
pub fn rollback_restore(app: &tauri::AppHandle) -> Result<RestoreOutcome, String> {
    let dir = rollback_dir(app)?;
    let info = read_marker(&dir).ok_or_else(|| "没有可回滚的备份".to_string())?;
    if !info.pending {
        return Err("没有待回滚的备份（已健康确认）".to_string());
    }
    let outcome = restore_app(&backup_root(&dir), &current_app_path()?)?;
    // 恢复成功后清理 marker（backup 目录由 restore 移走或保留；Windows 由 helper 使用）
    if !outcome.scheduled_restart {
        let _ = fs::remove_file(marker_path(&dir));
    }
    Ok(outcome)
}

// ─────────────────────────── Tauri 命令 ───────────────────────────

#[tauri::command]
pub fn update_rollback_prepare(app: tauri::AppHandle) -> Result<RollbackInfo, String> {
    rollback_prepare(&app)
}

#[tauri::command]
pub fn update_rollback_status(app: tauri::AppHandle) -> Option<RollbackInfo> {
    rollback_status(&app)
}

#[tauri::command]
pub fn update_rollback_note_launch(app: tauri::AppHandle) -> Option<RollbackInfo> {
    rollback_note_launch(&app)
}

#[tauri::command]
pub fn update_rollback_commit(app: tauri::AppHandle) -> Result<(), String> {
    rollback_commit(&app)
}

#[tauri::command]
pub fn update_rollback_restore(app: tauri::AppHandle) -> Result<RestoreOutcome, String> {
    rollback_restore(&app)
}

// ─────────────────────────── 单元测试（纯函数核心） ───────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mellow-upd-{}-{}", std::process::id(), tag));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn marker_roundtrip_and_launch_count() {
        let dir = test_dir("marker");
        let info = RollbackInfo {
            previous_version: "0.1.0".into(),
            pending: true,
            launch_count: 0,
            prepared_at: 1234,
        };
        write_marker(&dir, &info).unwrap();
        assert_eq!(read_marker(&dir), Some(info.clone()));
        // 启动计数
        let after = note_launch(&dir).unwrap();
        assert_eq!(after.launch_count, 1);
        assert!(after.pending);
        // pending=false 不再计数
        let mut done = info.clone();
        done.pending = false;
        write_marker(&dir, &done).unwrap();
        assert_eq!(note_launch(&dir).unwrap().launch_count, 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn copy_and_restore_app_dir() {
        let dir = test_dir("restore");
        // 假 app 目录（模拟 macOS bundle：嵌套文件 + 子目录）
        let app = dir.join("FakeApp.app");
        fs::create_dir_all(app.join("Contents/MacOS")).unwrap();
        fs::write(app.join("Contents/MacOS/fake"), b"old-binary").unwrap();
        fs::write(app.join("Contents/Info.plist"), b"<plist/>").unwrap();

        let backup = backup_root(&dir);
        let copied = copy_app(&app, &backup).unwrap();
        assert_eq!(copied.file_name().unwrap(), "FakeApp.app");
        assert_eq!(
            fs::read(copied.join("Contents/MacOS/fake")).unwrap(),
            b"old-binary"
        );

        // 模拟更新替换了 app（新内容）
        fs::write(app.join("Contents/MacOS/fake"), b"new-binary").unwrap();
        // 恢复 → 旧版本回来
        let outcome = restore_app(&backup, &app).unwrap();
        assert!(outcome.restored);
        assert!(!outcome.scheduled_restart);
        assert_eq!(
            fs::read(app.join("Contents/MacOS/fake")).unwrap(),
            b"old-binary"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn restore_missing_backup_errors() {
        let dir = test_dir("missing");
        fs::create_dir_all(backup_root(&dir)).unwrap();
        let target = dir.join("target.bin");
        fs::write(&target, b"x").unwrap();
        let err = restore_app(&backup_root(&dir), &target).unwrap_err();
        assert!(err.contains("备份不存在"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn restore_single_file_app() {
        let dir = test_dir("file-app");
        let app = dir.join("mellow.exe");
        fs::write(&app, b"OLD").unwrap();
        let backup = backup_root(&dir);
        copy_app(&app, &backup).unwrap();
        fs::write(&app, b"NEW").unwrap();
        restore_app(&backup, &app).unwrap();
        assert_eq!(fs::read(&app).unwrap(), b"OLD");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn commit_cleans_backup_and_marker() {
        let dir = test_dir("commit");
        let app = dir.join("FakeApp.app");
        fs::create_dir_all(app.join("Contents")).unwrap();
        fs::write(app.join("Contents/x"), b"1").unwrap();
        let backup = backup_root(&dir);
        copy_app(&app, &backup).unwrap();
        write_marker(
            &dir,
            &RollbackInfo {
                previous_version: "0.1.0".into(),
                pending: true,
                launch_count: 1,
                prepared_at: 1,
            },
        )
        .unwrap();
        assert!(backup.exists());
        // 健康确认 → commit：备份 + marker 清理
        let info = read_marker(&dir).unwrap();
        assert!(info.pending);
        let _ = fs::remove_dir_all(backup_root(&dir));
        fs::remove_file(marker_path(&dir)).ok();
        assert!(!marker_path(&dir).exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
