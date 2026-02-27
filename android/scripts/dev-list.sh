#!/usr/bin/env bash
#
# dev-list.sh - List configured devices and their connection status
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/device-config.sh"

list_all_devices
