#!/usr/bin/env bash
#
# emu-reset.sh - Clear all app data (settings, shared prefs, cache, databases)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-$HOME/.android-sdk}"
PACKAGE="app.ok200.android"

# Ensure adb is in PATH
export PATH="$SDK_ROOT/platform-tools:$PATH"

# Check emulator is running
if ! adb devices 2>/dev/null | grep -q "emulator-"; then
    echo "Error: No emulator running. Start one with: ./emu-start.sh"
    exit 1
fi

echo ">>> Clearing all app data for $PACKAGE..."
if adb shell pm clear "$PACKAGE"; then
    echo "    App data cleared (settings, shared prefs, cache, databases)"
else
    echo "Error: Failed to clear app data (is the app installed?)"
    exit 1
fi

echo ""
echo "=== Reset Complete ==="
