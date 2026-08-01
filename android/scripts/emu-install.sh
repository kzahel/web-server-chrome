#!/usr/bin/env bash
#
# emu-install.sh - Build and install APK to running emulator
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-$HOME/.android-sdk}"

# Ensure adb is in PATH
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

cd "$PROJECT_DIR"

# Parse args
BUILD=true
LAUNCH=true
RELEASE=false

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --no-build       Skip building the APK"
    echo "  --no-launch      Skip launching the app after install"
    echo "  --release        Build and install release APK (default: debug)"
    echo "  -h, --help       Show this help message"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-build) BUILD=false; shift ;;
        --no-launch) LAUNCH=false; shift ;;
        --release) RELEASE=true; shift ;;
        -h|--help) usage ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Determine build type
if $RELEASE; then
    BUILD_TYPE="release"
    GRADLE_TASK="assembleRelease"
    APK_PATH="$PROJECT_DIR/app/build/outputs/apk/release/app-release.apk"
else
    BUILD_TYPE="debug"
    GRADLE_TASK="assembleDebug"
    APK_PATH="$PROJECT_DIR/app/build/outputs/apk/debug/app-debug.apk"
fi

# Build APK
if $BUILD; then
    echo ">>> Building $BUILD_TYPE APK..."
    ./gradlew "$GRADLE_TASK" --quiet
fi

# Find APK
if [[ ! -f "$APK_PATH" ]]; then
    echo "Error: APK not found at $APK_PATH"
    echo "Run ./gradlew $GRADLE_TASK first"
    exit 1
fi

# Install
echo ">>> Installing APK to $EMU_SERIAL..."
adb_emu install -r "$APK_PATH"

# Launch app
if $LAUNCH; then
    echo ">>> Launching app..."
    adb_emu shell am start -n "app.ok200.android/.MainActivity"
fi

echo ""
echo "=== Installed $BUILD_TYPE ==="
echo ""
echo "Useful commands:"
echo "    ./emu-logs.sh                          # Watch app logs"
echo "    adb shell am force-stop app.ok200.android  # Force stop"
echo "    adb shell pm clear app.ok200.android       # Clear data"
echo ""
