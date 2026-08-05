#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tauri_app_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$tauri_app_root/../.." && pwd)"
artifact_dir="${OK200_E2E_ARTIFACTS:-$script_dir/artifacts}"

if [ "$(uname -s)" != "Linux" ]; then
  echo "Desktop WebDriver E2E requires Linux WebKitGTK; use the hosted desktop-e2e job on other hosts." >&2
  exit 2
fi

for command in pnpm npm tauri-driver WebKitWebDriver xvfb-run; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Desktop E2E prerequisite is missing: $command" >&2
    exit 2
  fi
done

mkdir -p "$artifact_dir"
export OK200_E2E_ARTIFACTS="$artifact_dir"
export NO_AT_BRIDGE=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1

cd "$repo_root"
pnpm install --frozen-lockfile

cd "$script_dir"
npm ci

xvfb-run -a -s '-screen 0 1280x1024x24' \
  npx wdio run wdio.conf.ts "$@" 2>&1 | tee "$artifact_dir/wdio.log"
