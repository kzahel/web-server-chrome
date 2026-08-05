#!/usr/bin/env bash
set -euo pipefail

component="${1:-}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

case "$component" in
  android|crostini|desktop|extension|ios) ;;
  *)
    echo "Usage: $0 <android|crostini|desktop|extension|ios>" >&2
    exit 1
    ;;
esac

cd "$repo_root"
node --test tests/compatibility/validate.test.mjs

case "$component" in
  android)
    android/scripts/check.sh
    (cd android && ./gradlew :app:assembleDebugAndroidTest)
    ;;
  crostini)
    desktop/crostini/scripts/check.sh
    ;;
  desktop)
    desktop/scripts/check.sh
    ;;
  extension)
    extension/scripts/check.sh
    extension/scripts/browser-check.sh
    ;;
  ios)
    ios/scripts/check.sh
    ios/scripts/release-archive.sh --check
    ;;
esac

commit="$(git rev-parse HEAD)"
corpus_version="$(node -p "require('./tests/compatibility/corpus-v1.json').corpusVersion")"

echo
echo "Release check passed: $component at $commit"
echo "Compatibility corpus: $corpus_version"
echo
echo "Tagged automation still required before publication:"
case "$component" in
  android)
    echo "  Android CI: API 26/36 instrumentation, signed APK/AAB inspection, exact Release APK smoke, SHA256SUMS"
    echo "Suggested testbed (advisory): android/scripts/test.sh --integration --device SERIAL"
    echo "Also use an external LAN peer and a Chromebook when routing, storage, or lifecycle changed."
    ;;
  crostini)
    echo "  ChromeOS Linux CI: static x86_64/ARM64 builds, signed-manifest validation, exact asset set, SHA256SUMS"
    echo "Suggested testbed (advisory): Chromebook Linux install/update/rollback, shared folder, Launcher, and LAN forwarding"
    ;;
  desktop)
    echo "  Tauri App CI: hosted Linux product E2E, platform package/signature inspection, updater finalizer, SHA256SUMS"
    echo "Suggested testbed (advisory): docs/runbooks/desktop-production-validation.md"
    ;;
  extension)
    echo "  Extension CI: source/package checks, real-browser smoke, tag/version reinspection, ZIP checksum"
    echo "Suggested testbed (advisory): exact packaged extension in the affected production browser/platform route"
    ;;
  ios)
    echo "  The archive lane is non-publishing; signed export, upload, TestFlight, and review remain in Tactical 017."
    echo "Suggested testbed (advisory): ios/scripts/device-smoke.sh"
    echo "Also repeat real Files selection, external LAN access, and foreground/background truth when affected."
    ;;
esac
echo
echo "Record passes, explicit skips, and claim limits with docs/runbooks/release-evidence-template.md."
