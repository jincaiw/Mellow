//! window geometry persistence —— 窗口几何记忆（第四轮 A2，Typora parity）。
//!
//! 目标：退出时记住窗口位置/内区尺寸/最大化状态，下次启动恢复。
//! （Typora 在 macOS 依赖系统状态恢复；Mellow 三平台统一自管。）
//!
//! 架构约束（PRD §113.4）：Rust 只做系统能力投射，不含业务逻辑。
//! - 纯函数（JSON 编解码 / 屏幕可见性判定）与 Tauri 解耦，可单测；
//! - 落盘文件：`app_data_dir/window-geometry.json`（物理像素：位置=外区左上角，
//!   尺寸=内区 client size，与 tauri WindowEvent 载荷一致）；
//! - 状态流：窗口 Moved/Resized 事件 → 进程内 Mutex 状态（廉价）→ 退出/销毁时一次性 flush；
//! - 恢复前做「至少与某显示器相交」校验，防拔外接屏后窗口恢复到屏幕外。

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

/// 持久化文件名（app_data_dir 下）。
pub const FILE_NAME: &str = "window-geometry.json";

/// 窗口几何（物理像素）。位置为窗口外区左上角，尺寸为内区 client size。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

/// 进程内共享的最新几何（窗口事件只更新内存；退出/销毁时落盘）。
#[derive(Default)]
pub struct GeometryState(pub Mutex<Option<WindowGeometry>>);

/// 几何文件路径。
pub fn file_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(FILE_NAME))
}

/// 从磁盘读取历史几何（文件缺失/损坏 → None）。
pub fn load(path: &Path) -> Option<WindowGeometry> {
    let raw = fs::read(path).ok()?;
    serde_json::from_slice(&raw).ok().filter(|g: &WindowGeometry| g.width > 0 && g.height > 0)
}

/// 原子写入（temp + rename，与 recovery.rs 同思路）。
pub fn save(path: &Path, geometry: &WindowGeometry) {
    let json = match serde_json::to_vec(geometry) {
        Ok(j) => j,
        Err(_) => return,
    };
    let dir = match path.parent() {
        Some(d) => d,
        None => return,
    };
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    let tmp = dir.join(format!("{}.tmp", FILE_NAME));
    let result = (|| -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&json)?;
        f.sync_all()?;
        fs::rename(&tmp, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
}

/// 纯函数：几何是否与任一显示器有效相交。
/// 每个显示器以 (x, y, w, h) 物理矩形描述；要求窗口至少露出一个可观区域
/// （≥120px 宽 × ≥48px 高），避免仅剩 1~2px 边缘时仍被判定为"在屏"。
pub fn visible_on_any_screen(
    monitors: &[(i32, i32, u32, u32)],
    g: &WindowGeometry,
) -> bool {
    const MIN_VISIBLE_W: i64 = 120;
    const MIN_VISIBLE_H: i64 = 48;
    let (wx, wy) = (g.x as i64, g.y as i64);
    let (ww, wh) = (g.width as i64, g.height as i64);
    monitors.iter().any(|&(mx, my, mw, mh)| {
        let (mx, my) = (mx as i64, my as i64);
        let (mw, mh) = (mw as i64, mh as i64);
        let ix = wx.max(mx);
        let iy = wy.max(my);
        let ix2 = (wx + ww).min(mx + mw);
        let iy2 = (wy + wh).min(my + mh);
        ix2 - ix >= MIN_VISIBLE_W && iy2 - iy >= MIN_VISIBLE_H
    })
}

/// 更新进程内几何状态（窗口事件回调调用；Resized/Moved 均可触发）。
pub fn record(app: &tauri::AppHandle, geometry: WindowGeometry) {
    if let Some(state) = app.try_state::<GeometryState>() {
        *state.0.lock().unwrap() = Some(geometry);
    }
}

/// flush：把进程内最新几何落盘（Exit / 窗口 Destroyed 时调用）。
pub fn flush(app: &tauri::AppHandle) {
    let path = match file_path(app) {
        Some(p) => p,
        None => return,
    };
    if let Some(state) = app.try_state::<GeometryState>() {
        if let Some(g) = *state.0.lock().unwrap() {
            save(&path, &g);
        }
    }
}

/// 从当前主窗口读取实时几何快照（无窗口 → None）。
pub fn read_window_geometry(app: &tauri::AppHandle) -> Option<WindowGeometry> {
    let window = app.get_webview_window("main")?;
    let pos = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    let maximized = window.is_maximized().unwrap_or(false);
    Some(WindowGeometry {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        maximized,
    })
}

/// 主窗口事件处理（由 lib.rs setup 挂在窗口上）：
/// - Moved / Resized → 快照写入进程内状态（退出/销毁时统一落盘）；
/// - Destroyed → 立即 flush（macOS 关窗不退出进程的场景也能持久化）。
pub fn handle_window_event(app: &tauri::AppHandle, event: &tauri::WindowEvent) {
    match event {
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
            if let Some(g) = read_window_geometry(app) {
                record(app, g);
            }
        }
        tauri::WindowEvent::Destroyed => flush(app),
        _ => {}
    }
}

/// 显示器物理矩形列表（供屏幕外恢复防护校验）。
pub fn monitor_rects(app: &tauri::AppHandle) -> Vec<(i32, i32, u32, u32)> {
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            (p.x, p.y, s.width, s.height)
        })
        .collect()
}

/// 启动恢复：几何文件存在、且与当前任一显示器有效相交时应用；
/// 否则静默忽略（保留 Builder 的 center() 默认位）。
pub fn restore(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let path = match file_path(app) {
        Some(p) => p,
        None => return,
    };
    let saved = match load(&path) {
        Some(g) => g,
        None => return,
    };
    if !visible_on_any_screen(&monitor_rects(app), &saved) {
        return;
    }
    use tauri::{PhysicalPosition, PhysicalSize, Position, Size};
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(saved.x, saved.y)));
    let _ = window.set_size(Size::Physical(PhysicalSize::new(saved.width, saved.height)));
    if saved.maximized {
        let _ = window.maximize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_round_trip_preserves_fields() {
        let dir = std::env::temp_dir().join(format!("mellow-geom-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(FILE_NAME);
        let g = WindowGeometry { x: -1200, y: 320, width: 1440, height: 900, maximized: true };
        save(&path, &g);
        assert_eq!(load(&path), Some(g));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_or_corrupt_file_loads_none() {
        let dir = std::env::temp_dir().join(format!("mellow-geom-bad-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(FILE_NAME);
        assert_eq!(load(&path), None); // 不存在
        fs::write(&path, "not json").unwrap();
        assert_eq!(load(&path), None); // 损坏
        fs::write(&path, r#"{"x":0,"y":0,"width":0,"height":0,"maximized":false}"#).unwrap();
        assert_eq!(load(&path), None); // 零尺寸视为非法
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn off_screen_geometry_is_rejected() {
        let monitors = [(0, 0, 1920, 1080), (1920, 0, 1920, 1080)];
        // 主屏内 → 可见
        let ok = WindowGeometry { x: 100, y: 80, width: 900, height: 600, maximized: false };
        assert!(visible_on_any_screen(&monitors, &ok));
        // 完全在右侧副屏 → 可见
        let right = WindowGeometry { x: 2200, y: 100, width: 800, height: 600, maximized: false };
        assert!(visible_on_any_screen(&monitors, &right));
        // 完全在屏幕外（旧副屏拔掉后遗留位置）→ 拒绝
        let lost = WindowGeometry { x: -4000, y: 100, width: 800, height: 600, maximized: false };
        assert!(!visible_on_any_screen(&monitors, &lost));
        // 只剩 2px 边缘露出 → 拒绝（防误判）
        let single = [(0, 0, 1920, 1080)];
        let sliver = WindowGeometry { x: 1918, y: 0, width: 800, height: 600, maximized: false };
        assert!(!visible_on_any_screen(&single, &sliver));
        // 绝大部分在屏但仅小部分在右副屏内 → 接受（跨屏窗口不误杀）
        let spanning = WindowGeometry { x: 1900, y: 100, width: 400, height: 600, maximized: false };
        assert!(visible_on_any_screen(&monitors, &spanning));
    }
}
