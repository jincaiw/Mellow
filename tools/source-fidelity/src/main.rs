//! Source Fidelity 校验工具 —— File Safety Gate。
//!
//! 对文本文件执行真实的「Open → No Edit → Save」原子保存管线
//! （与 `open_document` / `save_document` 完全相同的 decode / encode / atomic_save），
//! 并校验保存结果与原始字节完全一致（Source Fidelity，spec §3）。
//!
//! 用法：
//!   source_fidelity <input-file> <output-file>   单个文件
//!   source_fidelity --dir <in-dir> <out-dir>     目录递归（仅文本扩展名；in==out 支持原地保存）
//!
//! 退出码：0 = 全部字节一致；1 = 存在差异或失败；2 = 参数错误。

use mellow_desktop_lib::fs::{atomic_save, decode, encode};
use std::fs;
use std::path::{Path, PathBuf};

const TEXT_EXTS: &[&str] = &[
    "md", "markdown", "mdown", "mkd", "txt", "html", "htm", "tsv", "csv", "json", "yaml", "yml",
];

fn is_text(p: &Path) -> bool {
    match p.extension().and_then(|e| e.to_str()) {
        Some(e) => TEXT_EXTS.iter().any(|x| x.eq_ignore_ascii_case(e)),
        None => false,
    }
}

/// Open → No Edit → Save。返回 Err 表示字节不一致或 IO 失败。
fn roundtrip_file(input: &Path, output: &Path) -> Result<u64, String> {
    let bytes = fs::read(input).map_err(|e| format!("read {}: {e}", input.display()))?;
    let (content, encoding) = decode(&bytes); // Open（与 open_document 同一解码管线）
    let saved = encode(&content, encoding); // No Edit → Save（与 save_document 同一编码管线）
    atomic_save(output, &saved, None).map_err(|e| format!("save {}: {}", output.display(), e.message()))?;
    let on_disk = fs::read(output).map_err(|e| format!("verify {}: {e}", output.display()))?;
    if on_disk != bytes {
        return Err(format!(
            "BYTE DIFF: {} ({} bytes -> {})",
            input.display(),
            bytes.len(),
            on_disk.len()
        ));
    }
    Ok(bytes.len() as u64)
}

fn walk(
    root: &Path,
    dir: &Path,
    out_dir: &Path,
    total: &mut usize,
    ok: &mut usize,
    failed: &mut usize,
) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            let out = out_dir.join(p.strip_prefix(root).unwrap());
            let _ = fs::create_dir_all(&out);
            walk(root, &p, out_dir, total, ok, failed);
        } else if is_text(&p) {
            *total += 1;
            let out = out_dir.join(p.strip_prefix(root).unwrap());
            match roundtrip_file(&p, &out) {
                Ok(_) => *ok += 1,
                Err(e) => {
                    eprintln!("{e}");
                    *failed += 1;
                }
            }
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let code = match args.as_slice() {
        [_, flag, in_dir, out_dir] if flag == "--dir" => {
            let (in_dir, out_dir) = (PathBuf::from(in_dir), PathBuf::from(out_dir));
            let (mut total, mut ok, mut failed) = (0usize, 0usize, 0usize);
            let _ = fs::create_dir_all(&out_dir);
            walk(&in_dir, &in_dir, &out_dir, &mut total, &mut ok, &mut failed);
            eprintln!("[source-fidelity] total={total} identical={ok} diff/failed={failed}");
            if failed == 0 { 0 } else { 1 }
        }
        [_, in_file, out_file] => {
            match roundtrip_file(Path::new(in_file), Path::new(out_file)) {
                Ok(_) => {
                    println!("OK   {}", Path::new(in_file).display());
                    0
                }
                Err(e) => {
                    eprintln!("{e}");
                    1
                }
            }
        }
        _ => {
            eprintln!("usage: source_fidelity <in> <out> | source_fidelity --dir <in-dir> <out-dir>");
            2
        }
    };
    std::process::exit(code);
}
