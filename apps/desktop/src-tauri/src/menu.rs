//! macOS Native Enhancement：Menu Bar（spec §13）与 Services 菜单。
//!
//! 架构约束（PRD §113.4）：菜单只负责“发出命令 id”，所有执行统一走前端
//! CommandRegistry（`mellow-menu-command` 事件 → dispatchCommand(id, 'menu')）。
//! 菜单项 id 与前端注册命令 id 一一对应；菜单本身不含任何业务逻辑。

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;

/// 菜单点击 → 前端统一 dispatch 命令（不区分平台，Windows/Linux 无菜单时静默）
pub fn attach_menu_events(app: &tauri::AppHandle) {
    app.on_menu_event(|app, event| {
        let id = event.id().as_ref();
        if !id.is_empty() {
            let _ = app.emit("mellow-menu-command", id);
        }
    });
}

/// 构建 macOS 菜单栏（仅 macOS 安装；Windows/Linux 保留原生窗口装饰，不装菜单）
#[cfg(target_os = "macos")]
pub fn install_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let quit = PredefinedMenuItem::quit(app, Some("退出 Mellow"))?;
    let about = PredefinedMenuItem::about(app, Some("关于 Mellow"), Some(AboutMetadata::default()))?;
    let hide = PredefinedMenuItem::hide(app, Some("隐藏 Mellow"))?;
    // Services 子菜单由 attach_services 注入（objc2，系统填充服务列表）
    let app_menu = Submenu::with_items(app, "Mellow", true, &[&about, &hide, &quit])?;

    let new = MenuItem::with_id(app, "file.new", "新建", true, Some("Cmd+T"))?;
    let open = MenuItem::with_id(app, "file.open", "打开…", true, Some("Cmd+O"))?;
    let quick_open = MenuItem::with_id(app, "quickOpen.open", "Quick Open", true, Some("Cmd+Shift+O"))?;
    let open_folder = MenuItem::with_id(app, "workspace.openFolder", "打开文件夹…", true, None::<&str>)?;
    let save = MenuItem::with_id(app, "file.save", "保存", true, Some("Cmd+S"))?;
    let save_as = MenuItem::with_id(app, "file.saveAs", "另存为…", true, Some("Cmd+Shift+S"))?;
    let reveal = MenuItem::with_id(app, "file.revealInFinder", "在 Finder 中显示", true, None::<&str>)?;
    let close_tab = MenuItem::with_id(app, "tabs.close", "关闭标签页", true, Some("Cmd+W"))?;
    let sep = PredefinedMenuItem::separator(app)?;
    // RC F2：打印入口（golden journey #18；执行走前端 file.print）
    let print = MenuItem::with_id(app, "file.print", "打印…", true, Some("Cmd+P"))?;
    // RC F1：PDF 导出（golden journey #19；执行走前端 export.pdf）
    let export_pdf = MenuItem::with_id(app, "export.pdf", "导出 PDF…", true, None::<&str>)?;
    // RC F6：导出 HTML（PRD §73；执行走前端 export.html）
    let export_html = MenuItem::with_id(app, "export.html", "导出 HTML…", true, None::<&str>)?;
    let file_menu = Submenu::with_items(app, "文件", true, &[&new, &open, &quick_open, &open_folder, &sep, &save, &save_as, &sep, &reveal, &sep, &print, &export_pdf, &export_html, &sep, &close_tab])?;

    let palette = MenuItem::with_id(app, "commandPalette.open", "命令面板", true, Some("Cmd+Shift+P"))?;
    let focus = MenuItem::with_id(app, "view.focus.cycle", "Focus Mode", true, Some("F8"))?;
    let typewriter = MenuItem::with_id(app, "view.typewriter.cycle", "Typewriter Mode", true, Some("F9"))?;
    let reader = MenuItem::with_id(app, "reader.open", "用 Reader 打开", true, None::<&str>)?;
    let split = MenuItem::with_id(app, "split.open", "Split（Source | Preview）", true, None::<&str>)?;
    let fullscreen = MenuItem::with_id(app, "window.fullscreen", "切换全屏", true, Some("Ctrl+Cmd+F"))?;
    let minimize = MenuItem::with_id(app, "window.minimize", "最小化", true, Some("Cmd+M"))?;
    let maximize = MenuItem::with_id(app, "window.maximizeToggle", "缩放", true, None::<&str>)?;
    let view_menu = Submenu::with_items(app, "视图", true, &[&palette, &sep, &focus, &typewriter, &sep, &reader, &split, &sep, &fullscreen, &minimize, &maximize])?;

    let h1 = MenuItem::with_id(app, "insert.heading", "标题", true, None::<&str>)?;
    let list = MenuItem::with_id(app, "insert.list", "列表", true, None::<&str>)?;
    let task = MenuItem::with_id(app, "insert.task", "任务", true, None::<&str>)?;
    let quote = MenuItem::with_id(app, "insert.quote", "引用", true, None::<&str>)?;
    let table = MenuItem::with_id(app, "insert.table", "表格", true, None::<&str>)?;
    let code = MenuItem::with_id(app, "insert.code", "代码块", true, None::<&str>)?;
    let math = MenuItem::with_id(app, "insert.math", "数学公式", true, None::<&str>)?;
    let mermaid = MenuItem::with_id(app, "insert.mermaid", "Mermaid 图表", true, None::<&str>)?;
    let alert = MenuItem::with_id(app, "insert.alert", "提示框", true, None::<&str>)?;
    let image = MenuItem::with_id(app, "insert.image", "图片", true, None::<&str>)?;
    let toc = MenuItem::with_id(app, "insert.toc", "目录", true, None::<&str>)?;
    let insert_menu = Submenu::with_items(app, "插入", true, &[&h1, &list, &task, &quote, &table, &code, &math, &mermaid, &alert, &image, &toc])?;

    let menu = Menu::with_items(app, &[&app_menu, &file_menu, &view_menu, &insert_menu])?;
    app.set_menu(menu)?;
    attach_services(app);
    Ok(())
}

/// macOS Services：系统会自动在 Application 菜单挂载「服务」子菜单。
/// 注意：不要手动把 `ns_app.servicesMenu()` 再次 setSubmenu + insert ——
/// 系统已挂载同一 menu 对象，二次挂载触发
/// `'Menu to be set as submenu is already a submenu of some menu.'`（SIGABRT，实测）。
/// 保持 no-op：系统默认行为即可（NSServices 声明为 P1，见 spec）。
#[cfg(target_os = "macos")]
fn attach_services(_app: &tauri::AppHandle) {
    /* no-op */
}

/// 非 macOS：空实现（保证跨平台编译）
#[cfg(not(target_os = "macos"))]
pub fn install_menu(_app: &tauri::AppHandle) -> tauri::Result<()> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn attach_services(_app: &tauri::AppHandle) {
    /* no-op */
}
