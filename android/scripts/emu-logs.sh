#!/usr/bin/env bash
#
# emu-logs.sh - Filtered logcat for Ok200 Android daemon
#
set -euo pipefail

SDK_ROOT="${ANDROID_HOME:-$HOME/.android-sdk}"
export PATH="$SDK_ROOT/platform-tools:$PATH"

# Find running emulator (prefer emulator over physical devices)
EMU_SERIAL=$(adb devices 2>/dev/null | grep -o 'emulator-[0-9]*' | head -1)
if [[ -z "$EMU_SERIAL" ]]; then
    echo "Error: No emulator running. Start one with: ./emu-start.sh"
    exit 1
fi

# Use emulator-specific adb command
adb_emu() {
    adb -s "$EMU_SERIAL" "$@"
}

# Default: filter to Ok200 + Ktor + common errors
# Override with: ./emu-logs.sh --all
FILTER="Ok200:V Ktor:V OkHttp:V AndroidRuntime:E *:S"
USE_PID=false

if [[ "${1:-}" == "--all" ]]; then
    FILTER=""
    echo "Showing all logs (unfiltered)..."
elif [[ "${1:-}" == "--http" ]]; then
    FILTER="Ok200:V Ktor:V OkHttp:V *:S"
    echo "Showing HTTP-related logs..."
elif [[ "${1:-}" == "--crash" ]]; then
    FILTER="AndroidRuntime:E *:S"
    echo "Showing crashes only..."
elif [[ "${1:-}" == "--js" ]]; then
    USE_PID=true
    echo "Showing QuickJS logs (PID-filtered for reliability)..."
else
    echo "Showing Ok200 logs (use --all for everything, --http for network, --crash for errors, --js for QuickJS)..."
fi

echo "Press Ctrl+C to stop"
echo "---"

# Clear existing logs and start fresh
adb_emu logcat -c

if [[ "$USE_PID" == "true" ]]; then
    # PID-based filtering is more reliable for QuickJS logs
    # Tag filtering can miss logs when buffer is dominated by other apps
    APP_PID=$(adb_emu shell pidof app.ok200.android 2>/dev/null || true)
    if [[ -z "$APP_PID" ]]; then
        echo "Error: Ok200 app is not running"
        exit 1
    fi
    echo "Filtering by PID: $APP_PID"
    adb_emu logcat --pid="$APP_PID" | grep -E "(Ok200-JS|QuickJsContext|EngineController)"
else
    # shellcheck disable=SC2086
    adb_emu logcat $FILTER
fi
