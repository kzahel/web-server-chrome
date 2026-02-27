#!/usr/bin/env bash
#
# dev-shell.sh - Interactive ADB shell on a real device
#
# Usage:
#   ./dev-shell.sh <device>
#   ./dev-shell.sh <device> <command>   # Run single command
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/device-config.sh"

usage() {
    echo "Usage: $0 <device> [command]"
    echo ""
    echo "Open interactive ADB shell on a named device"
    echo ""
    echo "Arguments:"
    echo "  <device>       Device name from ~/.ok200-devices"
    echo "  [command]      Optional command to run (non-interactive)"
    echo ""
    echo "Examples:"
    echo "  $0 pixel9                          # Interactive shell"
    echo "  $0 pixel9 pm list packages         # Run command"
    exit 0
}

if [[ $# -lt 1 ]]; then
    echo "Error: Device name required"
    echo ""
    usage
fi

DEVICE_NAME="$1"
shift

if [[ "$DEVICE_NAME" == "-h" || "$DEVICE_NAME" == "--help" ]]; then
    usage
fi

# Load device config
if ! load_device_config "$DEVICE_NAME"; then
    echo ""
    echo "Available devices:"
    list_all_devices 2>/dev/null || true
    exit 1
fi

case "$DEVICE_TYPE" in
    serial|wifi)
        if [[ $# -gt 0 ]]; then
            adb -s "$DEVICE_CONNECTION" shell "$@"
        else
            adb -s "$DEVICE_CONNECTION" shell
        fi
        ;;
    ssh)
        SSH_HOST="${DEVICE_CONNECTION%%:*}"
        REMOTE_ADB="${DEVICE_CONNECTION#*:}"
        REMOTE_HOME=$(ssh "$SSH_HOST" 'echo $HOME')
        REMOTE_ADB="${REMOTE_ADB/#\~/$REMOTE_HOME}"

        if [[ $# -gt 0 ]]; then
            ssh "$SSH_HOST" "$REMOTE_ADB shell $*"
        else
            # Interactive shell over SSH
            ssh -t "$SSH_HOST" "$REMOTE_ADB shell"
        fi
        ;;
esac
