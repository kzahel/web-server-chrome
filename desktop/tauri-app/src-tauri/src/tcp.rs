use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::ipc::{Channel, InvokeBody, InvokeResponseBody, Request, Response};
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt, WriteHalf};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

// -- State --

pub struct TcpState {
    servers: Arc<Mutex<HashMap<u32, ServerHandle>>>,
    sockets: Arc<Mutex<HashMap<u32, SocketHandle>>>,
    next_id: Arc<AtomicU32>,
}

struct ServerHandle {
    accept_task: JoinHandle<()>,
    local_addr: SocketAddr,
}

struct SocketHandle {
    writer: Arc<Mutex<WriteHalf<TcpStream>>>,
    recv_task: JoinHandle<()>,
}

impl TcpState {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
            sockets: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(AtomicU32::new(1)),
        }
    }

    fn next_id(&self) -> u32 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }
}

// -- Control events sent as JSON through the channel --

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(dead_code)]
enum ControlEvent {
    Listening {
        #[serde(rename = "serverId")]
        server_id: u32,
        port: u16,
    },
    ListenError {
        #[serde(rename = "serverId")]
        server_id: u32,
        error: String,
    },
    Accept {
        #[serde(rename = "serverId")]
        server_id: u32,
        #[serde(rename = "socketId")]
        socket_id: u32,
        #[serde(rename = "remoteAddress")]
        remote_address: String,
        #[serde(rename = "remotePort")]
        remote_port: u16,
    },
    Close {
        #[serde(rename = "socketId")]
        socket_id: u32,
        #[serde(rename = "hadError")]
        had_error: bool,
    },
    Error {
        #[serde(rename = "socketId")]
        socket_id: u32,
        message: String,
    },
}

fn send_control(channel: &Channel<InvokeResponseBody>, event: &ControlEvent) {
    let json = serde_json::to_string(event).unwrap_or_default();
    let _ = channel.send(InvokeResponseBody::Json(json));
}

fn send_data(channel: &Channel<InvokeResponseBody>, socket_id: u32, data: &[u8]) {
    let mut frame = Vec::with_capacity(4 + data.len());
    frame.extend_from_slice(&socket_id.to_be_bytes());
    frame.extend_from_slice(data);
    let _ = channel.send(InvokeResponseBody::Raw(frame));
}

// -- Commands --

#[tauri::command]
pub async fn tcp_server_create(
    port: u16,
    host: String,
    channel: Channel<InvokeResponseBody>,
    state: State<'_, TcpState>,
) -> Result<u32, String> {
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .map_err(|e| format!("invalid address: {e}"))?;

    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("bind failed: {e}"))?;

    let local_addr = listener
        .local_addr()
        .map_err(|e| format!("local_addr failed: {e}"))?;

    let server_id = state.next_id();

    // Send listening event
    send_control(
        &channel,
        &ControlEvent::Listening {
            server_id,
            port: local_addr.port(),
        },
    );

    // Clone state references for the accept loop
    let sockets = Arc::new(Mutex::new(Vec::<u32>::new()));
    let sockets_for_task = sockets.clone();

    let channel = Arc::new(channel);
    let state_sockets = state.sockets.clone();
    let next_id = state.next_id.clone();

    let accept_task = tokio::spawn(async move {
        loop {
            let (stream, peer_addr) = match listener.accept().await {
                Ok(conn) => conn,
                Err(e) => {
                    eprintln!("tcp accept error: {e}");
                    continue;
                }
            };

            let socket_id = next_id.fetch_add(1, Ordering::Relaxed);
            let (reader, writer) = tokio::io::split(stream);
            let writer = Arc::new(Mutex::new(writer));

            // Send accept event
            send_control(
                &channel,
                &ControlEvent::Accept {
                    server_id,
                    socket_id,
                    remote_address: peer_addr.ip().to_string(),
                    remote_port: peer_addr.port(),
                },
            );

            // Spawn recv task
            let channel_for_recv = channel.clone();
            let state_sockets_for_recv = state_sockets.clone();
            let recv_task = tokio::spawn(async move {
                let mut reader = reader;
                let mut buf = vec![0u8; 65536];
                loop {
                    match reader.read(&mut buf).await {
                        Ok(0) => {
                            // EOF — clean close
                            send_control(
                                &channel_for_recv,
                                &ControlEvent::Close {
                                    socket_id,
                                    had_error: false,
                                },
                            );
                            break;
                        }
                        Ok(n) => {
                            send_data(&channel_for_recv, socket_id, &buf[..n]);
                        }
                        Err(e) => {
                            send_control(
                                &channel_for_recv,
                                &ControlEvent::Error {
                                    socket_id,
                                    message: e.to_string(),
                                },
                            );
                            send_control(
                                &channel_for_recv,
                                &ControlEvent::Close {
                                    socket_id,
                                    had_error: true,
                                },
                            );
                            break;
                        }
                    }
                }
                // Clean up socket from state
                state_sockets_for_recv.lock().await.remove(&socket_id);
            });

            // Store socket handle
            let handle = SocketHandle { writer, recv_task };
            state_sockets.lock().await.insert(socket_id, handle);

            // Track socket IDs for cleanup on server close
            sockets_for_task.lock().await.push(socket_id);
        }
    });

    // Store server handle
    let handle = ServerHandle {
        accept_task,
        local_addr,
    };
    state.servers.lock().await.insert(server_id, handle);

    Ok(server_id)
}

#[tauri::command]
pub async fn tcp_send(
    request: Request<'_>,
    state: State<'_, TcpState>,
) -> Result<Response, String> {
    let socket_id: u32 = request
        .headers()
        .get("x-socket-id")
        .ok_or("missing x-socket-id header")?
        .to_str()
        .map_err(|e| format!("invalid header: {e}"))?
        .parse()
        .map_err(|e| format!("invalid socket id: {e}"))?;

    let data = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(_) => return Err("expected raw binary body".into()),
    };

    // Get the writer Arc without holding the sockets lock during the write
    let writer = {
        let sockets = state.sockets.lock().await;
        sockets
            .get(&socket_id)
            .ok_or_else(|| format!("socket {socket_id} not found"))?
            .writer
            .clone()
    };

    let mut w = writer.lock().await;
    w.write_all(data)
        .await
        .map_err(|e| format!("write failed: {e}"))?;
    w.flush().await.map_err(|e| format!("flush failed: {e}"))?;

    Ok(Response::new(vec![]))
}

#[tauri::command]
pub async fn tcp_close(socket_id: u32, state: State<'_, TcpState>) -> Result<(), String> {
    let handle = state.sockets.lock().await.remove(&socket_id);
    if let Some(h) = handle {
        h.recv_task.abort();
        // Dropping the writer closes the write half
    }
    Ok(())
}

#[tauri::command]
pub async fn tcp_server_close(server_id: u32, state: State<'_, TcpState>) -> Result<(), String> {
    let handle = state.servers.lock().await.remove(&server_id);
    if let Some(h) = handle {
        h.accept_task.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn tcp_server_address(
    server_id: u32,
    state: State<'_, TcpState>,
) -> Result<serde_json::Value, String> {
    let servers = state.servers.lock().await;
    let server = servers
        .get(&server_id)
        .ok_or_else(|| format!("server {server_id} not found"))?;
    Ok(serde_json::json!({
        "address": server.local_addr.ip().to_string(),
        "port": server.local_addr.port(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_control_event_serialization() {
        let event = ControlEvent::Accept {
            server_id: 1,
            socket_id: 42,
            remote_address: "127.0.0.1".to_string(),
            remote_port: 54321,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"accept\""));
        assert!(json.contains("\"serverId\":1"));
        assert!(json.contains("\"socketId\":42"));
    }

    #[test]
    fn test_state_id_generation() {
        let state = TcpState::new();
        assert_eq!(state.next_id(), 1);
        assert_eq!(state.next_id(), 2);
        assert_eq!(state.next_id(), 3);
    }
}
