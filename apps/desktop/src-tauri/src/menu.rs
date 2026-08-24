//! Native Menu Bar（spec §13，PRD §23 / 附录 J）——三平台统一菜单。
//!
//! 架构约束（PRD §113.4）：菜单只负责“发出命令 id”，所有执行统一走前端
//! CommandRegistry（`mellow-menu-command` 事件 → dispatchCommand(id, 'menu')）。
//! 菜单项 id 与前端注册命令 id 一一对应；菜单本身不含任何业务逻辑。
//!
//! B2 菜单结构补全（对照 Typora 1.14.6 菜单树基准
//! `tests/benchmark/fixtures/typora-menu-dump.txt`）：
//! - 应用菜单：设置 ⌘, / 检查更新 / 服务 / 隐藏其他 / 显示全部；
//! - 文件：打开最近文件（动态子菜单，`set_recent_files` 重建）/ 全部关闭 /
//!   保存全部 / 从磁盘重新加载 / 导出子菜单；
//! - 编辑：复制为 Markdown ⇧⌘C / 粘贴为纯文本 ⇧⌘V / 查找子菜单（⌘G/⇧⌘G）；
//! - 段落：⌘0-6 全加速键 / 提升降低标题 / 警告框 5 类 / 任务状态 / 脚注 /
//!   水平分割线 / TOC / YAML；
//! - 格式：删除线 ⌃⇧`；
//! - 显示（原视图）：工具栏 / 全局搜索 ⇧⌘F / 保持窗口在最前端；
//! - 主题：6 内置主题 + 打开用户 CSS + 跟随系统；
//! - 窗口：独立菜单（最小化 / 缩放 / 标签页切换）。
//!
//! 平台差异：macOS 额外安装 Mellow 应用菜单（About/Settings/Services/Hide）；
//! Windows/Linux 安装 文件/编辑/段落/格式/显示/主题/窗口/帮助。
//!
//! 本地化：菜单标签属于系统 chrome（Adapter 层），由本模块目录维护 zh/en 两套，
//! 前端 locale 切换时经 `set_menu_locale` 命令触发重建；核心 UI i18n 仍以
//! packages/i18n 为单一真源（本目录仅覆盖原生菜单标签）。

use std::sync::Mutex;

use tauri::menu::{AboutMetadata, CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};

/// 当前菜单 locale（默认 zh-CN，PRD §87）
pub struct MenuLocale(pub Mutex<String>);

/// 最近文件列表（前端 recentFiles → `set_recent_files` → 「打开最近文件」子菜单）
pub struct RecentFiles(pub Mutex<Vec<String>>);

/// 拼写检查选中态（前端 spellcheck 偏好 → `set_spellcheck_state` → 「拼写和语法」CheckMenuItem）
pub struct SpellcheckState(pub Mutex<bool>);

/// 智能标点选中态（master-plan R2-1：前端偏好 → set_smart_punct_state → 「替换」CheckMenuItem）
pub struct SmartPunctState(pub Mutex<bool>);

/// 主题选中态（前端 themeSettings/activeTheme → `set_theme_selection` → 主题菜单 radio；
/// B2-5/B3-2：Typora 主题菜单选中态 parity）
pub struct ThemeSelection(pub Mutex<ThemeSelectionState>);

#[derive(Clone, Default)]
pub struct ThemeSelectionState {
    /// light | dark | system（themeSettings.mode）
    pub mode: String,
    /// 当前生效主题 id（system 模式下为亮/暗解析后的 id）
    pub active_theme_id: String,
}

/// 菜单标签目录：(key, zh, en)
static MENU_LABELS: &[(&str, &str, &str)] = &[
    // ── 应用菜单 ──
    ("menu.mellow", "Mellow", "Mellow"),
    ("menu.about", "关于 Mellow", "About Mellow"),
    ("menu.settings", "设置…", "Settings…"),
    ("menu.checkUpdate", "检查更新…", "Check for Updates…"),
    ("menu.services", "服务", "Services"),
    ("menu.hide", "隐藏 Mellow", "Hide Mellow"),
    ("menu.hideOthers", "隐藏其他", "Hide Others"),
    ("menu.showAll", "显示全部", "Show All"),
    ("menu.quit", "退出 Mellow", "Quit Mellow"),
    // ── 文件 ──
    ("menu.file", "文件", "File"),
    ("file.newTab", "新建标签页", "New Tab"),
    ("file.open", "打开…", "Open…"),
    ("file.recent", "打开最近文件", "Open Recent"),
    ("file.recentReopen", "重新打开关闭的文件", "Reopen Closed File"),
    ("file.recentClear", "清除最近文件", "Clear Recent Files"),
    ("quickOpen.open", "Quick Open", "Quick Open"),
    ("workspace.openFolder", "打开文件夹…", "Open Folder…"),
    ("file.info", "文件信息…", "File Info…"),
    ("file.reveal", "打开文件位置", "Reveal in Finder"),
    ("file.moveTo", "移到…", "Move to…"),
    ("file.trash", "删除", "Delete"),
    ("file.openSnapshotsFolder", "打开快照文件夹…", "Open Snapshots Folder…"),
    ("tabs.close", "关闭", "Close"),
    ("file.closeAll", "全部关闭", "Close All"),
    ("file.save", "保存", "Save"),
    ("file.saveAs", "另存为…", "Save As…"),
    ("file.saveAll", "保存全部打开的文件…", "Save All Open Files…"),
    ("file.reloadFromDisk", "从磁盘重新加载", "Reload from Disk"),
    ("file.import", "导入…", "Import…"),
    ("menu.export", "导出", "Export"),
    ("export.pdf", "PDF…", "PDF…"),
    ("export.html", "HTML…", "HTML…"),
    ("export.htmlPlain", "HTML (无样式)", "HTML (without styles)"),
    ("export.docx", "Word (.docx)…", "Word (.docx)…"),
    ("export.odt", "OpenOffice (.odt)…", "OpenOffice (.odt)…"),
    ("export.rtf", "RTF…", "RTF…"),
    ("export.epub", "Epub…", "Epub…"),
    ("export.latex", "LaTeX…", "LaTeX…"),
    ("export.mediawiki", "Media Wiki…", "Media Wiki…"),
    ("export.rst", "reStructuredText…", "reStructuredText…"),
    ("export.textile", "Textile…", "Textile…"),
    ("export.opml", "OPML…", "OPML…"),
    ("export.repeat", "使用上一次设置导出", "Export with Last Settings"),
    ("export.image", "图片 (PNG/JPEG)…", "Image (PNG/JPEG)…"),
    ("file.print", "打印…", "Print…"),
    // ── 编辑 ──
    ("menu.edit", "编辑", "Edit"),
    ("menu.undo", "撤销", "Undo"),
    ("menu.redo", "重做", "Redo"),
    ("menu.cut", "剪切", "Cut"),
    ("menu.copy", "拷贝", "Copy"),
    ("menu.paste", "粘贴", "Paste"),
    ("menu.selectAll", "全选", "Select All"),
    ("edit.copyMarkdown", "复制为 Markdown", "Copy as Markdown"),
    ("edit.pastePlain", "粘贴为纯文本", "Paste as Plain Text"),
    ("edit.copyPlain", "复制为纯文本", "Copy as Plain Text"),
    ("edit.copyHtmlSource", "复制为 HTML 代码", "Copy as HTML Code"),
    ("edit.copyImage", "拷贝图片", "Copy Image"),
    ("edit.deleteLine", "删除行", "Delete Line"),
    ("edit.selectMenu", "选择", "Select"),
    ("edit.selectLine", "选择行", "Select Line"),
    ("edit.selectParagraph", "选择段落或块", "Select Paragraph or Block"),
    ("edit.selectWord", "选中当前词", "Select Word"),
    ("edit.selectFormatSpan", "选中当前格式文本", "Select Format Span"),
    ("edit.gotoDocStart", "跳转到文首", "Go to Document Start"),
    ("edit.gotoDocEnd", "跳转到文末", "Go to Document End"),
    ("edit.gotoSelection", "跳转到所选内容", "Go to Selection"),
    ("edit.gotoLineStart", "跳转到行首", "Go to Line Start"),
    ("edit.gotoLineEnd", "跳转到行尾", "Go to Line End"),
    ("edit.deleteRangeMenu", "删除范围", "Delete Range"),
    ("edit.deleteParagraph", "删除块", "Delete Block"),
    ("edit.deleteFormatSpan", "删除当前格式文本", "Delete Format Span"),
    ("edit.deleteWord", "删除当前词", "Delete Word"),
    ("edit.moveLineUp", "上移该行", "Move Line Up"),
    ("edit.moveLineDown", "下移该行", "Move Line Down"),
    ("edit.spellMenu", "拼写和语法", "Spelling and Grammar"),
    ("edit.spellcheck", "键入时检查拼写", "Check Spelling While Typing"),
    ("edit.replaceMenu", "替换", "Substitutions"),
    ("edit.smartPunctuation", "智能标点", "Smart Punctuation"),
    ("view.wordCount", "字数统计窗口", "Word Count Window"),
    ("menu.find", "查找", "Find"),
    ("search.find", "查找…", "Find…"),
    ("search.findNext", "查找下一个", "Find Next"),
    ("search.findPrevious", "查找上一个", "Find Previous"),
    ("search.replace", "查找和替换…", "Find and Replace…"),
    // ── 段落 ──
    ("menu.paragraph", "段落", "Paragraph"),
    ("paragraph.h1", "一级标题", "Heading 1"),
    ("paragraph.h2", "二级标题", "Heading 2"),
    ("paragraph.h3", "三级标题", "Heading 3"),
    ("paragraph.h4", "四级标题", "Heading 4"),
    ("paragraph.h5", "五级标题", "Heading 5"),
    ("paragraph.h6", "六级标题", "Heading 6"),
    ("paragraph.normal", "段落", "Paragraph"),
    ("paragraph.headingUp", "提升标题级别", "Increase Heading Level"),
    ("paragraph.headingDown", "降低标题级别", "Decrease Heading Level"),
    ("insert.table", "表格", "Table"),
    ("format.mathBlock", "公式块", "Math Block"),
    ("format.codeBlock", "代码块", "Code Block"),
    ("insert.alertMenu", "警告框", "Alert"),
    ("alert.note", "提醒内容", "Note"),
    ("alert.tip", "建议内容", "Tip"),
    ("alert.important", "重要内容", "Important"),
    ("alert.warning", "警告内容", "Warning"),
    ("alert.caution", "注意内容", "Caution"),
    ("format.quote", "引用", "Quote"),
    ("format.orderedList", "有序列表", "Ordered List"),
    ("format.list", "无序列表", "Bulleted List"),
    ("format.taskList", "任务列表", "Task List"),
    ("paragraph.taskToggle", "切换任务状态", "Toggle Task State"),
    ("paragraph.footnote", "脚注", "Footnote"),
    ("paragraph.horizontalRule", "水平分割线", "Horizontal Rule"),
    ("paragraph.toc", "内容目录", "Table of Contents"),
    ("paragraph.yamlFrontMatter", "YAML Front Matter", "YAML Front Matter"),
    // ── 段落 → 表格/代码工具/列表缩进/插入段落（D4 Typora 对齐）──
    ("table.addRowAbove", "上方插入行", "Insert Row Above"),
    ("table.addRowBelow", "下方插入行", "Insert Row Below"),
    ("table.addColumnLeft", "左侧插入列", "Insert Column Left"),
    ("table.addColumnRight", "右侧插入列", "Insert Column Right"),
    ("table.moveRowUp", "向上移动表格行", "Move Row Up"),
    ("table.moveRowDown", "向下移动表格行", "Move Row Down"),
    ("table.moveColumnLeft", "向左移动表格列", "Move Column Left"),
    ("table.moveColumnRight", "向右移动表格列", "Move Column Right"),
    ("table.deleteRow", "删除行", "Delete Row"),
    ("table.deleteColumn", "删除列", "Delete Column"),
    ("table.copyTable", "复制表格", "Copy Table"),
    ("table.tidy", "格式化表格源码", "Format Table Source"),
    ("table.deleteTable", "删除表格", "Delete Table"),
    ("paragraph.codeToolsMenu", "代码工具", "Code Tools"),
    ("paragraph.copyCodeBlock", "复制代码块内容", "Copy Code Block Content"),
    ("paragraph.indentMenu", "列表缩进", "List Indent"),
    ("paragraph.indentMore", "增加缩进", "Increase Indent"),
    ("paragraph.indentLess", "减少缩进", "Decrease Indent"),
    ("paragraph.insertAbove", "在上方插入段落", "Insert Paragraph Above"),
    ("paragraph.insertBelow", "在下方插入段落", "Insert Paragraph Below"),
    // ── 显示 ──
    ("menu.view", "显示", "View"),
    ("commandPalette.open", "命令面板", "Command Palette"),
    ("view.source.toggle", "源代码模式", "Source Code Mode"),
    ("view.focus.cycle", "专注模式", "Focus Mode"),
    ("view.typewriter.cycle", "打字机模式", "Typewriter Mode"),
    ("view.toolbar.toggle", "工具栏", "Toolbar"),
    ("view.sidebarToggle", "显示／隐藏侧边栏", "Toggle Sidebar"),
    ("view.sidebarOutline", "大纲", "Outline"),
    ("view.sidebarFileList", "文档列表", "File List"),
    ("view.sidebarFileTree", "文件树", "File Tree"),
    ("view.search", "搜索", "Search"),
    ("view.zoomReset", "实际大小", "Actual Size"),
    ("view.zoomIn", "放大", "Zoom In"),
    ("view.zoomOut", "缩小", "Zoom Out"),
    ("view.alwaysOnTop", "保持窗口在最前端", "Keep Window on Top"),
    ("tabs.showAll", "显示所有标签页", "Show All Tabs"),
    ("view.devtools", "开发者工具", "Developer Tools"),
    ("reader.open", "用 Reader 打开", "Open in Reader"),
    ("window.fullscreen", "全屏", "Full Screen"),
    // ── 插入（Mellow 更优保留：slash 命令入口）──
    ("menu.insert", "插入", "Insert"),
    ("insert.heading", "标题", "Heading"),
    ("insert.list", "列表", "List"),
    ("insert.task", "任务", "Task"),
    ("insert.quote", "引用", "Quote"),
    ("insert.code", "代码块", "Code Block"),
    ("insert.math", "数学公式", "Math"),
    ("insert.mermaid", "Mermaid 图表", "Mermaid"),
    ("insert.alert", "提示框", "Alert"),
    ("insert.image", "图片", "Image"),
    ("insert.toc", "目录", "Table of Contents"),
    // ── 格式 ──
    ("menu.format", "格式", "Format"),
    ("format.bold", "加粗", "Bold"),
    ("format.italic", "斜体", "Italic"),
    ("format.code", "代码", "Code"),
    ("format.strike", "删除线", "Strikethrough"),
    ("format.highlight", "高亮", "Highlight"),
    ("format.sup", "上标", "Superscript"),
    ("format.sub", "下标", "Subscript"),
    ("format.link", "超链接…", "Hyperlink…"),
    ("format.clear", "清除样式", "Clear Formatting"),
    ("format.referenceLink", "链接引用…", "Link Reference…"),
    // ── 格式 → 下划线/注释/链接操作（D4 Typora 对齐）──
    ("format.underline", "下划线", "Underline"),
    ("format.comment", "注释", "Comment"),
    ("format.linkOpsMenu", "链接操作", "Link Ops"),
    ("format.openLink", "打开链接", "Open Link"),
    ("format.copyLinkUrl", "复制链接地址", "Copy Link Address"),
    // ── 格式 → 图像（B5 / PRD §55，Typora「格式 → 图像」子菜单对齐） ──
    ("format.imageMenu", "图像", "Image"),
    ("image.uploadAll", "上传图片", "Upload Images"),
    ("image.downloadRemote", "下载远程到 asset 目录", "Download Remote to Asset Dir"),
    ("image.moveAll", "移动全部到 asset 目录", "Move All to Asset Dir"),
    ("image.copyAll", "复制全部到 asset 目录", "Copy All to Asset Dir"),
    // ── 主题 ──
    ("menu.theme", "主题", "Themes"),
    ("theme.mellow-light", "Mellow Light", "Mellow Light"),
    ("theme.mellow-dark", "Mellow Dark", "Mellow Dark"),
    ("theme.paper", "Paper", "Paper"),
    ("theme.git-light", "Git Light", "Git Light"),
    ("theme.git-dark", "Git Dark", "Git Dark"),
    ("theme.newsprint", "Newsprint", "Newsprint"),
    ("theme.whitey", "Whitey", "Whitey"),
    ("theme.gothic", "Gothic", "Gothic"),
    ("theme.system", "跟随系统", "Follow System"),
    ("theme.openUserCss", "打开用户 CSS…", "Open User CSS…"),
    // ── 窗口 ──
    ("menu.window", "窗口", "Window"),
    ("window.minimize", "最小化", "Minimize"),
    ("window.maximizeToggle", "缩放", "Zoom"),
    ("tabs.prev", "显示上一个标签页", "Show Previous Tab"),
    ("tabs.next", "显示下一个标签页", "Show Next Tab"),
    // ── 帮助 ──
    ("menu.help", "帮助", "Help"),
    ("help.cheatsheet", "Markdown 速查表", "Markdown Cheatsheet"),
    ("help.quickStart", "快速上手", "Quick Start"),
    ("help.markdownReference", "Markdown 语法参考", "Markdown Reference"),
    ("help.feedback", "反馈问题…", "Feedback…"),
];

fn label(key: &str, locale: &str) -> String {
    for (k, zh, en) in MENU_LABELS {
        if *k == key {
            return if locale == "en-US" { (*en).to_string() } else { (*zh).to_string() };
        }
    }
    key.to_string()
}

/// 菜单点击 → 前端统一 dispatch 命令（不区分平台）
pub fn attach_menu_events(app: &AppHandle) {
    app.on_menu_event(|app, event| {
        let id = event.id().as_ref();
        if !id.is_empty() {
            let _ = app.emit("mellow-menu-command", id);
        }
    });
}

/// 当前 locale（供重建菜单复用）
fn current_locale(app: &AppHandle) -> String {
    app.try_state::<MenuLocale>()
        .map(|s| s.0.lock().unwrap().clone())
        .unwrap_or_else(|| "zh-CN".to_string())
}

/// 构建完整菜单（macOS 含应用菜单；Win/Linux 为 文件/编辑/…/帮助）
fn build_menu(app: &AppHandle, locale: &str, is_mac: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let l = |k: &str| label(k, locale);
    // 快捷键：仅 macOS 原生菜单设置加速键（菜单拦截，单次分发）；
    // Win/Linux 不设菜单加速键——快捷键统一由前端 keydown → CommandRegistry 处理，
    // 避免「菜单加速键 + JS keydown」对切换类命令（粗体/源码模式等）的双重触发。
    let accel = |mac: &'static str, _win: &'static str| -> Option<&'static str> {
        if is_mac { Some(mac) } else { None }
    };

    let mut subs: Vec<Submenu<tauri::Wry>> = Vec::new();

    // ── 应用菜单（macOS）────────────────────────────────
    if is_mac {
        let about = PredefinedMenuItem::about(app, Some(&l("menu.about")), Some(AboutMetadata::default()))?;
        let settings = MenuItem::with_id(app, "settings.open", &l("menu.settings"), true, accel("Cmd+,", "Ctrl+,"))?;
        let check_update = MenuItem::with_id(app, "updater.check", &l("menu.checkUpdate"), true, None::<&str>)?;
        let services = PredefinedMenuItem::services(app, Some(&l("menu.services")))?;
        let hide = PredefinedMenuItem::hide(app, Some(&l("menu.hide")))?;
        let hide_others = PredefinedMenuItem::hide_others(app, Some(&l("menu.hideOthers")))?;
        let show_all = PredefinedMenuItem::show_all(app, Some(&l("menu.showAll")))?;
        let quit = PredefinedMenuItem::quit(app, Some(&l("menu.quit")))?;
        subs.push(Submenu::with_items(
            app,
            &l("menu.mellow"),
            true,
            &[&about, &sep_item(app)?, &settings, &check_update, &sep_item(app)?, &services, &sep_item(app)?, &hide, &hide_others, &show_all, &sep_item(app)?, &quit],
        )?);
    }

    // ── 文件 ───────────────────────────────────────────
    let new_tab = MenuItem::with_id(app, "file.new", &l("file.newTab"), true, accel("Cmd+T", "Ctrl+Alt+T"))?;
    let open = MenuItem::with_id(app, "file.open", &l("file.open"), true, accel("Cmd+O", "Ctrl+O"))?;
    let reopen_closed = MenuItem::with_id(app, "tabs.reopenClosed", &l("file.recentReopen"), true, accel("Cmd+Shift+T", "Ctrl+Shift+T"))?;
    let recent_clear = MenuItem::with_id(app, "recent.clear", &l("file.recentClear"), true, None::<&str>)?;
    let quick_open = MenuItem::with_id(app, "quickOpen.open", &l("quickOpen.open"), true, accel("Cmd+Shift+O", "Ctrl+P"))?;
    let open_folder = MenuItem::with_id(app, "workspace.openFolder", &l("workspace.openFolder"), true, None::<&str>)?;
    let file_info = MenuItem::with_id(app, "file.info", &l("file.info"), true, None::<&str>)?;
    let reveal = MenuItem::with_id(app, "file.revealInFinder", &l("file.reveal"), true, None::<&str>)?;
    // D1-2/D1-3/D1-5 文档操作（Typora 文件→移到…/删除；快照文件夹替代版本复原）
    let move_to = MenuItem::with_id(app, "file.moveTo", &l("file.moveTo"), true, None::<&str>)?;
    let trash_doc = MenuItem::with_id(app, "file.trash", &l("file.trash"), true, None::<&str>)?;
    let snapshots = MenuItem::with_id(app, "file.openSnapshotsFolder", &l("file.openSnapshotsFolder"), true, None::<&str>)?;
    let close_tab = MenuItem::with_id(app, "tabs.close", &l("tabs.close"), true, accel("Cmd+W", "Ctrl+W"))?;
    let close_all = MenuItem::with_id(app, "file.closeAll", &l("file.closeAll"), true, accel("Cmd+Alt+W", "Ctrl+Shift+W"))?;
    let save = MenuItem::with_id(app, "file.save", &l("file.save"), true, accel("Cmd+S", "Ctrl+S"))?;
    let save_as = MenuItem::with_id(app, "file.saveAs", &l("file.saveAs"), true, accel("Cmd+Shift+S", "Ctrl+Shift+S"))?;
    let save_all = MenuItem::with_id(app, "file.saveAll", &l("file.saveAll"), true, accel("Cmd+Alt+S", "Ctrl+Alt+S"))?;
    let reload_disk = MenuItem::with_id(app, "file.reloadFromDisk", &l("file.reloadFromDisk"), true, None::<&str>)?;
    // ⌃⌘P 导出 PDF（Typora parity；Win/Linux 无默认键，前端 registry 处理）
    // D2：导出子菜单全量（Typora 顺序：PDF / HTML / 无样式 HTML / 图像 | pandoc 9 格式 | ⌃E 上次设置）
    let export_pdf = MenuItem::with_id(app, "export.pdf", &l("export.pdf"), true, accel("Cmd+Ctrl+P", ""))?;
    let export_html = MenuItem::with_id(app, "export.html", &l("export.html"), true, None::<&str>)?;
    let export_html_plain = MenuItem::with_id(app, "export.htmlPlain", &l("export.htmlPlain"), true, None::<&str>)?;
    let export_image = MenuItem::with_id(app, "export.image", &l("export.image"), true, None::<&str>)?;
    let export_docx = MenuItem::with_id(app, "export.docx", &l("export.docx"), true, None::<&str>)?;
    let export_odt = MenuItem::with_id(app, "export.odt", &l("export.odt"), true, None::<&str>)?;
    let export_rtf = MenuItem::with_id(app, "export.rtf", &l("export.rtf"), true, None::<&str>)?;
    let export_epub = MenuItem::with_id(app, "export.epub", &l("export.epub"), true, None::<&str>)?;
    let export_latex = MenuItem::with_id(app, "export.latex", &l("export.latex"), true, None::<&str>)?;
    let export_mediawiki = MenuItem::with_id(app, "export.mediawiki", &l("export.mediawiki"), true, None::<&str>)?;
    let export_rst = MenuItem::with_id(app, "export.rst", &l("export.rst"), true, None::<&str>)?;
    let export_textile = MenuItem::with_id(app, "export.textile", &l("export.textile"), true, None::<&str>)?;
    let export_opml = MenuItem::with_id(app, "export.opml", &l("export.opml"), true, None::<&str>)?;
    let export_repeat = MenuItem::with_id(app, "export.repeat", &l("export.repeat"), true, accel("Ctrl+E", ""))?;
    let export_sep1 = PredefinedMenuItem::separator(app)?;
    let export_sep2 = PredefinedMenuItem::separator(app)?;
    let export_menu = Submenu::with_items(
        app,
        &l("menu.export"),
        true,
        &[
            &export_pdf, &export_html, &export_html_plain, &export_image, &export_sep1,
            &export_docx, &export_odt, &export_rtf, &export_epub, &export_latex,
            &export_mediawiki, &export_rst, &export_textile, &export_opml, &export_sep2,
            &export_repeat,
        ],
    )?;
    // D2：导入…（Typora File→Import；pandoc 转 Markdown 后新标签页打开）
    let import_doc = MenuItem::with_id(app, "file.import", &l("file.import"), true, None::<&str>)?;
    let print = MenuItem::with_id(app, "file.print", &l("file.print"), true, accel("Cmd+P", "Ctrl+Alt+P"))?;

    // 打开最近文件（动态子菜单：前端 set_recent_files 重建）
    let recent_files: Vec<String> = app
        .try_state::<RecentFiles>()
        .map(|s| s.0.lock().unwrap().clone())
        .unwrap_or_default();
    let mut recent_items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    recent_items.push(Box::new(reopen_closed));
    if !recent_files.is_empty() {
        recent_items.push(Box::new(PredefinedMenuItem::separator(app)?));
        for path in &recent_files {
            let name = std::path::Path::new(path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());
            recent_items.push(Box::new(MenuItem::with_id(
                app,
                format!("recent.file::{path}"),
                &name,
                true,
                None::<&str>,
            )?));
        }
    }
    recent_items.push(Box::new(PredefinedMenuItem::separator(app)?));
    recent_items.push(Box::new(recent_clear));
    let recent_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = recent_items.iter().map(|i| i.as_ref()).collect();
    let recent_menu = Submenu::with_items(app, &l("file.recent"), true, &recent_refs)?;

    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let sep4 = PredefinedMenuItem::separator(app)?;
    let sep5 = PredefinedMenuItem::separator(app)?;
    let file_menu = Submenu::with_items(
        app,
        &l("menu.file"),
        true,
        &[
            &new_tab, &sep1, &open, &recent_menu, &quick_open, &open_folder, &sep2,
            &file_info, &reveal, &move_to, &trash_doc, &snapshots, &sep3,
            &close_tab, &close_all, &sep4,
            &save, &save_as, &save_all, &reload_disk, &sep5,
            &import_doc, &export_menu, &print,
        ],
    )?;
    subs.push(file_menu);

    // ── 编辑 ───────────────────────────────────────────
    let undo = PredefinedMenuItem::undo(app, Some(&l("menu.undo")))?;
    let redo = PredefinedMenuItem::redo(app, Some(&l("menu.redo")))?;
    let cut = PredefinedMenuItem::cut(app, Some(&l("menu.cut")))?;
    let copy = PredefinedMenuItem::copy(app, Some(&l("menu.copy")))?;
    let paste = PredefinedMenuItem::paste(app, Some(&l("menu.paste")))?;
    let select_all = PredefinedMenuItem::select_all(app, Some(&l("menu.selectAll")))?;
    let copy_markdown = MenuItem::with_id(app, "edit.copyMarkdown", &l("edit.copyMarkdown"), true, accel("Cmd+Shift+C", "Ctrl+Shift+C"))?;
    let paste_plain = MenuItem::with_id(app, "edit.pastePlain", &l("edit.pastePlain"), true, accel("Cmd+Shift+V", "Ctrl+Shift+V"))?;
    let find = MenuItem::with_id(app, "search.find", &l("search.find"), true, accel("Cmd+F", "Ctrl+F"))?;
    let find_next = MenuItem::with_id(app, "search.findNext", &l("search.findNext"), true, accel("Cmd+G", "Ctrl+G"))?;
    let find_prev = MenuItem::with_id(app, "search.findPrevious", &l("search.findPrevious"), true, accel("Cmd+Shift+G", "Ctrl+Shift+G"))?;
    let replace = MenuItem::with_id(app, "search.replace", &l("search.replace"), true, accel("Cmd+Alt+F", "Ctrl+H"))?;
    let find_sep = PredefinedMenuItem::separator(app)?;
    let find_menu = Submenu::with_items(app, &l("menu.find"), true, &[&find, &find_next, &find_prev, &find_sep, &replace])?;
    // D1-4 + D3 选择子菜单（Typora 编辑→选择全量：全选/段落或块/行/格式文本/词 + 跳转组）
    let sel_line = MenuItem::with_id(app, "edit.selectLine", &l("edit.selectLine"), true, accel("Cmd+L", "Ctrl+L"))?;
    let sel_para = MenuItem::with_id(app, "edit.selectParagraph", &l("edit.selectParagraph"), true, accel("Cmd+Alt+P", ""))?;
    let sel_word = MenuItem::with_id(app, "edit.selectWord", &l("edit.selectWord"), true, accel("Cmd+D", "Ctrl+D"))?;
    let sel_span = MenuItem::with_id(app, "edit.selectFormatSpan", &l("edit.selectFormatSpan"), true, accel("Cmd+E", "Ctrl+E"))?;
    let goto_doc_start = MenuItem::with_id(app, "edit.gotoDocStart", &l("edit.gotoDocStart"), true, accel("Cmd+Up", "Ctrl+Home"))?;
    let goto_doc_end = MenuItem::with_id(app, "edit.gotoDocEnd", &l("edit.gotoDocEnd"), true, accel("Cmd+Down", "Ctrl+End"))?;
    let goto_selection = MenuItem::with_id(app, "edit.gotoSelection", &l("edit.gotoSelection"), true, accel("Cmd+J", "Ctrl+J"))?;
    let goto_line_start = MenuItem::with_id(app, "edit.gotoLineStart", &l("edit.gotoLineStart"), true, accel("Ctrl+A", "Home"))?;
    let goto_line_end = MenuItem::with_id(app, "edit.gotoLineEnd", &l("edit.gotoLineEnd"), true, accel("Cmd+Right", "End"))?;
    let select_sep1 = PredefinedMenuItem::separator(app)?;
    let select_sep2 = PredefinedMenuItem::separator(app)?;
    let select_menu = Submenu::with_items(
        app,
        &l("edit.selectMenu"),
        true,
        &[
            &select_all, &sel_para, &sel_line, &sel_span, &sel_word, &select_sep1,
            &goto_doc_start, &goto_selection, &goto_doc_end, &select_sep2,
            &goto_line_start, &goto_line_end,
        ],
    )?;
    // D3 删除范围子菜单（Typora 编辑→删除范围：块/行或句/格式文本/词）
    let del_block = MenuItem::with_id(app, "edit.deleteParagraph", &l("edit.deleteParagraph"), true, accel("Cmd+Alt+Shift+P", "Ctrl+Alt+Shift+P"))?;
    let del_line_menu = MenuItem::with_id(app, "edit.deleteLine", &l("edit.deleteLine"), true, accel("Shift+Cmd+Backspace", "Ctrl+Shift+Backspace"))?;
    let del_span = MenuItem::with_id(app, "edit.deleteFormatSpan", &l("edit.deleteFormatSpan"), true, accel("Cmd+Alt+Shift+E", "Ctrl+Alt+Shift+E"))?;
    let del_word = MenuItem::with_id(app, "edit.deleteWord", &l("edit.deleteWord"), true, accel("Shift+Cmd+D", "Ctrl+Shift+D"))?;
    let delete_range_menu = Submenu::with_items(app, &l("edit.deleteRangeMenu"), true, &[&del_block, &del_line_menu, &del_span, &del_word])?;
    // D3 上移/下移该行（Typora 编辑菜单 ⌥↑/⌥↓）
    let move_line_up = MenuItem::with_id(app, "edit.moveLineUp", &l("edit.moveLineUp"), true, accel("Alt+Up", "Alt+Up"))?;
    let move_line_down = MenuItem::with_id(app, "edit.moveLineDown", &l("edit.moveLineDown"), true, accel("Alt+Down", "Alt+Down"))?;
    // D3 拷贝图片 / 复制为纯文本 / 复制为 HTML 代码（Typora 编辑菜单）
    let copy_image = MenuItem::with_id(app, "edit.copyImage", &l("edit.copyImage"), true, None::<&str>)?;
    let copy_plain = MenuItem::with_id(app, "edit.copyPlain", &l("edit.copyPlain"), true, None::<&str>)?;
    let copy_html_source = MenuItem::with_id(app, "edit.copyHtmlSource", &l("edit.copyHtmlSource"), true, None::<&str>)?;
    // D1-1 拼写和语法子菜单（Typora 编辑→拼写和语法「键入时检查」；CheckMenuItem 选中态走 SpellcheckState）
    let spell_checked = app
        .try_state::<SpellcheckState>()
        .map(|s| *s.0.lock().unwrap())
        .unwrap_or(true);
    let spell_toggle = CheckMenuItem::with_id(app, "edit.spellcheck.toggle", &l("edit.spellcheck"), true, spell_checked, None::<&str>)?;
    let spell_menu = Submenu::with_items(app, &l("edit.spellMenu"), true, &[&spell_toggle])?;
    // R2-1 替换子菜单（Typora 编辑→替换「智能标点」；默认关闭，与设置面板同一真源）
    let smart_punct_checked = app
        .try_state::<SmartPunctState>()
        .map(|s| *s.0.lock().unwrap())
        .unwrap_or(false);
    let smart_punct_toggle = CheckMenuItem::with_id(app, "edit.smartPunctuation.toggle", &l("edit.smartPunctuation"), true, smart_punct_checked, None::<&str>)?;
    let replace_menu = Submenu::with_items(app, &l("edit.replaceMenu"), true, &[&smart_punct_toggle])?;
    let sep6 = PredefinedMenuItem::separator(app)?;
    let sep7 = PredefinedMenuItem::separator(app)?;
    let sep7b = PredefinedMenuItem::separator(app)?;
    let sep7c = PredefinedMenuItem::separator(app)?;
    // D3 编辑菜单重排（Typora 顺序：剪切/拷贝/拷贝图片/粘贴 | 复制三兄弟+粘贴纯文本 | 选择 | 移行+删除范围 | 拼写 | 查找）
    let edit_menu = Submenu::with_items(
        app,
        &l("menu.edit"),
        true,
        &[
            &undo, &redo, &sep6,
            &cut, &copy, &copy_image, &paste, &sep7,
            &copy_plain, &copy_markdown, &copy_html_source, &paste_plain, &sep7b,
            &select_menu,
            &move_line_up, &move_line_down, &delete_range_menu, &sep7c,
            &spell_menu, &replace_menu, &find_menu,
        ],
    )?;
    subs.push(edit_menu);

    // ── 显示 ───────────────────────────────────────────
    let palette = MenuItem::with_id(app, "commandPalette.open", &l("commandPalette.open"), true, accel("Cmd+Shift+P", "Ctrl+Shift+P"))?;
    let focus = MenuItem::with_id(app, "view.focus.cycle", &l("view.focus.cycle"), true, Some("F8"))?;
    let typewriter = MenuItem::with_id(app, "view.typewriter.cycle", &l("view.typewriter.cycle"), true, Some("F9"))?;
    let toolbar = MenuItem::with_id(app, "view.toolbar.toggle", &l("view.toolbar.toggle"), true, None::<&str>)?;
    // R2-2 字数统计窗口（Typora 视图→字数统计窗口）
    let word_count = MenuItem::with_id(app, "view.wordCount", &l("view.wordCount"), true, None::<&str>)?;
    let source_toggle = MenuItem::with_id(app, "view.source.toggle", &l("view.source.toggle"), true, accel("Cmd+/", "Ctrl+/"))?;
    let sidebar_toggle = MenuItem::with_id(app, "view.sidebar.toggle", &l("view.sidebarToggle"), true, accel("Cmd+Shift+L", "Ctrl+Shift+L"))?;
    let sidebar_outline = MenuItem::with_id(app, "view.sidebar.outline", &l("view.sidebarOutline"), true, accel("Ctrl+Cmd+1", "Ctrl+Shift+1"))?;
    let sidebar_filelist = MenuItem::with_id(app, "view.sidebar.fileList", &l("view.sidebarFileList"), true, accel("Ctrl+Cmd+2", "Ctrl+Shift+2"))?;
    let sidebar_filetree = MenuItem::with_id(app, "view.sidebar.fileTree", &l("view.sidebarFileTree"), true, accel("Ctrl+Cmd+3", "Ctrl+Shift+3"))?;
    let global_search = MenuItem::with_id(app, "search.global", &l("view.search"), true, accel("Cmd+Shift+F", "Ctrl+Shift+F"))?;
    let zoom_reset = MenuItem::with_id(app, "view.zoomReset", &l("view.zoomReset"), true, accel("Cmd+Shift+0", "Ctrl+Shift+0"))?;
    let zoom_in = MenuItem::with_id(app, "view.zoomIn", &l("view.zoomIn"), true, accel("Cmd+Shift+=", "Ctrl+Shift+="))?;
    let zoom_out = MenuItem::with_id(app, "view.zoomOut", &l("view.zoomOut"), true, accel("Cmd+Shift+-", "Ctrl+Shift+-"))?;
    let always_on_top = MenuItem::with_id(app, "window.alwaysOnTop", &l("view.alwaysOnTop"), true, None::<&str>)?;
    // ⇧⌘\ 显示所有标签页（Typora 视图→显示所有标签页 / Tab Overview）
    let tabs_show_all = MenuItem::with_id(app, "tabs.showAll", &l("tabs.showAll"), true, accel("Shift+Cmd+\\", "Ctrl+Shift+\\"))?;
    let reader = MenuItem::with_id(app, "reader.open", &l("reader.open"), true, None::<&str>)?;
    let fullscreen = MenuItem::with_id(app, "window.fullscreen", &l("window.fullscreen"), true, accel("Ctrl+Cmd+F", "F11"))?;
    // DevTools：仅 debug 构建装配（release 菜单不显示；命令侧运行时再门控）
    #[cfg(debug_assertions)]
    let devtools = MenuItem::with_id(app, "view.devtools", &l("view.devtools"), true, None::<&str>)?;
    let sep8 = PredefinedMenuItem::separator(app)?;
    let sep9 = PredefinedMenuItem::separator(app)?;
    let sep10 = PredefinedMenuItem::separator(app)?;
    let sep11 = PredefinedMenuItem::separator(app)?;
    let sep12 = PredefinedMenuItem::separator(app)?;
    let sep13 = PredefinedMenuItem::separator(app)?;
    let mut view_items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = vec![
        &palette, &sep8,
        &source_toggle, &sep9,
        &focus, &typewriter, &toolbar, &word_count, &sep10,
        &sidebar_toggle, &sidebar_outline, &sidebar_filelist, &sidebar_filetree, &global_search, &sep11,
        &zoom_reset, &zoom_in, &zoom_out, &sep12,
        &always_on_top, &tabs_show_all, &sep13,
        &reader, &fullscreen,
    ];
    #[cfg(debug_assertions)]
    view_items.push(&devtools);
    let view_menu = Submenu::with_items(app, &l("menu.view"), true, &view_items)?;
    // Push 顺序由 `packages/commands/src/menuContract.ts` 的产品合同约束：
    // File → Edit → Paragraph → Format → View → Theme → Window → Help。

    // ── 插入（Mellow 更优保留：slash 命令统一入口）──────
    let i_heading = MenuItem::with_id(app, "insert.heading", &l("insert.heading"), true, None::<&str>)?;
    let i_list = MenuItem::with_id(app, "insert.list", &l("insert.list"), true, None::<&str>)?;
    let i_task = MenuItem::with_id(app, "insert.task", &l("insert.task"), true, None::<&str>)?;
    let i_quote = MenuItem::with_id(app, "insert.quote", &l("insert.quote"), true, None::<&str>)?;
    let i_table = MenuItem::with_id(app, "insert.table", &l("insert.table"), true, accel("Cmd+Alt+T", "Ctrl+T"))?;
    let i_code = MenuItem::with_id(app, "insert.code", &l("insert.code"), true, None::<&str>)?;
    let i_math = MenuItem::with_id(app, "insert.math", &l("insert.math"), true, None::<&str>)?;
    let i_mermaid = MenuItem::with_id(app, "insert.mermaid", &l("insert.mermaid"), true, None::<&str>)?;
    let i_alert = MenuItem::with_id(app, "insert.alert", &l("insert.alert"), true, None::<&str>)?;
    let i_image = MenuItem::with_id(app, "insert.image", &l("insert.image"), true, accel("Cmd+Ctrl+I", "Ctrl+Alt+I"))?;
    let i_toc = MenuItem::with_id(app, "insert.toc", &l("insert.toc"), true, None::<&str>)?;
    // 不创建独立 Insert 顶层菜单：插入类命令归入 Paragraph / Format，
    // 同时仍以原始 Command ID 发给前端统一分发。

    // ── 格式 ───────────────────────────────────────────
    let f_bold = MenuItem::with_id(app, "format.bold", &l("format.bold"), true, accel("Cmd+B", "Ctrl+B"))?;
    let f_italic = MenuItem::with_id(app, "format.italic", &l("format.italic"), true, accel("Cmd+I", "Ctrl+I"))?;
    let f_code = MenuItem::with_id(app, "format.code", &l("format.code"), true, accel("Ctrl+`", "Ctrl+`"))?;
    let f_strike = MenuItem::with_id(app, "format.strike", &l("format.strike"), true, accel("Ctrl+Shift+`", "Ctrl+Shift+`"))?;
    let f_highlight = MenuItem::with_id(app, "format.highlight", &l("format.highlight"), true, None::<&str>)?;
    let f_sup = MenuItem::with_id(app, "format.sup", &l("format.sup"), true, None::<&str>)?;
    let f_sub = MenuItem::with_id(app, "format.sub", &l("format.sub"), true, None::<&str>)?;
    let f_link = MenuItem::with_id(app, "format.link", &l("format.link"), true, accel("Cmd+K", "Ctrl+K"))?;
    // ⌥⌘L 链接引用（Typora 格式→链接引用）
    let f_reference = MenuItem::with_id(app, "format.referenceLink", &l("format.referenceLink"), true, accel("Cmd+Alt+L", "Ctrl+Alt+L"))?;
    // D4：下划线 ⌘U / 注释 ⌃-（Typora 格式菜单；引擎 applyInlineWrap 非对称包裹）
    let f_underline = MenuItem::with_id(app, "format.underline", &l("format.underline"), true, accel("Cmd+U", "Ctrl+U"))?;
    let f_comment = MenuItem::with_id(app, "format.comment", &l("format.comment"), true, accel("Ctrl+-", "Ctrl+Alt+Shift+-"))?;
    // D4：链接操作子菜单（Typora 格式→链接操作：打开链接 / 复制链接地址）
    let f_open_link = MenuItem::with_id(app, "format.openLink", &l("format.openLink"), true, None::<&str>)?;
    let f_copy_link = MenuItem::with_id(app, "format.copyLinkUrl", &l("format.copyLinkUrl"), true, None::<&str>)?;
    let link_ops_menu = Submenu::with_items(app, &l("format.linkOpsMenu"), true, &[&f_open_link, &f_copy_link])?;
    let f_clear = MenuItem::with_id(app, "format.clear", &l("format.clear"), true, accel("Cmd+\\", "Ctrl+\\"))?;
    let sep14 = PredefinedMenuItem::separator(app)?;
    let sep15 = PredefinedMenuItem::separator(app)?;
    // 图像子菜单（Typora「格式 → 图像」：上传图片 + 本地化批量操作）
    let img_upload = MenuItem::with_id(app, "image.uploadAll", &l("image.uploadAll"), true, None::<&str>)?;
    let img_download = MenuItem::with_id(app, "image.downloadRemote", &l("image.downloadRemote"), true, None::<&str>)?;
    let img_move = MenuItem::with_id(app, "image.moveAll", &l("image.moveAll"), true, None::<&str>)?;
    let img_copy = MenuItem::with_id(app, "image.copyAll", &l("image.copyAll"), true, None::<&str>)?;
    let image_menu = Submenu::with_items(app, &l("format.imageMenu"), true, &[&img_upload, &img_download, &img_move, &img_copy])?;
    let format_menu = Submenu::with_items(app, &l("menu.format"), true, &[&f_bold, &f_italic, &f_underline, &f_code, &f_strike, &f_comment, &f_highlight, &f_sup, &f_sub, &sep14, &f_link, &link_ops_menu, &f_reference, &sep15, &i_image, &f_clear, &image_menu])?;

    // ── 段落 ───────────────────────────────────────────
    let p_h1 = MenuItem::with_id(app, "paragraph.h1", &l("paragraph.h1"), true, accel("Cmd+1", "Ctrl+1"))?;
    let p_h2 = MenuItem::with_id(app, "paragraph.h2", &l("paragraph.h2"), true, accel("Cmd+2", "Ctrl+2"))?;
    let p_h3 = MenuItem::with_id(app, "paragraph.h3", &l("paragraph.h3"), true, accel("Cmd+3", "Ctrl+3"))?;
    let p_h4 = MenuItem::with_id(app, "paragraph.h4", &l("paragraph.h4"), true, accel("Cmd+4", "Ctrl+4"))?;
    let p_h5 = MenuItem::with_id(app, "paragraph.h5", &l("paragraph.h5"), true, accel("Cmd+5", "Ctrl+5"))?;
    let p_h6 = MenuItem::with_id(app, "paragraph.h6", &l("paragraph.h6"), true, accel("Cmd+6", "Ctrl+6"))?;
    let p_normal = MenuItem::with_id(app, "paragraph.normal", &l("paragraph.normal"), true, accel("Cmd+0", "Ctrl+0"))?;
    let p_up = MenuItem::with_id(app, "paragraph.headingUp", &l("paragraph.headingUp"), true, accel("Cmd+=", "Ctrl+="))?;
    let p_down = MenuItem::with_id(app, "paragraph.headingDown", &l("paragraph.headingDown"), true, accel("Cmd+-", "Ctrl+-"))?;
    // 表格/目录与插入菜单复用同一 MenuItem 实例（muda 同项可挂多菜单，事件 id 一致）
    let p_math = MenuItem::with_id(app, "format.mathBlock", &l("format.mathBlock"), true, accel("Cmd+Alt+B", "Ctrl+Alt+B"))?;
    let p_code = MenuItem::with_id(app, "format.codeBlock", &l("format.codeBlock"), true, accel("Cmd+Alt+C", "Ctrl+Alt+C"))?;
    let a_note = MenuItem::with_id(app, "alert.note", &l("alert.note"), true, None::<&str>)?;
    let a_tip = MenuItem::with_id(app, "alert.tip", &l("alert.tip"), true, None::<&str>)?;
    let a_important = MenuItem::with_id(app, "alert.important", &l("alert.important"), true, None::<&str>)?;
    let a_warning = MenuItem::with_id(app, "alert.warning", &l("alert.warning"), true, None::<&str>)?;
    let a_caution = MenuItem::with_id(app, "alert.caution", &l("alert.caution"), true, None::<&str>)?;
    let alert_menu = Submenu::with_items(app, &l("insert.alertMenu"), true, &[&a_note, &a_tip, &a_important, &a_warning, &a_caution])?;
    let p_quote = MenuItem::with_id(app, "format.quote", &l("format.quote"), true, accel("Cmd+Alt+Q", "Ctrl+Alt+Q"))?;
    let p_ordered = MenuItem::with_id(app, "format.orderedList", &l("format.orderedList"), true, accel("Cmd+Alt+O", "Ctrl+Alt+O"))?;
    let p_list = MenuItem::with_id(app, "format.list", &l("format.list"), true, accel("Cmd+Alt+U", "Ctrl+Alt+U"))?;
    let p_task = MenuItem::with_id(app, "format.taskList", &l("format.taskList"), true, accel("Cmd+Alt+X", "Ctrl+Alt+X"))?;
    let p_task_toggle = MenuItem::with_id(app, "paragraph.taskToggle", &l("paragraph.taskToggle"), true, accel("Ctrl+X", "Ctrl+Shift+X"))?;
    let p_footnote = MenuItem::with_id(app, "paragraph.footnote", &l("paragraph.footnote"), true, accel("Cmd+Alt+R", "Ctrl+Alt+R"))?;
    let p_hr = MenuItem::with_id(app, "paragraph.horizontalRule", &l("paragraph.horizontalRule"), true, accel("Cmd+Alt+-", "Ctrl+Alt+-"))?;
    let p_yaml = MenuItem::with_id(app, "paragraph.yamlFrontMatter", &l("paragraph.yamlFrontMatter"), true, None::<&str>)?;
    // D4：段落→表格操作子菜单（Typora 段落→表格；快捷键留引擎 keymap，菜单不设 accel 避免双触发）
    let t_add_above = MenuItem::with_id(app, "table.addRowAbove", &l("table.addRowAbove"), true, None::<&str>)?;
    let t_add_below = MenuItem::with_id(app, "table.addRowBelow", &l("table.addRowBelow"), true, None::<&str>)?;
    let t_add_col_left = MenuItem::with_id(app, "table.addColumnLeft", &l("table.addColumnLeft"), true, None::<&str>)?;
    let t_add_col_right = MenuItem::with_id(app, "table.addColumnRight", &l("table.addColumnRight"), true, None::<&str>)?;
    let t_move_row_up = MenuItem::with_id(app, "table.moveRowUp", &l("table.moveRowUp"), true, None::<&str>)?;
    let t_move_row_down = MenuItem::with_id(app, "table.moveRowDown", &l("table.moveRowDown"), true, None::<&str>)?;
    let t_move_col_left = MenuItem::with_id(app, "table.moveColumnLeft", &l("table.moveColumnLeft"), true, None::<&str>)?;
    let t_move_col_right = MenuItem::with_id(app, "table.moveColumnRight", &l("table.moveColumnRight"), true, None::<&str>)?;
    let t_del_row = MenuItem::with_id(app, "table.deleteRow", &l("table.deleteRow"), true, None::<&str>)?;
    let t_del_col = MenuItem::with_id(app, "table.deleteColumn", &l("table.deleteColumn"), true, None::<&str>)?;
    let t_copy = MenuItem::with_id(app, "table.copyTable", &l("table.copyTable"), true, None::<&str>)?;
    let t_tidy = MenuItem::with_id(app, "table.tidy", &l("table.tidy"), true, None::<&str>)?;
    let t_delete = MenuItem::with_id(app, "table.deleteTable", &l("table.deleteTable"), true, None::<&str>)?;
    let t_sep1 = PredefinedMenuItem::separator(app)?;
    let t_sep2 = PredefinedMenuItem::separator(app)?;
    let t_sep3 = PredefinedMenuItem::separator(app)?;
    let t_sep4 = PredefinedMenuItem::separator(app)?;
    let t_sep5 = PredefinedMenuItem::separator(app)?;
    let t_sep6 = PredefinedMenuItem::separator(app)?;
    // 表格子菜单：插入表格（复用 i_table 实例）+ 行列操作（Typora 顺序）
    let table_menu = Submenu::with_items(
        app,
        &l("insert.table"),
        true,
        &[
            &i_table, &t_sep1,
            &t_add_above, &t_add_below, &t_sep2,
            &t_add_col_left, &t_add_col_right, &t_sep3,
            &t_move_row_up, &t_move_row_down, &t_move_col_left, &t_move_col_right, &t_sep4,
            &t_del_row, &t_del_col, &t_sep5,
            &t_copy, &t_tidy, &t_sep6,
            &t_delete,
        ],
    )?;
    // D4：段落→代码工具子菜单（Typora 段落→代码工具→复制代码块内容）
    let p_copy_code = MenuItem::with_id(app, "paragraph.copyCodeBlock", &l("paragraph.copyCodeBlock"), true, None::<&str>)?;
    let code_tools_menu = Submenu::with_items(app, &l("paragraph.codeToolsMenu"), true, &[&p_copy_code])?;
    // D4：段落→列表缩进子菜单（Typora ⌘]/⌘[；引擎 applyListIndent）
    let p_indent_more = MenuItem::with_id(app, "paragraph.indentMore", &l("paragraph.indentMore"), true, accel("Cmd+]", "Ctrl+]"))?;
    let p_indent_less = MenuItem::with_id(app, "paragraph.indentLess", &l("paragraph.indentLess"), true, accel("Cmd+[", "Ctrl+["))?;
    let indent_menu = Submenu::with_items(app, &l("paragraph.indentMenu"), true, &[&p_indent_more, &p_indent_less])?;
    // D4：在上方/下方插入段落（Typora 段落菜单；引擎 applyInsertParagraph）
    let p_insert_above = MenuItem::with_id(app, "paragraph.insertAbove", &l("paragraph.insertAbove"), true, None::<&str>)?;
    let p_insert_below = MenuItem::with_id(app, "paragraph.insertBelow", &l("paragraph.insertBelow"), true, None::<&str>)?;
    let sep16 = PredefinedMenuItem::separator(app)?;
    let sep17 = PredefinedMenuItem::separator(app)?;
    let sep18 = PredefinedMenuItem::separator(app)?;
    let sep19 = PredefinedMenuItem::separator(app)?;
    let sep20 = PredefinedMenuItem::separator(app)?;
    let sep21 = PredefinedMenuItem::separator(app)?;
    let sep22 = PredefinedMenuItem::separator(app)?;
    let paragraph_menu = Submenu::with_items(
        app,
        &l("menu.paragraph"),
        true,
        &[
            &p_h1, &p_h2, &p_h3, &p_h4, &p_h5, &p_h6, &sep16,
            &p_normal, &sep17,
            &p_up, &p_down, &sep18,
            &table_menu, &p_math, &p_code, &code_tools_menu, &alert_menu, &p_quote, &sep19,
            &p_ordered, &p_list, &p_task, &p_task_toggle, &indent_menu, &sep20,
            &p_insert_above, &p_insert_below, &sep21,
            &p_footnote, &p_hr, &i_toc, &p_yaml, &sep22,
            &i_heading, &i_list, &i_task, &i_quote, &i_table, &i_code, &i_math, &i_mermaid, &i_alert,
        ],
    )?;
    subs.push(paragraph_menu);
    subs.push(format_menu);
    subs.push(view_menu);

    // ── 主题（B2-5/B3-2：radio 选中态 = 当前生效主题；跟随系统 = mode 勾选）──
    // 与 packages/themes 的 BUILTIN_THEMES 保持逐项同步；此列表由跨语言 Adapter
    // 消费，受 tests/parity/verify-menu-contract.mjs 回归保护。
    let theme_ids = ["mellow-light", "mellow-dark", "paper", "git-light", "git-dark", "newsprint", "whitey", "gothic"];
    let theme_state = app
        .try_state::<ThemeSelection>()
        .map(|s| s.0.lock().unwrap().clone())
        .unwrap_or_default();
    let mut theme_items: Vec<CheckMenuItem<tauri::Wry>> = Vec::new();
    for tid in theme_ids {
        theme_items.push(CheckMenuItem::with_id(
            app,
            format!("theme.apply.{tid}"),
            &l(&format!("theme.{tid}")),
            true,
            theme_state.active_theme_id == tid,
            None::<&str>,
        )?);
    }
    let theme_system = CheckMenuItem::with_id(app, "theme.mode.system", &l("theme.system"), true, theme_state.mode == "system", None::<&str>)?;
    let theme_css = MenuItem::with_id(app, "file.openUserCss", &l("theme.openUserCss"), true, None::<&str>)?;
    let theme_sep = PredefinedMenuItem::separator(app)?;
    let theme_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = theme_items
        .iter()
        .map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>)
        .chain([(&theme_sep as &dyn tauri::menu::IsMenuItem<tauri::Wry>), &theme_system, &theme_css])
        .collect();
    let theme_menu = Submenu::with_items(app, &l("menu.theme"), true, &theme_refs)?;
    subs.push(theme_menu);

    // ── 窗口（Typora 独立窗口菜单）─────────────────────
    let w_minimize = MenuItem::with_id(app, "window.minimize", &l("window.minimize"), true, accel("Cmd+M", "Ctrl+M"))?;
    let w_zoom = MenuItem::with_id(app, "window.maximizeToggle", &l("window.maximizeToggle"), true, None::<&str>)?;
    let w_tab_prev = MenuItem::with_id(app, "tabs.prev", &l("tabs.prev"), true, None::<&str>)?;
    let w_tab_next = MenuItem::with_id(app, "tabs.next", &l("tabs.next"), true, None::<&str>)?;
    let sep21 = PredefinedMenuItem::separator(app)?;
    let window_menu = Submenu::with_items(app, &l("menu.window"), true, &[&w_minimize, &w_zoom, &sep21, &w_tab_prev, &w_tab_next])?;
    subs.push(window_menu);

    // ── 帮助（B2 补全：快速上手 / Markdown 参考 / 反馈，复用 opener openUrl）──
    let help_cheatsheet = MenuItem::with_id(app, "help.cheatsheet", &l("help.cheatsheet"), true, None::<&str>)?;
    let help_quick_start = MenuItem::with_id(app, "help.quickStart", &l("help.quickStart"), true, None::<&str>)?;
    let help_markdown_ref = MenuItem::with_id(app, "help.markdownReference", &l("help.markdownReference"), true, None::<&str>)?;
    let help_feedback = MenuItem::with_id(app, "help.feedback", &l("help.feedback"), true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, &l("menu.help"), true, &[&help_quick_start, &help_markdown_ref, &help_cheatsheet, &help_feedback])?;
    subs.push(help_menu);

    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = subs.iter().map(|s| s as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
    Menu::with_items(app, &refs)
}

/// separator 便捷构造（应用菜单条目组）
fn sep_item(app: &AppHandle) -> tauri::Result<PredefinedMenuItem<tauri::Wry>> {
    PredefinedMenuItem::separator(app)
}

/// 安装菜单（三平台；macOS 含应用菜单）
pub fn install_menu(app: &AppHandle) -> tauri::Result<()> {
    let locale = current_locale(app);
    let is_mac = cfg!(target_os = "macos");
    let menu = build_menu(app, &locale, is_mac)?;
    app.set_menu(menu)?;
    Ok(())
}

/// 前端 locale 切换 → 重建菜单（三平台）
#[tauri::command]
pub fn set_menu_locale(app: AppHandle, locale: String) -> Result<(), String> {
    let is_mac = cfg!(target_os = "macos");
    let menu = build_menu(&app, &locale, is_mac).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    if let Some(state) = app.try_state::<MenuLocale>() {
        *state.0.lock().unwrap() = locale;
    }
    Ok(())
}

/// 前端 recentFiles 变化 → 重建菜单（「打开最近文件」动态子菜单）
#[tauri::command]
pub fn set_recent_files(app: AppHandle, files: Vec<String>) -> Result<(), String> {
    if let Some(state) = app.try_state::<RecentFiles>() {
        *state.0.lock().unwrap() = files;
    }
    let locale = current_locale(&app);
    let is_mac = cfg!(target_os = "macos");
    let menu = build_menu(&app, &locale, is_mac).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

/// 前端主题选中态变化 → 重建菜单（主题菜单 radio；B2-5/B3-2）
#[tauri::command]
pub fn set_theme_selection(app: AppHandle, mode: String, active_theme_id: String) -> Result<(), String> {
    if let Some(state) = app.try_state::<ThemeSelection>() {
        *state.0.lock().unwrap() = ThemeSelectionState { mode, active_theme_id };
    }
    let locale = current_locale(&app);
    let is_mac = cfg!(target_os = "macos");
    let menu = build_menu(&app, &locale, is_mac).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

/// 前端拼写检查偏好变化 → 重建菜单（「拼写和语法」CheckMenuItem；D1-1）
#[tauri::command]
pub fn set_spellcheck_state(app: AppHandle, checked: bool) -> Result<(), String> {
    if let Some(state) = app.try_state::<SpellcheckState>() {
        *state.0.lock().unwrap() = checked;
    }
    let locale = current_locale(&app);
    let is_mac = cfg!(target_os = "macos");
    let menu = build_menu(&app, &locale, is_mac).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

/// 前端智能标点偏好变化 → 重建菜单（「替换」CheckMenuItem；master-plan R2-1）
#[tauri::command]
pub fn set_smart_punct_state(app: AppHandle, checked: bool) -> Result<(), String> {
    if let Some(state) = app.try_state::<SmartPunctState>() {
        *state.0.lock().unwrap() = checked;
    }
    let locale = current_locale(&app);
    let is_mac = cfg!(target_os = "macos");
    let menu = build_menu(&app, &locale, is_mac).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}
