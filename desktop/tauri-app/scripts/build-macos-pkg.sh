#!/bin/bash
set -euo pipefail

# Build a .pkg installer wrapping the Tauri-built "200 OK Web Server.app".
#
# Usage: build-macos-pkg.sh [--user-domain] <APP_PATH> <VERSION> <ARCH>
#   --user-domain  Install to ~/Applications (no admin required) instead of /Applications
#   APP_PATH       Path to the signed "200 OK Web Server.app" from Tauri build
#   VERSION        Version string (e.g., 0.1.0)
#   ARCH           Architecture label (aarch64 or x64)
#
# Environment variables:
#   INSTALLER_IDENTITY  (optional) Developer ID Installer identity for productsign

USER_DOMAIN=false
if [ "${1:-}" = "--user-domain" ]; then
    USER_DOMAIN=true
    shift
fi

if [ $# -ne 3 ]; then
    echo "Usage: $0 [--user-domain] <APP_PATH> <VERSION> <ARCH>"
    echo "  --user-domain  Install to ~/Applications (no admin required)"
    echo "  APP_PATH       Path to 200 OK Web Server.app from Tauri build"
    echo "  VERSION        Version string (e.g., 0.1.0)"
    echo "  ARCH           Architecture label (aarch64 or x64)"
    exit 1
fi

APP_PATH="$1"
VERSION="$2"
ARCH="$3"
OUTPUT_FILE="200_OK_${VERSION}_${ARCH}.pkg"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER_SCRIPTS="$SCRIPT_DIR/../installers/macos/scripts"
IDENTIFIER="app.ok200.desktop"

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App bundle not found at $APP_PATH"
    exit 1
fi

if [ ! -f "$INSTALLER_SCRIPTS/postinstall" ]; then
    echo "Error: postinstall script not found at $INSTALLER_SCRIPTS/postinstall"
    exit 1
fi

echo "Building .pkg installer for 200 OK Web Server v${VERSION} (${ARCH})..."
echo "  App: $APP_PATH"
echo "  Output: $OUTPUT_FILE"

# Create temporary working directory
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# Create pkgroot with the .app (installs to /Applications)
PKGROOT="$WORK_DIR/pkgroot"
mkdir -p "$PKGROOT/Applications"
cp -R "$APP_PATH" "$PKGROOT/Applications/200 OK Web Server.app"

# Build component package
COMPONENT_PKG="$WORK_DIR/ok200-component.pkg"
pkgbuild --root "$PKGROOT" \
         --identifier "$IDENTIFIER" \
         --version "$VERSION" \
         --install-location "/" \
         --scripts "$INSTALLER_SCRIPTS" \
         "$COMPONENT_PKG"

# Create distribution.xml
if $USER_DOMAIN; then
    DOMAINS='<domains enable_localSystem="false" enable_currentUserHome="true"/>'
else
    DOMAINS=""
fi
cat > "$WORK_DIR/distribution.xml" << EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>200 OK Web Server</title>
    <options customize="never" require-scripts="false" hostArchitectures="x86_64,arm64"/>
    $DOMAINS
    <choices-outline>
        <line choice="default"/>
    </choices-outline>
    <choice id="default" title="200 OK Web Server">
        <pkg-ref id="$IDENTIFIER"/>
    </choice>
    <pkg-ref id="$IDENTIFIER" version="$VERSION" onConclusion="none">ok200-component.pkg</pkg-ref>
</installer-gui-script>
EOF

# Build product archive
UNSIGNED_FILE="$WORK_DIR/unsigned-$OUTPUT_FILE"
productbuild --distribution "$WORK_DIR/distribution.xml" \
             --package-path "$WORK_DIR" \
             "$UNSIGNED_FILE"

# Sign if installer identity is available
if [ -n "${INSTALLER_IDENTITY:-}" ]; then
    echo "Signing installer with: $INSTALLER_IDENTITY"
    productsign --sign "$INSTALLER_IDENTITY" "$UNSIGNED_FILE" "$OUTPUT_FILE"
else
    echo "Warning: No INSTALLER_IDENTITY set, creating unsigned package"
    cp "$UNSIGNED_FILE" "$OUTPUT_FILE"
fi

echo "Created: $OUTPUT_FILE"
