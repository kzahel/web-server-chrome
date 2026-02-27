#!/usr/bin/env bash
#
# dev-connect.sh - Connect/disconnect WiFi ADB devices
#
# Usage:
#   ./dev-connect.sh <device>              # Connect
#   ./dev-connect.sh <device> --disconnect # Disconnect
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/device-config.sh"

DISCONNECT=false

usage() {
    echo "Usage: $0 <device> [OPTIONS]"
    echo ""
    echo "Connect or disconnect a WiFi ADB device"
    echo ""
    echo "Arguments:"
    echo "  <device>         Device name from ~/.ok200-devices (must be wifi type)"
    echo ""
    echo "Options:"
    echo "  --disconnect, -d  Disconnect instead of connect"
    echo "  -h, --help        Show this help message"
    exit 0
}

DEVICE_NAME=""

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --disconnect|-d) DISCONNECT=true; shift ;;
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

if $DISCONNECT; then
    disconnect_wifi_device "$DEVICE_NAME"
else
    connect_wifi_device "$DEVICE_NAME"
fi
