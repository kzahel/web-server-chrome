#!/usr/bin/env bash
#
# Set the Tauri desktop app version across all files.
# Used for testing (swap to a test version, then swap back) and by the release script.
#
# Usage: ./desktop/scripts/set-tauri-version.sh <version>
#
# Updates:
#   - desktop/Cargo.toml              (workspace version -- all crates inherit)
#   - desktop/tauri-app/src-tauri/tauri.conf.json
#   - desktop/tauri-app/package.json
#   - desktop/Cargo.lock              (via cargo check)
#
set -euo pipefail

VERSION="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo ""
  echo "Examples:"
  echo "  $0 99.0.0      # Set a test version"
  echo "  $0 0.1.0       # Restore the real version"
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Error: Version must be a semantic version without a v prefix (e.g., 1.0.0)"
  exit 1
fi

TAURI_CONF="$REPO_ROOT/desktop/tauri-app/src-tauri/tauri.conf.json"
PKG_JSON="$REPO_ROOT/desktop/tauri-app/package.json"
WORKSPACE_TOML="$REPO_ROOT/desktop/Cargo.toml"

# Read current version from workspace Cargo.toml
CURRENT=$(grep '^version = ' "$WORKSPACE_TOML" | head -1 | sed 's/version = "\(.*\)"/\1/')

if [ "$CURRENT" = "$VERSION" ]; then
  echo "Already at version $VERSION"
  exit 0
fi

echo "Updating Tauri app version: $CURRENT -> $VERSION"

if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$TAURI_CONF"
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$PKG_JSON"
  sed -i '' "s/^version = \".*\"/version = \"${VERSION}\"/" "$WORKSPACE_TOML"
else
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$TAURI_CONF"
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$PKG_JSON"
  sed -i "s/^version = \".*\"/version = \"${VERSION}\"/" "$WORKSPACE_TOML"
fi

# Update Cargo.lock and fail before release if the workspace no longer checks.
(cd "$REPO_ROOT/desktop" && cargo check --quiet)

echo "Updated:"
echo "  $WORKSPACE_TOML"
echo "  $TAURI_CONF"
echo "  $PKG_JSON"
echo "  desktop/Cargo.lock"
