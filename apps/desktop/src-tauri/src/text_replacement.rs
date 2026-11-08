//! 系统文本替换词典（G7-MENU-05「文本替换」子菜单项）。
//!
//! 一手证据（Typora 1.14.9 本机只读核查，审计 §4.360「六」16）：Typora 原生桥
//! `word.getTextReplacement` 读的就是同一存储（其二进制含
//! `NSUserDictionaryReplacementItems` / `WebAutomaticTextReplacementEnabled` 字符串），
//! 数据在 `~/Library/Preferences/.GlobalPreferences.plist`：
//! - `NSUserDictionaryReplacementItems`：数组，元素 `{on, replace, with}`；
//! - `WebAutomaticTextReplacementEnabled`：开关，缺省按 true（WebKit/NSTextView 默认开）。
//!
//! 平台差异按 ADR-0016 只存在于本 Adapter：非 macOS → `available=false`、词典空、
//! enabled=false（菜单项本身在 schema 层 `macOnly` 隐藏，这里是第二道降级）。
//!
//! 与 Typora 的已登记差异（D 裁决）：Typora 的勾选态/生效态跟随 NSTextView 的
//! 系统开关（`WebAutomaticTextReplacementEnabled`），而 Mellow 的勾选态真值 =
//! 本地设置 `editor.textReplacement` —— 菜单勾选必须等于实际行为，才不会出现
//! 「显示勾着但系统关掉后不生效」的假状态。系统开关仅由纯函数
//! `parse_replacement_enabled` 保留（信息用途，未装配）。

use serde::Serialize;

#[derive(Serialize)]
pub struct ReplacementEntry {
    pub phrase: String,
    pub value: String,
}

/// 纯函数：从全局域 plist **字节**解析词典（只收 `on` 为真的条目）。
///
/// 抽成纯函数（同 `spellcheck_supported_on` 的理由）：解析语义必须在三平台 CI
/// 都能被测到，而不是锁在 `cfg(target_os = "macos")` 里。
///
/// ⚠️ 输入必须是**字节**而非 `&str`：macOS 的 `.GlobalPreferences.plist` 常态是
/// **二进制 plist**，`read_to_string` 会在首个非 UTF-8 字节上直接失败 ⇒ 词典恒空
/// （且失败是静默的，界面只会表现为「文本替换无效」）。`plist::Value::from_reader`
/// 会自动识别 XML / 二进制两种编码。
pub fn parse_replacement_entries(plist_bytes: &[u8]) -> Vec<ReplacementEntry> {
    let Ok(value) = plist::Value::from_reader(std::io::Cursor::new(plist_bytes)) else {
        return Vec::new();
    };
    let Some(items) = value
        .as_dictionary()
        .and_then(|d| d.get("NSUserDictionaryReplacementItems"))
        .and_then(|v| v.as_array())
    else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let dict = item.as_dictionary()?;
            let on = match dict.get("on") {
                Some(plist::Value::Boolean(b)) => *b,
                Some(plist::Value::Integer(i)) => i.as_signed().map_or(false, |n| n != 0),
                None => true, // 缺 on 字段：系统界面无法表达"存在但未启用"，保守视为启用
                _ => false,
            };
            if !on {
                return None;
            }
            let phrase = dict.get("replace")?.as_string()?.to_string();
            let value = dict.get("with")?.as_string()?.to_string();
            if phrase.is_empty() {
                return None;
            }
            Some(ReplacementEntry { phrase, value })
        })
        .collect()
}

/// 纯函数：从全局域 plist **字节**解析「文本替换」开关；键缺失按 true（WebKit 默认开）。
pub fn parse_replacement_enabled(plist_bytes: &[u8]) -> bool {
    let Ok(value) = plist::Value::from_reader(std::io::Cursor::new(plist_bytes)) else {
        return true; // 读不到偏好 ≠ 用户关掉了它；与 WebKit/NSTextView 缺省一致
    };
    match value
        .as_dictionary()
        .and_then(|d| d.get("WebAutomaticTextReplacementEnabled"))
    {
        Some(plist::Value::Boolean(b)) => *b,
        Some(plist::Value::Integer(i)) => i.as_signed().map_or(true, |n| n != 0),
        _ => true,
    }
}

/// 全局域偏好文件路径（`defaults` 的 kCFPreferencesAnyApplication 域）。
#[cfg(target_os = "macos")]
fn global_preferences_path() -> Option<std::path::PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        std::path::PathBuf::from(home)
            .join("Library/Preferences/.GlobalPreferences.plist"),
    )
}

/// 本平台是否具备系统文本替换能力（宿主据此决定是否显示菜单项 / 注入词典）。
#[tauri::command]
pub fn text_replacement_available() -> bool {
    cfg!(target_os = "macos")
}

/// 词典（仅 on 条目）；非 macOS / 读不到 → 空数组（不抛错）。
#[tauri::command]
pub fn text_replacement_entries() -> Vec<ReplacementEntry> {
    #[cfg(target_os = "macos")]
    {
        global_preferences_path()
            .and_then(|p| std::fs::read(p).ok())
            .map(|bytes| parse_replacement_entries(&bytes))
            .unwrap_or_default()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSUserDictionaryReplacementItems</key>
  <array>
    <dict><key>on</key><integer>1</integer><key>replace</key><string>jiu</string><key>with</key><string>九</string></dict>
    <dict><key>on</key><integer>0</integer><key>replace</key><string>off</string><key>with</key><string>X</string></dict>
    <dict><key>replace</key><string>nokey</string><key>with</key><string>N</string></dict>
    <dict><key>on</key><integer>1</integer><key>replace</key><string/></dict>
  </array>
  <key>WebAutomaticTextReplacementEnabled</key>
  <false/>
</dict>
</plist>"#;

    #[test]
    fn parses_only_enabled_nonempty_items() {
        let entries = parse_replacement_entries(SAMPLE.as_bytes());
        assert_eq!(entries.len(), 2, "on=0 与空 phrase 必须被过滤");
        assert_eq!(entries[0].phrase, "jiu");
        assert_eq!(entries[0].value, "九");
        assert_eq!(entries[1].phrase, "nokey", "缺 on 字段视为启用");
    }

    #[test]
    fn parses_switch_explicit_false_and_default_true() {
        assert!(!parse_replacement_enabled(SAMPLE.as_bytes()));
        let missing = SAMPLE.replace(
            "<key>WebAutomaticTextReplacementEnabled</key>\n  <false/>",
            "",
        );
        assert!(parse_replacement_enabled(missing.as_bytes()), "键缺失按 true（WebKit 默认）");
        assert!(parse_replacement_enabled(b"not a plist"), "解析失败按 true");
    }

    #[test]
    fn garbage_input_yields_empty_dict() {
        assert!(parse_replacement_entries(b"garbage").is_empty());
    }

    /// 回归：macOS 全局域偏好**常态是二进制 plist**，`read_to_string` 会静默失败
    /// ⇒ 词典恒空、文本替换像「没实现」。入口必须按**字节**读取。
    #[test]
    fn parses_binary_plist_bytes() {
        let xml = plist::Value::from_reader(std::io::Cursor::new(SAMPLE.as_bytes()))
            .expect("XML 夹具必须可解析");
        let mut binary = Vec::new();
        xml.to_writer_binary(&mut binary).expect("必须能写成二进制 plist");
        assert!(
            std::str::from_utf8(&binary).is_err(),
            "夹具必须是真正的二进制 plist（含非 UTF-8 字节），否则本测试不具区分力"
        );
        let entries = parse_replacement_entries(&binary);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].phrase, "jiu");
        assert!(!parse_replacement_enabled(&binary));
    }
}
