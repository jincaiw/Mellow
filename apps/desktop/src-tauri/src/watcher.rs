/**
 * watcher.rs —— 外部文件变化检测（spec §5）。
 *
 * - notify 跨平台文件监听（inotify / ReadDirectoryChangesW / FSEvents）；
 * - 变化事件 → 读磁盘状态（mtime/identity）→ emit 前端（mellow://file-changed）；
 * - rapid repeated updates 防抖：同路径 200ms 窗口合并（最后事件为准）；
 * - watcher 生命周期由 registry 管理（watch_document / unwatch_document）。
 */

use notify::{Event as NotifyEvent, EventKind, RecommendedWatcher, RecursiveMode, Watcher as NotifyWatcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

/// 前端文件变化事件（含磁盘状态，供 detectExternalChange）
#[derive(Clone, Serialize)]
pub struct FileChangeEventDto {
    pub path: String,
    pub mtime_ms: u64,
    pub identity_key: String,
    pub kind: String,
}

/// watcher 注册表（Tauri state）
#[derive(Default)]
pub struct WatcherRegistry(pub Mutex<HashMap<u64, RecommendedWatcher>>);

/// 防抖状态：path → 上次 emit 时间
#[derive(Default)]
pub struct DebounceState(pub Mutex<HashMap<String, Instant>>);

/// 防抖窗口（ms）：rapid repeated updates 合并
pub const DEBOUNCE_MS: u64 = 200;

fn kind_str(kind: &EventKind) -> &'static str {
    match kind {
        EventKind::Create(_) => "create",
        EventKind::Remove(_) => "remove",
        EventKind::Any => "modify",
        _ => "modify",
    }
}

/// 防抖判定（纯函数，可测）：同 path 在窗口内 → true（应跳过）
pub fn should_debounce(debounce: &mut HashMap<String, Instant>, path: &str, now: Instant) -> bool {
    if let Some(last) = debounce.get(path) {
        if now.duration_since(*last).as_millis() < DEBOUNCE_MS as u128 {
            return true;
        }
    }
    debounce.insert(path.to_string(), now);
    false
}

/// 注册文件监听（返回 watcher id）
#[tauri::command]
pub fn watch_document(app: AppHandle, path: String) -> Result<u64, String> {
    let watcher_id = {
        let state = app.state::<WatcherRegistry>();
        let mut registry = state.0.lock().unwrap();
        // 简单递增 id
        registry.len() as u64 + 1
    };

    let app_emit = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<NotifyEvent>| {
        let Ok(event) = res else { return };
        let Some(path) = event.paths.first() else { return };
        let path_str = path.to_string_lossy().into_owned();

        // rapid repeated updates 防抖（回调线程经 AppHandle 访问 state）
        {
            let state = app_emit.state::<DebounceState>();
            let mut debounce = state.0.lock().unwrap();
            if should_debounce(&mut debounce, &path_str, Instant::now()) {
                return;
            }
        }

        // 读磁盘状态（文件可能已被删除 → 0/空，前端据此处理）
        let (mtime_ms, identity_key) = match std::fs::metadata(&path) {
            Ok(meta) => (crate::fs::mtime_ms(&meta), crate::fs::identity_key(&meta)),
            Err(_) => (0, String::new()),
        };

        let _ = app_emit.emit(
            "mellow://file-changed",
            FileChangeEventDto {
                path: path_str,
                mtime_ms,
                identity_key,
                kind: kind_str(&event.kind).to_string(),
            },
        );
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    let state = app.state::<WatcherRegistry>();
    let mut registry = state.0.lock().unwrap();
    registry.insert(watcher_id, watcher);
    Ok(watcher_id)
}

/// 取消文件监听
#[tauri::command]
pub fn unwatch_document(app: AppHandle, watcher_id: u64) -> Result<(), String> {
    let state = app.state::<WatcherRegistry>();
    let mut registry = state.0.lock().unwrap();
    registry.remove(&watcher_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debounce_merges_rapid_updates() {
        let mut map: HashMap<String, Instant> = HashMap::new();
        let now = Instant::now();
        // 第一次：通过（记录时间）
        assert!(!should_debounce(&mut map, "/a.md", now));
        // 200ms 内再次：跳过（rapid repeated updates 合并）
        assert!(should_debounce(&mut map, "/a.md", now + std::time::Duration::from_millis(100)));
        // 超过窗口：再次通过
        assert!(!should_debounce(&mut map, "/a.md", now + std::time::Duration::from_millis(300)));
    }

    #[test]
    fn debounce_isolates_paths() {
        let mut map: HashMap<String, Instant> = HashMap::new();
        let now = Instant::now();
        assert!(!should_debounce(&mut map, "/a.md", now));
        // 不同路径不受影响
        assert!(!should_debounce(&mut map, "/b.md", now));
        // a 仍被防抖
        assert!(should_debounce(&mut map, "/a.md", now + std::time::Duration::from_millis(50)));
    }

    #[test]
    fn kind_mapping() {
        assert_eq!(kind_str(&EventKind::Create(notify::event::CreateKind::File)), "create");
        assert_eq!(kind_str(&EventKind::Remove(notify::event::RemoveKind::File)), "remove");
        assert_eq!(kind_str(&EventKind::Modify(notify::event::ModifyKind::Data(notify::event::DataChange::Any))), "modify");
    }
}
