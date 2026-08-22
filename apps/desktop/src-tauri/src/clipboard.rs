//! 系统剪贴板图片写入（Typora「拷贝图片」parity，D3）。
//!
//! arboard 跨平台（macOS NSPasteboard / Windows Win32 / Linux wl-clipboard）；
//! 解码用 image crate（PNG/JPEG/GIF/BMP/WebP → RGBA8）。
//! 远程 http(s) src 由前端先行下载（fs::download_remote）再走本命令，
//! 或直接提示不支持——本命令只接受本地文件路径。

use arboard::{Clipboard, ImageData};

/// 读取本地图片文件并写入系统剪贴板（位图，可粘贴到聊天/文档应用）。
/// 错误：文件不存在 / 非 image 可识别格式 / 剪贴板被占用（返回字符串给前端 toast）。
#[tauri::command]
pub fn copy_image_to_clipboard(path: String) -> Result<(), String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read image failed: {e}"))?;
    let img = image::load_from_memory(&bytes).map_err(|e| format!("decode image failed: {e}"))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    let data = ImageData {
        width: width as usize,
        height: height as usize,
        bytes: rgba.into_raw().into(),
    };
    let mut clipboard = Clipboard::new().map_err(|e| format!("open clipboard failed: {e}"))?;
    clipboard.set_image(data).map_err(|e| format!("write clipboard failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 1×1 红色 PNG（最小合法 PNG，base64 展开）
    const TINY_PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
        0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
        0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08,
        0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
        0xB0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    #[test]
    fn rejects_missing_file() {
        let r = copy_image_to_clipboard("/nonexistent/mellow-clipboard-test.png".into());
        assert!(r.unwrap_err().contains("read image failed"));
    }

    #[test]
    fn rejects_non_image_file() {
        let mut p = std::env::temp_dir();
        p.push("mellow-clipboard-test.txt");
        std::fs::write(&p, "not an image").unwrap();
        let r = copy_image_to_clipboard(p.to_string_lossy().into_owned());
        // 解码失败（文本不是图片）；剪贴板打开失败时错误信息不同——两者都算拒绝
        let err = r.unwrap_err();
        assert!(err.contains("decode image failed") || err.contains("open clipboard failed"));
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn decodes_tiny_png() {
        // 无头 CI 环境剪贴板可能不可用：解码成功 + 剪贴板尽力而为均视为通过
        let mut p = std::env::temp_dir();
        p.push("mellow-clipboard-test-tiny.png");
        std::fs::write(&p, TINY_PNG).unwrap();
        let r = copy_image_to_clipboard(p.to_string_lossy().into_owned());
        match r {
            Ok(()) => {}
            Err(e) => assert!(e.contains("clipboard"), "unexpected error: {e}"),
        }
        let _ = std::fs::remove_file(&p);
    }
}
