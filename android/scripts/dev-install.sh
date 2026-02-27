#!/usr/bin/env bash
#
# dev-install.sh - Build and install APK to a real device
#
# Usage:
#   ./dev-install.sh <device>                    # Debug build
#   ./dev-install.sh <device> --release          # Release build
#   ./dev-install.sh <device> --forward          # Debug + port forwarding
#   ./dev-install.sh <device> --no-build         # Skip gradle build
#   ./dev-install.sh <device> --ui native        # Specify UI mode
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONOREPO_ROOT="$(cd "$PROJECT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/device-config.sh"

# Defaults
BUILD=true
BUILD_BUNDLE=true
LAUNCH=true
RELEASE=false
SETUP_FORWARD=false
UI_MODE="native"
DEVICE_NAME=""
DEV_SERVER_PORT="${DEV_SERVER_PORT:-3000}"

usage() {
    echo "Usage: $0 <device> [OPTIONS]"
    echo ""
    echo "Deploy APK to a named device (phone or chromebook)"
    echo ""
    echo "Arguments:"
    echo "  <device>           Device name from ~/.ok200-devices"
    echo ""
    echo "Options:"
    echo "  --no-build         Skip building the APK AND the engine bundle"
    echo "  --no-bundle        Skip building the engine bundle only"
    echo "  --no-launch        Skip launching the app after install"
    echo "  --release          Build and install release APK (default: debug)"
    echo "  --forward, -f      Set up port forwarding for dev server"
    echo "  --ui MODE          UI mode to launch (default: native)"
    echo "                       native          - Native Android UI"
    echo "                       companion       - Companion mode (ChromeOS)"
    echo "                       standalone      - Standalone web UI"
    echo "                       standalone-full - Standalone full web UI"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 pixel9                    # Debug build to pixel9"
    echo "  $0 chromebook --release      # Release build to chromebook"
    echo "  $0 motog --forward           # Debug + port forwarding"
    exit 0
}

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-build) BUILD=false; BUILD_BUNDLE=false; shift ;;
        --no-bundle) BUILD_BUNDLE=false; shift ;;
        --no-launch) LAUNCH=false; shift ;;
        --release) RELEASE=true; shift ;;
        --forward|-f) SETUP_FORWARD=true; shift ;;
        --ui)
            if [[ -z "${2:-}" ]]; then
                echo "Error: --ui requires a mode argument"
                exit 1
            fi
            case "$2" in
                native|companion|standalone|standalone-full) UI_MODE="$2" ;;
                *) echo "Error: Unknown UI mode: $2"; echo "Valid modes: native, standalone, standalone-full"; exit 1 ;;
            esac
            shift 2
            ;;
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

# Build engine bundle
if $BUILD_BUNDLE; then
    echo ">>> Building TypeScript engine bundle..."
    cd "$MONOREPO_ROOT/packages/engine"
    pnpm bundle:native
    mkdir -p "$PROJECT_DIR/quickjs-engine/src/main/assets"
    cp dist/engine.native.js "$PROJECT_DIR/quickjs-engine/src/main/assets/engine.bundle.js"
    echo "    Bundle copied to Android assets"
    cd "$PROJECT_DIR"
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

# Set up port forwarding
if $SETUP_FORWARD; then
    echo ">>> Setting up port forwarding for dev server (port $DEV_SERVER_PORT)..."

    case "$DEVICE_TYPE" in
        serial|wifi)
            # For local devices, just set up adb reverse
            adb -s "$DEVICE_CONNECTION" reverse tcp:$DEV_SERVER_PORT tcp:$DEV_SERVER_PORT
            echo "Port forwarding active! App can reach localhost:$DEV_SERVER_PORT"
            ;;
        ssh)
            SSH_HOST="${DEVICE_CONNECTION%%:*}"
            REMOTE_ADB="${DEVICE_CONNECTION#*:}"
            REMOTE_HOME=$(ssh "$SSH_HOST" 'echo $HOME')
            REMOTE_ADB="${REMOTE_ADB/#\~/$REMOTE_HOME}"

            # Set up ADB reverse on remote (Android localhost -> remote localhost)
            echo "Setting up ADB reverse tcp:$DEV_SERVER_PORT..."
            ssh "$SSH_HOST" "$REMOTE_ADB reverse tcp:$DEV_SERVER_PORT tcp:$DEV_SERVER_PORT"

            # Check if SSH tunnel already exists
            if pgrep -f "ssh.*-R $DEV_SERVER_PORT:localhost:$DEV_SERVER_PORT.*$SSH_HOST" > /dev/null; then
                echo "SSH reverse tunnel already running."
            else
                echo "Starting SSH reverse tunnel (local :$DEV_SERVER_PORT -> $SSH_HOST :$DEV_SERVER_PORT)..."
                ssh -f -N -R "$DEV_SERVER_PORT:localhost:$DEV_SERVER_PORT" "$SSH_HOST"
                echo "SSH tunnel started in background."
            fi

            echo "Port forwarding active! App can reach localhost:$DEV_SERVER_PORT"
            echo "To stop tunnel: pkill -f 'ssh.*-R $DEV_SERVER_PORT.*$SSH_HOST'"
            ;;
    esac
fi

# Launch app
if $LAUNCH; then
    echo ">>> Launching app (UI mode: $UI_MODE)..."

    LAUNCH_CMD="am start -n app.ok200.android/.MainActivity"

    run_adb_command "$DEVICE_NAME" shell "$LAUNCH_CMD"
fi

echo ""
echo "=== Installed $BUILD_TYPE to $DEVICE_NAME (UI: $UI_MODE) ==="
echo ""
echo "Useful commands:"
echo "    ./dev-logs.sh $DEVICE_NAME           # Watch app logs"
echo "    ./dev-reset.sh $DEVICE_NAME          # Clear app data"
echo "    ./dev-shell.sh $DEVICE_NAME          # ADB shell"
echo ""
