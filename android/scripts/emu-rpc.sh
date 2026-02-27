#!/usr/bin/env bash
#
# emu-rpc.sh - Debug RPC calls to Ok200 Android app via ContentProvider
#
# Usage: emu rpc <method> [arg]
#
# Only works on debug builds. The ContentProvider is not included in release.
#
set -euo pipefail

SDK_ROOT="${ANDROID_HOME:-$HOME/.android-sdk}"
export PATH="$SDK_ROOT/platform-tools:$PATH"

# Find running emulator
EMU_SERIAL=$(adb devices 2>/dev/null | grep -o 'emulator-[0-9]*' | head -1)
if [[ -z "$EMU_SERIAL" ]]; then
    echo "Error: No emulator running. Start one with: emu start" >&2
    exit 1
fi

adb_emu() {
    adb -s "$EMU_SERIAL" "$@"
}

AUTHORITY="content://app.ok200.debug.rpc"

METHOD="${1:-}"
ARG="${2:-}"

if [[ -z "$METHOD" ]]; then
    echo "Usage: emu rpc <method> [arg]"
    echo ""
    echo "Methods:"
    echo "  ping                    - Check if app is responsive"
    echo "  getState                - Get server state and config"
    echo "  setPort <port>          - Set server port"
    echo "  setRootPath <path>      - Set serving root (file path on device)"
    echo "  startServer             - Start the web server"
    echo "  stopServer              - Stop the web server"
    echo ""
    echo "Examples:"
    echo "  emu rpc ping"
    echo "  emu rpc setPort 9090"
    echo "  emu rpc setRootPath /sdcard/www"
    echo "  emu rpc startServer"
    echo "  emu rpc getState"
    echo "  emu rpc stopServer"
    exit 0
fi

# Build adb command
CMD=(adb_emu shell content call --uri "$AUTHORITY" --method "$METHOD")
if [[ -n "$ARG" ]]; then
    CMD+=(--arg "$ARG")
fi

# Execute and parse output
# adb shell content call outputs: Result: Bundle[{result=...}]
RAW=$("${CMD[@]}" 2>&1)

if [[ "$RAW" == *"result="* ]]; then
    # Extract JSON: strip "Result: Bundle[{result=" prefix and "}]" suffix
    JSON=$(echo "$RAW" | sed 's/^Result: Bundle\[{result=//;s/}]$//')
    echo "$JSON"
else
    echo "$RAW" >&2
    exit 1
fi
