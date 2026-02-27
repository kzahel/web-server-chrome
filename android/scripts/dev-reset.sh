#!/usr/bin/env bash
#
# dev-reset.sh - Clear Ok200 app data on a real device
#
# Usage:
#   ./dev-reset.sh <device>
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/device-config.sh"

usage() {
    echo "Usage: $0 <device>"
    echo ""
    echo "Clear Ok200 app data (settings, cache, databases)"
    echo ""
    echo "Arguments:"
    echo "  <device>       Device name from ~/.ok200-devices"
    exit 0
}

if [[ $# -lt 1 ]]; then
    echo "Error: Device name required"
    echo ""
    usage
fi

DEVICE_NAME="$1"

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

echo "Clearing app data on $DEVICE_NAME..."
run_adb_command "$DEVICE_NAME" shell pm clear app.ok200.android

echo "Done! App data cleared."
