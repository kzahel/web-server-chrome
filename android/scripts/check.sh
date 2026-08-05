#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
android_root="$(cd "$script_dir/.." && pwd)"

cd "$android_root"
./gradlew assembleDebug testDebugUnitTest lintDebug
