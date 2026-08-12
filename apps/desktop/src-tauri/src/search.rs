use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use tauri::{AppHandle, Emitter};

const DEFAULT_IGNORE: [&str; 6] = [".git", "node_modules", "dist", "build", "target", "vendor"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub root: String,
    pub query: String,
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub regex: bool,
    pub include: Vec<String>,
    pub exclude: Vec<String>,
    pub context: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultJson {
    pub path: String,
    pub line: usize,
    pub column: usize,
    pub match_text: String,
    pub snippet: String,
    pub before: Vec<String>,
    pub after: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchEvent {
    pub search_id: String,
    pub event_type: String,
    pub result: Option<SearchResultJson>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn search_start(app: AppHandle, search_id: String, request: SearchRequest) -> Result<String, String> {
    if request.query.is_empty() {
        return Err("搜索关键词为空".to_string());
    }
    let id = search_id.clone();
    thread::spawn(move || {
        if let Err(e) = run_search(&app, &id, &request) {
            let _ = app.emit("mellow://search-result", SearchEvent { search_id: id.clone(), event_type: "error".into(), result: None, error: Some(e) });
        }
        let _ = app.emit("mellow://search-result", SearchEvent { search_id: id, event_type: "done".into(), result: None, error: None });
    });
    Ok(search_id)
}

#[tauri::command]
pub async fn search_cancel(_search_id: String) -> Result<(), String> {
    // 当前实现为短生命周期后台线程；取消由前端忽略旧 search_id，后续可接入 token。
    Ok(())
}

fn run_search(app: &AppHandle, search_id: &str, request: &SearchRequest) -> Result<(), String> {
    let pattern = if request.regex { request.query.clone() } else { regex::escape(&request.query) };
    let pattern = if request.whole_word { format!(r"\b(?:{})\b", pattern) } else { pattern };
    let re = RegexBuilder::new(&pattern)
        .case_insensitive(!request.case_sensitive)
        .unicode(true)
        .build()
        .map_err(|e| format!("regex: {}", e))?;
    let root = PathBuf::from(&request.root);
    visit_dir(&root, request, &mut |file| {
        if let Ok(content) = fs::read_to_string(file) {
            let lines: Vec<&str> = content.lines().collect();
            for (idx, line) in lines.iter().enumerate() {
                if let Some(m) = re.find(line) {
                    let before_start = idx.saturating_sub(request.context);
                    let before = lines[before_start..idx].iter().map(|s| (*s).to_string()).collect();
                    let after_end = usize::min(lines.len(), idx + 1 + request.context);
                    let after = lines[idx + 1..after_end].iter().map(|s| (*s).to_string()).collect();
                    let column = line[..m.start()].chars().count() + 1;
                    let result = SearchResultJson {
                        path: file.to_string_lossy().into_owned(),
                        line: idx + 1,
                        column,
                        match_text: m.as_str().to_string(),
                        snippet: line.trim().to_string(),
                        before,
                        after,
                    };
                    let _ = app.emit("mellow://search-result", SearchEvent { search_id: search_id.to_string(), event_type: "match".into(), result: Some(result), error: None });
                }
            }
        }
    })?;
    Ok(())
}

fn visit_dir<F: FnMut(&Path)>(dir: &Path, request: &SearchRequest, on_file: &mut F) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("read_dir {}: {}", dir.display(), e))?;
    for entry in entries {
        let entry = match entry { Ok(e) => e, Err(_) => continue };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if should_exclude(&path, &name, request) { continue; }
        if path.is_dir() {
            visit_dir(&path, request, on_file)?;
        } else if path.is_file() && should_include(&path, request) {
            on_file(&path);
        }
    }
    Ok(())
}

fn should_exclude(path: &Path, name: &str, request: &SearchRequest) -> bool {
    if DEFAULT_IGNORE.contains(&name) { return true; }
    let p = path.to_string_lossy().replace('\\', "/");
    request.exclude.iter().any(|g| glob_match(g, &p) || path.components().any(|c| c.as_os_str().to_string_lossy() == g.as_str()))
}

fn should_include(path: &Path, request: &SearchRequest) -> bool {
    if request.include.is_empty() { return true; }
    let p = path.to_string_lossy().replace('\\', "/");
    request.include.iter().any(|g| glob_match(g, &p))
}

fn glob_match(pattern: &str, value: &str) -> bool {
    let p = pattern.trim().replace('\\', "/");
    if p.is_empty() { return false; }
    wildcard_match(&p, value) || wildcard_match(&format!("**/{}", p), value)
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    fn inner(p: &[char], v: &[char]) -> bool {
        if p.is_empty() { return v.is_empty(); }
        if p[0] == '*' {
            return inner(&p[1..], v) || (!v.is_empty() && inner(p, &v[1..]));
        }
        if !v.is_empty() && (p[0] == '?' || p[0] == v[0]) {
            return inner(&p[1..], &v[1..]);
        }
        false
    }
    inner(&pattern.chars().collect::<Vec<_>>(), &value.chars().collect::<Vec<_>>())
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glob_supports_common_include_exclude() {
        assert!(glob_match("*.md", "/ws/a.md"));
        assert!(glob_match("docs/*.md", "/ws/docs/a.md"));
        assert!(!glob_match("*.md", "/ws/a.txt"));
    }

    #[test]
    fn large_workspace_visit_skips_default_ignored_dirs() {
        let root = std::env::temp_dir().join(format!("mellow-search-large-{}", now_ms()));
        fs::create_dir_all(root.join("docs")).unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
        fs::create_dir_all(root.join("target/debug")).unwrap();
        for i in 0..1200 {
            fs::write(root.join("docs").join(format!("file-{i}.md")), "needle\n").unwrap();
        }
        fs::write(root.join("node_modules/pkg/ignored.md"), "needle\n").unwrap();
        fs::write(root.join("target/debug/ignored.md"), "needle\n").unwrap();
        let request = SearchRequest {
            root: root.to_string_lossy().into_owned(),
            query: "needle".into(),
            case_sensitive: false,
            whole_word: false,
            regex: false,
            include: vec!["*.md".into()],
            exclude: vec![],
            context: 1,
        };
        let mut count = 0;
        visit_dir(&root, &request, &mut |_| count += 1).unwrap();
        assert_eq!(count, 1200);
        let _ = fs::remove_dir_all(root);
    }
}
