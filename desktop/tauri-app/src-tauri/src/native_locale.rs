//! App-local language preference, separate from server and native-host settings.
use std::sync::Mutex;
use tauri::{menu::MenuItemKind, Emitter, Manager};

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LanguageState {
    preference: String,
    system_languages: Vec<String>,
}

pub(crate) fn initialize(app: &tauri::AppHandle) {
    let preference = app
        .path()
        .app_data_dir()
        .ok()
        .and_then(|dir| std::fs::read(dir.join("language.json")).ok())
        .and_then(|bytes| serde_json::from_slice::<String>(&bytes).ok())
        .unwrap_or_else(|| "system".to_owned());
    app.manage(Mutex::new(LanguageState {
        preference,
        system_languages: ok200_common::localization::system_languages(),
    }));
}

pub(crate) fn text(app: &tauri::AppHandle, key: &str) -> String {
    let state = app.state::<Mutex<LanguageState>>();
    let state = state.lock().unwrap();
    ok200_common::localization::text(
        ok200_common::localization::resolve(&state.preference, &state.system_languages),
        key,
    )
    .to_owned()
}

pub(crate) fn translate(app: &tauri::AppHandle, english: &str) -> String {
    let state = app.state::<Mutex<LanguageState>>();
    let state = state.lock().unwrap();
    ok200_common::localization::translate(
        ok200_common::localization::resolve(&state.preference, &state.system_languages),
        english,
    )
}

#[tauri::command]
pub(crate) fn desktop_language_get(state: tauri::State<'_, Mutex<LanguageState>>) -> LanguageState {
    state.lock().unwrap().clone()
}

fn update_items(app: &tauri::AppHandle, items: Vec<MenuItemKind<tauri::Wry>>) -> tauri::Result<()> {
    for item in items {
        let english = match item.id().as_ref() {
            "autostart" => Some("Start at Login"),
            "run-in-background" => Some("Run in Background"),
            "show-tray-icon" => Some(super::tray_icon_label()),
            "check-updates" => Some("Check for Updates"),
            "show" => Some("Show App"),
            "quit" => Some("Quit"),
            _ => None,
        };
        match item {
            MenuItemKind::MenuItem(item) => {
                if let Some(source) = english {
                    item.set_text(translate(app, source))?;
                }
            }
            MenuItemKind::Check(item) => {
                if let Some(source) = english {
                    item.set_text(translate(app, source))?;
                }
            }
            MenuItemKind::Submenu(item) => {
                if item.id().as_ref() == "settings" {
                    item.set_text(translate(app, "Settings"))?;
                }
                update_items(app, item.items()?)?;
            }
            MenuItemKind::Predefined(item) => {
                let current = item.text()?;
                let translated = translate(app, &current);
                if translated != current {
                    item.set_text(translated)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn desktop_language_set(
    app: tauri::AppHandle,
    preference: String,
) -> Result<(), String> {
    if preference != "system"
        && !ok200_common::localization::supported_locales().contains(&preference.as_str())
    {
        return Err("Unsupported language preference".to_owned());
    }
    let state = app.state::<Mutex<LanguageState>>();
    let mut state = state.lock().unwrap();
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    let temporary = path.join("language.json.tmp");
    std::fs::write(
        &temporary,
        serde_json::to_vec(&preference).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    // Windows cannot rename over an existing file. This presentation-only
    // preference is safe to rewrite; interruption falls back to system language.
    std::fs::copy(&temporary, path.join("language.json")).map_err(|error| error.to_string())?;
    let _ = std::fs::remove_file(temporary);
    state.preference = preference;
    state.system_languages = ok200_common::localization::system_languages();
    let snapshot = state.clone();
    drop(state);
    if let Some(menu) = app.menu() {
        update_items(&app, menu.items().map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    }
    if let Some(tray) = app.tray_by_id("tray") {
        // Tray and app menu use separate instances; labels share the same locale.
        if let Some(menu) = app.try_state::<NativeTrayMenu>() {
            update_items(&app, menu.0.items().map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())?;
        }
        let _ = tray.set_tooltip(Some("200 OK"));
    }
    app.emit("desktop-language-changed", snapshot)
        .map_err(|error| error.to_string())
}

pub(crate) struct NativeTrayMenu(pub tauri::menu::Menu<tauri::Wry>);
