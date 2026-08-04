#!/bin/bash
# Uninstall script for 200 OK Desktop
# Run: bash "/Applications/200 OK Web Server.app/Contents/Resources/uninstall.sh"

APP_PATH="/Applications/200 OK Web Server.app"

echo "Uninstalling 200 OK..."

# Kill any running processes
echo "Stopping running processes..."
pkill -x "200 OK" 2>/dev/null && echo "Stopped 200 OK" || true
pkill -x "ok200-host" 2>/dev/null && echo "Stopped ok200-host" || true
sleep 0.5

# Remove native messaging manifests from all browsers
APP_SUPPORT="$HOME/Library/Application Support"
MANIFEST_NAME="app.ok200.native.json"
BROWSERS=(
    "Google/Chrome"
    "Google/Chrome Canary"
    "Chromium"
    "BraveSoftware/Brave-Browser"
    "Microsoft Edge"
    "Vivaldi"
    "Arc/User Data"
)

for browser in "${BROWSERS[@]}"; do
    MANIFEST="$APP_SUPPORT/$browser/NativeMessagingHosts/$MANIFEST_NAME"
    if [ -f "$MANIFEST" ]; then
        rm "$MANIFEST"
        echo "Removed manifest: $MANIFEST"
    fi
done

# Remove the app
if [ -d "$APP_PATH" ]; then
    rm -rf "$APP_PATH"
    echo "Removed: $APP_PATH"
fi

# Forget the package receipt
pkgutil --forget app.ok200.desktop 2>/dev/null || true

echo "Uninstallation complete."
