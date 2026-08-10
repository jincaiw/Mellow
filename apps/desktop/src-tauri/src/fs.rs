use serde::Deserialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// 打开对话框结果
#[derive(serde::Serialize)]
pub struct OpenDocumentResult {
    path: Option<String>,
    content: Option<String>,
    error: Option<String>,
}

/// 保存对话框结果
#[derive(serde::Serialize)]
pub struct SaveDocumentResult {
    path: Option<String>,
    error: Option<String>,
}

/// 打开文件：系统对话框 → 读取文本（ADR-0008 Document Model / ADR-0009 File Safety 的基础）
#[tauri::command]
pub async fn open_document(app: tauri::AppHandle) -> OpenDocumentResult {
    use tauri_plugin_dialog::DialogExt;

    let Some(file) = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "txt"])
        .blocking_pick_file()
    else {
        return OpenDocumentResult { path: None, content: None, error: None };
    };

    // into_path() 在 dialog 插件 v2 中返回 Result（可能因权限/路径错误失败）
    let Some(path) = file.into_path().ok() else {
        return OpenDocumentResult {
            path: None,
            content: None,
            error: Some("无法解析所选文件路径".to_string()),
        };
    };
    match fs::read_to_string(&path) {
        Ok(content) => OpenDocumentResult {
            path: Some(path.to_string_lossy().into_owned()),
            content: Some(content),
            error: None,
        },
        Err(e) => OpenDocumentResult {
            path: Some(path.to_string_lossy().into_owned()),
            content: None,
            error: Some(e.to_string()),
        },
    }
}

/// 保存文件：有 path 直接写；无 path 弹另存为对话框。
/// 采用 atomic write（temp file + rename），对应 ADR-0009 File Safety（Atomic save）。
#[tauri::command]
pub async fn save_document(
    app: tauri::AppHandle,
    path: Option<String>,
    content: String,
) -> SaveDocumentResult {
    use tauri_plugin_dialog::DialogExt;

    let resolved = match path {
        Some(p) => Some(PathBuf::from(p)),
        None => {
            let Some(file) = app
                .dialog()
                .file()
                .add_filter("Markdown", &["md", "markdown"])
                .set_file_name("untitled.md")
                .blocking_save_file()
            else {
                return SaveDocumentResult { path: None, error: None };
            };
            // 同上：dialog 插件 v2 返回 Result
            file.into_path().ok()
        }
    };

    let Some(target) = resolved else {
        return SaveDocumentResult { path: None, error: None };
    };

    if let Err(e) = atomic_write(&target, content.as_bytes()) {
        return SaveDocumentResult {
            path: Some(target.to_string_lossy().into_owned()),
            error: Some(e.to_string()),
        };
    }

    SaveDocumentResult {
        path: Some(target.to_string_lossy().into_owned()),
        error: None,
    }
}

/// Atomic write：写入同目录临时文件后 rename 覆盖目标。
/// 避免半写文件；跨平台（Windows 上 rename 需目标不存在或使用 replace）。
fn atomic_write(target: &Path, data: &[u8]) -> std::io::Result<()> {
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    let file_name = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("mellow-save");

    let tmp_path = dir.join(format!(".{file_name}.mellow-tmp"));

    // 清理历史残留临时文件
    if tmp_path.exists() {
        let _ = fs::remove_file(&tmp_path);
    }

    let result = (|| {
        let mut tmp = fs::File::create(&tmp_path)?;
        tmp.write_all(data)?;
        tmp.sync_all()?; // flush to disk before rename
        drop(tmp);
        fs::rename(&tmp_path, target)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }
    result
}

// 供测试用的辅助类型导出
#[allow(dead_code)]
#[derive(Deserialize)]
pub struct SaveDocumentPayload {
    pub path: Option<String>,
    pub content: String,
}
