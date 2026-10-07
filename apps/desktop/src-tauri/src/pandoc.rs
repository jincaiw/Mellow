//! Pandoc 导出/导入（PRD §75 P1 optional / deep-parity A9 Word / D2 导出格式扩展）。
//!
//! 不把 Pandoc 打进 Mellow 核心：检测 PATH 中的 pandoc，存在则用其导出
//! DOCX/ODT/RTF/EPUB/LaTeX/MediaWiki/reST/Textile/OPML，或导入为 Markdown。
//! 前端经 `export.*` 命令触发；本模块只负责检测与 spawn。
//!
//! 安全：format 经白名单校验（spawn 无 shell，注入面为零；白名单同时给出
//! 干净的错误信息与可测试性）。

use std::path::{Path, PathBuf};
use std::process::Command;

/// pandoc 候选可执行文件（**按优先级**，2026-10-07 审计 §4.127 新增）：
/// ① **显式路径**（设置 `export.pandocPath`，对齐 Typora 的同名偏好）；
/// ② PATH 中的 `pandoc`（**Typora 的默认行为**：`File.option.pandocPath || "pandoc"`）；
/// ③ **常见安装位置兜底**。
///
/// 【为什么必须有 ③】macOS 的 GUI 应用**不继承 shell 的 PATH** —— Finder/Dock 启动时
/// 进程 PATH 只有 `/usr/bin:/bin:/usr/sbin:/sbin`（实测本机 `launchctl getenv PATH` 为空），
/// 而 Homebrew 装在 `/opt/homebrew/bin` ⇒ **不兜底的话，用户明明装了 pandoc 却会被告知
/// 「需要安装 Pandoc 才能导出该格式」**（实测本机：`pandoc` 在 `/opt/homebrew/bin/pandoc`、
/// `/usr/bin/pandoc` 不存在）。
/// ⚠️ 该缺陷**在 dev 里测不出来**：`npm run desktop:dev` 从终端启动 ⇒ 继承 shell 的 PATH
/// （含 `/opt/homebrew/bin`）⇒ 能找到；**只有打包后从 Finder/Dock 启动才会暴露**。
pub fn pandoc_candidates(explicit: Option<&str>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(p) = explicit.map(str::trim).filter(|p| !p.is_empty()) {
        out.push(PathBuf::from(p));
    }
    out.push(PathBuf::from("pandoc")); // PATH 查找（Typora 默认）
    let mut well_known = vec![
        PathBuf::from("/opt/homebrew/bin/pandoc"), // macOS Apple Silicon（Homebrew）
        PathBuf::from("/usr/local/bin/pandoc"),    // macOS Intel / 手工安装
        PathBuf::from("/opt/local/bin/pandoc"),    // MacPorts
        PathBuf::from("/usr/bin/pandoc"),          // Linux 发行版
        PathBuf::from("/snap/bin/pandoc"),         // Linux snap
    ];
    if let Some(home) = std::env::var_os("HOME") {
        well_known.push(PathBuf::from(home).join(".local/bin/pandoc"));
    }
    if cfg!(windows) {
        // ⚠️ `C:\Program Files\Pandoc\pandoc.exe` **不是猜的**：Typora 的
        // `pandocPath` 文件选择器把 `defaultPath` 硬编码成它
        // （`Preferences.*.js`：`defaultPath: window.isWin ? "C:\\Program Files\\Pandoc\\pandoc.exe" : ""`）
        // ⇒ 这就是上游认定的 Windows 标准安装位置。
        for p in [
            r"C:\Program Files\Pandoc\pandoc.exe",
            r"C:\Program Files (x86)\Pandoc\pandoc.exe",
        ] {
            well_known.push(PathBuf::from(p));
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            well_known.push(PathBuf::from(local).join("Pandoc").join("pandoc.exe"));
        }
    }
    out.extend(well_known);
    out
}

/// 从候选里取**第一个**通过 `usable` 的；都不通过时**回落裸名 `pandoc`** ——
/// 让 spawn 报出**真实的 PATH 错误**，而不是把错误提前吞成一句「未安装」。
/// （抽成接受谓词的纯函数 ⇒ 单测不依赖本机是否装了 pandoc。）
pub fn resolve_from(candidates: &[PathBuf], usable: impl Fn(&PathBuf) -> bool) -> PathBuf {
    candidates
        .iter()
        .find(|c| usable(c))
        .cloned()
        .unwrap_or_else(|| PathBuf::from("pandoc"))
}

/// 实际要 spawn 的 pandoc 可执行文件。
pub fn resolve_pandoc(explicit: Option<&str>) -> PathBuf {
    resolve_from(&pandoc_candidates(explicit), |p| p.is_file())
}

/// 允许的 pandoc 导出格式（Typora 1.14.6 导出子菜单对齐；html 供无样式导出复用）
pub const ALLOWED_EXPORT_FORMATS: &[&str] = &[
    "docx",
    "odt",
    "rtf",
    "epub",
    "latex",
    "mediawiki",
    "rst",
    "textile",
    "opml",
    "html",
];

/// 允许的导入输入格式（pandoc -f 值；Typora File→Import 对齐）
pub const ALLOWED_IMPORT_FORMATS: &[&str] = &[
    "docx",
    "odt",
    "rtf",
    "epub",
    "html",
    "latex",
    "rst",
    "textile",
    "mediawiki",
    "opml",
];

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

/// pandoc 是否可用（**按候选顺序解析**，见 `pandoc_candidates`）
#[tauri::command]
pub fn pandoc_available(pandoc_path: Option<String>) -> bool {
    Command::new(resolve_pandoc(pandoc_path.as_deref()))
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// pandoc 导出：`pandoc -f markdown -t <format> <input> -o <output>`
#[tauri::command]
pub fn pandoc_export(
    input: String,
    output: String,
    format: Option<String>,
    pandoc_path: Option<String>,
) -> Result<(), String> {
    let fmt = format.unwrap_or_else(|| "docx".to_string());
    if !ALLOWED_EXPORT_FORMATS.contains(&fmt.as_str()) {
        return Err(format!("unsupported export format: {fmt}"));
    }
    let status = Command::new(resolve_pandoc(pandoc_path.as_deref()))
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
pub fn pandoc_import(
    input: String,
    output: String,
    format: Option<String>,
    pandoc_path: Option<String>,
) -> Result<(), String> {
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
    let status = Command::new(resolve_pandoc(pandoc_path.as_deref()))
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
        if !pandoc_available(None) {
            eprintln!("pandoc not installed — skipping");
            return;
        }
        let input = tmp("in.md");
        let output = tmp("out.docx");
        let _ = fs::remove_file(&input);
        let _ = fs::remove_file(&output);
        fs::write(
            &input,
            "# 中文标题\n\n段落 **bold** 与 `code`。\n\n| a | b |\n|---|---|\n| 1 | 2 |\n",
        )
        .unwrap();
        let input_s = input.to_string_lossy().to_string();
        let output_s = output.to_string_lossy().to_string();
        pandoc_export(input_s, output_s, None, None).expect("pandoc export should succeed");
        let meta = fs::metadata(&output).expect("docx should exist");
        assert!(meta.len() > 100, "docx should be non-trivial");
        let _ = fs::remove_file(&input);
        let _ = fs::remove_file(&output);
    }

    /// ⚠️ 本测试此前是**恒真空壳**（2026-10-01 修复）：函数体只有 `let _ = pandoc_available();`
    /// —— 「不 panic 即通过」，**断言本体不检查任何东西**；而注释还声称
    /// 「存在性由真实 CI 验证」——**该说法不成立**：`runtime-qualification.yml` 的 Linux runner
    /// 确实 `apt install pandoc`，但那个 job 只跑**定向**的 `file_safety_corpus` 用例、**不跑 lib 单测**；
    /// `ci.yml` 的 rust-check（ubuntu）根本不装 pandoc。
    /// 故「装了 pandoc 必须返回可用」**没有任何机器在守**（核实于 2026-10-01）。
    /// 后果形态：`pandoc_available()` 若被改成常量，导出功能会**假死**（装了 pandoc 却显示不可用），
    /// 而全部测试仍绿 —— 这正是本项目「占位项可点击且点击无反应」母题的同型。
    ///
    /// 修法：断言**与独立探针一致** —— 环境无关（两边都反映同一台机器），
    /// 但能抓住「实现被改成常量 / 写错机制」这一类。
    /// **残留边界（如实声明）**：仍未断言「装了 pandoc 的环境里必须为 true」——
    /// 那需要把本测试接进装了 pandoc 的 job（当前 `runtime-qualification` 只跑定向用例）。
    ///
    /// ⚠️ **2026-10-07（审计 §4.127）语义已变，`==` 断言作废**：`pandoc_available` 现在走
    /// 「显式路径 → PATH → 常见安装位置」三级解析，它**有意**比裸 PATH 探针**更宽**。
    /// 实测（本机）：把 PATH 限制成 `/usr/bin:/bin`（= macOS **GUI 应用**的 PATH）后，
    /// 裸探针 `false` 而本函数 `true` —— **那正是本修复的目的**，而旧的 `assert_eq!` 会把它判成失败。
    /// ⇒ 改为断言两个**不得回归**的方向（详见下）。
    #[test]
    fn pandoc_availability_detection() {
        // 独立探针（与实现同机制，但**独立写一遍**）：只看 PATH
        let probe = std::process::Command::new("pandoc")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        // 独立探针②：常见安装位置**再写一遍字面量**（不引用 `pandoc_candidates`，
        // 否则候选表被清空时本断言会跟着一起失效）
        let well_known = [
            "/opt/homebrew/bin/pandoc",
            "/usr/local/bin/pandoc",
            "/opt/local/bin/pandoc",
            "/usr/bin/pandoc",
        ]
        .iter()
        .map(std::path::PathBuf::from)
        .find(|p| p.is_file());

        // 方向①：PATH 探针能找到 ⇒ 本函数**必须**也能找到（不得漏报）
        if probe {
            assert!(
                pandoc_available(None),
                "裸 PATH 探针能找到 pandoc，pandoc_available(None) 却报不可用 —— 回归"
            );
        }
        // 方向②：pandoc 确实装在常见位置 ⇒ 本函数**必须**报可用
        //   （这条就是「macOS GUI 应用不继承 shell PATH」那个缺陷的**回归锁**；
        //    在没装 pandoc 的机器上它是**真空**的，故另有
        //    `resolve_pandoc_prefers_a_usable_fallback_over_a_missing_path_entry` 用合成夹具无条件锁定）
        if let Some(p) = &well_known {
            assert!(
                pandoc_available(None),
                "pandoc 实际存在于 {}，pandoc_available(None) 却报不可用 —— GUI 场景回归",
                p.display()
            );
        }
        // 方向③：报可用必须**有理由**（不许假阳性）。理由只能是「PATH 有」或「常见位置有」，
        //   因为此处 explicit=None。若都不成立却报 true，说明解析逻辑引入了未知来源。
        if !probe && well_known.is_none() {
            assert!(
                !pandoc_available(None),
                "PATH 与常见安装位置都没有 pandoc，pandoc_available(None) 却报可用 —— 假阳性"
            );
        }
    }

    #[test]
    fn export_format_allowlist() {
        // 白名单内格式放行（无 pandoc 环境下 spawn 失败 ≠ 格式拒绝）
        for fmt in ALLOWED_EXPORT_FORMATS {
            let r = pandoc_export(
                "/nonexistent.md".into(),
                "/tmp/x.out".into(),
                Some(fmt.to_string()),
                None,
            );
            if pandoc_available(None) {
                // pandoc 存在：输入文件不存在 → spawn 报错，但不是格式拒绝
                assert!(r.is_err());
                assert!(!r.unwrap_err().contains("unsupported"));
            } else {
                assert!(r.unwrap_err().contains("pandoc spawn failed"));
            }
        }
        // 白名单外格式直接拒绝（不触发 spawn）
        for bad in ["sh", "doc", "rm -rf", ""] {
            let r = pandoc_export(
                "/nonexistent.md".into(),
                "/tmp/x.out".into(),
                Some(bad.to_string()),
                None,
            );
            assert!(
                r.unwrap_err().contains("unsupported export format"),
                "bad={bad}"
            );
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
        let r = pandoc_import("/tmp/a.docx".into(), "/tmp/a.md".into(), Some("exe".into()), None);
        assert!(r.unwrap_err().contains("unsupported import format"));
        // 无法推断扩展名：报推断错误
        let r = pandoc_import("/tmp/a.xyz".into(), "/tmp/a.md".into(), None, None);
        assert!(r.unwrap_err().contains("cannot infer"));
        // 可推断格式：通过校验进入 spawn（无 pandoc 时报 spawn 失败，非格式错误）
        let r = pandoc_import("/tmp/a.docx".into(), "/tmp/a.md".into(), None, None);
        if pandoc_available(None) {
            assert!(r.is_err() && !r.unwrap_err().contains("unsupported"));
        } else {
            assert!(r.unwrap_err().contains("pandoc spawn failed"));
        }
    }

    #[test]
    fn pandoc_import_html_to_markdown_roundtrip() {
        if !pandoc_available(None) {
            eprintln!("pandoc not installed — skipping");
            return;
        }
        let input = tmp("in.html");
        let output = tmp("out.md");
        let _ = fs::remove_file(&input);
        let _ = fs::remove_file(&output);
        fs::write(
            &input,
            "<h1>标题</h1>\n<p>段落 <strong>加粗</strong>。</p>\n",
        )
        .unwrap();
        pandoc_import(
            input.to_string_lossy().into_owned(),
            output.to_string_lossy().into_owned(),
            None,
            None,
        )
        .expect("pandoc import should succeed");
        let md = fs::read_to_string(&output).expect("imported md should exist");
        assert!(md.contains("标题"), "md content: {md}");
        let _ = fs::remove_file(&input);
        let _ = fs::remove_file(&output);
    }

    // ── pandoc 可执行文件的**解析顺序**（2026-10-07，审计 §4.127）────────────────
    // 立此组的原因（**实测，本机**）：pandoc 装在 `/opt/homebrew/bin/pandoc`，而 macOS 的
    // **GUI 应用不继承 shell 的 PATH**（Finder/Dock 启动时 `launchctl getenv PATH` 为空、
    // 系统默认 PATH `/usr/bin:/bin:/usr/sbin:/sbin` 里没有 pandoc）⇒
    // 旧实现 `Command::new("pandoc")` 会**找不到**，用户被告知「需要安装 Pandoc」——
    // **而 pandoc 明明装了**。
    // ⚠️ 该缺陷**在 dev 里测不出来**：`npm run desktop:dev` 从终端启动 ⇒ 继承 shell 的 PATH
    //（含 `/opt/homebrew/bin`）⇒ 能找到；**只有打包后从 Finder/Dock 启动才会暴露**。
    #[test]
    fn candidates_put_explicit_path_first() {
        let c = pandoc_candidates(Some("/custom/bin/pandoc"));
        assert_eq!(c[0], PathBuf::from("/custom/bin/pandoc"), "显式路径必须最优先");
    }

    #[test]
    fn candidates_ignore_blank_explicit_path() {
        for blank in ["", "   "] {
            let c = pandoc_candidates(Some(blank));
            assert_eq!(
                c[0],
                PathBuf::from("pandoc"),
                "空白显式路径必须被忽略（回落到 PATH 查找 = Typora 的默认行为）"
            );
        }
    }

    #[test]
    fn candidates_include_well_known_install_locations() {
        let c = pandoc_candidates(None);
        for p in [
            "/opt/homebrew/bin/pandoc",
            "/usr/local/bin/pandoc",
            "/usr/bin/pandoc",
        ] {
            assert!(
                c.contains(&PathBuf::from(p)),
                "候选必须含 {p} —— GUI 应用的 PATH 里没有它（这正是本组测试存在的理由）"
            );
        }
        if cfg!(windows) {
            assert!(
                c.iter().any(|p| p.ends_with("Pandoc/pandoc.exe")),
                "Windows 需含 LOCALAPPDATA 下的 pandoc.exe"
            );
            // 与 Typora 的 `pandocPath` 选择器 `defaultPath` 对齐（见 `pandoc_candidates` 注释）
            assert!(
                c.contains(&PathBuf::from(r"C:\Program Files\Pandoc\pandoc.exe")),
                "Windows 需含 Typora 认定的标准安装位置 C:\\Program Files\\Pandoc\\pandoc.exe"
            );
        }
    }

    #[test]
    fn resolve_from_picks_first_usable() {
        let cands = vec![
            PathBuf::from("/a"),
            PathBuf::from("/b"),
            PathBuf::from("/c"),
        ];
        let picked = resolve_from(&cands, |p| p.to_string_lossy() == "/b");
        assert_eq!(picked, PathBuf::from("/b"));
    }

    /// **本修复的机制锁**（环境无关）：当**裸名 `pandoc` 不可用**（= GUI 应用的 PATH 里没有它）
    /// 而某个**常见安装位置可用**时，解析必须落到后者。
    /// 这条用**合成谓词**表达「PATH 查找失败」，因此在不装 pandoc 的机器上**也非真空**。
    #[test]
    fn resolve_pandoc_prefers_a_usable_fallback_over_a_missing_path_entry() {
        let cands = pandoc_candidates(None);
        // 谓词模拟：裸名（PATH 查找）失败，只有 `/opt/homebrew/bin/pandoc` 存在
        let picked = resolve_from(&cands, |p| p == Path::new("/opt/homebrew/bin/pandoc"));
        assert_eq!(
            picked,
            PathBuf::from("/opt/homebrew/bin/pandoc"),
            "PATH 查找失败时必须回落到常见安装位置 —— 否则 GUI 应用里「装了 pandoc 却提示需要安装」"
        );
        // 负样本：若连常见位置都不可用，必须回落**裸名**（让 spawn 报出真实的 PATH 错误，
        // 而不是把错误提前吞成一句「未安装」）
        assert_eq!(
            resolve_from(&cands, |_| false),
            PathBuf::from("pandoc"),
            "全部候选都不可用时必须回落裸名"
        );
    }

    #[test]
    fn resolve_from_falls_back_to_bare_name() {
        // 都不通过 ⇒ 回落**裸名** —— 让 spawn 报出真实的 PATH 错误，
        // 而不是把错误提前吞成一句「未安装」（那会误导用户去重装）
        assert_eq!(
            resolve_from(&[PathBuf::from("/a")], |_| false),
            PathBuf::from("pandoc")
        );
    }

    #[test]
    fn resolve_pandoc_finds_a_real_file_when_one_exists() {
        // 用临时目录里的假 pandoc 验证「存在即可用」——**不依赖本机是否装了 pandoc**
        let dir = tmp("resolve-bin");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("pandoc");
        fs::write(&fake, "#!/bin/sh\n").unwrap();
        assert_eq!(
            resolve_pandoc(Some(fake.to_string_lossy().as_ref())),
            fake
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
