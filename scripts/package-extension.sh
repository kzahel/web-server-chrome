#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTENSION_DIR="$REPO_ROOT/extension"
OUTPUT_PATH="${1:-$EXTENSION_DIR/package.zip}"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ok200-extension-stage.XXXXXX")"
ARCHIVE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ok200-extension-archive.XXXXXX")"
ARCHIVE_PATH="$ARCHIVE_DIR/ok200-extension.zip"

cleanup() {
  rm -rf -- "$STAGING_DIR" "$ARCHIVE_DIR"
}
trap cleanup EXIT

cd "$EXTENSION_DIR"
EXTENSION_OUT_DIR="$STAGING_DIR" SKIP_INJECT_KEY=1 pnpm build

node "$SCRIPT_DIR/validate-extension-package.mjs" "$STAGING_DIR"

cd "$STAGING_DIR"
zip -q -X -r "$ARCHIVE_PATH" .

node "$SCRIPT_DIR/validate-extension-package.mjs" "$ARCHIVE_PATH"
mkdir -p "$(dirname "$OUTPUT_PATH")"
mv -f -- "$ARCHIVE_PATH" "$OUTPUT_PATH"

echo "Created $OUTPUT_PATH"
shasum -a 256 "$OUTPUT_PATH"
