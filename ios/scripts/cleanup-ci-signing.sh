#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

material_dir="$RUNNER_TEMP/ok200-ios-signing-material"
keychain="$RUNNER_TEMP/ok200-ios-signing.keychain-db"
api_dir="$RUNNER_TEMP/ok200-asc-key"
installed_profile="$HOME/Library/MobileDevice/Provisioning Profiles/ok200-ios-$GITHUB_RUN_ID.mobileprovision"

if [[ -e "$installed_profile" ]]; then
  find "$installed_profile" -delete
fi
if [[ -e "$keychain" ]]; then
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  if [[ -e "$keychain" ]]; then
    find "$keychain" -delete
  fi
fi
for private_dir in "$material_dir" "$api_dir"; do
  if [[ -d "$private_dir" ]]; then
    find "$private_dir" -depth -delete
  fi
done

echo "Ephemeral iOS signing material removed"
