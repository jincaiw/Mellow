//! 系统拼写检查 / 用户词典（P0-EDITOR-005）。
//!
//! 平台差异按 ADR-0016 只允许存在于 Adapter / Native Enhancement：
//! - **macOS**：`NSSpellChecker`（系统词典 + 用户词典 learn / unlearn / 建议列表）；
//! - **Windows / Linux**：**未接入** → `spellcheck_available()` 返回 `false`，
//!   宿主据此**不显示**拼写区 —— 显示一个点了没反应的菜单项比不显示更糟
//!   （本项目「占位项可点击且点击无反应」母题）。
//!
//! 两个必须记住的语义：
//! 1. 系统拼写检查对**中日韩文字不提供建议**，故前端只应传拉丁词
//!    （引擎侧 `wordAt()` 已保证：非 `[A-Za-z][A-Za-z'-]*` 一律不返回）；
//! 2. 本模块的命令**不抛错**：不可用或无建议时返回空数组 / `false`，
//!    便于前端直接渲染，无需逐处 try/catch。

/// **纯函数**：给定「本平台是否 macOS」，是否具备词典能力。
///
/// 为什么要抽成纯函数（2026-10-01）：宿主用 `spellcheck_available()` 决定**是否显示拼写区** ——
/// 「显示一个点了没反应的项」比不显示更糟（本项目「占位项可点击且点击无反应」母题），
/// 故「非 macOS → false」是**用户可见行为**的依据，必须有断言守。
/// 而若把它直接写成 `cfg!(target_os = "macos")`，这条分支就**只能在非 macOS 上被测**：
/// macOS 单测全在 `cfg(target_os = "macos")` 里，于是**两端各自只有一半平台能验**
/// （本地 macOS 永远验不到 false 那一侧，ubuntu CI 永远验不到 true 那一侧）。
/// 抽成纯函数后，**两端都能在任意平台断言**。
const fn spellcheck_supported_on(is_macos: bool) -> bool {
    is_macos
}

/// 该平台是否具备词典能力（宿主据此决定是否显示拼写区）
#[tauri::command]
pub fn spellcheck_available() -> bool {
    spellcheck_supported_on(cfg!(target_os = "macos"))
}

/// 建议列表；不可用或无建议时返回**空数组**（不报错）
#[tauri::command]
pub fn spellcheck_suggest(word: String) -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        mac::suggest(&word)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = word;
        Vec::new()
    }
}

/// 加入用户词典；成功返回 true
#[tauri::command]
pub fn spellcheck_learn(word: String) -> bool {
    #[cfg(target_os = "macos")]
    {
        mac::learn(&word)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = word;
        false
    }
}

/// 从用户词典移除；成功返回 true
#[tauri::command]
pub fn spellcheck_unlearn(word: String) -> bool {
    #[cfg(target_os = "macos")]
    {
        mac::unlearn(&word)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = word;
        false
    }
}

/// 整篇检查拼写，返回**未命中词典的区间**（Typora 拼写子菜单「Check Document Now」）。
///
/// 返回的 `from` / `to` 是 **UTF-16 码元偏移**，与 JS 字符串 / CM6 位置**同一坐标系**，
/// 调用方可直接用作选区（**不要**在 Rust 侧换算成字节偏移 —— 那会把 CJK 之前的
/// 位置整体算错）。
#[derive(serde::Serialize)]
pub struct SpellIssue {
    pub from: usize,
    pub to: usize,
    pub word: String,
}

/// 上限：单次最多返回多少个问题（避免超大文档一次生成海量数据）
const MAX_ISSUES: usize = 500;

#[tauri::command]
pub fn spellcheck_check_document(text: String) -> Vec<SpellIssue> {
    #[cfg(target_os = "macos")]
    {
        mac::check_document(&text, MAX_ISSUES)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = text;
        Vec::new()
    }
}

/// 词是否已在用户词典中
#[tauri::command]
pub fn spellcheck_has_learned(word: String) -> bool {
    #[cfg(target_os = "macos")]
    {
        mac::has_learned(&word)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = word;
        false
    }
}

/// **平台判定契约**（2026-10-01）。
///
/// 立此测试的原因：`spellcheck_available()` 的返回值直接决定宿主**是否显示拼写区**
/// —— 而「非 macOS → false」这条分支此前**没有任何测试**：
/// macOS 单测全在 `cfg(target_os = "macos")` 里，ubuntu CI 只跑非 macOS 分支，
/// 于是**两端各自只有一半平台能验**（本地永远验不到 false，CI 永远验不到 true）。
/// 把判定抽成 `spellcheck_supported_on(is_macos)` 纯函数后，**两端都能在任意平台断言** ——
/// 这是「跨层字段两端必须同时锁」在**平台分支**上的形态。
#[cfg(test)]
mod platform_contract {
    use super::spellcheck_supported_on;

    #[test]
    fn non_macos_has_no_dictionary() {
        // 用户可见后果：宿主**不显示**拼写区（显示一个点了没反应的项比不显示更糟）
        assert!(
            !spellcheck_supported_on(false),
            "非 macOS 必须无词典能力 —— 否则宿主会显示点了没反应的拼写区"
        );
    }

    #[test]
    fn macos_has_dictionary() {
        assert!(spellcheck_supported_on(true), "macOS 必须具备词典能力（NSSpellChecker）");
    }

    #[test]
    fn available_matches_current_platform() {
        // 端到端一致性：`spellcheck_available()` 必须等于「本平台是否 macOS」。
        // 这条把纯函数与真实命令绑在一起 —— 否则两边可以各自漂移而纯函数测试仍全绿。
        assert_eq!(
            super::spellcheck_available(),
            cfg!(target_os = "macos"),
            "spellcheck_available() 必须与 cfg!(target_os = \"macos\") 一致"
        );
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSRange, NSString};

    /// 规范化：去首尾空白、转小写。词典与建议都按小写处理
    /// （`NSSpellChecker` 自身大小写不敏感，但用户词典的 `hasLearnedWord` 需要我们统一）。
    fn normalize(word: &str) -> String {
        word.trim().to_lowercase()
    }

    pub fn suggest(word: &str) -> Vec<String> {
        let w = normalize(word);
        if w.is_empty() {
            return Vec::new();
        }
        let checker = NSSpellChecker::sharedSpellChecker();
        let ns_word = NSString::from_str(&w);
        // 拉丁词：UTF-8 字节数 == UTF-16 长度，故 `len()` 可直接用作 NSRange 长度
        let range = NSRange::new(0, w.len());
        let guesses = checker.guessesForWordRange_inString_language_inSpellDocumentWithTag(
            range, &ns_word, None, 0,
        );
        match guesses {
            Some(arr) => arr.iter().map(|s| s.to_string()).collect(),
            None => Vec::new(),
        }
    }

    pub fn learn(word: &str) -> bool {
        let w = normalize(word);
        if w.is_empty() {
            return false;
        }
        let checker = NSSpellChecker::sharedSpellChecker();
        checker.learnWord(&NSString::from_str(&w));
        true
    }

    pub fn unlearn(word: &str) -> bool {
        let w = normalize(word);
        if w.is_empty() {
            return false;
        }
        let checker = NSSpellChecker::sharedSpellChecker();
        checker.unlearnWord(&NSString::from_str(&w));
        true
    }

    /// 整篇检查：反复调用 `checkSpellingOfString:startingAt:` 收集未命中区间。
    ///
    /// 该 API 每次返回**下一个**拼写错误的 NSRange；返回 `NSNotFound`（此处表现为
    /// 长度为 0）表示已到末尾。偏移全程按 **UTF-16 码元**，与 JS 侧一致。
    pub fn check_document(text: &str, max_issues: usize) -> Vec<super::SpellIssue> {
        if text.is_empty() {
            return Vec::new();
        }
        let checker = NSSpellChecker::sharedSpellChecker();
        let ns_text = NSString::from_str(text);
        let mut out: Vec<super::SpellIssue> = Vec::new();
        let mut offset: usize = 0;
        while out.len() < max_issues {
            // `starting_offset` 是 NSInteger（isize），而我们的 offset 是 usize
            let range = checker.checkSpellingOfString_startingAt(&ns_text, offset as isize);
            // 零长度 → 已到末尾（NSNotFound 亦表现为零长度）；同时防死循环
            if range.length == 0 {
                break;
            }
            let from = range.location;
            let to = range.location + range.length;
            // 逐字符构造词（按 UTF-16 取子串交给 NSString 处理，避免字节偏移错位）
            let sub = ns_text.substringWithRange(range);
            out.push(super::SpellIssue { from, to, word: sub.to_string() });
            offset = to;
        }
        out
    }

    pub fn has_learned(word: &str) -> bool {
        let w = normalize(word);
        if w.is_empty() {
            return false;
        }
        let checker = NSSpellChecker::sharedSpellChecker();
        checker.hasLearnedWord(&NSString::from_str(&w))
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn suggest_is_empty_for_empty_word() {
            assert!(suggest("").is_empty());
            assert!(suggest("   ").is_empty());
        }

        #[test]
        fn learn_then_has_learned_roundtrip() {
            // 用一个几乎不可能与真实词典冲突的伪词，避免污染用户词典的既有条目
            let w = "mellowzztestword";
            // 先清理：上一次运行若在中途崩溃，词典里可能残留该词 ——
            // 不做这一步，「前置断言」会因残留而 flaky（测试顺序无关性）。
            let _ = unlearn(w);
            assert!(!has_learned(w), "前置：清理后伪词不应在词典中");
            assert!(learn(w));
            assert!(has_learned(w), "learn 之后 has_learned 必须为真");
            assert!(unlearn(w));
            assert!(!has_learned(w), "unlearn 之后必须为假");
        }

        #[test]
        fn check_document_offsets_are_utf16_not_bytes() {
            // 前缀含 CJK：**若实现误用字节偏移，位置会整体偏移**
            //   UTF-16 码元：中(1) 文(1) 空格(1) → 伪词从 **3** 开始
            //   UTF-8 字节：中(3) 文(3) 空格(1) → 会是 7
            let text = "中文 mellowzzzqqq end";
            let issues = check_document(text, 100);
            assert!(!issues.is_empty(), "含明显非词时应至少报一处");
            assert_eq!(issues[0].from, 3, "偏移必须按 UTF-16 码元（3），不是字节（7）");
            assert_eq!(issues[0].word.to_lowercase(), "mellowzzzqqq");
        }

        #[test]
        fn check_document_is_empty_for_empty_text() {
            assert!(check_document("", 100).is_empty());
        }

        #[test]
        fn check_document_respects_max_issues() {
            // 上限必须生效（防超大文档一次生成海量数据）
            let text = "zzqqa zzqqb zzqqc zzqqd zzqqe";
            let issues = check_document(text, 2);
            assert!(issues.len() <= 2, "max_issues 必须生效，实际 {}", issues.len());
        }

        /// **真实系统词典**是否真的给出建议（P0-EDITOR-005 的关键一条）。
        ///
        /// ⚠️ 本测试此前是**恒真空壳**：原实现只写 `let _ = suggest("recieve");`
        /// —— 「不 panic 即通过」，**什么都没断言**。测试名声称 "returns guesses"，
        /// 而断言本体不检查任何东西 → 于是「真实 NSSpellChecker 的建议内容」
        /// **从未被任何机器验证过**（台账 P0-EDITOR-005 的 `runtime-verification-pending`
        /// 缺口有一半就在这里；另一半是应用侧 e2e，见
        /// `tests/e2e/spellcheck-suggestions-verify.mjs`）。
        /// 这与本仓反复出现的形态同源：**测试名与注释是「声称」，断言本体才是「守护」**。
        ///
        /// 本机实测（macOS 27.0 / arm64，2026-10-01 探针）：
        /// `suggest("recieve") == ["receive", "relieve"]`、`suggest("teh")[0] == "the"`、
        /// `suggest("mellowzzrecieve") == []`、`has_learned("recieve") == false`。
        /// 断言只锁**跨 macOS 版本稳定的部分**（正确拼写出现在建议里），
        /// 不锁条数与顺序 —— 那是系统词典的实现细节，锁死会变成「形状锁」。
        #[test]
        fn suggest_returns_guesses_for_misspelling() {
            let guesses = suggest("recieve");
            // ① **先自证「读到了东西」**：空输入上的断言恒真，故必须先断言非空。
            //    若这里失败，要区分两种原因（这正是它要区分的）：
            //    a) 系统词典缺失/被禁用（环境问题）；b) 该词曾被 learn 进用户词典。
            assert!(
                !guesses.is_empty(),
                "NSSpellChecker 未对经典拼写错误给出任何建议 —— \
                 若本机系统词典缺失/被禁用，或 'recieve' 曾被 learn 进用户词典，本断言会失败。\
                 实际返回：{guesses:?}"
            );
            // ② 建议里必须含**正确拼写**（这是「建议真的有用」的用户可见不变量）
            assert!(
                guesses.iter().any(|g| g.eq_ignore_ascii_case("receive")),
                "建议列表应包含正确拼写 receive，实际：{guesses:?}"
            );
            // ③ 建议不得**原样回吐输入** —— 那会让「建议」变成点了没反应的项
            assert!(
                !guesses.iter().any(|g| g.eq_ignore_ascii_case("recieve")),
                "建议列表不得包含原拼写本身，实际：{guesses:?}"
            );
            // ④ 规范化是**本模块自己的契约**（trim + 小写），与系统词典无关 → 可确定性断言
            assert_eq!(
                suggest("  RECIEVE  "),
                guesses,
                "suggest 必须对输入做 trim + 小写规范化（大小写/空白不应改变结果）"
            );
        }
    }
}
