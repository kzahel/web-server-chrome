#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
MODE="${2:-}"
if [[ ! "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] ||
   { [ -n "$MODE" ] && [ "$MODE" != "--check" ]; }; then
    echo "Usage: $0 <numeric-version> [--check]" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CRATE_MANIFEST="$REPO_ROOT/desktop/crostini/Cargo.toml"
CHANGELOG="$REPO_ROOT/desktop/crostini/CHANGELOG.md"
TAG="crostini-v${VERSION}"
cd "$REPO_ROOT"

if [ "$(git branch --show-current)" != "main" ]; then
    echo "Error: Crostini releases must run from main." >&2
    exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
    echo "Error: Working tree has uncommitted or untracked changes." >&2
    git status --short
    exit 1
fi
if ! grep -q "^## \[${VERSION}\]" "$CHANGELOG"; then
    echo "Error: $CHANGELOG has no ${VERSION} release entry." >&2
    exit 1
fi
if git rev-parse --quiet --verify "refs/tags/$TAG" >/dev/null; then
    echo "Error: Local tag already exists: $TAG" >&2
    exit 1
fi
if [ -n "$(git ls-remote --tags origin "refs/tags/$TAG")" ]; then
    echo "Error: Remote tag already exists: $TAG" >&2
    exit 1
fi

CURRENT_VERSION=$(sed -n '/^\[package\]/,/^\[/s/^version = "\([^"]*\)"/\1/p' "$CRATE_MANIFEST")
node - "$CURRENT_VERSION" "$VERSION" <<'NODE'
const [current, target] = process.argv.slice(2);
const pattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const currentMatch = current.match(pattern);
const targetMatch = target.match(pattern);
if (!currentMatch || !targetMatch || targetMatch[4]) process.exit(1);
for (let index = 1; index <= 3; index += 1) {
  const left = Number(currentMatch[index]);
  const right = Number(targetMatch[index]);
  if (right > left) process.exit(0);
  if (right < left) process.exit(1);
}
process.exit(currentMatch[4] ? 0 : 1);
NODE
echo "ChromeOS Linux release preflight: $CURRENT_VERSION -> $VERSION"

scripts/release-check.sh crostini

if [ "$MODE" = "--check" ]; then
    echo "Release preflight passed for $TAG. No files, tags, or remotes changed."
    exit 0
fi

node - "$CRATE_MANIFEST" "$VERSION" <<'NODE'
const fs = require("node:fs");
const [path, version] = process.argv.slice(2);
const source = fs.readFileSync(path, "utf8");
const updated = source.replace(
  /(\[package\][\s\S]*?\nversion = ")[^"]+("\n)/,
  `$1${version}$2`,
);
if (updated === source) throw new Error("could not update Crostini package version");
fs.writeFileSync(path, updated);
NODE
(
    cd desktop
    cargo check -p ok200-crostini
)
git add "$CRATE_MANIFEST" desktop/Cargo.lock "$CHANGELOG"
git commit -m "Release ChromeOS Linux v${VERSION}"
git tag "$TAG"

echo "Prepared ChromeOS Linux v${VERSION} commit and local tag $TAG."
echo "Nothing was pushed or published."
echo "Maintainer command: git push origin main $TAG"
echo "The tag triggers signed static x86_64/ARM64 release construction."
