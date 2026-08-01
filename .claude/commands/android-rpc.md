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
| `getState` | — | Authoritative controller phase, listener address, error, and configured root/port |
| `setPort` | port number | `{"ok":true,"port":N}` |
| `setRootPath` | device path | `{"ok":true,"rootUri":"...","rootDisplayName":"..."}` |
| `setRootUri` | persisted SAF tree URI | Select an already-granted SAF root |
| `releaseRootPermission` | — | Release the configured SAF root's persisted read grant |
| `getSettings` | — | Server, storage, lifetime, wake, boot, and low-battery settings |
| `setLanEnabled` | boolean | Update localhost/LAN binding |
| `setDirectoryListing` | boolean | Update directory listing |
| `setCorsEnabled` | boolean | Update CORS |
| `setSpaEnabled` | boolean | Update SPA fallback |
| `setLifetimeMode` | `app_open`, `background`, or `reliable` | Update the server-lifetime policy |
| `setBackgroundEnabled` | boolean | Legacy alias: false selects `app_open`, true selects `reliable` |
| `setWakeLockMode` | `none`, `wifi_only`, or `full` | Update wake policy; non-None requires valid Reliable background |
| `setStartOnBoot` | boolean | Update boot start; enabling requires valid Reliable background |
| `setShutdownOnLowBattery` | boolean | Update low-battery shutdown |
| `setShutdownBatteryThreshold` | 5–50 | Update shutdown threshold |
| `getPowerState` | — | Current battery, charging, display, Doze, and optimization state |
| `startServer` | — | `{"ok":bool,"running":bool,"port":N,"host":"..."}` (waits up to 5s) |
| `stopServer` | — | `{"ok":true}` |

## Usage

```bash
emu rpc ping
emu rpc setRootPath /sdcard/Download
emu rpc setPort 8080
emu rpc setLifetimeMode background
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
- `startServer` uses the application-scoped Kotlin controller. Reliable mode
  requires enabled notifications and, on modern Android, a visible app when the
  debug RPC initiates its foreground service; `app_open` and `background` start
  directly through the application controller.
- All methods return JSON with an `ok` field indicating success
- Errors return `{"ok":false,"error":"message"}`
