#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
desktop_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$desktop_root/.." && pwd)"

node --test "$repo_root/.github/scripts/validate-desktop-release.test.mjs"

cd "$desktop_root"
cargo fmt --all -- --check
cargo clippy -p ok200-core -p ok200-common -p ok200-host --all-targets -- -D warnings
cargo test -p ok200-core -p ok200-host -p ok200-common
cargo test -p ok200-desktop --lib
