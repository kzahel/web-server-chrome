#!/bin/bash
set -euo pipefail

# 200 OK Web Server AppImage installer for Linux.
# Usage: curl -fsSL https://ok200.app/install.sh | bash
#
# Installs entirely within the current user's home directory:
#   ~/.local/bin/200-ok.AppImage
#   ~/.local/lib/ok200/ok200-host
#   ~/.local/share/applications/200-ok.desktop
#
# No administrator privileges are required. Downloaded release assets are
# verified against the SHA256SUMS file published with the same GitHub release.

FALLBACK_TAG="desktop-v0.1.4"
RELEASES_API_URL="https://api.github.com/repos/kzahel/web-server-chrome/releases?per_page=100"
MANIFEST_NAME="app.ok200.native"
MANIFEST_FILENAME="${MANIFEST_NAME}.json"
EXTENSION_ID="lpkjdhnmgkhaabhimpdinmdgejoaejic"

if [ -t 1 ]; then
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    GREEN='' YELLOW='' RED='' BOLD='' NC=''
fi

info() { echo -e "${GREEN}==>${NC} ${BOLD}$*${NC}"; }
warn() { echo -e "${YELLOW}warning:${NC} $*"; }
error() { echo -e "${RED}error:${NC} $*" >&2; }

if [[ "$(uname -s)" != "Linux" ]]; then
    error "This installer is for Linux."
    echo "Download another platform from https://ok200.app/download"
    exit 1
fi

case "$(uname -m)" in
    x86_64|amd64) ASSET_ARCH="amd64" ;;
    *)
        error "Unsupported architecture: $(uname -m)"
        echo "The current Linux desktop release supports x86_64."
        exit 1
        ;;
esac

for command_name in curl sha256sum awk; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        error "$command_name is required."
        exit 1
    fi
done

info "Checking for the latest desktop release..."
TAG=$(
    curl -fsSL "$RELEASES_API_URL" 2>/dev/null |
        grep -o '"tag_name":[[:space:]]*"desktop-v[^"]*"' |
        sed -n '1{s/.*"\(desktop-v[^"]*\)"/\1/;p;}' || true
)
if [ -z "$TAG" ]; then
    warn "Could not resolve the latest release; using ${FALLBACK_TAG}."
    TAG="$FALLBACK_TAG"
fi

VERSION="${TAG#desktop-v}"
ASSET_NAME="200.OK_${VERSION}_${ASSET_ARCH}.AppImage"
BASE_URL="https://github.com/kzahel/web-server-chrome/releases/download/${TAG}"
TEMP_DIR=$(mktemp -d)
STAGED_INSTALL_PATH=""
STAGED_HOST_PATH=""
cleanup() {
    rm -rf "$TEMP_DIR"
    if [ -n "$STAGED_INSTALL_PATH" ]; then
        rm -f "$STAGED_INSTALL_PATH"
    fi
    if [ -n "$STAGED_HOST_PATH" ]; then
        rm -f "$STAGED_HOST_PATH"
    fi
}
trap cleanup EXIT

info "Downloading checksum manifest..."
curl -fSL --progress-bar "${BASE_URL}/SHA256SUMS" -o "${TEMP_DIR}/SHA256SUMS"
EXPECTED=$(
    awk -v name="$ASSET_NAME" '$2 == name { print $1; exit }' "${TEMP_DIR}/SHA256SUMS"
)
if [[ ! "$EXPECTED" =~ ^[[:xdigit:]]{64}$ ]]; then
    error "No valid checksum was published for ${ASSET_NAME}."
    exit 1
fi

info "Downloading ${ASSET_NAME}..."
curl -fSL --progress-bar "${BASE_URL}/${ASSET_NAME}" -o "${TEMP_DIR}/${ASSET_NAME}"
ACTUAL=$(sha256sum "${TEMP_DIR}/${ASSET_NAME}" | awk '{ print $1 }')
if [ "${ACTUAL,,}" != "${EXPECTED,,}" ]; then
    error "Checksum verification failed for ${ASSET_NAME}."
    exit 1
fi
info "Verified ${ASSET_NAME}."

INSTALL_DIR="${HOME}/.local/bin"
INSTALL_PATH="${INSTALL_DIR}/200-ok.AppImage"
LIB_DIR="${HOME}/.local/lib/ok200"
CONFIG_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/ok200-native"
DATA_DIR="${XDG_DATA_HOME:-${HOME}/.local/share}"
APPLICATIONS_DIR="${DATA_DIR}/applications"
ICON_DIR="${DATA_DIR}/icons/hicolor/128x128/apps"

mkdir -p "$INSTALL_DIR" "$LIB_DIR" "$CONFIG_DIR" "$APPLICATIONS_DIR" "$ICON_DIR"
chmod 755 "${TEMP_DIR}/${ASSET_NAME}"
STAGED_INSTALL_PATH="${INSTALL_PATH}.$$.tmp"
cp "${TEMP_DIR}/${ASSET_NAME}" "$STAGED_INSTALL_PATH"
chmod 755 "$STAGED_INSTALL_PATH"
mv -f "$STAGED_INSTALL_PATH" "$INSTALL_PATH"
printf '%s\n' "$INSTALL_PATH" > "${CONFIG_DIR}/appimage-path"

info "Installing browser integration..."
(
    cd "$TEMP_DIR"
    "$INSTALL_PATH" --appimage-extract "usr/bin/ok200-host" >/dev/null
    "$INSTALL_PATH" --appimage-extract \
        "usr/share/icons/hicolor/128x128/apps/ok200-desktop.png" >/dev/null
)

HOST_SOURCE="${TEMP_DIR}/squashfs-root/usr/bin/ok200-host"
ICON_SOURCE="${TEMP_DIR}/squashfs-root/usr/share/icons/hicolor/128x128/apps/ok200-desktop.png"
if [ ! -f "$HOST_SOURCE" ]; then
    error "The AppImage did not contain its native messaging host."
    exit 1
fi
STAGED_HOST_PATH="${LIB_DIR}/ok200-host.$$.tmp"
cp "$HOST_SOURCE" "$STAGED_HOST_PATH"
chmod 755 "$STAGED_HOST_PATH"
mv -f "$STAGED_HOST_PATH" "${LIB_DIR}/ok200-host"
ln -sfn "$INSTALL_PATH" "${LIB_DIR}/200-ok"
if [ -f "$ICON_SOURCE" ]; then
    cp "$ICON_SOURCE" "${ICON_DIR}/ok200-desktop.png"
    chmod 644 "${ICON_DIR}/ok200-desktop.png"
fi

ESCAPED_HOST_PATH="${LIB_DIR}/ok200-host"
ESCAPED_HOST_PATH="${ESCAPED_HOST_PATH//\\/\\\\}"
ESCAPED_HOST_PATH="${ESCAPED_HOST_PATH//\"/\\\"}"
MANIFEST=$(
    cat <<MANIFEST_JSON
{
  "name": "${MANIFEST_NAME}",
  "description": "200 OK Web Server Native Messaging Host",
  "path": "${ESCAPED_HOST_PATH}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXTENSION_ID}/"
  ]
}
MANIFEST_JSON
)

BROWSER_DIRS=(
    "${HOME}/.config/google-chrome"
    "${HOME}/.config/chromium"
    "${HOME}/.config/BraveSoftware/Brave-Browser"
    "${HOME}/.config/microsoft-edge"
)
REGISTERED=0
for browser_dir in "${BROWSER_DIRS[@]}"; do
    if [ -d "$browser_dir" ]; then
        hosts_dir="${browser_dir}/NativeMessagingHosts"
        mkdir -p "$hosts_dir"
        printf '%s\n' "$MANIFEST" > "${hosts_dir}/${MANIFEST_FILENAME}"
        chmod 644 "${hosts_dir}/${MANIFEST_FILENAME}"
        REGISTERED=$((REGISTERED + 1))
    fi
done

ESCAPED_INSTALL_PATH="${INSTALL_PATH//\\/\\\\}"
ESCAPED_INSTALL_PATH="${ESCAPED_INSTALL_PATH//\"/\\\"}"
ESCAPED_INSTALL_PATH="${ESCAPED_INSTALL_PATH//\$/\\\$}"
ESCAPED_INSTALL_PATH="${ESCAPED_INSTALL_PATH//\`/\\\`}"
cat > "${APPLICATIONS_DIR}/200-ok.desktop" <<DESKTOP_ENTRY
[Desktop Entry]
Type=Application
Name=200 OK
Comment=200 OK Web Server Desktop App
Exec="${ESCAPED_INSTALL_PATH}" %U
Icon=ok200-desktop
Terminal=false
Categories=Development;Network;
StartupWMClass=ok200-desktop
DESKTOP_ENTRY
chmod 644 "${APPLICATIONS_DIR}/200-ok.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

echo ""
info "200 OK ${VERSION} installed."
echo "  AppImage: ${INSTALL_PATH}"
echo "  Launch it from your application menu or run:"
echo "    ${INSTALL_PATH}"
if [ "$REGISTERED" -eq 0 ]; then
    echo ""
    warn "No supported Chromium browser profile exists yet."
    echo "Launch 200 OK after installing Chrome, Chromium, Brave, or Edge to register it."
fi
