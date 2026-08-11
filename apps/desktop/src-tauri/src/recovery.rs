/**
 * recovery.rs —— Crash Recovery 存储层（spec §6）。
 *
 * - 与 Auto Save 分离：只写 AppData recovery 目录，绝不触碰原文件；
 * - keyed by document id：快照文件名 = sanitized document id；
 * - 原子写入（复用 fs.rs 的 temp+rename 思路）；
 * - 保存成功后由前端调用 delete 清理（cleanup after successful save）。
 *
 * 纯函数核心可独立测试（kill process / multiple docs / renamed 等场景）。
 */

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// 光标（与 document-model CursorState 对齐）
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CursorDto {
    pub anchor: u64,
    pub head: u64,
}

/// 滚动位置
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScrollDto {
    pub top: u64,
    pub left: u64,
}

/// 恢复快照内容（document id mapping + 编辑器状态）
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RecoveryPayload {
    pub document_id: String,
    pub path: Option<String>,
    pub content: String,
    pub revision: u64,
    pub encoding: String,
    pub eol: String,
    pub cursor: Option<CursorDto>,
    pub scroll: Option<ScrollDto>,
    pub saved_at: u64,
}

/// 启动发现列表条目
#[derive(Serialize, Clone, Debug)]
pub struct RecoveryEntry {
    pub document_id: String,
    pub path: Option<String>,
    pub revision: u64,
    pub saved_at: u64,
}

/// 快照文件名 = sanitized document id（防路径穿越）
pub fn snapshot_file_name(document_id: &str) -> String {
    let sanitized: String = document_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    format!("{}.json", sanitized)
}

pub fn snapshot_path(dir: &Path, document_id: &str) -> PathBuf {
    dir.join(snapshot_file_name(document_id))
}

/// 保存快照（原子：temp + rename）
pub fn save_snapshot(dir: &Path, payload: &RecoveryPayload) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let target = snapshot_path(dir, &payload.document_id);
    let data = serde_json::to_vec(payload).map_err(|e| e.to_string())?;

    let tmp = target.with_extension("json.tmp");
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

/// 列出所有恢复快照（启动发现）
pub fn list_snapshots(dir: &Path) -> Vec<RecoveryEntry> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .filter_map(|entry| {
            let data = fs::read(entry.path()).ok()?;
            let payload: RecoveryPayload = serde_json::from_slice(&data).ok()?;
            Some(RecoveryEntry {
                document_id: payload.document_id,
                path: payload.path,
                revision: payload.revision,
                saved_at: payload.saved_at,
            })
        })
        .collect()
}

/// 读取指定文档快照
pub fn load_snapshot(dir: &Path, document_id: &str) -> Option<RecoveryPayload> {
    let data = fs::read(snapshot_path(dir, document_id)).ok()?;
    serde_json::from_slice(&data).ok()
}

/// 删除快照（保存成功后 cleanup；忽略时也调用）
pub fn delete_snapshot(dir: &Path, document_id: &str) -> Result<(), String> {
    let path = snapshot_path(dir, document_id);
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ─────────────────────────── Tauri 命令 ───────────────────────────

/// AppData recovery 目录（跨平台：macOS ~/Library/Application Support / Windows %APPDATA% / Linux ~/.local/share）
fn recovery_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("recovery"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recovery_save(app: tauri::AppHandle, payload: RecoveryPayload) -> Result<(), String> {
    let dir = recovery_dir(&app)?;
    save_snapshot(&dir, &payload)
}

#[tauri::command]
pub async fn recovery_list(app: tauri::AppHandle) -> Result<Vec<RecoveryEntry>, String> {
    let dir = recovery_dir(&app)?;
    Ok(list_snapshots(&dir))
}

#[tauri::command]
pub async fn recovery_get(app: tauri::AppHandle, document_id: String) -> Result<Option<RecoveryPayload>, String> {
    let dir = recovery_dir(&app)?;
    Ok(load_snapshot(&dir, &document_id))
}

#[tauri::command]
pub async fn recovery_delete(app: tauri::AppHandle, document_id: String) -> Result<(), String> {
    let dir = recovery_dir(&app)?;
    delete_snapshot(&dir, &document_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mellow-rec-{}-{}", std::process::id(), tag));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn payload(document_id: &str, path: Option<&str>, content: &str, revision: u64) -> RecoveryPayload {
        RecoveryPayload {
            document_id: document_id.to_string(),
            path: path.map(|p| p.to_string()),
            content: content.to_string(),
            revision,
            encoding: "utf-8".to_string(),
            eol: "\n".to_string(),
            cursor: Some(CursorDto { anchor: 1, head: 2 }),
            scroll: Some(ScrollDto { top: 10, left: 0 }),
            saved_at: 1000 + revision,
        }
    }

    #[test]
    fn kill_process_snapshot_persists() {
        // 模拟进程被杀后重新启动：写入 → 新读（跨进程持久性由文件系统保证）
        let dir = test_dir("kill");
        let p = payload("doc-1", Some("/a.md"), "# editing", 3);
        save_snapshot(&dir, &p).unwrap();

        // 模拟"新进程"（重新读目录）
        let loaded = load_snapshot(&dir, "doc-1").unwrap();
        assert_eq!(loaded.document_id, "doc-1");
        assert_eq!(loaded.content, "# editing");
        assert_eq!(loaded.revision, 3);
        assert_eq!(loaded.path.as_deref(), Some("/a.md"));
        assert_eq!(loaded.cursor.unwrap().anchor, 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn kill_before_save_recovery_available() {
        // kill before save：编辑后未保存（dirty），快照应存在
        let dir = test_dir("before-save");
        save_snapshot(&dir, &payload("doc-x", None, "unsaved edits", 5)).unwrap();
        let list = list_snapshots(&dir);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].document_id, "doc-x");
        assert_eq!(list[0].revision, 5);
        assert_eq!(list[0].path, None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn kill_during_editing_recovers_latest() {
        // kill during editing：多次快照，最后一次（最新）可恢复
        let dir = test_dir("editing");
        save_snapshot(&dir, &payload("doc-2", Some("/b.md"), "v1", 1)).unwrap();
        save_snapshot(&dir, &payload("doc-2", Some("/b.md"), "v2 edited", 2)).unwrap();

        let loaded = load_snapshot(&dir, "doc-2").unwrap();
        assert_eq!(loaded.content, "v2 edited");
        assert_eq!(loaded.revision, 2);
        // 只保留一个快照文件（同 id 覆盖）
        let list = list_snapshots(&dir);
        assert_eq!(list.len(), 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn multiple_documents_independent() {
        let dir = test_dir("multi");
        save_snapshot(&dir, &payload("doc-a", Some("/a.md"), "AAA", 1)).unwrap();
        save_snapshot(&dir, &payload("doc-b", Some("/b.md"), "BBB", 2)).unwrap();

        let mut list = list_snapshots(&dir);
        list.sort_by(|l, r| l.document_id.cmp(&r.document_id));
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].document_id, "doc-a");
        assert_eq!(list[1].document_id, "doc-b");

        // 独立删除
        delete_snapshot(&dir, "doc-a").unwrap();
        let rest = list_snapshots(&dir);
        assert_eq!(rest.len(), 1);
        assert_eq!(rest[0].document_id, "doc-b");
        // doc-a 已删
        assert!(load_snapshot(&dir, "doc-a").is_none());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn renamed_document_keeps_id_updates_path() {
        // renamed：同一 document id，path 更新（document-model rename 语义）
        let dir = test_dir("rename");
        save_snapshot(&dir, &payload("doc-r", Some("/old.md"), "content", 1)).unwrap();
        let mut renamed = payload("doc-r", Some("/new/place.md"), "content", 1);
        renamed.revision = 2;
        save_snapshot(&dir, &renamed).unwrap();

        let loaded = load_snapshot(&dir, "doc-r").unwrap();
        assert_eq!(loaded.document_id, "doc-r"); // id 稳定
        assert_eq!(loaded.path.as_deref(), Some("/new/place.md")); // path 更新
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn snapshot_file_name_sanitizes() {
        assert_eq!(snapshot_file_name("550e8400-e29b-41d4-a716-446655440000"), "550e8400-e29b-41d4-a716-446655440000.json");
        // 非法字符 → _（防路径穿越）
        assert!(!snapshot_file_name("../../etc/passwd").contains('/'));
        assert_eq!(snapshot_file_name("a/b"), "a_b.json");
    }

    #[test]
    fn cleanup_after_successful_save() {
        let dir = test_dir("cleanup");
        save_snapshot(&dir, &payload("doc-c", Some("/c.md"), "x", 1)).unwrap();
        assert!(load_snapshot(&dir, "doc-c").is_some());
        // 保存成功后 cleanup
        delete_snapshot(&dir, "doc-c").unwrap();
        assert!(load_snapshot(&dir, "doc-c").is_none());
        assert!(list_snapshots(&dir).is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }
}
