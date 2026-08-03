#!/bin/bash
#
# Deploy extension to Chromebook for testing.
# Run from dev laptop, not from Crostini.
#
# Prerequisites:
#   - ChromeOS testbed checkout and a healthy `bin/chromeos doctor`
#   - Extension loaded once from ~/Downloads/200-ok-extension/
#
# Usage:
#   ./scripts/deploy-extension-chromebook.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

CHROMEOS_TESTBED_CLI="${CHROMEOS_TESTBED_CLI:-$HOME/code/chromeos-testbed/bin/chromeos}"
CHROMEOS_EXTENSION_NAME="${CHROMEOS_EXTENSION_NAME:-200-ok-extension}"
EXTENSION_ID="lpkjdhnmgkhaabhimpdinmdgejoaejic"

if [[ ! -x "$CHROMEOS_TESTBED_CLI" ]]; then
    echo "ChromeOS testbed CLI not found: $CHROMEOS_TESTBED_CLI" >&2
    echo "Set CHROMEOS_TESTBED_CLI to the checkout's bin/chromeos path." >&2
    exit 1
fi

echo "Building extension..."
pnpm --dir extension build

"$CHROMEOS_TESTBED_CLI" deploy-ext "$PWD/extension/dist" \
    --name "$CHROMEOS_EXTENSION_NAME" \
    --reload "$EXTENSION_ID"

echo "Done! Extension deployed to ChromeOS Downloads/$CHROMEOS_EXTENSION_NAME/."
