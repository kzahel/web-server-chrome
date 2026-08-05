#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
extension_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$extension_root/.." && pwd)"
package_dir="$(mktemp -d)"
trap 'rm -rf "$package_dir"' EXIT

cd "$extension_root"
pnpm run typecheck
pnpm run test
"$repo_root/scripts/package-extension.sh" "$package_dir/ok200-extension.zip"
