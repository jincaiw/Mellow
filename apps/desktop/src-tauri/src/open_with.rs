//! Open With（PRD §79）—— 检测本机常见编辑器并用其打开当前文件。
//!
//! 平台检测属于 Adapter 层（PRD §113.2 原生增强矩阵：Open With 按平台实现）。
//! 统一输出 EditorApp 列表；启动命令按平台差异化：
//! - macOS：`open -a <AppName> <file>`（无需具体二进制路径，系统解析）；
//! - Windows：直接 spawn <exe> <file>；
//! - Linux：spawn <命令> <file>（PATH 解析）。

use std::process::Command;

#[derive(serde::Serialize)]
pub struct EditorApp {
    pub id: String,
    pub name: String,
    /// macOS = App 名称（open -a）；Win/Linux = 可执行文件路径/命令
    pub launch: String,
}

/// 检测本机可用编辑器（按平台；系统默认编辑器恒返回）
#[tauri::command]
pub fn detect_open_with() -> Vec<EditorApp> {
    let mut apps: Vec<EditorApp> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let candidates: &[(&str, &str, &str)] = &[
            ("vscode", "Visual Studio Code", "Visual Studio Code.app"),
            ("cursor", "Cursor", "Cursor.app"),
            ("zed", "Zed", "Zed.app"),
            ("sublime", "Sublime Text", "Sublime Text.app"),
            ("bbedit", "BBEdit", "BBEdit.app"),
        ];
        for (id, name, app) in candidates {
            let mut found = std::path::Path::new("/Applications").join(app).exists();
            if !found {
                if let Ok(home) = std::env::var("HOME") {
                    found = std::path::Path::new(&home)
                        .join("Applications")
                        .join(app)
                        .exists();
                }
            }
            if found {
                apps.push(EditorApp {
                    id: (*id).to_string(),
                    name: (*name).to_string(),
                    launch: (*name).to_string(),
                });
            }
        }
        // 系统 TextEdit 恒存在
        apps.push(EditorApp {
            id: "textedit".to_string(),
            name: "TextEdit（系统）".to_string(),
            launch: "TextEdit".to_string(),
        });
    }

    #[cfg(target_os = "windows")]
    {
        let candidates: &[(&str, &str, &str)] = &[
            ("vscode", "VS Code", "Code.exe"),
            ("cursor", "Cursor", "Cursor.exe"),
            ("zed", "Zed", "zed.exe"),
            ("sublime", "Sublime Text", "sublime_text.exe"),
        ];
        for (id, name, exe) in candidates {
            let mut found = false;
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                found = std::path::Path::new(&local)
                    .join("Programs")
                    .join("Microsoft VS Code")
                    .join(exe)
                    .exists()
                    || std::path::Path::new(&local)
                        .join("Programs")
                        .join("Cursor")
                        .join(exe)
                        .exists();
            }
            if !found {
                if let Ok(pf) = std::env::var("ProgramFiles") {
                    found = std::path::Path::new(&pf)
                        .join("Microsoft VS Code")
                        .join(exe)
                        .exists();
                }
            }
            if found {
                apps.push(EditorApp {
                    id: (*id).to_string(),
                    name: (*name).to_string(),
                    launch: (*name).to_string(),
                });
            }
        }
        apps.push(EditorApp {
            id: "notepad".to_string(),
            name: "记事本（系统）".to_string(),
            launch: "notepad".to_string(),
        });
    }

    #[cfg(target_os = "linux")]
    {
        for (id, name, cmd) in [
            ("vscode", "VS Code", "code"),
            ("cursor", "Cursor", "cursor"),
            ("zed", "Zed", "zed"),
            ("sublime", "Sublime Text", "subl"),
            ("gedit", "gedit", "gedit"),
            ("kate", "Kate", "kate"),
        ] {
            if Command::new("sh")
                .args(["-c", &format!("command -v {cmd}")])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                apps.push(EditorApp {
                    id: id.to_string(),
                    name: name.to_string(),
                    launch: cmd.to_string(),
                });
            }
        }
    }

    apps
}

/// 用指定编辑器打开文件
#[tauri::command]
pub fn open_with_editor(launch: String, file_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", &launch, &file_path])
            .spawn()
            .map_err(|e| format!("open failed: {e}"))?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        Command::new(&launch)
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("spawn failed: {e}"))?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        Command::new(&launch)
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("spawn failed: {e}"))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = (launch, file_path);
        Err("unsupported platform".to_string())
    }
}
