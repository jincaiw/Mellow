use tauri::AppHandle;
use tauri::Emitter;

use crate::BridgeMessage;

/// CoreEditor → native 桥接入口。
///
/// V0.0 策略：
/// - `core` 模块的 `notify*` 全部为 fire-and-forget 状态通知，返回 `null`（Promise resolve null，
///   CoreEditor 内部不依赖返回值）；
/// - `fs` 模块（Image Workflow，spec image-workflow §3/§4）：copy/mkdir/write/read/exists/reveal，
///   由 editor-engine 的 createBridgeImageHost 调用；
/// - 其余模块（completion/preview/tokenizer/api/foundationModels/translation）V0.0 无宿主实现，
///   返回 `null`（CoreEditor 对缺失宿主防御式处理）。
#[tauri::command]
pub fn bridge_call(
    app: AppHandle,
    message: BridgeMessage,
) -> Result<Option<serde_json::Value>, String> {
    match message.module_name.as_str() {
        "core" => {
            // 状态通知：转发为事件供 React 订阅。parameters 必须原样保留：
            // notifyViewDidUpdate 的 contentEdited/isDirty 是桌面壳判定 dirty、
            // recovery 与状态栏刷新的唯一编辑器事实来源。
            let _ = app.emit(
                "mellow://bridge",
                serde_json::json!({
                    "moduleName": message.module_name,
                    "methodName": message.method_name,
                    "parameters": message.parameters,
                }),
            );
            Ok(None)
        }
        "fs" => bridge_fs(&message),
        _ => Ok(None),
    }
}

/// Image Workflow 文件操作（Rust System Core；同步实现——命令内部为同步 fs 调用）
fn bridge_fs(message: &BridgeMessage) -> Result<Option<serde_json::Value>, String> {
    use std::path::PathBuf;

    match message.method_name.as_str() {
        "copyFile" => {
            #[derive(serde::Deserialize)]
            struct Params {
                from: String,
                to: String,
            }
            let p: Params = serde_json::from_str(&message.parameters).map_err(|e| e.to_string())?;
            std::fs::copy(&p.from, &p.to).map_err(|e| format!("copy {} → {}: {}", p.from, p.to, e))?;
            Ok(Some(serde_json::json!({ "ok": true })))
        }
        "mkdir" => {
            #[derive(serde::Deserialize)]
            struct Params {
                path: String,
            }
            let p: Params = serde_json::from_str(&message.parameters).map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&p.path).map_err(|e| format!("mkdir {}: {}", p.path, e))?;
            Ok(Some(serde_json::json!({ "ok": true })))
        }
        "writeBinary" => {
            #[derive(serde::Deserialize)]
            struct Params {
                path: String,
                data: Vec<u8>,
            }
            let p: Params = serde_json::from_str(&message.parameters).map_err(|e| e.to_string())?;
            let target = PathBuf::from(&p.path);
            let dir = target.parent().unwrap_or_else(|| std::path::Path::new("."));
            if !dir.as_os_str().is_empty() && !dir.exists() {
                std::fs::create_dir_all(dir).map_err(|e| format!("mkdir {}: {}", dir.display(), e))?;
            }
            let name = target.file_name().and_then(|n| n.to_str()).unwrap_or("mellow-bin");
            let tmp = dir.join(format!(".{}.mellow-tmp", name));
            let _ = std::fs::remove_file(&tmp);
            std::fs::write(&tmp, &p.data).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &target).map_err(|e| {
                let _ = std::fs::remove_file(&tmp);
                format!("write {}: {}", p.path, e)
            })?;
            Ok(Some(serde_json::json!({ "ok": true })))
        }
        "exists" => {
            #[derive(serde::Deserialize)]
            struct Params {
                path: String,
            }
            let p: Params = serde_json::from_str(&message.parameters).map_err(|e| e.to_string())?;
            Ok(Some(serde_json::json!({ "ok": true, "exists": std::path::Path::new(&p.path).exists() })))
        }
        "reveal" => {
            #[derive(serde::Deserialize)]
            struct Params {
                path: String,
            }
            let p: Params = serde_json::from_str(&message.parameters).map_err(|e| e.to_string())?;
            // 真机能力：系统文件管理器定位（macOS Finder / Windows Explorer / Linux XDG）
            // V0.0 无宿主实现（fire-and-forget no-op），由 tauri-plugin-opener 接入时启用
            let _ = p;
            Ok(Some(serde_json::json!({ "ok": true })))
        }
        _ => Ok(None),
    }
}
