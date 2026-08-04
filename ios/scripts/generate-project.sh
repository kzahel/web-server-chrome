#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"

exec xcodegen generate --spec "$ios_root/project.yml" --project "$ios_root"
