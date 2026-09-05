//! Updater Safety —— signed update / verify package（安全 Auto Update 门禁）
//!
//! 覆盖（对应 docs/specs/auto-update-spec.md）：
//! 1. signed update：产物签名可用 minisign 语义校验（与 tauri-plugin-updater 同款
//!    `base64_decode → PublicKey::decode → verify` 流程）；
//! 2. verify package：篡改产物必须校验失败（拒绝安装）；
//! 3. 生产 pubkey（tauri.conf.json plugins.updater.pubkey）必须是合法 minisign 公钥；
//! 4. mock 更新服务器端到端：check（latest.json）→ download（产物）→ verify 签名。
//!
//! 测试密钥为 TEST-ONLY（tests/fixtures/updater/README.md），与生产 updater 密钥无关。

use minisign_verify::{PublicKey, Signature};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../tests/fixtures/updater")
        .join(name)
}

fn b64_decode(s: &str) -> String {
    let bytes = base64_std_decode(s.as_bytes());
    String::from_utf8(bytes).expect("base64 → utf8")
}

fn base64_std_decode(data: &[u8]) -> Vec<u8> {
    // 最小 base64 解码（无依赖；仅用于测试）
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0u32;
    for &c in data {
        if c == b'=' || c == b'\n' || c == b'\r' {
            continue;
        }
        let v = TABLE.iter().position(|&t| t == c).expect("invalid base64") as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    out
}

/// 与 tauri-plugin-updater `verify_signature` 相同的校验流程
fn verify_signature(data: &[u8], signature_b64: &str, pubkey_b64: &str) -> Result<(), String> {
    let pubkey = PublicKey::decode(&b64_decode(pubkey_b64)).map_err(|e| format!("pubkey: {e}"))?;
    let sig = Signature::decode(&b64_decode(signature_b64)).map_err(|e| format!("sig: {e}"))?;
    pubkey
        .verify(data, &sig, true)
        .map_err(|e| format!("verify: {e}"))
}

fn current_target() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return "darwin-aarch64";
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        return "darwin-x86_64";
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        return "windows-x86_64";
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        return "linux-x86_64";
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        return "linux-aarch64";
    }
    #[allow(unreachable_code)]
    {
        "unknown"
    }
}

// ─────────────────────────── 1. signed update：fixture 签名可校验 ───────────────────────────

#[test]
fn signed_update_fixture_verifies() {
    let artifact = std::fs::read(fixture("mock-update.bin")).unwrap();
    let sig = std::fs::read_to_string(fixture("mock-update.bin.sig")).unwrap();
    let pubkey = std::fs::read_to_string(fixture("test-pub.key")).unwrap();
    verify_signature(&artifact, sig.trim(), pubkey.trim()).expect("签名必须通过");
}

// ─────────────────────────── 2. verify package：篡改必须拒绝 ───────────────────────────

#[test]
fn tampered_package_is_rejected() {
    let mut artifact = std::fs::read(fixture("mock-update.bin")).unwrap();
    let sig = std::fs::read_to_string(fixture("mock-update.bin.sig")).unwrap();
    let pubkey = std::fs::read_to_string(fixture("test-pub.key")).unwrap();
    let n = artifact.len();
    artifact[0] ^= 0xFF;
    artifact[n / 2] ^= 0x01;
    artifact[n - 1] ^= 0xFF;
    assert!(
        verify_signature(&artifact, sig.trim(), pubkey.trim()).is_err(),
        "篡改产物必须校验失败（拒绝安装）"
    );
}

// ─────────────────────────── 3. 生产 pubkey 合法性 ───────────────────────────

#[test]
fn production_pubkey_is_valid_minisign_key() {
    let conf: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json"))
            .unwrap(),
    )
    .unwrap();
    let pubkey = conf["plugins"]["updater"]["pubkey"]
        .as_str()
        .expect("pubkey 缺失");
    let decoded = b64_decode(pubkey);
    PublicKey::decode(&decoded).expect("生产 pubkey 必须是合法 minisign 公钥");
}

// ─────────────────────────── 4. mock 更新服务器端到端 ───────────────────────────

/// 极简 HTTP 服务器：任何路径 → latest.json；/artifact → 产物
fn spawn_mock_server(
    artifact: Vec<u8>,
    sig: String,
    target: String,
) -> (u16, std::thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let handle = std::thread::spawn(move || {
        for stream in listener.incoming().take(2) {
            let Ok(mut s) = stream else { continue };
            let mut buf = [0u8; 4096];
            let _ = s.read(&mut buf);
            let req = String::from_utf8_lossy(&buf);
            let path = req.split_whitespace().nth(1).unwrap_or("/");
            if path == "/artifact" {
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    artifact.len()
                );
                let _ = s.write_all(header.as_bytes());
                let _ = s.write_all(&artifact);
            } else {
                let manifest = serde_json::json!({
                    "version": "99.0.0",
                    "notes": "mock update for updater safety test",
                    "pub_date": "2026-08-16T00:00:00Z",
                    "platforms": {
                        target.as_str(): {
                            "signature": sig,
                            "url": format!("http://127.0.0.1:{port}/artifact"),
                        }
                    }
                });
                let body = manifest.to_string();
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = s.write_all(header.as_bytes());
                let _ = s.write_all(body.as_bytes());
            }
        }
    });
    (port, handle)
}

fn http_get(url: &str) -> Result<Vec<u8>, String> {
    let url = url.replace("http://", "");
    let (host, path) = url.split_once('/').unwrap_or((url.as_str(), "/"));
    let addr = host.split(':').next().unwrap_or("127.0.0.1");
    let port: u16 = host
        .split(':')
        .nth(1)
        .and_then(|p| p.parse().ok())
        .unwrap_or(80);
    let mut s = std::net::TcpStream::connect((addr, port)).map_err(|e| e.to_string())?;
    let req = format!("GET /{path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n");
    s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut body = Vec::new();
    let mut buf = [0u8; 8192];
    let mut in_body = false;
    loop {
        let n = s.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&buf[..n]);
    }
    // 去掉 header（第一个 \r\n\r\n 之后）
    let text = String::from_utf8_lossy(&body);
    let idx = text.find("\r\n\r\n").map(|i| i + 4).unwrap_or(0);
    Ok(body[idx..].to_vec())
}

#[test]
fn mock_server_check_download_verify() {
    let artifact = std::fs::read(fixture("mock-update.bin")).unwrap();
    let sig = std::fs::read_to_string(fixture("mock-update.bin.sig")).unwrap();
    let pubkey = std::fs::read_to_string(fixture("test-pub.key")).unwrap();
    let target = current_target();

    let (port, handle) =
        spawn_mock_server(artifact.clone(), sig.trim().to_string(), target.to_string());

    // check：拉取 latest.json（endpoint 模板与生产一致）
    let endpoint =
        format!("http://127.0.0.1:{port}/{{{{target}}}}/{{{{arch}}}}/{{{{current_version}}}}");
    let manifest_raw = http_get(&endpoint).unwrap();
    let manifest: serde_json::Value = serde_json::from_slice(&manifest_raw).unwrap();
    assert_eq!(manifest["version"], "99.0.0");

    let platform = &manifest["platforms"][target];
    let url = platform["url"].as_str().unwrap();
    let remote_sig = platform["signature"].as_str().unwrap();

    // download：拉取产物
    let downloaded = http_get(url).unwrap();
    assert_eq!(downloaded, artifact);

    // verify package：签名校验通过（= 可安装）
    verify_signature(&downloaded, remote_sig, pubkey.trim()).expect("下载产物签名必须通过");

    // 篡改 → 拒绝
    let mut tampered = downloaded.clone();
    tampered[0] ^= 0x01;
    assert!(verify_signature(&tampered, remote_sig, pubkey.trim()).is_err());

    handle.join().unwrap();
}
