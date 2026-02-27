use serde::Serialize;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

/// Result written to `update-check-result.json` in the config directory.
#[derive(Serialize)]
struct UpdateCheckResult {
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    current_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

const RESULT_FILENAME: &str = "update-check-result.json";

/// Run a headless update check (and optionally auto-install).
/// Builds a minimal Tauri app with only the updater plugin,
/// performs the check, writes the result to a JSON file, then exits.
pub fn run(auto_update: bool, context: tauri::Context) {
    let app = tauri::Builder::default()
        .setup(move |app| {
            #[cfg(desktop)]
            {
                let mut builder =
                    tauri_plugin_updater::Builder::new().header("X-Check-Reason", "host")?;
                if let Some(cfu_id) = ok200_common::get_or_create_cfu_id() {
                    builder = builder.header("X-CFU-Id", &cfu_id)?;
                }
                app.handle().plugin(builder.build())?;
            }

            // Close the window immediately — we don't need UI
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.destroy();
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                do_update_check(&handle, auto_update).await;
                handle.exit(0);
            });

            Ok(())
        })
        .build(context)
        .unwrap_or_else(|e| {
            eprintln!("headless-updater: failed to init: {e}");
            write_result_to_shared_dir(&UpdateCheckResult {
                available: false,
                version: None,
                current_version: None,
                body: None,
                error: Some(format!("Failed to initialize: {e}")),
            });
            std::process::exit(1);
        });

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
            if code.is_none() {
                api.prevent_exit();
            }
        }
    });
}

async fn do_update_check(handle: &tauri::AppHandle, auto_update: bool) {
    let result = check_and_maybe_install(handle, auto_update).await;
    write_result(handle, &result);
    if result.error.is_some() {
        eprintln!(
            "headless-updater: error: {}",
            result.error.as_deref().unwrap_or("unknown")
        );
    } else if result.available {
        eprintln!(
            "headless-updater: update available: {}",
            result.version.as_deref().unwrap_or("unknown")
        );
    } else {
        eprintln!("headless-updater: up to date");
    }
}

async fn check_and_maybe_install(
    handle: &tauri::AppHandle,
    auto_update: bool,
) -> UpdateCheckResult {
    let updater = match handle.updater() {
        Ok(u) => u,
        Err(e) => {
            return UpdateCheckResult {
                available: false,
                version: None,
                current_version: None,
                body: None,
                error: Some(format!("Failed to create updater: {e}")),
            };
        }
    };

    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            return UpdateCheckResult {
                available: false,
                version: None,
                current_version: None,
                body: None,
                error: None,
            };
        }
        Err(e) => {
            return UpdateCheckResult {
                available: false,
                version: None,
                current_version: None,
                body: None,
                error: Some(format!("Update check failed: {e}")),
            };
        }
    };

    let result = UpdateCheckResult {
        available: true,
        version: Some(update.version.clone()),
        current_version: Some(update.current_version.clone()),
        body: update.body.clone(),
        error: None,
    };

    if !auto_update {
        return result;
    }

    // Write interim result before download (in case install kills the process on Windows)
    write_result(handle, &result);

    eprintln!("headless-updater: downloading update {}...", update.version);
    if let Err(e) = update
        .download_and_install(
            |chunk_len, content_len| {
                eprintln!("headless-updater: download progress: +{chunk_len} / {content_len:?}");
            },
            || {
                eprintln!("headless-updater: download complete, installing...");
            },
        )
        .await
    {
        return UpdateCheckResult {
            available: true,
            version: Some(result.version.unwrap_or_default()),
            current_version: result.current_version,
            body: result.body,
            error: Some(format!("Install failed: {e}")),
        };
    }

    eprintln!("headless-updater: install complete, restarting...");
    handle.restart();
}

fn write_result(_handle: &tauri::AppHandle, result: &UpdateCheckResult) {
    write_result_to_shared_dir(result);
}

/// Write result to the shared config directory that the native host can also read.
fn write_result_to_shared_dir(result: &UpdateCheckResult) {
    let dir = dirs::config_dir().map(|d| d.join("ok200-native"));
    if let Some(dir) = dir {
        std::fs::create_dir_all(&dir).ok();
        let path = dir.join(RESULT_FILENAME);
        if let Ok(json) = serde_json::to_string_pretty(result) {
            if let Err(e) = std::fs::write(&path, json) {
                eprintln!(
                    "headless-updater: failed to write result to {}: {e}",
                    path.display()
                );
            }
        }
    }
}
