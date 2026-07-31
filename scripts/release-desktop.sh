#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
MODE="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> [--check]"
  exit 1
fi

if [ -n "$MODE" ] && [ "$MODE" != "--check" ]; then
  echo "Error: Unknown option $MODE"
  echo "Usage: $0 <version> [--check]"
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Error: Version must be a semantic version without a v prefix (e.g., 1.0.0)"
  exit 1
fi

# Fail if tracked or untracked files would be omitted from the release.
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo "Error: Working tree has uncommitted changes. Please commit or stash first."
  git status --short
  exit 1
fi

TAG="desktop-v${VERSION}"
CHANGELOG="$REPO_ROOT/desktop/tauri-app/CHANGELOG.md"

if git rev-parse --quiet --verify "refs/tags/$TAG" >/dev/null; then
  echo "Error: Local tag $TAG already exists"
  exit 1
fi

REMOTE_TAG="$(git ls-remote --tags origin "refs/tags/$TAG")"
if [ -n "$REMOTE_TAG" ]; then
  echo "Error: Remote tag $TAG already exists"
  exit 1
fi

# Check that changelog has been updated (hard fail)
if ! grep -q "## \[${VERSION}\]" "$CHANGELOG" 2>/dev/null; then
  echo "Error: $CHANGELOG doesn't have an entry for version ${VERSION}"
  echo "Please add a '## [${VERSION}]' section before releasing."
  exit 1
fi

if [ "$MODE" = "--check" ]; then
  echo "Release preflight passed for $TAG"
  exit 0
fi

# Update version in all files
"$REPO_ROOT/desktop/scripts/set-tauri-version.sh" "$VERSION"

# Commit version bump
TAURI_CONF="$REPO_ROOT/desktop/tauri-app/src-tauri/tauri.conf.json"
PKG_JSON="$REPO_ROOT/desktop/tauri-app/package.json"
WORKSPACE_TOML="$REPO_ROOT/desktop/Cargo.toml"

git add "$TAURI_CONF" "$PKG_JSON" "$WORKSPACE_TOML" "$REPO_ROOT/desktop/Cargo.lock" "$CHANGELOG"
git commit -m "Release Desktop v${VERSION}"

# Push commit and tag
git push origin HEAD

# Create and push tag separately (this triggers the release build)
git tag "$TAG"
git push origin "$TAG"

echo "Created and pushed tag $TAG"
echo "CI will build and create GitHub release: https://github.com/kzahel/web-server-chrome/actions"
