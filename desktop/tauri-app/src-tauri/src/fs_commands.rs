use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::sync::Mutex;

// -- State --

pub struct FsState {
    handles: Mutex<HashMap<u32, tokio::fs::File>>,
    next_id: AtomicU32,
}

impl FsState {
    pub fn new() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }

    fn next_id(&self) -> u32 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }
}

// -- Response types --

#[derive(Serialize)]
pub struct FileStat {
    size: u64,
    mtime_ms: f64,
    is_directory: bool,
    is_file: bool,
}

#[derive(Serialize)]
pub struct TreeEntry {
    path: String,
    size: u64,
}

// -- Commands --

#[tauri::command]
pub async fn fs_open(path: String, mode: String, state: State<'_, FsState>) -> Result<u32, String> {
    let file = match mode.as_str() {
        "r" => tokio::fs::OpenOptions::new()
            .read(true)
            .open(&path)
            .await
            .map_err(|e| format!("open failed: {e}"))?,
        "w" => tokio::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&path)
            .await
            .map_err(|e| format!("open failed: {e}"))?,
        "r+" => tokio::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .await
            .map_err(|e| format!("open failed: {e}"))?,
        _ => return Err(format!("invalid mode: {mode}")),
    };

    let id = state.next_id();
    state.handles.lock().await.insert(id, file);
    Ok(id)
}

#[tauri::command]
pub async fn fs_read(
    handle_id: u32,
    length: u64,
    position: u64,
    state: State<'_, FsState>,
) -> Result<Response, String> {
    let mut handles = state.handles.lock().await;
    let file = handles
        .get_mut(&handle_id)
        .ok_or_else(|| format!("handle {handle_id} not found"))?;

    file.seek(std::io::SeekFrom::Start(position))
        .await
        .map_err(|e| format!("seek failed: {e}"))?;

    let mut buf = vec![0u8; length as usize];
    let n = file
        .read(&mut buf)
        .await
        .map_err(|e| format!("read failed: {e}"))?;
    buf.truncate(n);

    Ok(Response::new(buf))
}

#[tauri::command]
pub async fn fs_write(request: Request<'_>, state: State<'_, FsState>) -> Result<u32, String> {
    let handle_id: u32 = request
        .headers()
        .get("x-handle-id")
        .ok_or("missing x-handle-id header")?
        .to_str()
        .map_err(|e| format!("invalid header: {e}"))?
        .parse()
        .map_err(|e| format!("invalid handle id: {e}"))?;

    let position: u64 = request
        .headers()
        .get("x-position")
        .ok_or("missing x-position header")?
        .to_str()
        .map_err(|e| format!("invalid header: {e}"))?
        .parse()
        .map_err(|e| format!("invalid position: {e}"))?;

    let data = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(_) => return Err("expected raw binary body".into()),
    };

    let mut handles = state.handles.lock().await;
    let file = handles
        .get_mut(&handle_id)
        .ok_or_else(|| format!("handle {handle_id} not found"))?;

    file.seek(std::io::SeekFrom::Start(position))
        .await
        .map_err(|e| format!("seek failed: {e}"))?;

    let n = file
        .write(data)
        .await
        .map_err(|e| format!("write failed: {e}"))?;

    Ok(n as u32)
}

#[tauri::command]
pub async fn fs_close(handle_id: u32, state: State<'_, FsState>) -> Result<(), String> {
    state.handles.lock().await.remove(&handle_id);
    Ok(())
}

#[tauri::command]
pub async fn fs_stat(path: String) -> Result<FileStat, String> {
    let meta = fs::metadata(&path)
        .await
        .map_err(|e| format!("stat failed: {e}"))?;

    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0.0, |d| d.as_secs_f64() * 1000.0);

    Ok(FileStat {
        size: meta.len(),
        mtime_ms,
        is_directory: meta.is_dir(),
        is_file: meta.is_file(),
    })
}

#[tauri::command]
pub async fn fs_exists(path: String) -> Result<bool, String> {
    fs::try_exists(&path)
        .await
        .map_err(|e| format!("exists failed: {e}"))
}

#[tauri::command]
pub async fn fs_readdir(path: String) -> Result<Vec<String>, String> {
    let mut entries = Vec::new();
    let mut dir = fs::read_dir(&path)
        .await
        .map_err(|e| format!("readdir failed: {e}"))?;

    while let Some(entry) = dir
        .next_entry()
        .await
        .map_err(|e| format!("readdir failed: {e}"))?
    {
        if let Some(name) = entry.file_name().to_str() {
            entries.push(name.to_string());
        }
    }

    Ok(entries)
}

#[tauri::command]
pub async fn fs_mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path)
        .await
        .map_err(|e| format!("mkdir failed: {e}"))
}

#[tauri::command]
pub async fn fs_delete(path: String) -> Result<(), String> {
    let meta = fs::metadata(&path)
        .await
        .map_err(|e| format!("delete failed: {e}"))?;

    if meta.is_dir() {
        fs::remove_dir_all(&path)
            .await
            .map_err(|e| format!("delete failed: {e}"))
    } else {
        fs::remove_file(&path)
            .await
            .map_err(|e| format!("delete failed: {e}"))
    }
}

#[tauri::command]
pub async fn fs_realpath(path: String) -> Result<String, String> {
    let canonical = fs::canonicalize(&path)
        .await
        .map_err(|e| format!("realpath failed: {e}"))?;
    Ok(canonical.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn fs_list_tree(path: String) -> Result<Vec<TreeEntry>, String> {
    let base = PathBuf::from(&path);
    let mut result = Vec::new();
    list_tree_recursive(&base, &base, &mut result).await?;
    Ok(result)
}

async fn list_tree_recursive(
    base: &PathBuf,
    current: &PathBuf,
    result: &mut Vec<TreeEntry>,
) -> Result<(), String> {
    let mut dir = fs::read_dir(current)
        .await
        .map_err(|e| format!("list_tree failed: {e}"))?;

    while let Some(entry) = dir
        .next_entry()
        .await
        .map_err(|e| format!("list_tree failed: {e}"))?
    {
        let entry_path = entry.path();
        let Ok(meta) = fs::metadata(&entry_path).await else {
            continue;
        };

        if meta.is_file() {
            let relative = entry_path
                .strip_prefix(base)
                .unwrap_or(&entry_path)
                .to_string_lossy()
                .to_string();
            result.push(TreeEntry {
                path: relative,
                size: meta.len(),
            });
        } else if meta.is_dir() {
            Box::pin(list_tree_recursive(base, &entry_path, result)).await?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn fs_truncate(
    handle_id: u32,
    length: u64,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let mut handles = state.handles.lock().await;
    let file = handles
        .get_mut(&handle_id)
        .ok_or_else(|| format!("handle {handle_id} not found"))?;

    file.set_len(length)
        .await
        .map_err(|e| format!("truncate failed: {e}"))
}

#[tauri::command]
pub async fn fs_sync(handle_id: u32, state: State<'_, FsState>) -> Result<(), String> {
    let mut handles = state.handles.lock().await;
    let file = handles
        .get_mut(&handle_id)
        .ok_or_else(|| format!("handle {handle_id} not found"))?;

    file.sync_all()
        .await
        .map_err(|e| format!("sync failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_id_generation() {
        let state = FsState::new();
        assert_eq!(state.next_id(), 1);
        assert_eq!(state.next_id(), 2);
    }

    #[test]
    fn test_file_stat_serialization() {
        let stat = FileStat {
            size: 1024,
            mtime_ms: 1700000000000.0,
            is_directory: false,
            is_file: true,
        };
        let json = serde_json::to_string(&stat).unwrap();
        assert!(json.contains("\"size\":1024"));
        assert!(json.contains("\"is_file\":true"));
    }
}
