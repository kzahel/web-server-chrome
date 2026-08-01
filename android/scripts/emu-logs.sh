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

# Default: filter to the Kotlin server/lifecycle components and common errors.
# Override with: ./emu-logs.sh --all
FILTER="AndroidServerController:V WebServerService:V BootReceiver:V DozeMonitor:V WakeLockManager:V DebugRpcProvider:V AndroidRuntime:E *:S"

if [[ "${1:-}" == "--all" ]]; then
    FILTER=""
    echo "Showing all logs (unfiltered)..."
elif [[ "${1:-}" == "--http" ]]; then
    FILTER="AndroidServerController:V *:S"
    echo "Showing HTTP-related logs..."
elif [[ "${1:-}" == "--crash" ]]; then
    FILTER="AndroidRuntime:E *:S"
    echo "Showing crashes only..."
else
    echo "Showing Ok200 logs (use --all for everything, --http for requests, --crash for errors)..."
fi

echo "Press Ctrl+C to stop"
echo "---"

# Clear existing logs and start fresh
adb_emu logcat -c

# shellcheck disable=SC2086
adb_emu logcat $FILTER
