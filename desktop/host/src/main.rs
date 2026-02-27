use std::io::{self, Read, Write};

fn read_message_from(reader: &mut impl Read) -> io::Result<Option<serde_json::Value>> {
    let mut len_buf = [0u8; 4];
    match reader.read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > 1024 * 1024 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "message too large",
        ));
    }
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf)?;
    let value: serde_json::Value =
        serde_json::from_slice(&buf).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    Ok(Some(value))
}

fn read_message() -> io::Result<Option<serde_json::Value>> {
    read_message_from(&mut io::stdin().lock())
}

fn write_message_to(writer: &mut impl Write, value: &serde_json::Value) -> io::Result<()> {
    let json = serde_json::to_vec(value)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let len = (json.len() as u32).to_le_bytes();
    writer.write_all(&len)?;
    writer.write_all(&json)?;
    writer.flush()?;
    Ok(())
}

fn write_message(value: &serde_json::Value) -> io::Result<()> {
    write_message_to(&mut io::stdout().lock(), value)
}

fn handle_message(msg: &serde_json::Value) -> serde_json::Value {
    let action = msg.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "handshake" => {
            serde_json::json!({
                "action": "handshake",
                "version": env!("CARGO_PKG_VERSION"),
                "name": "ok200-host"
            })
        }
        "ping" => {
            serde_json::json!({
                "action": "pong"
            })
        }
        "launch" => {
            match launch_app() {
                Ok(()) => serde_json::json!({
                    "action": "launch",
                    "ok": true
                }),
                Err(e) => serde_json::json!({
                    "action": "launch",
                    "ok": false,
                    "error": e
                }),
            }
        }
        _ => {
            serde_json::json!({
                "error": format!("unknown action: {action}")
            })
        }
    }
}

fn launch_app() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .args(["-b", "app.ok200.desktop"])
            .spawn()
            .map_err(|e| format!("failed to run open: {e}"))?
            .wait()
            .map_err(|e| format!("open failed: {e}"))?;
        if !status.success() {
            return Err(format!("open -b exited with {status}"));
        }
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        // Try to find the Tauri binary relative to our own path
        let host_path =
            std::env::current_exe().map_err(|e| format!("cannot find own exe: {e}"))?;
        let dir = host_path
            .parent()
            .ok_or_else(|| "cannot find parent directory".to_string())?;

        for name in &["200-ok", "ok200-desktop", "200 OK"] {
            let candidate = dir.join(name);
            if candidate.exists() {
                std::process::Command::new(&candidate)
                    .spawn()
                    .map_err(|e| format!("failed to spawn {}: {e}", candidate.display()))?;
                return Ok(());
            }
        }

        // Fallback: try gtk-launch with the desktop file
        let status = std::process::Command::new("gtk-launch")
            .arg("200-ok")
            .spawn()
            .map_err(|e| format!("gtk-launch failed: {e}"))?
            .wait()
            .map_err(|e| format!("gtk-launch failed: {e}"))?;
        if status.success() {
            return Ok(());
        }

        return Err("could not find 200 OK app".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let host_path =
            std::env::current_exe().map_err(|e| format!("cannot find own exe: {e}"))?;
        let dir = host_path
            .parent()
            .ok_or_else(|| "cannot find parent directory".to_string())?;

        let app_exe = dir.join("200 OK.exe");
        if app_exe.exists() {
            std::process::Command::new(&app_exe)
                .spawn()
                .map_err(|e| format!("failed to spawn: {e}"))?;
            return Ok(());
        }

        return Err("could not find 200 OK.exe".to_string());
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("unsupported platform".to_string())
    }
}

fn main() {
    eprintln!("ok200-host: started, pid={}", std::process::id());

    loop {
        match read_message() {
            Ok(Some(msg)) => {
                let response = handle_message(&msg);
                if let Err(e) = write_message(&response) {
                    eprintln!("ok200-host: write error: {e}");
                    break;
                }
            }
            Ok(None) => {
                // stdin closed (extension disconnected)
                break;
            }
            Err(e) => {
                eprintln!("ok200-host: read error: {e}");
                break;
            }
        }
    }

    eprintln!("ok200-host: exiting");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_roundtrip_message() {
        let msg = serde_json::json!({"action": "ping"});
        let mut buf = Vec::new();
        write_message_to(&mut buf, &msg).unwrap();

        let mut cursor = Cursor::new(buf);
        let read_back = read_message_from(&mut cursor).unwrap().unwrap();
        assert_eq!(msg, read_back);
    }

    #[test]
    fn test_eof_returns_none() {
        let mut cursor = Cursor::new(Vec::new());
        let result = read_message_from(&mut cursor).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_message_too_large() {
        let len_bytes = (2_000_000u32).to_le_bytes();
        let mut cursor = Cursor::new(len_bytes.to_vec());
        let err = read_message_from(&mut cursor).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn test_handle_handshake() {
        let msg = serde_json::json!({"action": "handshake"});
        let response = handle_message(&msg);
        assert_eq!(response["action"], "handshake");
        assert_eq!(response["name"], "ok200-host");
        assert!(response["version"].as_str().is_some());
    }

    #[test]
    fn test_handle_ping() {
        let msg = serde_json::json!({"action": "ping"});
        let response = handle_message(&msg);
        assert_eq!(response["action"], "pong");
    }

    #[test]
    fn test_handle_unknown_action() {
        let msg = serde_json::json!({"action": "unknown"});
        let response = handle_message(&msg);
        assert!(response.get("error").is_some());
    }

    #[test]
    fn test_handle_launch_returns_structured_response() {
        let msg = serde_json::json!({"action": "launch"});
        let response = handle_message(&msg);
        assert_eq!(response["action"], "launch");
        // In test/CI the app won't be installed, so ok will be false
        assert!(response.get("ok").is_some());
    }
}
