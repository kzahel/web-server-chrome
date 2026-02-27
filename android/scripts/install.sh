#!/bin/bash
# Install Android APK to ChromeOS Android container
#
# Usage:
#   ./scripts/install.sh                    # Install debug APK
#   ./scripts/install.sh release            # Install release APK
#   ./scripts/install.sh /path/to/app.apk   # Install from custom path
#
# If you get signature mismatch errors, use:
#   ./scripts/install.sh --reinstall
#
# Prerequisites:
#   - adb must be in PATH (should be set in ~/.bashrc before interactive check)
#   - Android container must be running on ChromeOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BUILD_TYPE="debug"
REINSTALL=false
CUSTOM_APK_PATH=""

# Parse arguments
for arg in "$@"; do
    case $arg in
        --reinstall)
            REINSTALL=true
            ;;
        release)
            BUILD_TYPE="release"
            ;;
        debug)
            BUILD_TYPE="debug"
            ;;
        *.apk)
            CUSTOM_APK_PATH="$arg"
            ;;
    esac
done

if [ -n "$CUSTOM_APK_PATH" ]; then
    APK_PATH="$CUSTOM_APK_PATH"
else
    APK_PATH="$PROJECT_DIR/app/build/outputs/apk/$BUILD_TYPE/app-$BUILD_TYPE.apk"
fi
PACKAGE_NAME="app.ok200.android"

if [ ! -f "$APK_PATH" ]; then
    echo "Error: APK not found at $APK_PATH"
    if [ -z "$CUSTOM_APK_PATH" ]; then
        echo "Run './gradlew assemble${BUILD_TYPE^}' first"
    fi
    exit 1
fi

if [ -n "$CUSTOM_APK_PATH" ]; then
    echo "Installing APK from $APK_PATH..."
else
    echo "Installing $BUILD_TYPE APK..."
fi

# Check if adb can see the device
if ! adb devices | grep -q "device$"; then
    echo "Error: No Android device found. Make sure Android container is running."
    adb devices
    exit 1
fi

if [ "$REINSTALL" = true ]; then
    echo "Uninstalling existing app..."
    adb uninstall "$PACKAGE_NAME" 2>/dev/null || true
fi

# -r: replace existing, -t: allow test APKs (debug builds)
if adb install -r -t "$APK_PATH"; then
    echo "✓ Successfully installed APK"
else
    echo ""
    echo "Installation failed. If you see INSTALL_FAILED_UPDATE_INCOMPATIBLE,"
    echo "the app was signed with a different key. Run:"
    echo "  ./scripts/install.sh --reinstall"
    exit 1
fi
