# android-env.sh - Source this for Android dev convenience
#
# Usage: source scripts/android-env.sh
#
# Provides:
#   - ANDROID_HOME and PATH setup
#   - emu command for emulator control
#   - dev command for real device deployment
#
# Requires for dev command: ~/.ok200-devices config file
# See: scripts/devices.example for format

export ANDROID_HOME="${ANDROID_HOME:-$HOME/.android-sdk}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# Find scripts directory (works whether sourced from repo root or scripts/)
_SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
if [[ -d "$(dirname "$_SCRIPT_SOURCE")" ]]; then
    _SCRIPTS_DIR="$(cd "$(dirname "$_SCRIPT_SOURCE")" && pwd)"
else
    _SCRIPTS_DIR="./scripts"
fi

# Device config file for real devices
_DEV_CONFIG_FILE="${DEVICE_CONFIG_FILE:-$HOME/.ok200-devices}"

# Helper to get emulator serial (prefer emulator over physical devices)
_get_emu_serial() {
    adb devices 2>/dev/null | grep -o 'emulator-[0-9]*' | head -1
}

# Emulator-specific adb (fails if no emulator running)
adb_emu() {
    local serial
    serial=$(_get_emu_serial)
    if [[ -z "$serial" ]]; then
        echo "Error: No emulator running. Start one with: emu start" >&2
        return 1
    fi
    adb -s "$serial" "$@"
}

# Aliases
alias emu-start="$_SCRIPTS_DIR/emu-start.sh"
alias emu-stop="$_SCRIPTS_DIR/emu-stop.sh"
alias emu-install="$_SCRIPTS_DIR/emu-install.sh"
alias emu-logs="$_SCRIPTS_DIR/emu-logs.sh"
alias emu-shell="adb_emu shell"
alias emu-reset="adb_emu shell pm clear app.ok200.android"

# Device-specific aliases
alias emu-phone="AVD_NAME=ok200-dev $_SCRIPTS_DIR/emu-start.sh"
alias emu-tablet="AVD_NAME=ok200-tablet $_SCRIPTS_DIR/emu-start.sh"

# Quick status
alias emu-status="adb devices && adb forward --list 2>/dev/null || echo 'No forwards'"

# Shorthand for common tasks
emu() {
    case "${1:-}" in
        start)       emu-start ;;
        stop)        emu-stop ;;
        install)     shift; emu-install "$@" ;;
        logs)        shift; emu-logs "$@" ;;
        shell)       adb_emu shell ;;
        status)      emu-status ;;
        restart)     emu-stop; sleep 1; emu-start ;;
        phone)       AVD_NAME=ok200-dev emu-start ;;
        tablet)      AVD_NAME=ok200-tablet emu-start ;;
        reset)       emu-reset ;;
        *)
            echo "Usage: emu <command>"
            echo ""
            echo "Commands:"
            echo "  start       - Start emulator (default: phone)"
            echo "  stop        - Stop emulator"
            echo "  install     - Build and install APK"
            echo "  logs        - Show filtered logcat"
            echo "  shell       - ADB shell into device"
            echo "  status      - Show devices and port forwards"
            echo "  reset       - Clear app data (settings, cache, databases)"
            echo "  restart     - Stop then start"
            echo "  phone       - Start phone emulator (Pixel 6)"
            echo "  tablet      - Start tablet emulator (Pixel Tablet)"
            ;;
    esac
}

# =============================================================================
# Real device commands (dev)
# =============================================================================

# Aliases for dev scripts
alias dev-list="$_SCRIPTS_DIR/dev-list.sh"
alias dev-install="$_SCRIPTS_DIR/dev-install.sh"
alias dev-logs="$_SCRIPTS_DIR/dev-logs.sh"
alias dev-shell="$_SCRIPTS_DIR/dev-shell.sh"
alias dev-reset="$_SCRIPTS_DIR/dev-reset.sh"
alias dev-connect="$_SCRIPTS_DIR/dev-connect.sh"

# Main dev command
dev() {
    case "${1:-}" in
        list)
            dev-list
            ;;
        install)
            shift
            dev-install "$@"
            ;;
        logs)
            shift
            dev-logs "$@"
            ;;
        shell)
            shift
            dev-shell "$@"
            ;;
        reset)
            shift
            dev-reset "$@"
            ;;
        connect)
            shift
            dev-connect "$@"
            ;;
        disconnect)
            shift
            dev-connect "$@" --disconnect
            ;;
        *)
            echo "Usage: dev <command> [device] [options]"
            echo ""
            echo "Commands:"
            echo "  list                    - List configured devices and status"
            echo "  install <device>        - Build and install APK to device"
            echo "  logs <device>           - Watch logcat from device"
            echo "  shell <device>          - Open ADB shell on device"
            echo "  reset <device>          - Clear app data on device"
            echo "  connect <device>        - Connect WiFi ADB device"
            echo "  disconnect <device>     - Disconnect WiFi ADB device"
            echo ""
            echo "Device config: $_DEV_CONFIG_FILE"
            if [[ -f "$_DEV_CONFIG_FILE" ]]; then
                echo ""
                echo "Configured devices:"
                grep -v '^#' "$_DEV_CONFIG_FILE" | grep -v '^$' | cut -d= -f1 | sed 's/^/  /'
            fi
            ;;
    esac
}

# Create per-device aliases if config exists (e.g., dev-pixel9)
if [[ -f "$_DEV_CONFIG_FILE" ]]; then
    while IFS='=' read -r name _config || [[ -n "$name" ]]; do
        # Skip empty lines and comments
        [[ -z "$name" || "$name" =~ ^[[:space:]]*# ]] && continue
        # shellcheck disable=SC2139
        alias "dev-$name=$_SCRIPTS_DIR/dev-install.sh $name"
    done < "$_DEV_CONFIG_FILE"
fi

# =============================================================================
# Summary
# =============================================================================

echo "Android dev environment loaded"
echo "  ANDROID_HOME=$ANDROID_HOME"
echo "  emu: start|stop|install|logs|shell|status|reset|restart|phone|tablet"
echo "  dev: list|install|logs|shell|reset|connect|disconnect"
if [[ -f "$_DEV_CONFIG_FILE" ]]; then
    _device_count=$(grep -v '^#' "$_DEV_CONFIG_FILE" | grep -v '^$' | wc -l | tr -d ' ')
    echo "  Devices: $_device_count configured in $_DEV_CONFIG_FILE"
fi
