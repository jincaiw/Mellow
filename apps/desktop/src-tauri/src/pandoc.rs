//! Pandoc 导出/导入（PRD §75 P1 optional / deep-parity A9 Word / D2 导出格式扩展）。
//!
//! 不把 Pandoc 打进 Mellow 核心：检测 PATH 中的 pandoc，存在则用其导出
//! DOCX/ODT/RTF/EPUB/LaTeX/MediaWiki/reST/Textile/OPML，或导入为 Markdown。
//! 前端经 `export.*` 命令触发；本模块只负责检测与 spawn。
//!
//! 安全：format 经白名单校验（spawn 无 shell，注入面为零；白名单同时给出
//! 干净的错误信息与可测试性）。

use std::path::Path;
use std::process::Command;

/// 允许的 pandoc 导出格式（Typora 1.14.6 导出子菜单对齐；html 供无样式导出复用）
pub const ALLOWED_EXPORT_FORMATS: &[&str] = &[
    "docx", "odt", "rtf", "epub", "latex", "mediawiki", "rst", "textile", "opml", "html",
];

/// 允许的导入输入格式（pandoc -f 值；Typora File→Import 对齐）
pub const ALLOWED_IMPORT_FORMATS: &[&str] =
    &["docx", "odt", "rtf", "epub", "html", "latex", "rst", "textile", "mediawiki", "opml"];

/// 扩展名 → pandoc 输入格式（导入时按所选文件推断）
fn import_format_from_ext(path: &str) -> Option<&'static str> {
    let ext = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "docx" => Some("docx"),
        "odt" => Some("odt"),
        "rtf" => Some("rtf"),
        "epub" => Some("epub"),
        "html" | "htm" => Some("html"),
        "tex" | "latex" => Some("latex"),
        "rst" => Some("rst"),
        "textile" => Some("textile"),
        "wiki" | "mediawiki" => Some("mediawiki"),
        "opml" => Some("opml"),
        _ => None,
    }
}

/// pandoc 是否可用（PATH 检测）
#[tauri::command]
pub fn pandoc_available() -> bool {
    Command::new("pandoc")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// pandoc 导出：`pandoc -f markdown -t <format> <input> -o <output>`
#[tauri::command]
pub fn pandoc_export(input: String, output: String, format: Option<String>) -> Result<(), String> {
    let fmt = format.unwrap_or_else(|| "docx".to_string());
    if !ALLOWED_EXPORT_FORMATS.contains(&fmt.as_str()) {
        return Err(format!("unsupported export format: {fmt}"));
    }
    let status = Command::new("pandoc")
        .args(["-f", "markdown", "-t", &fmt, "-o", &output, &input])
        .status()
        .map_err(|e| format!("pandoc spawn failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("pandoc exited with {status}"))
    }
}

/// pandoc 导入：`pandoc -f <format> -t markdown <input> -o <output.md>`
/// format 缺省时按输入扩展名推断；输出应为 .md（调用方负责选路径）。
#[tauri::command]
pub fn pandoc_import(input: String, output: String, format: Option<String>) -> Result<(), String> {
    let fmt = match format {
        Some(f) => {
            if !ALLOWED_IMPORT_FORMATS.contains(&f.as_str()) {
                return Err(format!("unsupported import format: {f}"));
            }
            f
        }
        None => import_format_from_ext(&input)
            .ok_or_else(|| format!("cannot infer import format from: {input}"))?
            .to_string(),
    };
    let status = Command::new("pandoc")
        .args(["-f", &fmt, "-t", "markdown", "-o", &output, &input])
        .status()
        .map_err(|e| format!("pandoc spawn failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("pandoc exited with {status}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("mellow-pandoc-test-{}", name));
        p
    }

    #[test]
    fn pandoc_export_docx_roundtrip() {
        // 无 pandoc 环境跳过（CI 可装 pandoc 验证真实路径）
        if !pandoc_available() {
            eprintln!("pandoc not installed — skipping");
            return;
        }
        let input = tmp("in.md");
        let output = tmp("out.docx");
        let _ = fs::remove_file(&input);
        let _ = fs::remove_file(&output);
        fs::write(&input, "# 中文标题\n\n段落 **bold** 与 `code`。\n\n| a | b |\n|---|---|\n| 1 | 2 |\n").unwrap();
        let input_s = input.to_string_lossy().to_string();
        let output_s = output.to_string_lossy().to_string();
        pandoc_export(input_s, output_s, None).expect("pandoc export should succeed");
        let meta = fs::metadata(&output).expect("docx should exist");
        assert!(meta.len() > 100, "docx should be non-trivial");
        let _ = fs::remove_file(&input);
        let _ = fs::remove_file(&output);
    }

    #[test]
    fn pandoc_availability_detection() {
        // 无论是否安装都不崩溃；存在性由真实 CI 验证
        let _ = pandoc_available();
    }

    #[test]
    fn export_format_allowlist() {
        // 白名单内格式放行（无 pandoc 环境下 spawn 失败 ≠ 格式拒绝）
        for fmt in ALLOWED_EXPORT_FORMATS {
            let r = pandoc_export("/nonexistent.md".into(), "/tmp/x.out".into(), Some(fmt.to_string()));
            if pandoc_available() {
                // pandoc 存在：输入文件不存在 → spawn 报错，但不是格式拒绝
                assert!(r.is_err());
                assert!(!r.unwrap_err().contains("unsupported"));
            } else {
                assert!(r.unwrap_err().contains("pandoc spawn failed"));
            }
        }
        // 白名单外格式直接拒绝（不触发 spawn）
        for bad in ["sh", "doc", "rm -rf", ""] {
            let r = pandoc_export("/nonexistent.md".into(), "/tmp/x.out".into(), Some(bad.to_string()));
            assert!(r.unwrap_err().contains("unsupported export format"), "bad={bad}");
        }
    }

    #[test]
    fn import_format_inference() {
        assert_eq!(import_format_from_ext("/tmp/a.docx"), Some("docx"));
        assert_eq!(import_format_from_ext("/tmp/a.HTM"), Some("html"));
        assert_eq!(import_format_from_ext("/tmp/a.tex"), Some("latex"));
        assert_eq!(import_format_from_ext("/tmp/a.opml"), Some("opml"));
        assert_eq!(import_format_from_ext("/tmp/a.md"), None);
        assert_eq!(import_format_from_ext("/tmp/noext"), None);
    }

    #[test]
    fn import_rejects_unknown_format_and_infers() {
        // 显式未知格式：直接拒绝
        let r = pandoc_import("/tmp/a.docx".into(), "/tmp/a.md".into(), Some("exe".into()));
        assert!(r.unwrap_err().contains("unsupported import format"));
        // 无法推断扩展名：报推断错误
        let r = pandoc_import("/tmp/a.xyz".into(), "/tmp/a.md".into(), None);
        assert!(r.unwrap_err().contains("cannot infer"));
        // 可推断格式：通过校验进入 spawn（无 pandoc 时报 spawn 失败，非格式错误）
        let r = pandoc_import("/tmp/a.docx".into(), "/tmp/a.md".into(), None);
        if pandoc_available() {
            assert!(r.is_err() && !r.unwrap_err().contains("unsupported"));
        } else {
            assert!(r.unwrap_err().contains("pandoc spawn failed"));
        }
    }

    #[test]
    fn pandoc_import_html_to_markdown_roundtrip() {
        if !pandoc_available() {
            eprintln!("pandoc not installed — skipping");
            return;
        }
        let input = tmp("in.html");
        let output = tmp("out.md");
        let _ = fs::remove_file(&input);
        let _ = fs::remove_file(&output);
        fs::write(&input, "<h1>标题</h1>\n<p>段落 <strong>加粗</strong>。</p>\n").unwrap();
        pandoc_import(
            input.to_string_lossy().into_owned(),
            output.to_string_lossy().into_owned(),
            None,
        )
        .expect("pandoc import should succeed");
        let md = fs::read_to_string(&output).expect("imported md should exist");
        assert!(md.contains("标题"), "md content: {md}");
        let _ = fs::remove_file(&input);
        let _ = fs::remove_file(&output);
    }
}
