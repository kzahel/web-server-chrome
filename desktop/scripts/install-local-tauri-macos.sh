#!/bin/bash
set -e

if [[ "$(uname)" != "Darwin" ]]; then
    echo "Error: This script is for macOS only."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$SCRIPT_DIR/../tauri-app"

if [ ! -f "$TAURI_DIR/src-tauri/tauri.conf.json" ]; then
    echo "Error: Cannot find tauri-app at $TAURI_DIR"
    exit 1
fi

echo "Building Tauri app in release mode (unsigned)..."
cd "$TAURI_DIR"
pnpm tauri build --no-sign --bundles app

APP_NAME="200 OK.app"
BUILD_APP="$SCRIPT_DIR/../target/release/bundle/macos/$APP_NAME"

if [ ! -d "$BUILD_APP" ]; then
    echo "Error: Built app not found at $BUILD_APP"
    exit 1
fi

DEST_DIR="$HOME/Applications"
mkdir -p "$DEST_DIR"

echo "Installing to $DEST_DIR/$APP_NAME..."
# Remove old version if present
rm -rf "$DEST_DIR/$APP_NAME"
cp -R "$BUILD_APP" "$DEST_DIR/$APP_NAME"

# Strip quarantine so Gatekeeper doesn't block unsigned app
xattr -cr "$DEST_DIR/$APP_NAME"

echo "Installed: $DEST_DIR/$APP_NAME"
