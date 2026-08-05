#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
android_root="$(cd "$script_dir/.." && pwd)"

cd "$android_root"
bash -n scripts/verify-release-artifacts.sh scripts/smoke-release-apk.sh
for expectation in release/expected-permissions.txt release/expected-native-libraries.txt; do
  sort -c "$expectation"
done
grep -Eq '^[0-9a-f]{64}$' release/expected-upload-cert-sha256.txt
./gradlew assembleDebug testDebugUnitTest lintDebug
