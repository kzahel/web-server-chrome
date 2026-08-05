#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
extension_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$extension_root/.." && pwd)"
scratch_dir="$(mktemp -d)"
artifact_dir="${OK200_EXTENSION_BROWSER_ARTIFACTS:-$extension_root/browser-artifacts}"
trap 'rm -rf "$scratch_dir"' EXIT

"$repo_root/scripts/package-extension.sh" "$scratch_dir/ok200-extension.zip"
mkdir -p "$scratch_dir/unpacked"
unzip -q "$scratch_dir/ok200-extension.zip" -d "$scratch_dir/unpacked"
node "$script_dir/browser-smoke.mjs" "$scratch_dir/unpacked" "$artifact_dir"
