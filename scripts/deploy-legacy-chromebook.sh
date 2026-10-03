#!/bin/bash
#
# Deploy legacy Chrome App to Chromebook for testing (load as unpacked).
#
# Prerequisites:
#   - ChromeOS testbed checkout and a healthy `bin/chromeos doctor`
#   - Load unpacked once from ~/Downloads/crostini-shared/wsc-legacy-app/
#
# Usage:
#   ./scripts/deploy-legacy-chromebook.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

CHROMEOS_TESTBED_CLI="${CHROMEOS_TESTBED_CLI:-$HOME/code/chromeos-testbed/bin/chromeos}"
CHROMEOS_LEGACY_NAME="${CHROMEOS_LEGACY_NAME:-crostini-shared/wsc-legacy-app}"

if [[ ! -x "$CHROMEOS_TESTBED_CLI" ]]; then
    echo "ChromeOS testbed CLI not found: $CHROMEOS_TESTBED_CLI" >&2
    echo "Set CHROMEOS_TESTBED_CLI to the checkout's bin/chromeos path." >&2
    exit 1
fi

"$CHROMEOS_TESTBED_CLI" deploy-ext "$PWD/legacy" \
    --name "$CHROMEOS_LEGACY_NAME"

echo "Done! Legacy app deployed to ChromeOS Downloads/$CHROMEOS_LEGACY_NAME/."
echo "Reload it at chrome://extensions/ (or load it unpacked there once)."
