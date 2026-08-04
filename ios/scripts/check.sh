#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"
simulator_name="${IOS_SIMULATOR_NAME:-iPhone 17 Pro}"
debug_data="$ios_root/build/CheckDerivedData"
release_data="$ios_root/build/ReleaseDerivedData"

"$script_dir/generate-project.sh"

xcodebuild \
  -project "$ios_root/OK200.xcodeproj" \
  -scheme OK200 \
  -configuration Debug \
  -destination "platform=iOS Simulator,name=$simulator_name" \
  -derivedDataPath "$debug_data" \
  CODE_SIGNING_ALLOWED=NO \
  -quiet \
  test

xcodebuild \
  -project "$ios_root/OK200.xcodeproj" \
  -scheme OK200 \
  -configuration Release \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$release_data" \
  CODE_SIGNING_ALLOWED=NO \
  -quiet \
  build

release_binary="$release_data/Build/Products/Release-iphonesimulator/OK200.app/OK200"
if strings "$release_binary" | rg -q \
  'OK200-QA-Fixture|use-ok200-ui-test-fixture|reset-ok200-ui-test-state|use-ok200-invalid-root|hello from ios'; then
  echo "Release binary contains a DEBUG fixture or automation hook" >&2
  exit 1
fi

if rg -q 'DEVELOPMENT_TEAM = [A-Z0-9]+;' "$ios_root/OK200.xcodeproj/project.pbxproj"; then
  echo "The generated project contains a committed development team" >&2
  exit 1
fi

echo "iOS Debug tests and Release fixture/signing checks passed"
