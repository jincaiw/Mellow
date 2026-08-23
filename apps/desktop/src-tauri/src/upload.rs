/**
 * upload —— 图片上传服务（B5 / PRD §55）。
 *
 * 三通道：
 * - picgo-http：PicGo.app / PicList / PicGo-Core server 模式。
 *   POST <http_url> multipart 字段 `list[]`（多文件多 part）；
 *   响应 `{"success":true,"result":[url...]}`（与输入等长）。
 * - picgo-cli：PicGo-Core 命令行。`picgo upload "f1" "f2"` 参数形式，
 *   stdout 过滤出 http(s):// 行（跳过 `[PicGo ...]` 日志）。
 * - custom-command：Typora 兼容契约。stdin 传绝对路径（UTF-8，每行一个）
 *   → stdout URL（每行一个，与输入等长）。
 *
 * 密钥策略（PRD §55）：上传凭据归各 adapter 自管（PicGo 配置文件等），
 * 宿主不经手、不存储；未来 keychain 化时走 KeychainService。
 *
 * 安全：命令仅经用户显式配置执行；文件路径注入 shell 前做引号包裹；
 * 上传端点不限制 localhost（PicGo server 可远程部署，Typora 同）。
 */

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

/// 上传图片（tauri command；阻塞 IO 短时执行，同 fs::download_remote 模式）
#[tauri::command]
pub async fn upload_images(
    files: Vec<String>,
    service: String,
    http_url: String,
    command: String,
) -> Result<Vec<String>, String> {
    upload_images_impl(&files, &service, &http_url, &command)
}

/// 上传核心实现（命令与测试共用）
pub fn upload_images_impl(
    files: &[String],
    service: &str,
    http_url: &str,
    command: &str,
) -> Result<Vec<String>, String> {
    if files.is_empty() {
        return Ok(Vec::new());
    }
    match service {
        "picgo-http" => upload_via_http(files, http_url),
        "picgo-cli" => upload_via_picgo_cli(files),
        "custom-command" => upload_via_custom_command(files, command),
        other => Err(format!("未知上传通道: {}（可选 picgo-http / picgo-cli / custom-command）", other)),
    }
}

// ─────────────────────────── picgo-http ───────────────────────────

/// 扩展名 → MIME（multipart Content-Type；未知扩展名按二进制流）
fn mime_for(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

/// multipart body 构造（PicGo server 契约：字段名 `list[]`，每文件一个 part）
fn build_multipart(files: &[String], boundary: &str) -> Result<Vec<u8>, String> {
    let mut body: Vec<u8> = Vec::new();
    for f in files {
        let name = Path::new(f)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("image");
        let data = std::fs::read(f).map_err(|e| format!("读取图片失败 {}: {}", f, e))?;
        let header = format!(
            "--{}\r\nContent-Disposition: form-data; name=\"list[]\"; filename=\"{}\"\r\nContent-Type: {}\r\n\r\n",
            boundary,
            name.replace('"', ""),
            mime_for(f),
        );
        body.extend_from_slice(header.as_bytes());
        body.extend_from_slice(&data);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());
    Ok(body)
}

fn upload_via_http(files: &[String], http_url: &str) -> Result<Vec<String>, String> {
    if http_url.trim().is_empty() {
        return Err("上传端点为空（设置 → 图像 → 上传服务地址）".into());
    }
    let boundary = format!("----mellow-upload-{}", std::process::id());
    let body = build_multipart(files, &boundary)?;
    let response = ureq::post(http_url)
        .timeout(Duration::from_secs(60))
        .set(
            "Content-Type",
            &format!("multipart/form-data; boundary={}", boundary),
        )
        .send_bytes(&body)
        .map_err(|e| format!("上传请求失败 {}: {}", http_url, e))?;
    let status = response.status();
    let text = response
        .into_string()
        .map_err(|e| format!("读取上传响应失败: {}", e))?;
    if status != 200 {
        return Err(format!("上传服务返回 HTTP {}: {}", status, text));
    }
    parse_picgo_response(&text, files.len())
}

/// PicGo server 响应解析：`{"success":true,"result":[url...]}`
pub fn parse_picgo_response(text: &str, expected: usize) -> Result<Vec<String>, String> {
    let v: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("上传响应不是合法 JSON: {}", e))?;
    let success = v.get("success").and_then(|s| s.as_bool()).unwrap_or(false);
    if !success {
        let msg = v
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("(无错误信息)");
        return Err(format!("上传服务返回失败: {}", msg));
    }
    let result = v
        .get("result")
        .and_then(|r| r.as_array())
        .ok_or_else(|| "上传响应缺少 result 数组".to_string())?;
    let urls: Vec<String> = result
        .iter()
        .filter_map(|u| u.as_str().map(String::from))
        .collect();
    if urls.len() != expected {
        return Err(format!(
            "上传服务返回 URL 数量不匹配: {} != {}",
            urls.len(),
            expected
        ));
    }
    Ok(urls)
}

// ─────────────────────────── CLI 通道（picgo-cli / custom-command） ───────────────────────────

/// 跨平台 shell 执行（macOS/Linux: sh -c；Windows: cmd /C）
fn run_shell(command: &str, stdin_data: Option<&str>) -> Result<(String, String, i32), String> {
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(command);
        c
    } else {
        let mut c = Command::new("sh");
        c.arg("-c").arg(command);
        c
    };
    cmd.stdin(if stdin_data.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    })
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动上传命令失败「{}」: {}", command, e))?;
    if let Some(data) = stdin_data {
        if let Some(mut stdin) = child.stdin.take() {
            // EPIPE = 命令提前退出未消费 stdin（echo 类命令 / 鉴权失败早退）：
            // 不视为致命错误，交由退出码/输出数量判定报告真实原因。
            if stdin.write_all(data.as_bytes()).is_err() {
                drop(stdin); // 关闭管道，避免子进程滞留等待输入
            }
        }
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("等待上传命令结束失败: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    Ok((stdout, stderr, output.status.code().unwrap_or(-1)))
}

/// 双引号包裹（路径含空格；转义反斜杠与引号防 shell 注入）
fn shell_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// PicGo-Core CLI：`picgo upload "f1" "f2"` 参数形式；stdout URL 行过滤
fn upload_via_picgo_cli(files: &[String]) -> Result<Vec<String>, String> {
    let mut cmdline = String::from("picgo upload");
    for f in files {
        cmdline.push(' ');
        cmdline.push_str(&shell_quote(f));
    }
    let (stdout, stderr, code) = run_shell(&cmdline, None)?;
    if code != 0 {
        return Err(format!(
            "picgo 命令退出码 {}: {}",
            code,
            stderr.trim().is_empty().then(|| stdout.trim().to_string()).unwrap_or(stderr.trim().to_string())
        ));
    }
    parse_picgo_cli_stdout(&stdout, files.len())
}

/// PicGo-Core stdout 解析：收集 http(s):// 开头行（跳过 `[PicGo ...]` 日志）
pub fn parse_picgo_cli_stdout(stdout: &str, expected: usize) -> Result<Vec<String>, String> {
    let urls: Vec<String> = stdout
        .lines()
        .map(str::trim)
        .filter(|l| l.starts_with("http://") || l.starts_with("https://"))
        .map(String::from)
        .collect();
    if urls.len() != expected {
        return Err(format!(
            "picgo 输出 URL 数量不匹配: {} != {}（stdout: {}）",
            urls.len(),
            expected,
            stdout.trim()
        ));
    }
    Ok(urls)
}

/// 自定义命令（Typora 兼容契约）：stdin 路径每行一个 → stdout URL 每行一个
fn upload_via_custom_command(files: &[String], command: &str) -> Result<Vec<String>, String> {
    if command.trim().is_empty() {
        return Err("上传命令为空（设置 → 图像 → 自定义上传命令）".into());
    }
    let stdin_data = format!("{}\n", files.join("\n"));
    let (stdout, stderr, code) = run_shell(command, Some(&stdin_data))?;
    if code != 0 {
        return Err(format!(
            "上传命令退出码 {}: {}",
            code,
            if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() }
        ));
    }
    let urls: Vec<String> = stdout
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();
    if urls.len() != files.len() {
        return Err(format!(
            "上传命令输出 URL 数量不匹配: {} != {}（期望每行一个 URL，stdout: {}）",
            urls.len(),
            files.len(),
            stdout.trim()
        ));
    }
    Ok(urls)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── 响应解析（纯函数） ──

    #[test]
    fn parse_picgo_response_ok() {
        let text = r#"{"success":true,"result":["https://cdn.test/a.png","https://cdn.test/b.png"]}"#;
        assert_eq!(
            parse_picgo_response(text, 2).unwrap(),
            vec!["https://cdn.test/a.png", "https://cdn.test/b.png"]
        );
    }

    #[test]
    fn parse_picgo_response_failure() {
        let text = r#"{"success":false,"message":"token invalid"}"#;
        let err = parse_picgo_response(text, 1).unwrap_err();
        assert!(err.contains("token invalid"), "{}", err);
    }

    #[test]
    fn parse_picgo_response_count_mismatch() {
        let text = r#"{"success":true,"result":["https://cdn.test/a.png"]}"#;
        assert!(parse_picgo_response(text, 2).is_err());
    }

    #[test]
    fn parse_picgo_cli_stdout_filters_log_lines() {
        let stdout = "[PicGo INFO]: uploading...\n[PicGo WARNING]: config\nhttps://cdn.test/a.png\nhttps://cdn.test/b.png\n";
        assert_eq!(parse_picgo_cli_stdout(stdout, 2).unwrap().len(), 2);
    }

    // ── multipart 构造 ──

    #[test]
    fn build_multipart_contains_parts_and_boundary() {
        let dir = std::env::temp_dir().join(format!("mellow-upload-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("img.png");
        std::fs::write(&file, b"PNGDATA").unwrap();
        let files = vec![file.to_string_lossy().into_owned()];
        let body = build_multipart(&files, "BOUNDARY").unwrap();
        let s = String::from_utf8_lossy(&body);
        assert!(s.contains("--BOUNDARY\r\n"));
        assert!(s.contains("name=\"list[]\""));
        assert!(s.contains("filename=\"img.png\""));
        assert!(s.contains("Content-Type: image/png"));
        assert!(s.ends_with("--BOUNDARY--\r\n"));
        assert!(s.contains("PNGDATA"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── custom-command 契约（stdin/stdout；Unix sh） ──

    #[cfg(unix)]
    #[test]
    fn custom_command_reads_stdin_and_outputs_urls() {
        let urls = upload_via_custom_command(
            &["/tmp/a.png".to_string(), "/tmp/b.png".to_string()],
            "sed 's|^|https://cdn.test/|'",
        )
        .unwrap();
        assert_eq!(urls, vec!["https://cdn.test//tmp/a.png", "https://cdn.test//tmp/b.png"]);
    }

    #[cfg(unix)]
    #[test]
    fn custom_command_count_mismatch_reports_error() {
        // echo 不读 stdin 即退出（EPIPE 竞态）：容忍后仍应按输出数量判定报告
        let err = upload_via_custom_command(
            &["/tmp/a.png".to_string(), "/tmp/b.png".to_string()],
            "echo https://cdn.test/one.png",
        )
        .unwrap_err();
        assert!(err.contains("数量不匹配"), "{}", err);
    }

    #[cfg(unix)]
    #[test]
    fn custom_command_early_exit_reports_real_error() {
        // 命令早退不消费 stdin（如鉴权失败）：应透出退出码与 stderr 真实原因，
        // 而非「写入 stdin 失败: Broken pipe」
        let err = upload_via_custom_command(
            &["/tmp/a.png".to_string()],
            "echo 'token invalid' >&2; exit 1",
        )
        .unwrap_err();
        assert!(err.contains("退出码 1"), "{}", err);
        assert!(err.contains("token invalid"), "{}", err);
    }

    // ── picgo-http 全链路（本地 mock server，参照 fs::download_remote 测试先例） ──

    #[test]
    fn upload_via_http_roundtrip() {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let dir = std::env::temp_dir().join(format!("mellow-upload-http-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("img.png");
        std::fs::write(&file, b"PNGHTTPDATA").unwrap();

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 8192];
            let mut n = 0usize;
            // 读到请求头 + body（Content-Length 边界内）
            let mut raw = Vec::new();
            loop {
                let k = stream.read(&mut buf).unwrap();
                if k == 0 { break; }
                raw.extend_from_slice(&buf[..k]);
                n += k;
                let s = String::from_utf8_lossy(&raw);
                if let Some(h) = s.find("\r\n\r\n") {
                    let len: usize = s[..h]
                        .lines()
                        .find(|l| l.to_ascii_lowercase().starts_with("content-length:"))
                        .and_then(|l| l.split(':').nth(1))
                        .and_then(|v| v.trim().parse().ok())
                        .unwrap_or(0);
                    if raw.len() >= h + 4 + len { break; }
                }
            }
            let request = String::from_utf8_lossy(&raw).into_owned();
            let response = r#"{"success":true,"result":["https://cdn.test/uploaded.png"]}"#;
            let http = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.len(),
                response
            );
            stream.write_all(http.as_bytes()).unwrap();
            request
        });

        let url = format!("http://127.0.0.1:{}/upload", port);
        let files = vec![file.to_string_lossy().into_owned()];
        let urls = upload_via_http(&files, &url).unwrap();
        assert_eq!(urls, vec!["https://cdn.test/uploaded.png"]);

        let request = server.join().unwrap();
        assert!(request.starts_with("POST /upload HTTP/1.1"), "{}", request);
        assert!(request.contains("multipart/form-data; boundary=----mellow-upload-"), "{}", request);
        assert!(request.contains("name=\"list[]\""), "{}", request);
        assert!(request.contains("filename=\"img.png\""), "{}", request);
        assert!(request.contains("PNGHTTPDATA"), "{}", request);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
