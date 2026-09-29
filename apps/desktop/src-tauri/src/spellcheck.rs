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

/// 该平台是否具备词典能力（宿主据此决定是否显示拼写区）
#[tauri::command]
pub fn spellcheck_available() -> bool {
    cfg!(target_os = "macos")
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
        fn suggest_returns_guesses_for_misspelling() {
            // 系统词典存在性依赖运行环境；只断言「不 panic 且返回 Vec」
            let _ = suggest("recieve");
        }
    }
}
