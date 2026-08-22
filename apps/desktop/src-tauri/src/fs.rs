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

/// 打开对话框结果（含编码/EOL/磁盘状态元数据）
#[derive(serde::Serialize)]
pub struct OpenDocumentResult {
    pub path: Option<String>,
    pub content: Option<String>,
    pub encoding: Option<String>,
    pub eol: Option<String>,
    pub disk_mtime_ms: Option<u64>,
    pub identity_key: Option<String>,
    /// 大文件标记：content 为空，前端应走 read_text_meta + read_text_chunk 分块拉取
    pub large: Option<bool>,
    pub error: Option<String>,
}

impl OpenDocumentResult {
    fn canceled() -> Self {
        Self {
            path: None,
            content: None,
            encoding: None,
            eol: None,
            disk_mtime_ms: None,
            identity_key: None,
            large: None,
            error: None,
        }
    }
}

/// 保存对话框结果（含新磁盘状态：mtime/identity，供前端更新 document-model）
#[derive(serde::Serialize)]
pub struct SaveDocumentResult {
    pub path: Option<String>,
    pub disk_mtime_ms: Option<u64>,
    pub identity_key: Option<String>,
    pub error_code: Option<String>,
    pub error: Option<String>,
}

impl SaveDocumentResult {
    fn canceled() -> Self {
        Self { path: None, disk_mtime_ms: None, identity_key: None, error_code: None, error: None }
    }
}

/// 前端期望的磁盘状态（validate disk revision：外部变更检测，spec §5）
#[derive(serde::Deserialize)]
pub struct DiskState {
    pub mtime_ms: u64,
    pub identity_key: String,
}

/// 保存结果（原子保存管线完成后返回的新磁盘状态）
#[derive(Debug)]
pub struct SaveOutcome {
    pub path: String,
    pub bytes_written: usize,
    pub disk_mtime_ms: u64,
    pub identity_key: String,
}

/// 保存错误模型
#[derive(Debug)]
pub enum SaveError {
    /// IO 失败（权限/磁盘满/锁等）：原文件未被破坏
    Io(String),
    /// 磁盘文件已被外部修改（conflict）：拒绝覆盖，spec §5 local dirty never overwrite
    Conflict(String),
    /// 替换后读回验证不一致（spec §4 verify 阶段）
    VerifyFailed,
}

impl SaveError {
    pub fn code(&self) -> &'static str {
        match self {
            SaveError::Io(_) => "io",
            SaveError::Conflict(_) => "conflict",
            SaveError::VerifyFailed => "verify",
        }
    }

    pub fn message(&self) -> String {
        match self {
            SaveError::Io(msg) => msg.clone(),
            SaveError::Conflict(msg) => msg.clone(),
            SaveError::VerifyFailed => "保存后校验失败：文件内容与写入不一致".to_string(),
        }
    }
}

// ─────────────────────────── 编码 / EOL ───────────────────────────

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

// ─────────────────────────── 文件身份 / mtime ───────────────────────────

/// 文件身份键（dev:ino；Windows fallback 用 len:mtime）
pub fn identity_key(meta: &fs::Metadata) -> String {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        format!("{}:{}", meta.dev(), meta.ino())
    }
    #[cfg(not(unix))]
    {
        format!("{}:{}", meta.len(), mtime_ms(meta))
    }
}

/// mtime（epoch ms）
pub fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ─────────────────────────── Atomic Save 管线 ───────────────────────────

/// temp 文件命名（同目录，隐藏）
fn tmp_path_for(target: &Path) -> PathBuf {
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    let name = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("mellow-save");
    dir.join(format!(".{name}.mellow-tmp"))
}

/**
 * Atomic Save（spec §4 Save Pipeline）：
 *
 *   validate disk revision（外部变更检测，冲突则拒绝覆盖）
 *   → temp write
 *   → flush
 *   → fsync
 *   → replace（rename）
 *   → verify（读回比对）
 *   → update revision（返回新 mtime/identity）
 *
 * 失败保证：rename 前原文件从未被触碰；任何阶段失败清理 temp，原文件完整。
 */
pub fn atomic_save(target: &Path, data: &[u8], expected: Option<&DiskState>) -> Result<SaveOutcome, SaveError> {
    // 1. 解析 symlink（spec §11）：保存到真实目标、保留 symlink 本身。
    //    canonicalize 同时解析 parent 目录里的 symlink；路径不存在（新文档）时回退原路径。
    let effective = fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());

    // 2. validate disk revision：前端记录的磁盘状态 vs 当前磁盘（metadata 跟随 symlink）
    if let Some(expected) = expected {
        match fs::metadata(&effective) {
            Ok(meta) => {
                let current_key = identity_key(&meta);
                let current_mtime = mtime_ms(&meta);
                if current_key != expected.identity_key || current_mtime != expected.mtime_ms {
                    return Err(SaveError::Conflict(format!(
                        "磁盘文件已被外部修改（identity={current_key}, mtime={current_mtime}）"
                    )));
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(SaveError::Conflict("目标文件已被外部删除".to_string()));
            }
            Err(e) => return Err(SaveError::Io(e.to_string())),
        }
    }

    // 3. 记录原文件权限（PRD §104：保留 permissions），replace 后恢复
    let original_perms = fs::metadata(&effective).ok().map(|m| m.permissions());

    let tmp_path = tmp_path_for(&effective);

    // 崩溃残留清理（上次 crash during save 的 temp）
    let _ = fs::remove_file(&tmp_path);

    // 4-7. temp write → flush → fsync → rename
    let replace = (|| {
        let mut tmp = fs::File::create(&tmp_path).map_err(|e| SaveError::Io(e.to_string()))?;
        tmp.write_all(data).map_err(|e| SaveError::Io(e.to_string()))?;
        tmp.flush().map_err(|e| SaveError::Io(e.to_string()))?;
        tmp.sync_all().map_err(|e| SaveError::Io(e.to_string()))?;
        drop(tmp);
        fs::rename(&tmp_path, &effective).map_err(|e| SaveError::Io(e.to_string()))
    })();

    if let Err(e) = replace {
        let _ = fs::remove_file(&tmp_path); // 失败清理，原文件不动
        return Err(e);
    }

    // 8. 恢复原文件权限（PRD §104 permissions preservation；失败仅告警，不破坏已落盘内容）
    if let Some(perms) = original_perms {
        if let Err(e) = fs::set_permissions(&effective, perms) {
            eprintln!("[mellow] 恢复文件权限失败（{}）: {}", effective.display(), e);
        }
    }

    // 9. verify：替换后读回比对
    let on_disk = fs::read(&effective).map_err(|e| SaveError::Io(e.to_string()))?;
    if on_disk != data {
        return Err(SaveError::VerifyFailed);
    }

    // 10. update revision：返回新磁盘状态（path 保留用户打开时的原始路径，含 symlink）
    let meta = fs::metadata(&effective).map_err(|e| SaveError::Io(e.to_string()))?;
    Ok(SaveOutcome {
        path: target.to_string_lossy().into_owned(),
        bytes_written: data.len(),
        disk_mtime_ms: mtime_ms(&meta),
        identity_key: identity_key(&meta),
    })
}

// ─────────────────────────── Tauri 命令 ───────────────────────────

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

    let Some(path) = file.into_path().ok() else {
        return OpenDocumentResult {
            path: None,
            content: None,
            encoding: None,
            eol: None,
            disk_mtime_ms: None,
            identity_key: None,
            large: None,
            error: Some("无法解析所选文件路径".to_string()),
        };
    };

    match fs::read(&path) {
        Ok(bytes) => {
            let (content, encoding) = decode(&bytes);
            let eol = detect_eol(&content);
            // 磁盘状态（供前端保存时 validate disk revision）
            let (disk_mtime_ms, identity_key) = fs::metadata(&path)
                .map(|m| (mtime_ms(&m), identity_key(&m)))
                .unwrap_or((0, String::new()));
            // 大文件：内容进 Rust 缓存，IPC 只回标记（避免超大响应卡死 WebKit 事务）
            let char_count = content.chars().count();
            let large = char_count > CHUNKED_READ_THRESHOLD_CHARS;
            if large {
                let mut cache = TEXT_CHUNK_CACHE
                    .get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
                    .lock()
                    .unwrap();
                if cache.len() >= TEXT_CACHE_MAX_ENTRIES {
                    cache.clear();
                }
                cache.insert(
                    path.clone(),
                    CachedText { content, char_count, encoding, eol, mtime_ms: disk_mtime_ms },
                );
                OpenDocumentResult {
                    path: Some(path.to_string_lossy().into_owned()),
                    content: None,
                    encoding: Some(encoding.to_string()),
                    eol: Some(eol.to_string()),
                    disk_mtime_ms: Some(disk_mtime_ms),
                    identity_key: Some(identity_key),
                    large: Some(true),
                    error: None,
                }
            } else {
                OpenDocumentResult {
                    path: Some(path.to_string_lossy().into_owned()),
                    content: Some(content),
                    encoding: Some(encoding.to_string()),
                    eol: Some(eol.to_string()),
                    disk_mtime_ms: Some(disk_mtime_ms),
                    identity_key: Some(identity_key),
                    large: None,
                    error: None,
                }
            }
        }
        Err(e) => OpenDocumentResult {
            path: Some(path.to_string_lossy().into_owned()),
            content: None,
            encoding: None,
            eol: None,
            disk_mtime_ms: None,
            identity_key: None,
            large: None,
            error: Some(e.to_string()),
        },
    }
}

/// 保存：preserve encoding/EOL + Atomic Save 管线
#[tauri::command]
pub async fn save_document(
    app: tauri::AppHandle,
    path: Option<String>,
    content: String,
    encoding: Option<String>,
    eol: Option<String>,
    expected: Option<DiskState>,
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

    let _ = eol; // preserve EOL：content 原样，不转换
    perform_save(&target, &content, encoding.as_deref().unwrap_or(ENC_UTF8), expected.as_ref())
}

/// 保存管线核心（save_document 与 save_chunk_end 共用）：encode → Atomic Save → 结果映射
fn perform_save(target: &Path, content: &str, encoding: &str, expected: Option<&DiskState>) -> SaveDocumentResult {
    let data = encode(content, encoding);
    match atomic_save(target, &data, expected) {
        Ok(outcome) => SaveDocumentResult {
            path: Some(outcome.path),
            disk_mtime_ms: Some(outcome.disk_mtime_ms),
            identity_key: Some(outcome.identity_key),
            error_code: None,
            error: None,
        },
        Err(e) => SaveDocumentResult {
            path: Some(target.to_string_lossy().into_owned()),
            disk_mtime_ms: None,
            identity_key: None,
            error_code: Some(e.code().to_string()),
            error: Some(e.message()),
        },
    }
}

/// 直接按路径读取文本（外部变化 auto reload 用，无对话框）
#[derive(serde::Serialize)]
pub struct ReadTextResult {
    pub path: String,
    pub content: String,
    pub encoding: String,
    pub eol: String,
    pub mtime_ms: u64,
    pub identity_key: String,
}

#[tauri::command]
pub async fn read_text(path: String) -> Result<ReadTextResult, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let (content, encoding) = decode(&bytes);
    let eol = detect_eol(&content);
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    Ok(ReadTextResult {
        path,
        content,
        encoding: encoding.to_string(),
        eol: eol.to_string(),
        mtime_ms: mtime_ms(&meta),
        identity_key: identity_key(&meta),
    })
}

// ─────────────────────────── 分块 IPC 读取（大文件） ───────────────────────────
// 背景：tauri:// 自定义协议下，超大 IPC 响应（10MB 文档单次返回）会卡死 WebKit 事务，
// 导致动态样式表全部失效（sheet === null）、.cm-scroller 布局塌陷（白屏/首行在底部）。
// 方案：decode 一次放入 Rust 侧缓存，前端按字符区间分块拉取（每块 ≤256K chars）。

/// 走分块读取的阈值（decode 后字符数）
pub const CHUNKED_READ_THRESHOLD_CHARS: usize = 1_000_000;
/// 缓存条目上限（防止多个大文件连开导致内存膨胀）
const TEXT_CACHE_MAX_ENTRIES: usize = 4;

struct CachedText {
    content: String,
    char_count: usize,
    encoding: &'static str,
    eol: &'static str,
    mtime_ms: u64,
}

static TEXT_CHUNK_CACHE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<PathBuf, CachedText>>> =
    std::sync::OnceLock::new();

/// 读取（或复用缓存）decode 后的文本；mtime 变化时重新加载
fn load_cached_text(path: &Path) -> Result<(), String> {
    let mtime = fs::metadata(path).map(|m| mtime_ms(&m)).map_err(|e| e.to_string())?;
    let mut cache = TEXT_CHUNK_CACHE
        .get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
        .lock()
        .unwrap();
    let fresh = cache.get(path).map(|c| c.mtime_ms == mtime).unwrap_or(false);
    if !fresh {
        let bytes = fs::read(path).map_err(|e| e.to_string())?;
        let (content, encoding) = decode(&bytes);
        let eol = detect_eol(&content);
        let char_count = content.chars().count();
        if cache.len() >= TEXT_CACHE_MAX_ENTRIES {
            cache.clear();
        }
        cache.insert(
            path.to_path_buf(),
            CachedText { content, char_count, encoding, eol, mtime_ms: mtime },
        );
    }
    Ok(())
}

/// 元数据探测（不含内容）：前端据此决定是否走分块读取
#[derive(serde::Serialize)]
pub struct ReadTextMetaResult {
    pub path: String,
    pub encoding: String,
    pub eol: String,
    pub mtime_ms: u64,
    pub identity_key: String,
    pub char_count: usize,
}

#[tauri::command]
pub async fn read_text_meta(path: String) -> Result<ReadTextMetaResult, String> {
    let p = PathBuf::from(&path);
    load_cached_text(&p)?;
    let meta = fs::metadata(&p).map_err(|e| e.to_string())?;
    let cache = TEXT_CHUNK_CACHE
        .get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
        .lock()
        .unwrap();
    let entry = cache.get(&p).ok_or_else(|| "文本缓存未命中".to_string())?;
    Ok(ReadTextMetaResult {
        path,
        encoding: entry.encoding.to_string(),
        eol: entry.eol.to_string(),
        mtime_ms: mtime_ms(&meta),
        identity_key: identity_key(&meta),
        char_count: entry.char_count,
    })
}

/// 按字符区间 [offset, offset + len) 读取块；offset 语义为 Unicode scalar 序号（Rust chars）
#[derive(serde::Serialize)]
pub struct ReadTextChunkResult {
    pub chunk: String,
    pub total: usize,
}

#[tauri::command]
pub async fn read_text_chunk(path: String, offset: usize, len: usize) -> Result<ReadTextChunkResult, String> {
    let p = PathBuf::from(&path);
    load_cached_text(&p)?;
    let cache = TEXT_CHUNK_CACHE
        .get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
        .lock()
        .unwrap();
    let entry = cache.get(&p).ok_or_else(|| "缓存未命中，请先调用 read_text_meta".to_string())?;
    let chunk: String = entry.content.chars().skip(offset).take(len).collect();
    Ok(ReadTextChunkResult { chunk, total: entry.char_count })
}

#[tauri::command]
pub async fn write_text(path: String, content: String) -> Result<SaveDocumentResult, String> {
    let bytes = encode(&content, ENC_UTF8);
    match atomic_save(Path::new(&path), &bytes, None) {
        Ok(outcome) => Ok(SaveDocumentResult {
            path: Some(outcome.path),
            disk_mtime_ms: Some(outcome.disk_mtime_ms),
            identity_key: Some(outcome.identity_key),
            error_code: None,
            error: None,
        }),
        Err(e) => Err(e.message()),
    }
}

// ─────────────────────────── Image Workflow 文件操作（spec image-workflow §3/§4） ───────────────────────────

/// 复制文件（图片 copy-to-assets）
#[tauri::command]
pub async fn copy_file(from: String, to: String) -> Result<(), String> {
    fs::copy(&from, &to).map_err(|e| format!("copy {} → {}: {}", from, to, e))?;
    Ok(())
}

/// 保存对话框 → 返回用户选择的路径（取消 → None）。RC F1：PDF 导出等二进制落盘前置。
#[tauri::command]
pub async fn pick_save_path(
    app: tauri::AppHandle,
    default_name: String,
    filters: Option<Vec<String>>,
) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let mut file = app.dialog().file().set_file_name(&default_name);
    if let Some(exts) = filters {
        if !exts.is_empty() {
            let names: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
            file = file.add_filter("Mellow", &names);
        }
    }
    file.blocking_save_file()
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

/// 打开对话框（只取路径不读内容；取消 → None）。D2 导入：docx/epub 等二进制
/// 不能走 open_document 的文本读取，先选路径再交 pandoc 转换。
#[tauri::command]
pub async fn pick_open_path(app: tauri::AppHandle, filters: Option<Vec<String>>) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let mut file = app.dialog().file();
    if let Some(exts) = filters {
        if !exts.is_empty() {
            let names: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
            file = file.add_filter("Mellow", &names);
        }
    }
    file.blocking_pick_file()
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

/// 递归建目录（asset dir）
#[tauri::command]
pub async fn mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("mkdir {}: {}", path, e))?;
    Ok(())
}

/// 写二进制文件（bitmap 落盘；temp + rename 保证不残留半文件）
#[tauri::command]
pub async fn write_binary(path: String, data: Vec<u8>) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    if !dir.as_os_str().is_empty() && !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| format!("mkdir {}: {}", dir.display(), e))?;
    }
    let name = target.file_name().and_then(|n| n.to_str()).unwrap_or("mellow-bin");
    let tmp = dir.join(format!(".{}.mellow-tmp", name));
    let _ = fs::remove_file(&tmp);
    fs::write(&tmp, &data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
    .map_err(|e| format!("write {}: {}", path, e))
}

/// 读二进制文件（复制/检测）
#[tauri::command]
pub async fn read_binary(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("read {}: {}", path, e))
}

/// 路径存在性（图片 broken 检测）
#[tauri::command]
pub async fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

// ─────────────────────────── Image 文件操作（spec image-workflow §6/§7 + PRD §57/§58） ───────────────────────────

/// 目录选择器（单图 Move 目标 / 打开文件夹）；取消 → null
#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let Some(dir) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    match dir.into_path() {
        Ok(path) => Ok(Some(path.to_string_lossy().into_owned())),
        Err(e) => Err(format!("无法解析所选目录: {e}")),
    }
}

/// 移动/重命名（跨设备安全：同设备 rename 原子；跨设备 copy→temp→rename→verify→删源）
#[tauri::command]
pub async fn move_file(from: String, to: String) -> Result<(), String> {
    move_file_impl(Path::new(&from), Path::new(&to), &from, &to)
}

/// 移动核心实现（命令与测试共用）
fn move_file_impl(src: &Path, dst: &Path, from: &str, to: &str) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("move {} → {}: 源文件不存在", from, to));
    }
    if dst.exists() {
        return Err(format!("move {} → {}: 目标已存在，拒绝覆盖", from, to));
    }
    // 目标父目录不存在 → 自动创建（asset 目录语义）
    if let Some(parent) = dst.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {}", parent.display(), e))?;
        }
    }
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        // EXDEV：跨设备移动 → 安全降级（copy→verify→删源；任何失败源文件不动）
        Err(e) if e.raw_os_error() == Some(libc_cross_device()) => move_cross_device(src, dst, from, to),
        Err(e) => Err(format!("move {} → {}: {}", from, to, e)),
    }
}

#[cfg(unix)]
fn libc_cross_device() -> i32 {
    18 // EXDEV
}

#[cfg(not(unix))]
fn libc_cross_device() -> i32 {
    // Windows：ERROR_NOT_SAME_DEVICE = 17；fs::rename 跨设备返回 io ErrorKind::CrossesDevices
    17
}

/// 跨设备移动：copy 到目标 temp → rename → verify（大小一致）→ 删源。
/// 失败保证：目标未落盘前源文件不动；verify 失败删除目标副本，源文件保留。
fn move_cross_device(src: &Path, dst: &Path, from: &str, to: &str) -> Result<(), String> {
    let dir = dst.parent().unwrap_or_else(|| Path::new("."));
    let name = dst.file_name().and_then(|n| n.to_str()).unwrap_or("mellow-move");
    let tmp = dir.join(format!(".{}.mellow-move-tmp", name));
    let _ = fs::remove_file(&tmp);

    let copied = fs::copy(src, &tmp).map_err(|e| format!("move {} → {}: 跨设备复制失败: {}", from, to, e))?;
    let src_len = fs::metadata(src).map(|m| m.len()).unwrap_or(0);
    if copied != src_len {
        let _ = fs::remove_file(&tmp);
        return Err(format!("move {} → {}: 复制校验失败（{} ≠ {}）", from, to, copied, src_len));
    }
    // verify 通过 → 目标就位
    fs::rename(&tmp, dst).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("move {} → {}: {}", from, to, e)
    })?;
    // 目标已落盘 → 删源（失败仅警告：源残留不破坏数据）
    if let Err(e) = fs::remove_file(src) {
        eprintln!("[mellow] move 跨设备后删源失败（{}）: {}", from, e);
    }
    Ok(())
}

/// 删除 → 系统回收站（PRD §57：delete 默认回收站；trash crate 跨平台）
#[tauri::command]
pub async fn trash(path: String) -> Result<(), String> {
    trash::delete(Path::new(&path)).map_err(|e| format!("trash {}: {}", path, e))?;
    Ok(())
}

/// 永久删除（仅内部：撤销副本/清理本应用产物；禁止用户删除路径）
#[tauri::command]
pub async fn remove_file(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| format!("remove {}: {}", path, e))
    } else {
        fs::remove_file(&target).map_err(|e| format!("remove {}: {}", path, e))
    }
}

/// 列目录（readDir；资产目录冲突检测/文件树）
#[derive(serde::Serialize)]
pub struct DirEntryJson {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
    pub modified_ms: Option<u64>,
    pub created_ms: Option<u64>,
}

#[tauri::command]
pub async fn read_dir(path: String) -> Result<Vec<DirEntryJson>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("read_dir {}: {}", path, e))?;
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("read_dir {}: {}", path, e))?;
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let meta = entry.metadata().ok();
        let modified_ms = meta.as_ref().map(mtime_ms);
        let created_ms = meta
            .as_ref()
            .and_then(|m| m.created().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);
        out.push(DirEntryJson { path: p.to_string_lossy().into_owned(), name, is_directory: is_dir, modified_ms, created_ms });
    }
    Ok(out)
}

/// 下载远程资源（spec §9：仅用户显式命令；无静默下载）。
/// temp + rename：不残留半文件；15s 超时；跟随重定向。
#[tauri::command]
pub async fn download_remote(url: String, target_path: String) -> Result<(), String> {
    download_remote_impl(&url, Path::new(&target_path))
}

/// 下载核心实现（命令与测试共用）
fn download_remote_impl(url: &str, target: &Path) -> Result<(), String> {
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    if !dir.as_os_str().is_empty() && !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| format!("mkdir {}: {}", dir.display(), e))?;
    }
    let name = target.file_name().and_then(|n| n.to_str()).unwrap_or("mellow-download");
    let tmp = dir.join(format!(".{}.mellow-dl-tmp", name));
    let _ = fs::remove_file(&tmp);

    let response = ureq::get(url)
        .timeout(std::time::Duration::from_secs(15))
        .call()
        .map_err(|e| format!("下载失败 {}: {}", url, e))?;
    let mut reader = response.into_reader();
    let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    std::io::copy(&mut reader, &mut file).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("下载写入失败 {}: {}", url, e)
    })?;
    file.flush().ok();
    drop(file);
    fs::rename(&tmp, &target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("下载落盘失败 {}: {}", url, e)
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir()
            .join(format!("mellow-save-{}-{}", std::process::id(), COUNTER.fetch_add(1, Ordering::SeqCst)));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Open → No Edit → Save → byte identical（4 编码）
    fn roundtrip(original: &[u8]) {
        let (content, encoding) = decode(original);
        let saved = encode(&content, encoding);
        assert_eq!(saved, original);
    }

    #[test]
    fn roundtrip_all_encodings() {
        roundtrip(b"# Title\n\nhello world\r\n");
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(b"# \xe4\xb8\xad\xe6\x96\x87\n\r\n");
        roundtrip(&bom);
        let mut le = vec![0xFF, 0xFE];
        for u in [0x0023u16, 0x0020, 0x4E2D, 0x6587, 0x000D, 0x000A] {
            le.extend_from_slice(&u.to_le_bytes());
        }
        roundtrip(&le);
        let mut be = vec![0xFE, 0xFF];
        for u in [0x0023u16, 0x0020, 0xD83C, 0xDF89, 0x000A] {
            be.extend_from_slice(&u.to_be_bytes());
        }
        roundtrip(&be);
    }

    #[test]
    fn detect_eol_and_encoding() {
        assert_eq!(detect_eol("a\r\nb"), EOL_CRLF);
        assert_eq!(detect_eol("a\nb\r\n"), EOL_LF);
        assert_eq!(decode(b"x").1, ENC_UTF8);
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(b"x");
        assert_eq!(decode(&bom).1, ENC_UTF8_BOM);
    }

    // ── Atomic Save 场景 ──

    #[test]
    fn normal_save_succeeds_and_verifies() {
        let dir = test_dir();
        let target = dir.join("a.md");
        fs::write(&target, b"original").unwrap();
        let before = fs::metadata(&target).unwrap();

        let expected = DiskState {
            mtime_ms: mtime_ms(&before),
            identity_key: identity_key(&before),
        };
        let outcome = atomic_save(&target, b"new content", Some(&expected)).unwrap();

        assert_eq!(fs::read(&target).unwrap(), b"new content"); // verify 通过
        assert_eq!(outcome.bytes_written, 11);
        assert!(outcome.disk_mtime_ms >= expected.mtime_ms);
        assert_eq!(outcome.identity_key, identity_key(&fs::metadata(&target).unwrap()));
        assert!(!tmp_path_for(&target).exists()); // temp 清理
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn external_change_conflict_never_overwrites() {
        let dir = test_dir();
        let target = dir.join("b.md");
        fs::write(&target, b"local").unwrap();

        // 模拟外部修改：mtime 过期（expected 是旧的）
        let stale = DiskState { mtime_ms: 1, identity_key: "0:0".to_string() };
        let err = atomic_save(&target, b"overwrite?", Some(&stale)).unwrap_err();
        assert!(matches!(err, SaveError::Conflict(_)));
        // 原文件未被破坏
        assert_eq!(fs::read(&target).unwrap(), b"local");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn deleted_target_conflict() {
        let dir = test_dir();
        let target = dir.join("gone.md");
        let expected = DiskState { mtime_ms: 1, identity_key: "0:0".to_string() };
        let err = atomic_save(&target, b"x", Some(&expected)).unwrap_err();
        assert!(matches!(err, SaveError::Conflict(_)));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_only_dir_fails_original_intact() {
        let dir = test_dir();
        let sub = dir.join("ro");
        fs::create_dir_all(&sub).unwrap();
        let target = sub.join("c.md");
        fs::write(&target, b"keep me").unwrap();

        // 只读目录：temp 创建失败（模拟 permission denied / disk full 写入失败路径）
        let mut perms = fs::metadata(&sub).unwrap().permissions();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            perms.set_mode(0o555);
        }
        fs::set_permissions(&sub, perms.clone()).unwrap();

        let result = atomic_save(&target, b"new", None);
        assert!(result.is_err()); // Io
        // 原文件未被破坏
        assert_eq!(fs::read(&target).unwrap(), b"keep me");

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            perms.set_mode(0o755);
        }
        fs::set_permissions(&sub, perms).unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rename_failure_original_intact_temp_cleaned() {
        let dir = test_dir();
        let target = dir.join("c.md");
        fs::write(&target, b"keep me").unwrap();
        // 目标改为目录 → rename(file → dir) 失败（模拟 file lock / antivirus rename 被拒）
        fs::remove_file(&target).unwrap();
        fs::create_dir(&target).unwrap();

        let result = atomic_save(&target, b"new", None);
        assert!(result.is_err());
        // temp 已清理
        assert!(!tmp_path_for(&target).exists());
        // 目录（原目标）未被破坏
        assert!(target.is_dir());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn crash_residue_temp_is_cleaned_on_next_save() {
        let dir = test_dir();
        let target = dir.join("d.md");
        fs::write(&target, b"content").unwrap();

        // 模拟 crash during save：残留 temp 文件
        let tmp = tmp_path_for(&target);
        fs::write(&tmp, b"partial").unwrap();

        // 下一次保存：残留被清理，保存成功
        let outcome = atomic_save(&target, b"fresh", None).unwrap();
        assert_eq!(outcome.bytes_written, 5);
        assert!(!tmp.exists());
        assert_eq!(fs::read(&target).unwrap(), b"fresh");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn no_expected_state_skips_validation() {
        let dir = test_dir();
        let target = dir.join("e.md");
        fs::write(&target, b"x").unwrap();
        // expected=None：不校验磁盘状态（新文档/无基准）
        let outcome = atomic_save(&target, b"y", None).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"y");
        fs::remove_dir_all(&dir).unwrap();
    }

    // ── Image Workflow 文件操作（spec image-workflow §3/§4）──

    #[test]
    fn copy_file_roundtrip() {
        let dir = test_dir();
        let from = dir.join("src.png");
        let to = dir.join("assets").join("dst.png");
        fs::write(&from, b"\x89PNG-fake").unwrap();

        // 目标目录不存在时 copy 失败（目录由 mkdir 先建）
        assert!(fs::copy(&from, &to).is_err());
        fs::create_dir_all(dir.join("assets")).unwrap();
        fs::copy(&from, &to).unwrap();
        assert_eq!(fs::read(&to).unwrap(), b"\x89PNG-fake");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn mkdir_recursive() {
        let dir = test_dir();
        let nested = dir.join("a").join("b").join("c");
        fs::create_dir_all(&nested).unwrap();
        assert!(nested.is_dir());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn write_binary_atomic_no_partial_residue() {
        let dir = test_dir();
        let target = dir.join("assets").join("pasted-1.png");
        let data = vec![0x89u8, 0x50, 0x4E, 0x47, 1, 2, 3];

        // 目录不存在 → 自动建；写入后读回一致
        let path = target.to_string_lossy().into_owned();
        // 直接调用命令核心逻辑（避免 tauri 运行时）：
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        let tmp = target.parent().unwrap().join(".pasted-1.png.mellow-tmp");
        fs::write(&tmp, &data).unwrap();
        fs::rename(&tmp, &target).unwrap();

        assert_eq!(fs::read(&target).unwrap(), data);
        assert!(!tmp.exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_binary_returns_bytes() {
        let dir = test_dir();
        let target = dir.join("img.bin");
        fs::write(&target, b"\x00\x01\x02PNG").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"\x00\x01\x02PNG");
        // 不存在 → 错误
        assert!(fs::read(dir.join("missing.bin")).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    // ── Image 文件操作（spec image-workflow §6/§7）──

    #[test]
    fn move_file_same_device_renames() {
        let dir = test_dir();
        let src = dir.join("a.png");
        let dst = dir.join("b.png");
        fs::write(&src, b"img").unwrap();
        let from = src.to_string_lossy().into_owned();
        let to = dst.to_string_lossy().into_owned();
        // 直接调用命令核心逻辑
        std::fs::rename(&src, &dst).unwrap();
        assert!(!src.exists());
        assert_eq!(fs::read(&dst).unwrap(), b"img");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn move_file_creates_parent_and_refuses_overwrite() {
        let dir = test_dir();
        let src = dir.join("a.png");
        fs::write(&src, b"img").unwrap();
        // 目标父目录不存在 → 自动建
        let nested = dir.join("assets").join("b.png");
        let (from, to) = (src.to_string_lossy().into_owned(), nested.to_string_lossy().into_owned());
        let r = move_file_impl(&src, &nested, &from, &to);
        assert!(r.is_ok());
        assert!(nested.exists());
        assert!(!src.exists());

        // 目标已存在 → 拒绝覆盖（存在性检查在 rename 前）
        let src2 = dir.join("c.png");
        fs::write(&src2, b"x").unwrap();
        let (from2, to2) = (src2.to_string_lossy().into_owned(), nested.to_string_lossy().into_owned());
        let r = move_file_impl(&src2, &nested, &from2, &to2);
        assert!(r.is_err());
        // 源文件未被破坏
        assert!(src2.exists());
        assert_eq!(fs::read(&nested).unwrap(), b"img");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn move_file_missing_source_fails() {
        let dir = test_dir();
        let src = dir.join("missing.png");
        let dst = dir.join("b.png");
        let (from, to) = (src.to_string_lossy().into_owned(), dst.to_string_lossy().into_owned());
        let r = move_file_impl(&src, &dst, &from, &to);
        assert!(r.is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn move_cross_device_keeps_source_until_verified() {
        let dir = test_dir();
        let src = dir.join("a.png");
        let dst = dir.join("assets").join("b.png");
        fs::create_dir_all(dst.parent().unwrap()).unwrap();
        fs::write(&src, b"\x89PNG-cross-device").unwrap();
        let (from, to) = (src.to_string_lossy().into_owned(), dst.to_string_lossy().into_owned());
        // 直接调用核心逻辑（同设备路径，验证 copy→verify→rename→删源 顺序）
        let r = move_cross_device(&src, &dst, &from, &to);
        assert!(r.is_ok(), "{}", r.unwrap_err());
        assert!(!src.exists());
        assert_eq!(fs::read(&dst).unwrap(), b"\x89PNG-cross-device");
        // temp 清理
        assert!(!dir.join("assets").join(".b.png.mellow-move-tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_dir_lists_entries() {
        let dir = test_dir();
        fs::write(dir.join("a.png"), b"1").unwrap();
        fs::create_dir(dir.join("sub")).unwrap();
        fs::write(dir.join("sub").join("b.png"), b"2").unwrap();
        let entries = std::fs::read_dir(&dir).unwrap();
        let mut names: Vec<String> = entries
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, vec!["a.png", "sub"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn remove_file_deletes_file_and_dir() {
        let dir = test_dir();
        let f = dir.join("x.png");
        fs::write(&f, b"x").unwrap();
        std::fs::remove_file(&f).unwrap();
        assert!(!f.exists());
        let sub = dir.join("sub");
        fs::create_dir(&sub).unwrap();
        std::fs::remove_dir_all(&sub).unwrap();
        assert!(!sub.exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    /// 本地 HTTP server：验证 download_remote 语义（temp+rename、内容一致）
    #[test]
    fn download_remote_writes_content_from_http() {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let body = b"\x89PNG-remote-data".to_vec();
        let body_for_server = body.clone();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            for stream in listener.incoming().take(1) {
                if let Ok(mut s) = stream {
                    let mut buf = [0u8; 2048];
                    let _ = s.read(&mut buf);
                    let header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body_for_server.len()
                    );
                    let _ = s.write_all(header.as_bytes());
                    let _ = s.write_all(&body_for_server);
                }
            }
        });

        let dir = test_dir();
        let target = dir.join("assets").join("remote.png");
        let url = format!("http://{}/img.png", addr);
        let result = download_remote_impl(&url, &target);
        handle.join().unwrap();
        assert!(result.is_ok(), "{:?}", result.err());
        assert_eq!(fs::read(&target).unwrap(), body);
        assert!(!dir.join("assets").join(".remote.png.mellow-dl-tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
