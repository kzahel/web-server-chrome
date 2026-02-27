//! Integration test: spawn ok200-host, send handshake + ping, verify framing, close stdin.
//!
//! Run: `cargo test -p ok200-host --test native_messaging`

use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn write_native_message(stdin: &mut impl Write, msg: &serde_json::Value) {
    let json = serde_json::to_vec(msg).unwrap();
    let len = (json.len() as u32).to_le_bytes();
    stdin.write_all(&len).unwrap();
    stdin.write_all(&json).unwrap();
    stdin.flush().unwrap();
}

fn read_native_message(stdout: &mut impl Read) -> serde_json::Value {
    let mut len_buf = [0u8; 4];
    stdout.read_exact(&mut len_buf).unwrap();
    let len = u32::from_le_bytes(len_buf) as usize;
    assert!(len < 1024 * 1024, "Message too large: {len} bytes");
    let mut buf = vec![0u8; len];
    stdout.read_exact(&mut buf).unwrap();
    serde_json::from_slice(&buf).unwrap()
}

fn wait_with_timeout(child: &mut std::process::Child, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if child.try_wait().unwrap().is_some() {
            return true;
        }
        if Instant::now() > deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[test]
fn test_host_handshake_and_ping() {
    let host_bin = env!("CARGO_BIN_EXE_ok200-host");

    let mut child = Command::new(host_bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("failed to spawn ok200-host");

    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = child.stdout.take().unwrap();

    // 1. Handshake
    write_native_message(&mut stdin, &serde_json::json!({"action": "handshake"}));
    let response = read_native_message(&mut stdout);
    assert_eq!(response["action"], "handshake");
    assert_eq!(response["name"], "ok200-host");
    assert!(response["version"].as_str().is_some_and(|v| !v.is_empty()));

    // 2. Ping (validates framing survives a second message)
    write_native_message(&mut stdin, &serde_json::json!({"action": "ping"}));
    let response = read_native_message(&mut stdout);
    assert_eq!(response["action"], "pong");

    // 3. Unknown action
    write_native_message(&mut stdin, &serde_json::json!({"action": "bogus"}));
    let response = read_native_message(&mut stdout);
    assert!(response.get("error").is_some());

    // 4. Close stdin -> host should exit cleanly
    drop(stdin);
    assert!(
        wait_with_timeout(&mut child, Duration::from_secs(5)),
        "ok200-host did not exit within 5 seconds after stdin close"
    );
}
