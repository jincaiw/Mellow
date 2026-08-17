//! Native Menu Bar（spec §13，PRD §23 / 附录 J）——三平台统一菜单。
//!
//! 架构约束（PRD §113.4）：菜单只负责“发出命令 id”，所有执行统一走前端
//! CommandRegistry（`mellow-menu-command` 事件 → dispatchCommand(id, 'menu')）。
//! 菜单项 id 与前端注册命令 id 一一对应；菜单本身不含任何业务逻辑。
//!
//! 平台差异：macOS 额外安装 Mellow 应用菜单（About/Hide/Quit）与 Services；
//! Windows/Linux 安装 文件/编辑/视图/插入/格式/段落/主题/帮助（Typora 结构）。
//!
//! 本地化：菜单标签属于系统 chrome（Adapter 层），由本模块目录维护 zh/en 两套，
//! 前端 locale 切换时经 `set_menu_locale` 命令触发重建；核心 UI i18n 仍以
//! packages/i18n 为单一真源（本目录仅覆盖原生菜单标签）。

use std::sync::Mutex;

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};

/// 当前菜单 locale（默认 zh-CN，PRD §87）
pub struct MenuLocale(pub Mutex<String>);

/// 菜单标签目录：(key, zh, en)
static MENU_LABELS: &[(&str, &str, &str)] = &[
    ("menu.mellow", "Mellow", "Mellow"),
    ("menu.about", "关于 Mellow", "About Mellow"),
    ("menu.hide", "隐藏 Mellow", "Hide Mellow"),
    ("menu.quit", "退出 Mellow", "Quit Mellow"),
    ("menu.file", "文件", "File"),
    ("menu.edit", "编辑", "Edit"),
    ("menu.view", "视图", "View"),
    ("menu.insert", "插入", "Insert"),
    ("menu.format", "格式", "Format"),
    ("menu.paragraph", "段落", "Paragraph"),
    ("menu.theme", "主题", "Themes"),
    ("menu.help", "帮助", "Help"),
    ("file.new", "新建", "New"),
    ("file.open", "打开…", "Open…"),
    ("quickOpen.open", "Quick Open", "Quick Open"),
    ("workspace.openFolder", "打开文件夹…", "Open Folder…"),
    ("file.save", "保存", "Save"),
    ("file.saveAs", "另存为…", "Save As…"),
    ("file.reveal", "在 Finder 中显示", "Reveal in Finder"),
    ("tabs.close", "关闭标签页", "Close Tab"),
    ("file.info", "文件信息…", "File Info…"),
    ("file.openWith", "打开方式…", "Open With…"),
    ("file.print", "打印…", "Print…"),
    ("export.pdf", "导出 PDF…", "Export PDF…"),
    ("export.html", "导出 HTML…", "Export HTML…"),
    ("commandPalette.open", "命令面板", "Command Palette"),
    ("view.source.toggle", "源码模式", "Source Mode"),
    ("view.focus.cycle", "Focus Mode", "Focus Mode"),
    ("view.typewriter.cycle", "Typewriter Mode", "Typewriter Mode"),
    ("reader.open", "用 Reader 打开", "Open in Reader"),
    ("split.open", "Split（Source | Preview）", "Split (Source | Preview)"),
    ("window.fullscreen", "切换全屏", "Toggle Full Screen"),
    ("window.minimize", "最小化", "Minimize"),
    ("window.maximizeToggle", "缩放", "Zoom"),
    ("insert.heading", "标题", "Heading"),
    ("insert.list", "列表", "List"),
    ("insert.task", "任务", "Task"),
    ("insert.quote", "引用", "Quote"),
    ("insert.table", "表格", "Table"),
    ("insert.code", "代码块", "Code Block"),
    ("insert.math", "数学公式", "Math"),
    ("insert.mermaid", "Mermaid 图表", "Mermaid"),
    ("insert.alert", "提示框", "Alert"),
    ("insert.image", "图片", "Image"),
    ("insert.toc", "目录", "Table of Contents"),
    ("menu.undo", "撤销", "Undo"),
    ("menu.redo", "重做", "Redo"),
    ("menu.cut", "剪切", "Cut"),
    ("menu.copy", "复制", "Copy"),
    ("menu.paste", "粘贴", "Paste"),
    ("menu.selectAll", "全选", "Select All"),
    ("search.find", "查找…", "Find…"),
    ("search.replace", "替换…", "Replace…"),
    ("format.bold", "粗体", "Bold"),
    ("format.italic", "斜体", "Italic"),
    ("format.strike", "删除线", "Strikethrough"),
    ("format.code", "行内代码", "Inline Code"),
    ("format.highlight", "高亮", "Highlight"),
    ("format.sup", "上标", "Superscript"),
    ("format.sub", "下标", "Subscript"),
    ("format.link", "链接…", "Link…"),
    ("format.quote", "引用", "Quote"),
    ("format.list", "列表", "List"),
    ("paragraph.h1", "一级标题", "Heading 1"),
    ("paragraph.h2", "二级标题", "Heading 2"),
    ("paragraph.h3", "三级标题", "Heading 3"),
    ("paragraph.h4", "四级标题", "Heading 4"),
    ("paragraph.h5", "五级标题", "Heading 5"),
    ("paragraph.h6", "六级标题", "Heading 6"),
    ("paragraph.normal", "段落", "Paragraph"),
    ("theme.mellow-light", "Mellow Light", "Mellow Light"),
    ("theme.mellow-dark", "Mellow Dark", "Mellow Dark"),
    ("theme.system", "跟随系统", "Follow System"),
    ("help.cheatsheet", "Markdown 速查表", "Markdown Cheatsheet"),
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
    if is_mac {
        let about = PredefinedMenuItem::about(app, Some(&l("menu.about")), Some(AboutMetadata::default()))?;
        let hide = PredefinedMenuItem::hide(app, Some(&l("menu.hide")))?;
        let quit = PredefinedMenuItem::quit(app, Some(&l("menu.quit")))?;
        subs.push(Submenu::with_items(app, &l("menu.mellow"), true, &[&about, &hide, &quit])?);
    }

    let sep = PredefinedMenuItem::separator(app)?;

    let new = MenuItem::with_id(app, "file.new", &l("file.new"), true, accel("Cmd+T", "Ctrl+Alt+T"))?;
    let open = MenuItem::with_id(app, "file.open", &l("file.open"), true, accel("Cmd+O", "Ctrl+O"))?;
    let quick_open = MenuItem::with_id(app, "quickOpen.open", &l("quickOpen.open"), true, accel("Cmd+Shift+O", "Ctrl+P"))?;
    let open_folder = MenuItem::with_id(app, "workspace.openFolder", &l("workspace.openFolder"), true, None::<&str>)?;
    let save = MenuItem::with_id(app, "file.save", &l("file.save"), true, accel("Cmd+S", "Ctrl+S"))?;
    let save_as = MenuItem::with_id(app, "file.saveAs", &l("file.saveAs"), true, accel("Cmd+Shift+S", "Ctrl+Shift+S"))?;
    let reveal = MenuItem::with_id(app, "file.revealInFinder", &l("file.reveal"), true, None::<&str>)?;
    let close_tab = MenuItem::with_id(app, "tabs.close", &l("tabs.close"), true, accel("Cmd+W", "Ctrl+W"))?;
    let print = MenuItem::with_id(app, "file.print", &l("file.print"), true, accel("Cmd+P", "Ctrl+P"))?;
    let export_pdf = MenuItem::with_id(app, "export.pdf", &l("export.pdf"), true, None::<&str>)?;
    let export_html = MenuItem::with_id(app, "export.html", &l("export.html"), true, None::<&str>)?;
    let open_with = MenuItem::with_id(app, "file.openWith", &l("file.openWith"), true, None::<&str>)?;
    let file_info = MenuItem::with_id(app, "file.info", &l("file.info"), true, None::<&str>)?;
    let file_menu = Submenu::with_items(
        app,
        &l("menu.file"),
        true,
        &[&new, &open, &quick_open, &open_folder, &sep, &save, &save_as, &sep, &reveal, &sep, &print, &export_pdf, &export_html, &sep, &open_with, &file_info, &sep, &close_tab],
    )?;
    subs.push(file_menu);

    let undo = PredefinedMenuItem::undo(app, Some(&l("menu.undo")))?;
    let redo = PredefinedMenuItem::redo(app, Some(&l("menu.redo")))?;
    let cut = PredefinedMenuItem::cut(app, Some(&l("menu.cut")))?;
    let copy = PredefinedMenuItem::copy(app, Some(&l("menu.copy")))?;
    let paste = PredefinedMenuItem::paste(app, Some(&l("menu.paste")))?;
    let select_all = PredefinedMenuItem::select_all(app, Some(&l("menu.selectAll")))?;
    let find = MenuItem::with_id(app, "search.find", &l("search.find"), true, accel("Cmd+F", "Ctrl+F"))?;
    let replace = MenuItem::with_id(app, "search.replace", &l("search.replace"), true, accel("Cmd+H", "Ctrl+H"))?;
    let edit_menu = Submenu::with_items(app, &l("menu.edit"), true, &[&undo, &redo, &sep, &cut, &copy, &paste, &select_all, &sep, &find, &replace])?;
    subs.push(edit_menu);

    let palette = MenuItem::with_id(app, "commandPalette.open", &l("commandPalette.open"), true, accel("Cmd+Shift+P", "Ctrl+Shift+P"))?;
    let focus = MenuItem::with_id(app, "view.focus.cycle", &l("view.focus.cycle"), true, Some("F8"))?;
    let typewriter = MenuItem::with_id(app, "view.typewriter.cycle", &l("view.typewriter.cycle"), true, Some("F9"))?;
    let source_toggle = MenuItem::with_id(app, "view.source.toggle", &l("view.source.toggle"), true, accel("Cmd+/", "Ctrl+/"))?;
    let reader = MenuItem::with_id(app, "reader.open", &l("reader.open"), true, None::<&str>)?;
    let split = MenuItem::with_id(app, "split.open", &l("split.open"), true, None::<&str>)?;
    let fullscreen = MenuItem::with_id(app, "window.fullscreen", &l("window.fullscreen"), true, accel("Ctrl+Cmd+F", "F11"))?;
    let minimize = MenuItem::with_id(app, "window.minimize", &l("window.minimize"), true, accel("Cmd+M", "Ctrl+M"))?;
    let maximize = MenuItem::with_id(app, "window.maximizeToggle", &l("window.maximizeToggle"), true, None::<&str>)?;
    let view_menu = Submenu::with_items(app, &l("menu.view"), true, &[&palette, &sep, &focus, &typewriter, &source_toggle, &sep, &reader, &split, &sep, &fullscreen, &minimize, &maximize])?;
    subs.push(view_menu);

    let h1 = MenuItem::with_id(app, "insert.heading", &l("insert.heading"), true, None::<&str>)?;
    let list = MenuItem::with_id(app, "insert.list", &l("insert.list"), true, None::<&str>)?;
    let task = MenuItem::with_id(app, "insert.task", &l("insert.task"), true, None::<&str>)?;
    let quote = MenuItem::with_id(app, "insert.quote", &l("insert.quote"), true, None::<&str>)?;
    let table = MenuItem::with_id(app, "insert.table", &l("insert.table"), true, accel("Cmd+Opt+T", "Ctrl+Alt+T"))?;
    let code = MenuItem::with_id(app, "insert.code", &l("insert.code"), true, None::<&str>)?;
    let math = MenuItem::with_id(app, "insert.math", &l("insert.math"), true, None::<&str>)?;
    let mermaid = MenuItem::with_id(app, "insert.mermaid", &l("insert.mermaid"), true, None::<&str>)?;
    let alert = MenuItem::with_id(app, "insert.alert", &l("insert.alert"), true, None::<&str>)?;
    let image = MenuItem::with_id(app, "insert.image", &l("insert.image"), true, accel("Cmd+Ctrl+I", "Ctrl+Alt+I"))?;
    let toc = MenuItem::with_id(app, "insert.toc", &l("insert.toc"), true, None::<&str>)?;
    let insert_menu = Submenu::with_items(app, &l("menu.insert"), true, &[&h1, &list, &task, &quote, &table, &code, &math, &mermaid, &alert, &image, &toc])?;
    subs.push(insert_menu);

    let f_bold = MenuItem::with_id(app, "format.bold", &l("format.bold"), true, accel("Cmd+B", "Ctrl+B"))?;
    let f_italic = MenuItem::with_id(app, "format.italic", &l("format.italic"), true, accel("Cmd+I", "Ctrl+I"))?;
    let f_strike = MenuItem::with_id(app, "format.strike", &l("format.strike"), true, None::<&str>)?;
    let f_code = MenuItem::with_id(app, "format.code", &l("format.code"), true, None::<&str>)?;
    let f_highlight = MenuItem::with_id(app, "format.highlight", &l("format.highlight"), true, None::<&str>)?;
    let f_sup = MenuItem::with_id(app, "format.sup", &l("format.sup"), true, None::<&str>)?;
    let f_sub = MenuItem::with_id(app, "format.sub", &l("format.sub"), true, None::<&str>)?;
    let f_link = MenuItem::with_id(app, "format.link", &l("format.link"), true, accel("Cmd+K", "Ctrl+K"))?;
    let f_quote = MenuItem::with_id(app, "format.quote", &l("format.quote"), true, None::<&str>)?;
    let f_list = MenuItem::with_id(app, "format.list", &l("format.list"), true, None::<&str>)?;
    let format_menu = Submenu::with_items(app, &l("menu.format"), true, &[&f_bold, &f_italic, &f_strike, &f_code, &f_highlight, &f_sup, &f_sub, &sep, &f_link, &f_quote, &f_list])?;
    subs.push(format_menu);

    let p_h1 = MenuItem::with_id(app, "paragraph.h1", &l("paragraph.h1"), true, accel("Cmd+1", "Ctrl+1"))?;
    let p_h2 = MenuItem::with_id(app, "paragraph.h2", &l("paragraph.h2"), true, accel("Cmd+2", "Ctrl+2"))?;
    let p_h3 = MenuItem::with_id(app, "paragraph.h3", &l("paragraph.h3"), true, accel("Cmd+3", "Ctrl+3"))?;
    let p_h4 = MenuItem::with_id(app, "paragraph.h4", &l("paragraph.h4"), true, None::<&str>)?;
    let p_h5 = MenuItem::with_id(app, "paragraph.h5", &l("paragraph.h5"), true, None::<&str>)?;
    let p_h6 = MenuItem::with_id(app, "paragraph.h6", &l("paragraph.h6"), true, None::<&str>)?;
    let p_normal = MenuItem::with_id(app, "paragraph.normal", &l("paragraph.normal"), true, None::<&str>)?;
    let paragraph_menu = Submenu::with_items(app, &l("menu.paragraph"), true, &[&p_h1, &p_h2, &p_h3, &p_h4, &p_h5, &p_h6, &sep, &p_normal])?;
    subs.push(paragraph_menu);

    let theme_light = MenuItem::with_id(app, "theme.apply.mellow-light", &l("theme.mellow-light"), true, None::<&str>)?;
    let theme_dark = MenuItem::with_id(app, "theme.apply.mellow-dark", &l("theme.mellow-dark"), true, None::<&str>)?;
    let theme_system = MenuItem::with_id(app, "theme.mode.system", &l("theme.system"), true, None::<&str>)?;
    let theme_menu = Submenu::with_items(app, &l("menu.theme"), true, &[&theme_light, &theme_dark, &sep, &theme_system])?;
    subs.push(theme_menu);

    let help_cheatsheet = MenuItem::with_id(app, "help.cheatsheet", &l("help.cheatsheet"), true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, &l("menu.help"), true, &[&help_cheatsheet])?;
    subs.push(help_menu);

    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = subs.iter().map(|s| s as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
    Menu::with_items(app, &refs)
}

/// 安装菜单（三平台；macOS 含应用菜单）
pub fn install_menu(app: &AppHandle) -> tauri::Result<()> {
    let locale = app
        .try_state::<MenuLocale>()
        .map(|s| s.0.lock().unwrap().clone())
        .unwrap_or_else(|| "zh-CN".to_string());
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

/// macOS Services：系统会自动在 Application 菜单挂载「服务」子菜单。
/// 保持 no-op：系统默认行为即可（NSServices 声明为 P1，见 spec）。
pub fn attach_services(_app: &AppHandle) {
    /* no-op */
}