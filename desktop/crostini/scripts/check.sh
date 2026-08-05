#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
crostini_root="$(cd "$script_dir/.." && pwd)"
desktop_root="$(cd "$crostini_root/.." && pwd)"
repo_root="$(cd "$desktop_root/.." && pwd)"

cd "$desktop_root"
cargo fmt --all -- --check
cargo clippy --locked -p ok200-crostini --all-targets -- -D warnings
cargo test --locked -p ok200-crostini

cd "$repo_root"
node --test .github/scripts/write-crostini-release-manifest.test.mjs
scripts/test-crostini-installer.sh
