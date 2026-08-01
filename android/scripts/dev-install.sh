#!/usr/bin/env bash
#
# dev-install.sh - Build and install APK to a real device
#
# Usage:
#   ./dev-install.sh <device>                    # Debug build
#   ./dev-install.sh <device> --release          # Release build
#   ./dev-install.sh <device> --no-build         # Skip gradle build
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/device-config.sh"

# Defaults
BUILD=true
LAUNCH=true
RELEASE=false
DEVICE_NAME=""

usage() {
    echo "Usage: $0 <device> [OPTIONS]"
    echo ""
    echo "Deploy APK to a named device (phone or chromebook)"
    echo ""
    echo "Arguments:"
    echo "  <device>           Device name from ~/.ok200-devices"
    echo ""
    echo "Options:"
    echo "  --no-build         Skip building the APK"
    echo "  --no-launch        Skip launching the app after install"
    echo "  --release          Build and install release APK (default: debug)"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 pixel9                    # Debug build to pixel9"
    echo "  $0 chromebook --release      # Release build to chromebook"
    exit 0
}

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-build) BUILD=false; shift ;;
        --no-launch) LAUNCH=false; shift ;;
        --release) RELEASE=true; shift ;;
        -h|--help) usage ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            if [[ -z "$DEVICE_NAME" ]]; then
                DEVICE_NAME="$1"
            else
                echo "Error: Multiple device names specified"
                exit 1
            fi
            shift
            ;;
    esac
done

if [[ -z "$DEVICE_NAME" ]]; then
    echo "Error: Device name required"
    echo ""
    usage
fi

# Load device config
if ! load_device_config "$DEVICE_NAME"; then
    echo ""
    echo "Available devices:"
    list_all_devices 2>/dev/null || true
    exit 1
fi

cd "$PROJECT_DIR"

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

# Install based on device type
echo ">>> Installing to $DEVICE_NAME ($DEVICE_TYPE)..."

case "$DEVICE_TYPE" in
    serial|wifi)
        adb -s "$DEVICE_CONNECTION" install -r -t "$APK_PATH"
        ;;
    ssh)
        SSH_HOST="${DEVICE_CONNECTION%%:*}"
        REMOTE_ADB="${DEVICE_CONNECTION#*:}"

        # Get remote home for path expansion
        REMOTE_HOME=$(ssh "$SSH_HOST" 'echo $HOME')
        REMOTE_ADB="${REMOTE_ADB/#\~/$REMOTE_HOME}"

        # Use a temp location on remote
        REMOTE_APK="/tmp/ok200-app-$BUILD_TYPE.apk"

        echo "Copying APK to $SSH_HOST:$REMOTE_APK..."
        scp "$APK_PATH" "$SSH_HOST:$REMOTE_APK"

        echo "Installing via remote adb..."
        ssh "$SSH_HOST" "$REMOTE_ADB install -r -t '$REMOTE_APK'"
        ;;
esac

# Launch app
if $LAUNCH; then
    echo ">>> Launching app..."

    LAUNCH_CMD="am start -n app.ok200.android/.MainActivity"

    run_adb_command "$DEVICE_NAME" shell "$LAUNCH_CMD"
fi

echo ""
echo "=== Installed $BUILD_TYPE to $DEVICE_NAME ==="
echo ""
echo "Useful commands:"
echo "    ./dev-logs.sh $DEVICE_NAME           # Watch app logs"
echo "    ./dev-reset.sh $DEVICE_NAME          # Clear app data"
echo "    ./dev-shell.sh $DEVICE_NAME          # ADB shell"
echo ""
