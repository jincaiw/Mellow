//! Native Menu Adapter（V4.0 P1-1.3：单一真源 materialization）。
//!
//! 菜单树的唯一真源是前端 `packages/commands/src/menuSchema.ts`（MENU_SCHEMA 声明表）：
//! 文案经 i18n `menu.*` 解析、主题从 Theme Registry 派生、快捷键/checkState 随 spec
//! 携带。本模块只做两件事（§7.4 硬规则 6）：
//!   1. `set_menu_spec`：把前端下发的可序列化 NativeMenuSpec 递归物化为 muda 菜单
//!      （MenuItem / CheckMenuItem / PredefinedMenuItem / Submenu）；
//!   2. `attach_menu_events`：菜单点击 → `mellow-menu-command` 事件 → 前端
//!      CommandRegistry 统一分发（菜单本身不含任何业务逻辑）。
//!
//! 启动期 `install_menu` 仅装配最小 fallback 菜单（macOS 应用菜单：关于/退出），
//! 完整菜单由前端就绪后的首次 `set_menu_spec` 接管；Rust 不再持有 MENU_LABELS、
//! 主题列表或任何菜单状态（MenuLocale/RecentFiles/SpellcheckState/SmartPunctState/
//! ThemeSelection 已随 P1-1.3 移除）。

use tauri::menu::{
    AboutMetadata, CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu,
};
use tauri::{AppHandle, Emitter};

/// 菜单点击 → 前端统一 dispatch 命令（不区分平台）
pub fn attach_menu_events(app: &AppHandle) {
    app.on_menu_event(|app, event| {
        let id = event.id().as_ref();
        if !id.is_empty() {
            let _ = app.emit("mellow-menu-command", id);
        }
    });
}

// ── NativeMenuSpec（与 packages/commands/src/menuSchema.ts 的 TS 定义一一对应）──

#[derive(serde::Deserialize)]
pub struct MenuSpec {
    menus: Vec<SpecMenu>,
}

#[derive(serde::Deserialize)]
struct SpecMenu {
    #[serde(default)]
    #[allow(dead_code)]
    id: String,
    label: String,
    items: Vec<SpecItem>,
}

#[derive(serde::Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum SpecItem {
    Command {
        id: String,
        label: String,
        #[serde(default)]
        accel: Option<String>,
        /// Some(v) = CheckMenuItem（radio/checkbox），None = 普通 MenuItem
        #[serde(default)]
        checked: Option<bool>,
        /// Some(false) = 灰显不可点击（占位/提示项，如「打开最近文件」空态的「空」）
        #[serde(default)]
        enabled: Option<bool>,
    },
    Predefined {
        /// OS 预定义动作：undo/redo/cut/copy/paste/selectAll/about/services/hide/
        /// hideOthers/showAll/quit（与 TS MenuPredefinedKind 一致）
        predefined: String,
        #[serde(default)]
        label: Option<String>,
    },
    Separator,
    Submenu {
        label: String,
        items: Vec<SpecItem>,
    },
}

fn build_predefined(
    app: &AppHandle,
    kind: &str,
    label: Option<&str>,
) -> tauri::Result<Box<dyn IsMenuItem<tauri::Wry>>> {
    let item: Box<dyn IsMenuItem<tauri::Wry>> = match kind {
        "undo" => Box::new(PredefinedMenuItem::undo(app, label)?),
        "redo" => Box::new(PredefinedMenuItem::redo(app, label)?),
        "cut" => Box::new(PredefinedMenuItem::cut(app, label)?),
        "copy" => Box::new(PredefinedMenuItem::copy(app, label)?),
        "paste" => Box::new(PredefinedMenuItem::paste(app, label)?),
        "selectAll" => Box::new(PredefinedMenuItem::select_all(app, label)?),
        "about" => Box::new(PredefinedMenuItem::about(
            app,
            label,
            Some(AboutMetadata::default()),
        )?),
        "services" => Box::new(PredefinedMenuItem::services(app, label)?),
        "hide" => Box::new(PredefinedMenuItem::hide(app, label)?),
        "hideOthers" => Box::new(PredefinedMenuItem::hide_others(app, label)?),
        "showAll" => Box::new(PredefinedMenuItem::show_all(app, label)?),
        "quit" => Box::new(PredefinedMenuItem::quit(app, label)?),
        // TS 侧 MenuPredefinedKind 枚举已穷举；防御性 fallback（不可达）
        _ => Box::new(PredefinedMenuItem::separator(app)?),
    };
    Ok(item)
}

fn build_item(app: &AppHandle, item: &SpecItem) -> tauri::Result<Box<dyn IsMenuItem<tauri::Wry>>> {
    match item {
        SpecItem::Separator => Ok(Box::new(PredefinedMenuItem::separator(app)?)),
        SpecItem::Command {
            id,
            label,
            accel,
            checked,
            enabled,
        } => {
            let is_enabled = enabled.unwrap_or(true);
            if let Some(checked) = checked {
                Ok(Box::new(CheckMenuItem::with_id(
                    app,
                    id,
                    label,
                    is_enabled,
                    *checked,
                    accel.as_deref(),
                )?))
            } else {
                Ok(Box::new(MenuItem::with_id(
                    app,
                    id,
                    label,
                    is_enabled,
                    accel.as_deref(),
                )?))
            }
        }
        SpecItem::Predefined { predefined, label } => {
            build_predefined(app, predefined, label.as_deref())
        }
        SpecItem::Submenu { label, items } => {
            let built = build_items(app, items)?;
            let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = built.iter().map(|i| i.as_ref()).collect();
            Ok(Box::new(Submenu::with_items(app, label, true, &refs)?))
        }
    }
}

fn build_items(
    app: &AppHandle,
    items: &[SpecItem],
) -> tauri::Result<Vec<Box<dyn IsMenuItem<tauri::Wry>>>> {
    items.iter().map(|item| build_item(app, item)).collect()
}

/// 前端 syncNativeMenu → 物化完整菜单（三平台；spec 已含平台过滤与平台 accelerator）
#[tauri::command]
pub fn set_menu_spec(app: AppHandle, spec: MenuSpec) -> Result<(), String> {
    let mut roots: Vec<Box<dyn IsMenuItem<tauri::Wry>>> = Vec::new();
    for menu in &spec.menus {
        let built = build_items(&app, &menu.items).map_err(|e| e.to_string())?;
        let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = built.iter().map(|i| i.as_ref()).collect();
        let submenu =
            Submenu::with_items(&app, &menu.label, true, &refs).map_err(|e| e.to_string())?;
        roots.push(Box::new(submenu));
    }
    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = roots.iter().map(|i| i.as_ref()).collect();
    let menu = Menu::with_items(&app, &refs).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

/// 启动期最小 fallback 菜单：macOS 应用菜单只留 关于/退出（OS predefined item），
/// 完整菜单由前端就绪后 `set_menu_spec` 接管；Windows/Linux 启动期为空菜单栏。
/// Rust 在此只做 OS predefined item materialization（§7.4 硬规则 6）。
pub fn install_menu(app: &AppHandle) -> tauri::Result<()> {
    if cfg!(target_os = "macos") {
        let about =
            PredefinedMenuItem::about(app, Some("关于 Mellow"), Some(AboutMetadata::default()))?;
        let quit = PredefinedMenuItem::quit(app, Some("退出 Mellow"))?;
        let sep = PredefinedMenuItem::separator(app)?;
        let app_menu = Submenu::with_items(app, "Mellow", true, &[&about, &sep, &quit])?;
        let menu = Menu::with_items(app, &[&app_menu])?;
        app.set_menu(menu)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 前端下发的 spec 必须能**整体**反序列化。
    ///
    /// 立此测试的原因：`set_menu_spec` 是「一份 spec → 整棵菜单」的原子替换，**任一字段
    /// 名/类型对不上都会让整条菜单装配失败**（表现为菜单整体消失，而不是某字段被忽略）。
    /// `enabled` 是「打开最近文件」空态占位项新增的跨层字段（TS `NativeMenuCommandItem.enabled`
    /// → Rust `SpecItem::Command.enabled`），一旦两端拼写漂移，前端单测与 parity 护栏都看不见，
    /// 只有真机才会发现菜单没了 —— 故在此做一次契约测试。
    #[test]
    fn spec_round_trips_with_enabled_field() {
        let json = r#"{"menus":[{"id":"file","label":"File","items":[
            {"type":"command","id":"recent.empty","label":"空","enabled":false},
            {"type":"command","id":"file.save","label":"Save","accel":"Cmd+S","checked":true},
            {"type":"separator"},
            {"type":"submenu","label":"Open Recent","items":[
                {"type":"command","id":"recent.clear","label":"Clear Items"}
            ]}
        ]}]}"#;
        let spec: MenuSpec = serde_json::from_str(json).expect("菜单 spec 必须可反序列化");
        let items = &spec.menus[0].items;
        assert_eq!(items.len(), 4);

        match &items[0] {
            SpecItem::Command { id, enabled, .. } => {
                assert_eq!(id, "recent.empty");
                assert_eq!(*enabled, Some(false), "enabled:false 必须被保留（占位项要灰显）");
            }
            other => panic!("第一项应为 command，实际 {:?}", std::mem::discriminant(other)),
        }
        match &items[1] {
            SpecItem::Command {
                enabled, checked, ..
            } => {
                assert_eq!(*enabled, None, "未声明 enabled 时应为 None（物化时视为可用）");
                assert_eq!(*checked, Some(true), "checked 仍须按原语义解析为 CheckMenuItem");
            }
            other => panic!("第二项应为 command，实际 {:?}", std::mem::discriminant(other)),
        }
        assert!(matches!(items[2], SpecItem::Separator));
        match &items[3] {
            SpecItem::Submenu { items, .. } => assert_eq!(items.len(), 1, "子菜单须递归解析"),
            other => panic!("第四项应为 submenu，实际 {:?}", std::mem::discriminant(other)),
        }
    }
}
