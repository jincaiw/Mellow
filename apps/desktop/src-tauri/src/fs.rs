use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// 编码标识（与 host-api Encoding 对齐）
pub const ENC_UTF8: &str = "utf-8";
pub const ENC_UTF8_BOM: &str = "utf-8-bom";
pub const ENC_UTF16LE: &str = "utf-16le";
pub const ENC_UTF16BE: &str = "utf-16be";

/// 行尾标识
pub const EOL_LF: &str = "\n";
pub const EOL_CRLF: &str = "\r\n";
pub const EOL_CR: &str = "\r";

/// 打开对话框结果（含编码/EOL 元数据，preserve metadata）
#[derive(serde::Serialize)]
pub struct OpenDocumentResult {
    pub path: Option<String>,
    pub content: Option<String>,
    pub encoding: Option<String>,
    pub eol: Option<String>,
    pub error: Option<String>,
}

impl OpenDocumentResult {
    fn canceled() -> Self {
        Self { path: None, content: None, encoding: None, eol: None, error: None }
    }
}

/// 保存对话框结果
#[derive(serde::Serialize)]
pub struct SaveDocumentResult {
    pub path: Option<String>,
    pub error: Option<String>,
}

impl SaveDocumentResult {
    fn canceled() -> Self {
        Self { path: None, error: None }
    }
}

/// 检测编码并解码为 String（保留原始 EOL 字符，BOM 剥离记录在 encoding）
/// UTF-8 用标准库；UTF-16 手写解码（含 surrogate pair），不依赖 encoding_rs。
pub fn decode(bytes: &[u8]) -> (String, &'static str) {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        (String::from_utf8_lossy(&bytes[3..]).into_owned(), ENC_UTF8_BOM)
    } else if bytes.starts_with(&[0xFF, 0xFE]) {
        (decode_utf16(&bytes[2..], true), ENC_UTF16LE)
    } else if bytes.starts_with(&[0xFE, 0xFF]) {
        (decode_utf16(&bytes[2..], false), ENC_UTF16BE)
    } else {
        (String::from_utf8_lossy(bytes).into_owned(), ENC_UTF8)
    }
}

/// 按编码编码为字节（BOM 还原）—— 与 decode 互逆，保证 byte identical
pub fn encode(content: &str, encoding: &str) -> Vec<u8> {
    match encoding {
        ENC_UTF8_BOM => {
            let mut bytes = vec![0xEF, 0xBB, 0xBF];
            bytes.extend_from_slice(content.as_bytes());
            bytes
        }
        ENC_UTF16LE => {
            let mut bytes = vec![0xFF, 0xFE];
            bytes.extend_from_slice(&encode_utf16(content, true));
            bytes
        }
        ENC_UTF16BE => {
            let mut bytes = vec![0xFE, 0xFF];
            bytes.extend_from_slice(&encode_utf16(content, false));
            bytes
        }
        _ => content.as_bytes().to_vec(),
    }
}

/// UTF-16 解码（含 surrogate pair；奇数末尾字节容错忽略）
fn decode_utf16(bytes: &[u8], little_endian: bool) -> String {
    let unit_at = |i: usize| -> u16 {
        if little_endian {
            u16::from_le_bytes([bytes[i], bytes[i + 1]])
        } else {
            u16::from_be_bytes([bytes[i], bytes[i + 1]])
        }
    };

    let mut out = String::new();
    let mut i = 0;
    while i + 1 < bytes.len() {
        let unit = unit_at(i);
        i += 2;
        // high surrogate 且后续是 low surrogate
        if (0xD800..=0xDBFF).contains(&unit) && i + 1 < bytes.len() {
            let low = unit_at(i);
            if (0xDC00..=0xDFFF).contains(&low) {
                let cp = 0x1_0000 + (((unit as u32 - 0xD800) << 10) | (low as u32 - 0xDC00));
                out.push(char::from_u32(cp).unwrap_or('\u{FFFD}'));
                i += 2;
                continue;
            }
        }
        out.push(char::from_u32(unit as u32).unwrap_or('\u{FFFD}'));
    }
    out
}

/// UTF-16 编码（含 surrogate pair）
fn encode_utf16(content: &str, little_endian: bool) -> Vec<u8> {
    let mut out = Vec::new();
    for c in content.chars() {
        let mut buf = [0u16; 2];
        for unit in c.encode_utf16(&mut buf) {
            if little_endian {
                out.extend_from_slice(&unit.to_le_bytes());
            } else {
                out.extend_from_slice(&unit.to_be_bytes());
            }
        }
    }
    out
}

/// 检测行尾（首个换行符；无换行 → LF）。`\r\n` 优先识别，`\r` 单独出现为 CR。
pub fn detect_eol(content: &str) -> &'static str {
    let bytes = content.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' => {
                if i + 1 < bytes.len() && bytes[i + 1] == b'\n' {
                    return EOL_CRLF;
                }
                return EOL_CR;
            }
            b'\n' => return EOL_LF,
            _ => {}
        }
        i += 1;
    }
    EOL_LF
}

/// 打开文件：系统对话框 → 读字节 → 检测编码/EOL → 返回文本与元数据
#[tauri::command]
pub async fn open_document(app: tauri::AppHandle) -> OpenDocumentResult {
    use tauri_plugin_dialog::DialogExt;

    let Some(file) = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "txt"])
        .blocking_pick_file()
    else {
        return OpenDocumentResult::canceled();
    };

    // into_path() 在 dialog 插件 v2 中返回 Result（可能因权限/路径错误失败）
    let Some(path) = file.into_path().ok() else {
        return OpenDocumentResult {
            path: None,
            content: None,
            encoding: None,
            eol: None,
            error: Some("无法解析所选文件路径".to_string()),
        };
    };

    match fs::read(&path) {
        Ok(bytes) => {
            let (content, encoding) = decode(&bytes);
            let eol = detect_eol(&content);
            OpenDocumentResult {
                path: Some(path.to_string_lossy().into_owned()),
                content: Some(content),
                encoding: Some(encoding.to_string()),
                eol: Some(eol.to_string()),
                error: None,
            }
        }
        Err(e) => OpenDocumentResult {
            path: Some(path.to_string_lossy().into_owned()),
            content: None,
            encoding: None,
            eol: None,
            error: Some(e.to_string()),
        },
    }
}

/// 保存文件：有 path 直接写；无 path 弹另存为对话框。
/// - preserve encoding：按打开时检测的 encoding 重新编码（BOM 还原）；
/// - preserve EOL：content 原样（不做 EOL 转换），eol 参数仅记录/预留；
/// - atomic write（temp + flush + fsync + rename），对应 ADR-0009。
#[tauri::command]
pub async fn save_document(
    app: tauri::AppHandle,
    path: Option<String>,
    content: String,
    encoding: Option<String>,
    eol: Option<String>,
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
                return SaveDocumentResult::canceled();
            };
            file.into_path().ok()
        }
    };

    let Some(target) = resolved else {
        return SaveDocumentResult::canceled();
    };

    // EOL 保留：content 原样写入，不转换（eol 参数为 preserve-metadata 语义记录）
    let _ = eol;
    let encoding = encoding.unwrap_or_else(|| ENC_UTF8.to_string());
    let data = encode(&content, &encoding);

    if let Err(e) = atomic_write(&target, &data) {
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

/// Atomic write：写入同目录临时文件后 rename 覆盖目标（flush + fsync）。
fn atomic_write(target: &Path, data: &[u8]) -> std::io::Result<()> {
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    let file_name = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("mellow-save");

    let tmp_path = dir.join(format!(".{file_name}.mellow-tmp"));

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

#[cfg(test)]
mod tests {
    use super::*;

    /// Open → No Edit → Save → byte identical（4 种编码 + 混合 EOL + 中文）
    fn roundtrip(original: &[u8]) {
        let (content, encoding) = decode(original);
        // 保存前不编辑：content 原样（保留 EOL）
        let saved = encode(&content, encoding);
        assert_eq!(saved, original, "byte identical failed for {:?}", encoding);
    }

    #[test]
    fn roundtrip_utf8_no_bom() {
        roundtrip(b"# Title\n\nhello world\r\n");
    }

    #[test]
    fn roundtrip_utf8_bom() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(b"# \xe4\xb8\xad\xe6\x96\x87\n\nlist:\r\n- a\r\n- b\n");
        roundtrip(&bytes);
    }

    #[test]
    fn roundtrip_utf16le() {
        // "# 中文\r\n" 的 UTF-16LE + BOM
        let mut bytes = vec![0xFF, 0xFE];
        for unit in [0x0023u16, 0x0020, 0x4E2D, 0x6587, 0x000D, 0x000A] {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        roundtrip(&bytes);
    }

    #[test]
    fn roundtrip_utf16be() {
        let mut bytes = vec![0xFE, 0xFF];
        for unit in [0x0023u16, 0x0020, 0x4E2D, 0x6587, 0x000D, 0x000A] {
            bytes.extend_from_slice(&unit.to_be_bytes());
        }
        roundtrip(&bytes);
    }

    #[test]
    fn roundtrip_utf16le_surrogate_pair() {
        // 代理对（emoji 🎉 = U+1F389）
        let mut bytes = vec![0xFF, 0xFE];
        for unit in [0xD83Cu16, 0xDF89u16, 0x000A] {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        roundtrip(&bytes);
    }

    #[test]
    fn detect_eol_variants() {
        assert_eq!(detect_eol("a\nb"), EOL_LF);
        assert_eq!(detect_eol("a\r\nb"), EOL_CRLF);
        assert_eq!(detect_eol("a\rb"), EOL_CR);
        assert_eq!(detect_eol(""), EOL_LF);
        assert_eq!(detect_eol("a\r\nb\nc"), EOL_CRLF); // 首个为准
        assert_eq!(detect_eol("a\nb\r\nc"), EOL_LF);
    }

    #[test]
    fn detect_encoding_labels() {
        assert_eq!(decode(b"plain").1, ENC_UTF8);
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(b"x");
        assert_eq!(decode(&bom).1, ENC_UTF8_BOM);
        assert_eq!(decode(&[0xFF, 0xFE, 0x61, 0x00]).1, ENC_UTF16LE);
        assert_eq!(decode(&[0xFE, 0xFF, 0x00, 0x61]).1, ENC_UTF16BE);
    }

    #[test]
    fn atomic_write_replaces_and_is_clean() {
        let dir = std::env::temp_dir().join(format!("mellow-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("doc.md");
        fs::write(&target, b"old").unwrap();

        atomic_write(&target, b"new content").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new content");
        // 临时文件清理
        assert!(!target.with_file_name(".doc.md.mellow-tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
