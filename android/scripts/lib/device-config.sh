#!/usr/bin/env bash
#
# device-config.sh - Shared functions for device configuration
#
# Source this file in dev-*.sh scripts:
#   source "$(dirname "$0")/lib/device-config.sh"
#
# Config file: ~/.ok200-devices
# Format: name=type:connection_info
#   Types: serial (USB), wifi (WiFi ADB), ssh (remote ADB over SSH)
#
# Example:
#   pixel9=serial:ABC123XYZ
#   motog=wifi:192.168.1.50:5555
#   chromebook=ssh:chromebook:~/android-sdk/platform-tools/adb

DEVICE_CONFIG_FILE="${DEVICE_CONFIG_FILE:-$HOME/.ok200-devices}"

# SDK path for local adb
SDK_ROOT="${ANDROID_HOME:-$HOME/.android-sdk}"
export PATH="$SDK_ROOT/platform-tools:$PATH"

# Load device config by name
# Sets: DEVICE_TYPE, DEVICE_CONNECTION
# Returns 0 on success, 1 if device not found
load_device_config() {
    local device_name="$1"

    if [[ ! -f "$DEVICE_CONFIG_FILE" ]]; then
        echo "Error: Device config file not found: $DEVICE_CONFIG_FILE" >&2
        echo "Create it with entries like: pixel9=serial:ABC123XYZ" >&2
        return 1
    fi

    local line
    line=$(grep "^${device_name}=" "$DEVICE_CONFIG_FILE" 2>/dev/null | head -1)

    if [[ -z "$line" ]]; then
        echo "Error: Device '$device_name' not found in $DEVICE_CONFIG_FILE" >&2
        return 1
    fi

    # Parse: name=type:connection
    local value="${line#*=}"
    DEVICE_TYPE="${value%%:*}"
    DEVICE_CONNECTION="${value#*:}"

    case "$DEVICE_TYPE" in
        serial|wifi|ssh)
            return 0
            ;;
        *)
            echo "Error: Unknown device type '$DEVICE_TYPE' for device '$device_name'" >&2
            echo "Valid types: serial, wifi, ssh" >&2
            return 1
            ;;
    esac
}

# Get the adb command prefix for a device
# For serial/wifi: "adb -s <serial>"
# For ssh: returns empty (ssh commands handled separately)
get_adb_prefix() {
    local device_name="$1"

    if ! load_device_config "$device_name"; then
        return 1
    fi

    case "$DEVICE_TYPE" in
        serial)
            echo "adb -s $DEVICE_CONNECTION"
            ;;
        wifi)
            echo "adb -s $DEVICE_CONNECTION"
            ;;
        ssh)
            # For SSH devices, caller needs to handle specially
            echo ""
            ;;
    esac
}

# Run an adb command on a device
# Usage: run_adb_command <device_name> <adb_args...>
# For SSH devices, wraps command in ssh
run_adb_command() {
    local device_name="$1"
    shift

    if ! load_device_config "$device_name"; then
        return 1
    fi

    case "$DEVICE_TYPE" in
        serial|wifi)
            adb -s "$DEVICE_CONNECTION" "$@"
            ;;
        ssh)
            # Parse ssh connection: host:adb_path
            local ssh_host="${DEVICE_CONNECTION%%:*}"
            local remote_adb="${DEVICE_CONNECTION#*:}"

            # Expand ~ in remote_adb path
            ssh "$ssh_host" "$remote_adb $*"
            ;;
    esac
}

# Check if a device is connected
# Returns 0 if connected, 1 if not
check_device_connected() {
    local device_name="$1"

    if ! load_device_config "$device_name"; then
        return 1
    fi

    case "$DEVICE_TYPE" in
        serial|wifi)
            adb devices 2>/dev/null | grep -q "^${DEVICE_CONNECTION}[[:space:]]"
            ;;
        ssh)
            local ssh_host="${DEVICE_CONNECTION%%:*}"
            local remote_adb="${DEVICE_CONNECTION#*:}"

            # Check if SSH host is reachable and adb has devices
            ssh -o ConnectTimeout=5 "$ssh_host" "$remote_adb devices 2>/dev/null" | grep -q "device$"
            ;;
    esac
}

# List all configured devices with their status
list_all_devices() {
    if [[ ! -f "$DEVICE_CONFIG_FILE" ]]; then
        echo "No device config file found: $DEVICE_CONFIG_FILE"
        echo ""
        echo "Create it with entries like:"
        echo "  pixel9=serial:ABC123XYZ"
        echo "  motog=wifi:192.168.1.50:5555"
        echo "  chromebook=ssh:chromebook:~/android-sdk/platform-tools/adb"
        return 1
    fi

    printf "%-15s %-8s %-12s %s\n" "DEVICE" "TYPE" "STATUS" "CONNECTION"
    printf "%-15s %-8s %-12s %s\n" "------" "----" "------" "----------"

    while IFS='=' read -r name config || [[ -n "$name" ]]; do
        # Skip empty lines and comments
        [[ -z "$name" || "$name" =~ ^[[:space:]]*# ]] && continue

        local type="${config%%:*}"
        local connection="${config#*:}"
        local status="unknown"

        # Check connection status
        if load_device_config "$name" 2>/dev/null; then
            if check_device_connected "$name" 2>/dev/null; then
                status="connected"
            else
                status="offline"
            fi
        else
            status="invalid"
        fi

        # Truncate long connections for display
        local display_conn="$connection"
        if [[ ${#display_conn} -gt 35 ]]; then
            display_conn="${display_conn:0:32}..."
        fi

        printf "%-15s %-8s %-12s %s\n" "$name" "$type" "$status" "$display_conn"
    done < "$DEVICE_CONFIG_FILE"
}

# Connect a WiFi device (run adb connect)
connect_wifi_device() {
    local device_name="$1"

    if ! load_device_config "$device_name"; then
        return 1
    fi

    if [[ "$DEVICE_TYPE" != "wifi" ]]; then
        echo "Error: Device '$device_name' is type '$DEVICE_TYPE', not wifi" >&2
        return 1
    fi

    echo "Connecting to $device_name at $DEVICE_CONNECTION..."
    adb connect "$DEVICE_CONNECTION"
}

# Disconnect a WiFi device
disconnect_wifi_device() {
    local device_name="$1"

    if ! load_device_config "$device_name"; then
        return 1
    fi

    if [[ "$DEVICE_TYPE" != "wifi" ]]; then
        echo "Error: Device '$device_name' is type '$DEVICE_TYPE', not wifi" >&2
        return 1
    fi

    echo "Disconnecting $device_name at $DEVICE_CONNECTION..."
    adb disconnect "$DEVICE_CONNECTION"
}

# Copy a file to a device (for SSH devices, uses scp)
# Usage: copy_to_device <device_name> <local_path> <remote_path>
copy_to_device() {
    local device_name="$1"
    local local_path="$2"
    local remote_path="$3"

    if ! load_device_config "$device_name"; then
        return 1
    fi

    case "$DEVICE_TYPE" in
        serial|wifi)
            adb -s "$DEVICE_CONNECTION" push "$local_path" "$remote_path"
            ;;
        ssh)
            local ssh_host="${DEVICE_CONNECTION%%:*}"
            scp "$local_path" "$ssh_host:$remote_path"
            ;;
    esac
}

# Get the SSH host for an SSH device (or empty for local devices)
get_ssh_host() {
    local device_name="$1"

    if ! load_device_config "$device_name"; then
        return 1
    fi

    if [[ "$DEVICE_TYPE" == "ssh" ]]; then
        echo "${DEVICE_CONNECTION%%:*}"
    fi
}

# Get the remote ADB path for an SSH device
get_remote_adb_path() {
    local device_name="$1"

    if ! load_device_config "$device_name"; then
        return 1
    fi

    if [[ "$DEVICE_TYPE" == "ssh" ]]; then
        echo "${DEVICE_CONNECTION#*:}"
    fi
}
