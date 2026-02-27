# Android Debug RPC

Control the Ok200 Android app programmatically via debug RPC. This uses a debug-only ContentProvider accessed through `adb shell content call`.

## Prerequisites

```bash
source ~/.profile && source android/scripts/android-env.sh
emu start        # emulator running
emu install      # debug build installed
```

The app process does NOT need to be open — Android auto-starts it when the ContentProvider is accessed.

## Methods

| Method | Arg | Returns |
|---|---|---|
| `ping` | — | `{"ok":true}` |
| `getState` | — | `{"running":bool,"port":int,"host":"...","error":null,"rootUri":"...","configuredPort":int,"engineInitialized":bool}` |
| `setPort` | port number | `{"ok":true,"port":N}` |
| `setRootPath` | device path | `{"ok":true,"rootUri":"...","rootDisplayName":"..."}` |
| `startServer` | — | `{"ok":bool,"running":bool,"port":N,"host":"..."}` (waits up to 3s) |
| `stopServer` | — | `{"ok":true}` |

## Usage

```bash
emu rpc ping
emu rpc setRootPath /sdcard/Download
emu rpc setPort 8080
emu rpc startServer
emu rpc getState
emu rpc stopServer
```

## Typical Test Workflow

```bash
# Setup
emu rpc setRootPath /sdcard/Download
emu rpc setPort 9090
emu rpc startServer

# Verify server is serving
adb_emu forward tcp:9090 tcp:9090
curl http://localhost:9090/

# Check state
emu rpc getState

# Teardown
emu rpc stopServer
```

## Notes

- Only works on **debug builds** (ContentProvider excluded from release)
- `setRootPath` uses `file://` URIs, bypassing the SAF folder picker
- `startServer` initializes the QuickJS engine if needed and starts the foreground service
- All methods return JSON with an `ok` field indicating success
- Errors return `{"ok":false,"error":"message"}`
