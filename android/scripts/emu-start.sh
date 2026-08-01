#!/usr/bin/env bash
#
# emu-start.sh - Start emulator and set up port forwarding
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="${ANDROID_HOME:-$HOME/.android-sdk}"
AVD_NAME="${AVD_NAME:-jstorrent-dev}"
DAEMON_PORT="${DAEMON_PORT:-7800}"
#GPU_MODE="${GPU_MODE:-auto}"
GPU_MODE="${GPU_MODE:-off}"
#ENABLE HW ACCEL (not good on my machine, crashes and visual glitch in host OS
#GPU_MODE="${GPU_MODE:-host}"

# Ensure tools are in PATH
export PATH="$SDK_ROOT/cmdline-tools/latest/bin:$SDK_ROOT/platform-tools:$SDK_ROOT/emulator:$PATH"

get_emulator_serial() {
    adb devices 2>/dev/null | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1; exit }'
}

# Check if emulator is already running. Always target its serial explicitly so
# an attached physical device cannot satisfy boot checks or receive forwards.
DEVICE="$(get_emulator_serial)"
if [[ -n "$DEVICE" ]]; then
    echo "Emulator already running"
    echo "Device: $DEVICE"
else
    echo ">>> Starting emulator '$AVD_NAME'..."
    
    # Check AVD exists
    if ! avdmanager list avd -c | grep -q "^${AVD_NAME}$"; then
        echo "Error: AVD '$AVD_NAME' not found. Run setup-emulator.sh first."
        exit 1
    fi
    
    # Start emulator in background
    # -no-snapshot: fresh boot each time (cleaner for dev)
    # -no-audio: avoid audio driver issues
    # -gpu auto: use host GPU acceleration
    emulator -avd "$AVD_NAME" \
        -no-snapshot \
        -no-audio \
        -gpu "$GPU_MODE" \
        &>/tmp/emulator.log &
    
    EMULATOR_PID=$!
    echo "    Emulator PID: $EMULATOR_PID"
    echo "    Log: /tmp/emulator.log"
    
    # Wait for boot
    echo ">>> Waiting for emulator to boot..."
    TIMEOUT=120
    ELAPSED=0
    while [[ $ELAPSED -lt $TIMEOUT ]]; do
        DEVICE="$(get_emulator_serial)"
        if [[ -n "$DEVICE" ]] && adb -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; then
            break
        fi
        sleep 2
        ELAPSED=$((ELAPSED + 2))
        printf "."
    done
    echo ""
    
    if [[ $ELAPSED -ge $TIMEOUT ]]; then
        echo "Error: Emulator failed to boot within ${TIMEOUT}s"
        echo "Check /tmp/emulator.log for details"
        exit 1
    fi
    
    echo "    Boot complete!"
fi

# Set up port forwarding
echo ""
echo ">>> Setting up port forwarding (host:$DAEMON_PORT -> device:$DAEMON_PORT)..."
adb -s "$DEVICE" forward tcp:$DAEMON_PORT tcp:$DAEMON_PORT

# Also forward common alternative ports
for ALT_PORT in 7805 7814 7827; do
    adb -s "$DEVICE" forward tcp:$ALT_PORT tcp:$ALT_PORT 2>/dev/null || true
done

echo ""
echo "=== Emulator Ready ==="
echo ""
echo "Port forwarding active: localhost:$DAEMON_PORT -> emulator:$DAEMON_PORT"
echo ""
echo "Next steps:"
echo "    ./emu-install.sh     # Install the APK"
echo "    ./emu-logs.sh        # Watch logs"
echo "    adb shell            # Shell into device"
echo ""
echo "Extension can connect to: http://127.0.0.1:$DAEMON_PORT"
echo ""
