#!/usr/bin/env bash
#
# test.sh - Run Android tests
#
# Usage:
#   ./test.sh                  # Run unit tests (default)
#   ./test.sh --unit           # Run unit tests (JVM, no device needed)
#   ./test.sh --integration    # Run instrumented tests (emulator only)
#   ./test.sh --all            # Run unit and instrumented tests
#   ./test.sh --integration --device SERIAL  # Target specific device
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-$HOME/.android-sdk}"
export PATH="$SDK_ROOT/platform-tools:$PATH"

# Defaults
RUN_UNIT=false
RUN_INTEGRATION=false
DEVICE=""
VERBOSE=false

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Test suites:
  --unit            Run unit tests (JVM, no device needed)
  --integration     Run instrumented tests (needs device/emulator)
  --all             Run all test suites

Options:
  --device SERIAL   Target a specific device (default: emulator)
  --verbose         Show full gradle output (default: --quiet)
  -h, --help        Show this help

Device selection:
  By default, only the emulator is used. If no emulator is running, the script
  exits with an error. Use --device SERIAL to target a specific device instead.

If no suite is specified, --unit is assumed.

Examples:
  $(basename "$0")                          # Unit tests only
  $(basename "$0") --integration            # Instrumented on emulator
  $(basename "$0") --all                    # Everything
  $(basename "$0") --integration --device 48081FDAQ002HZ  # Specific device
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --unit)         RUN_UNIT=true; shift ;;
        --integration)  RUN_INTEGRATION=true; shift ;;
        --all)          RUN_UNIT=true; RUN_INTEGRATION=true; shift ;;
        --device)       DEVICE="$2"; shift 2 ;;
        --verbose)      VERBOSE=true; shift ;;
        -h|--help)      usage ;;
        *)              echo "Unknown option: $1"; echo "Run with --help for usage."; exit 1 ;;
    esac
done

# Default to unit tests if nothing specified
if ! $RUN_UNIT && ! $RUN_INTEGRATION; then
    RUN_UNIT=true
fi

GRADLE_QUIET="--quiet"
if $VERBOSE; then
    GRADLE_QUIET=""
fi

FAILED=()

cd "$PROJECT_DIR"

# --- Unit tests ---
if $RUN_UNIT; then
    echo ""
    echo "=== Unit Tests ==="
    if ./gradlew testDebugUnitTest $GRADLE_QUIET; then
        echo "  PASSED"
    else
        echo "  FAILED"
        FAILED+=("unit")
    fi
fi

# --- Select device for instrumented tests ---
if $RUN_INTEGRATION; then
    if [[ -n "$DEVICE" ]]; then
        # Explicit device requested — verify it's connected
        if ! adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}' | grep -qx "$DEVICE"; then
            echo ""
            echo "Error: Device '$DEVICE' not found or not online."
            echo "Connected devices:"
            adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print "  " $1}'
            exit 1
        fi
    else
        # Default to emulator
        DEVICE=$(adb devices 2>/dev/null | grep -o 'emulator-[0-9]*' | head -1)
        if [[ -z "$DEVICE" ]]; then
            echo ""
            echo "Error: No emulator running. Start one with: emu start"
            echo "Or specify a device with: --device SERIAL"
            exit 1
        fi
    fi
    export ANDROID_SERIAL="$DEVICE"
    echo ""
    echo "Using device: $DEVICE"
fi

# --- Integration tests (instrumented) ---
if $RUN_INTEGRATION; then
    echo ""
    echo "=== Integration Tests (instrumented) ==="
    if ./gradlew connectedDebugAndroidTest $GRADLE_QUIET; then
        echo "  PASSED"
    else
        echo "  FAILED"
        FAILED+=("integration")
    fi
fi

# --- Summary ---
echo ""
echo "================================"
if [[ ${#FAILED[@]} -eq 0 ]]; then
    echo "All tests passed."
else
    echo "FAILURES: ${FAILED[*]}"
    exit 1
fi
