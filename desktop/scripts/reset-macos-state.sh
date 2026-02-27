#!/bin/bash
# Reset 200 OK state on macOS for testing
# This removes saved preferences and app state for a clean testing environment

set -e

APP_SUPPORT_DIR="$HOME/Library/Application Support/200 OK"
APP_SUPPORT_LOWER="$HOME/Library/Application Support/200-ok"

echo "=== 200 OK macOS State Reset ==="
echo

# Kill any running ok200-host processes
echo "Stopping running processes..."
pkill -x "ok200-host" 2>/dev/null && echo "Stopped ok200-host" || true
sleep 0.5
echo

# Remove app state
echo "Removing app state..."

for dir in "$APP_SUPPORT_DIR" "$APP_SUPPORT_LOWER"; do
    if [ -d "$dir" ]; then
        echo "Clearing $dir..."
        # Remove log files
        rm -fv "$dir"/*.log 2>/dev/null || true
        # Remove any cached data
        rm -fv "$dir"/*.cache 2>/dev/null || true
        # Remove state/config files
        rm -fv "$dir"/*.json 2>/dev/null || true
    fi
done

echo
echo "App state cleared."
echo

echo "=== Reset Complete ==="
