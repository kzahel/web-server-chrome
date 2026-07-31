use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;

#[cfg(target_os = "macos")]
use std::collections::HashMap;
#[cfg(target_os = "macos")]
use tauri::menu::MenuItemKind;

mod headless_updater;
mod native_host;
mod server_control;

const MAIN_WINDOW_LABEL: &str = "main";

/// Strip the `\\?\` extended-length path prefix that Windows APIs produce.
/// Chrome's native messaging launcher doesn't understand this prefix.
#[cfg(windows)]
pub(crate) fn strip_win_prefix(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        p
    }
}

// -- Settings --

fn default_true() -> bool {
    true
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct Settings {
    #[serde(default)]
    autostart: bool,
    #[serde(default = "default_true")]
    run_in_background: bool,
    /// Show tray icon in macOS menu bar. Ignored on other platforms.
    #[serde(default = "default_true")]
    show_in_menu_bar: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            autostart: false,
            run_in_background: true,
            show_in_menu_bar: true,
        }
    }
}

fn load_settings(app: &tauri::AppHandle) -> Settings {
    let data_dir = app.path().app_data_dir().expect("no app data directory");
    let path = data_dir.join("settings.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(app: &tauri::AppHandle, settings: &Settings) {
    let data_dir = app.path().app_data_dir().expect("no app data directory");
    std::fs::create_dir_all(&data_dir).ok();
    let path = data_dir.join("settings.json");
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        std::fs::write(&path, json).ok();
    }
}

// -- Sidecar resolution --

/// Resolve the path to a sidecar binary, trying multiple candidate paths.
pub(crate) fn resolve_sidecar(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let target_triple = option_env!("TARGET_TRIPLE").unwrap_or(env!("TAURI_ENV_TARGET_TRIPLE"));

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("no resource dir: {e}"))?;
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(std::path::Path::to_path_buf));

    let base_name = std::path::Path::new(name)
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or(name);

    let mut candidates = Vec::new();
    for dir in [Some(&resource_dir), exe_dir.as_ref()]
        .into_iter()
        .flatten()
    {
        let extension = std::env::consts::EXE_SUFFIX;
        candidates.push(dir.join(format!("{name}-{target_triple}{extension}")));
        candidates.push(dir.join(format!("{name}{extension}")));
        candidates.push(dir.join(format!("{base_name}-{target_triple}{extension}")));
        candidates.push(dir.join(format!("{base_name}{extension}")));
    }

    for candidate in &candidates {
        if candidate.exists() {
            let path = candidate.clone();
            #[cfg(windows)]
            let path = strip_win_prefix(path);
            return Ok(path);
        }
    }

    Err(format!(
        "sidecar not found, tried: {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

// -- Window helpers --

fn restore_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let window = if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window
    } else {
        let config = app
            .config()
            .app
            .windows
            .iter()
            .find(|config| config.label == MAIN_WINDOW_LABEL)
            .cloned()
            .ok_or_else(|| "main webview window configuration is missing".to_owned())?;
        WebviewWindowBuilder::from_config(app, &config)
            .map_err(|error| format!("configure main webview window: {error}"))?
            .build()
            .map_err(|error| format!("recreate main webview window: {error}"))?
    };

    window
        .unminimize()
        .map_err(|error| format!("restore main webview window: {error}"))?;
    window
        .show()
        .map_err(|error| format!("show main webview window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("focus main webview window: {error}"))
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Err(error) = restore_main_window(app) {
        eprintln!("failed to restore main window: {error}");
    }
}

// -- macOS menu/tray check item sync --

#[cfg(target_os = "macos")]
struct CheckItemSync(HashMap<String, Vec<CheckMenuItem<tauri::Wry>>>);

/// Keep `CheckMenuItems` in sync across app menu and tray menu on macOS.
#[cfg(target_os = "macos")]
fn sync_check_items(app: &tauri::AppHandle, id: &str, checked: bool) {
    if let Some(sync) = app.try_state::<CheckItemSync>() {
        if let Some(items) = sync.0.get(id) {
            for item in items {
                let _ = item.set_checked(checked);
            }
        }
    }
}

// -- Menu event handler --

fn handle_menu_event(app: &tauri::AppHandle, event_id: &str) {
    match event_id {
        "show" => {
            show_main_window(app);
        }
        "check-updates" => {
            show_main_window(app);
            let _ = app.emit("check-for-updates", ());
        }
        "autostart" => {
            let state = app.state::<Mutex<Settings>>();
            let mut s = state.lock().unwrap();
            s.autostart = !s.autostart;
            let checked = s.autostart;
            if checked {
                let _ = app.autolaunch().enable();
            } else {
                let _ = app.autolaunch().disable();
            }
            save_settings(app, &s);
            drop(s);
            #[cfg(target_os = "macos")]
            sync_check_items(app, "autostart", checked);
        }
        "run-in-background" => {
            let state = app.state::<Mutex<Settings>>();
            let mut s = state.lock().unwrap();
            s.run_in_background = !s.run_in_background;
            #[cfg(target_os = "macos")]
            let checked = s.run_in_background;
            save_settings(app, &s);
            drop(s);
            #[cfg(target_os = "macos")]
            sync_check_items(app, "run-in-background", checked);
        }
        "show-in-menu-bar" => {
            let state = app.state::<Mutex<Settings>>();
            let mut s = state.lock().unwrap();
            s.show_in_menu_bar = !s.show_in_menu_bar;
            let visible = s.show_in_menu_bar;
            save_settings(app, &s);
            drop(s);
            if let Some(tray) = app.tray_by_id("tray") {
                let _ = tray.set_visible(visible);
            }
            #[cfg(target_os = "macos")]
            sync_check_items(app, "show-in-menu-bar", visible);
        }
        "quit" => {
            app.exit(0);
        }
        _ => {
            eprintln!("handle_menu_event: unhandled event: {event_id}");
        }
    }
}

// -- Entry point --

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();

    // Check for headless updater mode before building the full app
    let args: Vec<String> = std::env::args().collect();
    let check_update = args.iter().any(|a| a == "--check-update");
    let auto_update = args.iter().any(|a| a == "--auto-update");
    let quit_for_uninstall = args.iter().any(|a| a == "--quit-for-uninstall");
    if check_update || auto_update {
        headless_updater::run(auto_update, context);
        return;
    }

    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            server_control::server_get,
            server_control::server_update_config,
            server_control::server_start,
            server_control::server_stop,
            server_control::server_pick_root,
        ])
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|arg| arg == "--quit-for-uninstall") {
                app.exit(0);
            } else {
                show_main_window(app);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filename(".window-state-v2.json")
                .build(),
        )
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<Mutex<Settings>>();
                if state.lock().unwrap().run_in_background {
                    let _ = window.hide();
                    api.prevent_close();
                } else if let Some(tray) = window.app_handle().tray_by_id("tray") {
                    let _ = tray.set_tooltip(Some("200 OK"));
                    #[cfg(target_os = "macos")]
                    let _ = tray.set_title(Some(""));
                }
            }
        })
        .setup(move |app| {
            // The NSIS uninstaller starts this command to request a graceful
            // shutdown. If no app instance is running, exit this temporary
            // process without creating the normal window or tray state.
            if quit_for_uninstall {
                app.handle().exit(0);
                return Ok(());
            }

            // Auto-updater with check-for-update ID header
            #[cfg(desktop)]
            {
                let mut builder = tauri_plugin_updater::Builder::new();
                if let Some(cfu_id) = ok200_common::get_or_create_cfu_id() {
                    builder = builder.header("X-CFU-Id", &cfu_id)?;
                }
                app.handle().plugin(builder.build())?;
            }

            // Settings
            let settings = load_settings(app.handle());
            app.manage(Mutex::new(settings.clone()));
            let server_config_path = app
                .path()
                .app_data_dir()
                .expect("no app data directory")
                .join("server.json");
            let home_dir = app.path().home_dir().ok();
            app.manage(server_control::DesktopServerController::new(
                server_config_path,
                home_dir,
            ));

            // Build settings submenu items. Each menu needs its own item
            // instances (macOS NSMenuItem can only have one parent).
            let build_settings_menu = |app: &tauri::App,
                                       settings: &Settings|
             -> Result<
                tauri::menu::Submenu<tauri::Wry>,
                Box<dyn std::error::Error>,
            > {
                let autostart_i = CheckMenuItem::with_id(
                    app,
                    "autostart",
                    "Start at Login",
                    true,
                    settings.autostart,
                    None::<&str>,
                )?;
                let background_i = CheckMenuItem::with_id(
                    app,
                    "run-in-background",
                    "Run in Background",
                    true,
                    settings.run_in_background,
                    None::<&str>,
                )?;
                let builder = SubmenuBuilder::new(app, "Settings")
                    .item(&autostart_i)
                    .item(&background_i);
                #[cfg(target_os = "macos")]
                let builder = {
                    let show_in_menu_bar_i = CheckMenuItem::with_id(
                        app,
                        "show-in-menu-bar",
                        "Show Icon in Menu Bar",
                        true,
                        settings.show_in_menu_bar,
                        None::<&str>,
                    )?;
                    builder.item(&show_in_menu_bar_i)
                };
                Ok(builder.build()?)
            };

            // macOS native app menu bar
            #[cfg(target_os = "macos")]
            {
                let app_settings_menu = build_settings_menu(app, &settings)?;
                let app_submenu = SubmenuBuilder::new(app, "200 OK")
                    .about(Some(tauri::menu::AboutMetadata {
                        name: Some("200 OK".to_string()),
                        version: Some(app.config().version.clone().unwrap_or_default()),
                        website: Some("https://ok200.app".to_string()),
                        ..Default::default()
                    }))
                    .separator()
                    .items(&[&MenuItem::with_id(
                        app,
                        "check-updates",
                        "Check for Updates",
                        true,
                        None::<&str>,
                    )?])
                    .separator()
                    .item(&app_settings_menu)
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;

                let app_menu = Menu::with_items(app, &[&app_submenu])?;
                app.set_menu(app_menu)?;
            }

            // System tray (separate item instances)
            let tray_settings_menu = build_settings_menu(app, &settings)?;
            let tray_menu = {
                let show_i = MenuItem::with_id(app, "show", "Show App", true, None::<&str>)?;
                let update_i = MenuItem::with_id(
                    app,
                    "check-updates",
                    "Check for Updates",
                    true,
                    None::<&str>,
                )?;
                let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let sep1 = PredefinedMenuItem::separator(app)?;
                let sep2 = PredefinedMenuItem::separator(app)?;

                Menu::with_items(
                    app,
                    &[
                        &show_i,
                        &update_i,
                        &sep1,
                        &tray_settings_menu,
                        &sep2,
                        &quit_i,
                    ],
                )?
            };

            // Collect CheckMenuItems for macOS sync
            #[cfg(target_os = "macos")]
            {
                let mut sync_map: HashMap<String, Vec<CheckMenuItem<tauri::Wry>>> = HashMap::new();
                fn collect_checks(
                    items: Vec<MenuItemKind<tauri::Wry>>,
                    map: &mut HashMap<String, Vec<CheckMenuItem<tauri::Wry>>>,
                ) {
                    for item in items {
                        match item {
                            MenuItemKind::Check(c) => {
                                map.entry(c.id().as_ref().to_string()).or_default().push(c);
                            }
                            MenuItemKind::Submenu(sub) => {
                                collect_checks(sub.items().unwrap_or_default(), map);
                            }
                            _ => {}
                        }
                    }
                }
                if let Some(app_menu) = app.menu() {
                    collect_checks(app_menu.items().unwrap_or_default(), &mut sync_map);
                }
                collect_checks(tray_menu.items().unwrap_or_default(), &mut sync_map);
                app.manage(CheckItemSync(sync_map));
            }

            // Global menu handler for both app-menu and tray-menu events
            app.on_menu_event(move |app, event| {
                handle_menu_event(app, event.id.as_ref());
            });

            TrayIconBuilder::with_id("tray")
                .tooltip("200 OK")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(cfg!(target_os = "macos"))
                .on_tray_icon_event(|tray, event| {
                    if !cfg!(target_os = "macos") {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_main_window(tray.app_handle());
                        }
                    }
                })
                .build(app)?;

            // Hide tray icon if user disabled it (macOS only)
            #[cfg(target_os = "macos")]
            if !settings.show_in_menu_bar {
                if let Some(tray) = app.tray_by_id("tray") {
                    let _ = tray.set_visible(false);
                }
            }

            // Register native messaging host manifests
            match native_host::register_native_messaging_hosts(app.handle()) {
                Ok(count) => {
                    eprintln!("native-host: registered with {count} browser(s)");
                }
                Err(e) => {
                    eprintln!("native-host: registration failed: {e}");
                }
            }

            // Show window on first launch
            show_main_window(app.handle());

            Ok(())
        })
        .build(context)
        .expect("error building Tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { api, code, .. } => {
            if code.is_none() {
                api.prevent_exit();
            }
        }
        tauri::RunEvent::Exit => {
            if let Some(state) = app_handle.try_state::<server_control::DesktopServerController>() {
                tauri::async_runtime::block_on(state.shutdown());
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            show_main_window(app_handle);
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_defaults() {
        let s = Settings::default();
        assert!(!s.autostart);
        assert!(s.run_in_background);
        assert!(s.show_in_menu_bar);
    }

    #[test]
    fn test_settings_serde_backward_compat() {
        // Unknown fields should be ignored (forward compatibility)
        let json = r#"{"autostart": true, "run_in_background": false, "future_field": 42}"#;
        let s: Settings = serde_json::from_str(json).unwrap();
        assert!(s.autostart);
        assert!(!s.run_in_background);
        // show_in_menu_bar should get its default (true)
        assert!(s.show_in_menu_bar);
    }

    #[test]
    fn test_settings_serde_roundtrip() {
        let s = Settings {
            autostart: true,
            run_in_background: false,
            show_in_menu_bar: false,
        };
        let json = serde_json::to_string(&s).unwrap();
        let parsed: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.autostart, s.autostart);
        assert_eq!(parsed.run_in_background, s.run_in_background);
        assert_eq!(parsed.show_in_menu_bar, s.show_in_menu_bar);
    }

    #[test]
    fn test_settings_missing_fields_get_defaults() {
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert!(!s.autostart);
        assert!(s.run_in_background);
        assert!(s.show_in_menu_bar);
    }

    #[test]
    fn test_main_window_is_created_from_configuration_when_missing() {
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        *context.config_mut() = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let app = tauri::test::mock_builder().build(context).unwrap();
        assert!(app.get_webview_window(MAIN_WINDOW_LABEL).is_none());

        restore_main_window(app.handle()).unwrap();
        assert!(app.get_webview_window(MAIN_WINDOW_LABEL).is_some());
    }
}
