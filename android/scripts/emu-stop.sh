#!/usr/bin/env bash
#
# emu-stop.sh - Stop the running emulator
#
set -euo pipefail

SDK_ROOT="${ANDROID_HOME:-$HOME/.android-sdk}"
export PATH="$SDK_ROOT/platform-tools:$PATH"

# Check if running
if ! adb devices 2>/dev/null | grep -q "emulator-"; then
    echo "No emulator running"
    exit 0
fi

echo ">>> Stopping emulator..."

# Graceful shutdown via adb
adb emu kill 2>/dev/null || true

# Give it a moment
sleep 2

# Check if it's actually gone
if adb devices 2>/dev/null | grep -q "emulator-"; then
    echo "    Emulator didn't stop gracefully, force killing..."
    pkill -f "qemu-system" 2>/dev/null || true
    pkill -f "emulator" 2>/dev/null || true
fi

# Clear port forwards
adb forward --remove-all 2>/dev/null || true

echo "Emulator stopped"
