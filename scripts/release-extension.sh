#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
MODE="${2:-}"

if [[ -z "$VERSION" || ( -n "$MODE" && "$MODE" != "--check" ) ]]; then
  echo "Usage: $0 <version> [--check]"
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must use numeric semver without a prefix (for example 0.1.4)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAG="extension-v${VERSION}"
MANIFEST="$REPO_ROOT/extension/public/manifest.json"
PACKAGE_JSON="$REPO_ROOT/extension/package.json"
CHANGELOG="$REPO_ROOT/extension/CHANGELOG.md"

cd "$REPO_ROOT"

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "Error: Extension releases must run from main (current: $CURRENT_BRANCH)"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: Working tree has uncommitted or untracked changes."
  git status --short
  exit 1
fi

if ! grep -q "## \[${VERSION}\]" "$CHANGELOG" 2>/dev/null; then
  echo "Error: $CHANGELOG doesn't have an entry for version ${VERSION}"
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Error: Local tag already exists: $TAG"
  exit 1
fi

if ! REMOTE_TAG="$(git ls-remote --tags origin "refs/tags/$TAG")"; then
  echo "Error: Could not query remote tags from origin"
  exit 1
fi
if [[ -n "$REMOTE_TAG" ]]; then
  echo "Error: Remote tag already exists: $TAG"
  exit 1
fi

CURRENT_VERSION="$(node -p "require('./extension/public/manifest.json').version")"
PACKAGE_VERSION="$(node -p "require('./extension/package.json').version")"
if [[ "$PACKAGE_VERSION" != "$CURRENT_VERSION" ]]; then
  echo "Error: Manifest version $CURRENT_VERSION does not match package version $PACKAGE_VERSION"
  exit 1
fi
if ! node - "$CURRENT_VERSION" "$VERSION" <<'NODE'
const [current, target] = process.argv.slice(2).map((version) =>
  version.split(".").map(Number),
);
for (let index = 0; index < 3; index += 1) {
  if (target[index] > current[index]) process.exit(0);
  if (target[index] < current[index]) process.exit(1);
}
process.exit(1);
NODE
then
  echo "Error: Target version $VERSION must be greater than current version $CURRENT_VERSION"
  exit 1
fi
echo "Extension release preflight: $CURRENT_VERSION -> $VERSION"

"$SCRIPT_DIR/release-check.sh" extension

if [[ "$MODE" == "--check" ]]; then
  echo "Source preflight passed for $TAG at current version $CURRENT_VERSION."
  echo "The authorized release run will rewrite and validate the final $VERSION artifact."
  echo "No tracked files, commits, tags, or remotes changed."
  exit 0
fi

node - "$MANIFEST" "$PACKAGE_JSON" "$VERSION" <<'NODE'
const fs = require("node:fs");
const [manifestPath, packagePath, version] = process.argv.slice(2);
for (const filePath of [manifestPath, packagePath]) {
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  value.version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
NODE

pnpm exec biome format --write "$MANIFEST" "$PACKAGE_JSON"

"$SCRIPT_DIR/package-extension.sh" "$REPO_ROOT/extension/package.zip"
node "$SCRIPT_DIR/validate-extension-package.mjs" \
  "$REPO_ROOT/extension/package.zip" --expected-version "$VERSION"

git add "$MANIFEST" "$PACKAGE_JSON" "$CHANGELOG"
git commit -m "Release Extension v${VERSION}"
git tag "$TAG"

echo "Prepared Extension v${VERSION} commit and local tag $TAG."
echo "Nothing was pushed or published."
echo "Maintainer release command: git push origin main $TAG"
echo "Pushing the tag will let CI create the exact Chrome Web Store ZIP."
