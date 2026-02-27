#!/bin/bash
#
# Package legacy Chrome App for Chrome Web Store upload.
#
# Usage:
#   ./scripts/package-legacy.sh
#
set -e
cd "$(dirname "$0")/.."

OUT="legacy-app.zip"

cd legacy
zip -r "../$OUT" . \
    -x "*.DS_Store" \
    -x "__MACOSX/*"

echo "Created $OUT"
