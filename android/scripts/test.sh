#!/usr/bin/env bash
#
# test.sh - Run Android tests
#
# Usage:
#   ./test.sh                  # Run unit tests (default)
#   ./test.sh --unit           # Run unit tests (JVM, no device needed)
#   ./test.sh --integration    # Run instrumented tests (excludes e2e, emulator only)
#   ./test.sh --e2e            # Run e2e tests (emulator + seeder)
#   ./test.sh --all            # Run all tests (emulator + seeder)
#   ./test.sh --integration --device SERIAL  # Target specific device
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONOREPO_ROOT="$(cd "$PROJECT_DIR/.." && pwd)"
SDK_ROOT="${ANDROID_HOME:-$HOME/.android-sdk}"
export PATH="$SDK_ROOT/platform-tools:$PATH"

E2E_PACKAGE="app.ok200.android.e2e"

# Defaults
RUN_UNIT=false
RUN_INTEGRATION=false
RUN_E2E=false
DEVICE=""
SEEDER_HOST=""
SEEDER_PORT=""
START_SEEDER=false
VERBOSE=false

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Test suites:
  --unit            Run unit tests (JVM, no device needed)
  --integration     Run instrumented tests excluding e2e (needs device/emulator)
  --e2e             Run e2e tests (needs device/emulator + seeder)
  --all             Run all test suites

Options:
  --device SERIAL   Target a specific device (default: emulator)
  --seeder-host H   Seeder host for e2e tests (default: 10.0.2.2 for emulator)
  --seeder-port P   Seeder port for e2e tests (default: 6881)
  --start-seeder    Start pnpm seed-for-test before e2e tests
  --verbose         Show full gradle output (default: --quiet)
  -h, --help        Show this help

Device selection:
  By default, only the emulator is used. If no emulator is running, the script
  exits with an error. Use --device SERIAL to target a specific device instead.

If no suite is specified, --unit is assumed.

Examples:
  $(basename "$0")                          # Unit tests only
  $(basename "$0") --integration            # Instrumented on emulator
  $(basename "$0") --e2e --start-seeder     # E2E with auto-started seeder
  $(basename "$0") --all --start-seeder     # Everything
  $(basename "$0") --integration --device 48081FDAQ002HZ  # Specific device
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --unit)         RUN_UNIT=true; shift ;;
        --integration)  RUN_INTEGRATION=true; shift ;;
        --e2e)          RUN_E2E=true; shift ;;
        --all)          RUN_UNIT=true; RUN_INTEGRATION=true; RUN_E2E=true; shift ;;
        --device)       DEVICE="$2"; shift 2 ;;
        --seeder-host)  SEEDER_HOST="$2"; shift 2 ;;
        --seeder-port)  SEEDER_PORT="$2"; shift 2 ;;
        --start-seeder) START_SEEDER=true; shift ;;
        --verbose)      VERBOSE=true; shift ;;
        -h|--help)      usage ;;
        *)              echo "Unknown option: $1"; echo "Run with --help for usage."; exit 1 ;;
    esac
done

# Default to unit tests if nothing specified
if ! $RUN_UNIT && ! $RUN_INTEGRATION && ! $RUN_E2E; then
    RUN_UNIT=true
fi

GRADLE_QUIET="--quiet"
if $VERBOSE; then
    GRADLE_QUIET=""
fi

SEEDER_PID=""
cleanup() {
    if [[ -n "$SEEDER_PID" ]]; then
        echo ">>> Stopping seeder (pid $SEEDER_PID)..."
        kill "$SEEDER_PID" 2>/dev/null || true
        wait "$SEEDER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

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
if $RUN_INTEGRATION || $RUN_E2E; then
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

# --- Integration tests (instrumented, excluding e2e) ---
if $RUN_INTEGRATION; then
    echo ""
    echo "=== Integration Tests (instrumented, excluding e2e) ==="
    if ./gradlew connectedDebugAndroidTest \
        -Pandroid.testInstrumentationRunnerArguments.notPackage="$E2E_PACKAGE" \
        $GRADLE_QUIET; then
        echo "  PASSED"
    else
        echo "  FAILED"
        FAILED+=("integration")
    fi
fi

# --- E2E tests (need seeder) ---
if $RUN_E2E; then
    echo ""
    echo "=== E2E Tests (requires seeder) ==="

    # Optionally start seeder
    if $START_SEEDER; then
        echo ">>> Starting seeder..."
        cd "$MONOREPO_ROOT"
        pnpm seed-for-test &
        SEEDER_PID=$!
        cd "$PROJECT_DIR"
        # Give seeder time to start
        sleep 3
        echo "    Seeder started (pid $SEEDER_PID)"
    fi

    # Build instrumentation args
    INST_ARGS="-Pandroid.testInstrumentationRunnerArguments.package=$E2E_PACKAGE"
    if [[ -n "$SEEDER_HOST" ]]; then
        INST_ARGS="$INST_ARGS -Pandroid.testInstrumentationRunnerArguments.seeder_host=$SEEDER_HOST"
    fi
    if [[ -n "$SEEDER_PORT" ]]; then
        INST_ARGS="$INST_ARGS -Pandroid.testInstrumentationRunnerArguments.seeder_port=$SEEDER_PORT"
    fi

    # shellcheck disable=SC2086
    if ./gradlew connectedDebugAndroidTest $INST_ARGS $GRADLE_QUIET; then
        echo "  PASSED"
    else
        echo "  FAILED"
        FAILED+=("e2e")
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
