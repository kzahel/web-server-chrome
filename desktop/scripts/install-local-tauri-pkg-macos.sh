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

# Read version from tauri.conf.json
VERSION=$(python3 -c "import json; print(json.load(open('$TAURI_DIR/src-tauri/tauri.conf.json'))['version'])")
ARCH=$(uname -m)
case "$ARCH" in
    arm64) ARCH_LABEL="aarch64" ;;
    x86_64) ARCH_LABEL="x64" ;;
    *) echo "Error: Unsupported architecture: $ARCH"; exit 1 ;;
esac

echo "Building Tauri app in release mode (unsigned)..."
cd "$TAURI_DIR"
pnpm tauri build --no-sign --bundles app

BUILD_APP="$SCRIPT_DIR/../target/release/bundle/macos/200 OK.app"
if [ ! -d "$BUILD_APP" ]; then
    echo "Error: Built app not found at $BUILD_APP"
    exit 1
fi

echo "Building .pkg installer (unsigned, user-domain)..."
cd "$SCRIPT_DIR/../tauri-app"
./scripts/build-macos-pkg.sh --user-domain "$BUILD_APP" "$VERSION" "$ARCH_LABEL"

PKG_FILE="200_OK_${VERSION}_${ARCH_LABEL}.pkg"
if [ ! -f "$PKG_FILE" ]; then
    echo "Error: .pkg not found at $PKG_FILE"
    exit 1
fi

echo "Installing .pkg to ~/Applications (no admin required)..."
installer -pkg "$PKG_FILE" -target CurrentUserHomeDirectory

# Strip quarantine so Gatekeeper doesn't block unsigned app
xattr -cr "$HOME/Applications/200 OK.app"

echo "Installed: $HOME/Applications/200 OK.app"
