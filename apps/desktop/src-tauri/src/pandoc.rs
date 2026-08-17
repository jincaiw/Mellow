//! Pandoc 导出（PRD §75 P1 optional / deep-parity A9 Word 导出）。
//!
//! 不把 Pandoc 打进 Mellow 核心：检测 PATH 中的 pandoc，存在则用其导出 DOCX/EPUB/LaTeX 等。
//! 前端经 `export.docx` 命令触发；本模块只负责检测与 spawn。

use std::process::Command;

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
}
