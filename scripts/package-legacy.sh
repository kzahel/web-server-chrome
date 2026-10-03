#!/usr/bin/env bash
#
# Package the final legacy Chrome App candidate for Chrome Web Store upload.
#
# Usage:
#   ./scripts/package-legacy.sh [output.zip]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_PATH="${1:-$REPO_ROOT/legacy-app.zip}"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ok200-legacy-stage.XXXXXX")"
ARCHIVE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ok200-legacy-archive.XXXXXX")"
EXTRACT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ok200-legacy-extract.XXXXXX")"
ARCHIVE_PATH="$ARCHIVE_DIR/legacy-app.zip"

cleanup() {
  rm -rf -- "$STAGING_DIR" "$ARCHIVE_DIR" "$EXTRACT_DIR"
}
trap cleanup EXIT

if [[ "$OUTPUT_PATH" != /* ]]; then
  OUTPUT_PATH="$REPO_ROOT/$OUTPUT_PATH"
fi

node --test "$REPO_ROOT/tests/legacy-migration.test.mjs"

cp -R "$REPO_ROOT/legacy/." "$STAGING_DIR/"
rm -f -- \
  "$STAGING_DIR/test.html" \
  "$STAGING_DIR/react-ui/nojsx/index.js.map" \
  "$STAGING_DIR/react-ui/nojsx/options.js.map"
node "$SCRIPT_DIR/validate-legacy-package.mjs" "$STAGING_DIR"

# Normalize timestamps and entry order so the reviewed source produces the
# same ZIP bytes on every build.
find "$STAGING_DIR" -exec touch -t 198001010000 {} +
cd "$STAGING_DIR"
find . -type f -print | LC_ALL=C sort | zip -q -X "$ARCHIVE_PATH" -@

unzip -q "$ARCHIVE_PATH" -d "$EXTRACT_DIR"
node "$SCRIPT_DIR/validate-legacy-package.mjs" "$EXTRACT_DIR"

mkdir -p "$(dirname "$OUTPUT_PATH")"
mv -f -- "$ARCHIVE_PATH" "$OUTPUT_PATH"

echo "Created $OUTPUT_PATH"
shasum -a 256 "$OUTPUT_PATH"
