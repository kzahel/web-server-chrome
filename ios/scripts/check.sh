#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$ios_root/.." && pwd)"
simulator_name="${IOS_SIMULATOR_NAME:-iPhone 17 Pro}"
debug_data="$ios_root/build/CheckDerivedData"
release_data="$ios_root/build/ReleaseDerivedData"
device_release_data="$ios_root/build/DeviceReleaseDerivedData"
privacy_manifest="$ios_root/200OK/Resources/PrivacyInfo.xcprivacy"
app_icon="$ios_root/200OK/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"

bash -n \
  "$script_dir/cleanup-ci-signing.sh" \
  "$script_dir/inspect-release.sh" \
  "$script_dir/prepare-ci-signing.sh" \
  "$script_dir/release-archive.sh" \
  "$repo_root/scripts/release-ios.sh"
"$script_dir/prepare-ci-signing.sh" --check >/dev/null

plutil -lint "$privacy_manifest"

privacy_values="$(plutil -p "$privacy_manifest")"
for expected_value in \
  '"NSPrivacyTracking" => false' \
  '"NSPrivacyCollectedDataTypes" => [' \
  '"NSPrivacyAccessedAPICategoryUserDefaults"' \
  '"CA92.1"' \
  '"NSPrivacyAccessedAPICategoryFileTimestamp"' \
  '"3B52.1"'; do
  if ! rg -F -q -- "$expected_value" <<<"$privacy_values"; then
    echo "Privacy manifest is missing expected value: $expected_value" >&2
    exit 1
  fi
done

if sips -g hasAlpha "$app_icon" | rg -q 'hasAlpha: yes'; then
  echo "App Store icon must not contain an alpha channel" >&2
  exit 1
fi

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

xcodebuild \
  -project "$ios_root/OK200.xcodeproj" \
  -scheme OK200 \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$device_release_data" \
  CODE_SIGNING_ALLOWED=NO \
  -quiet \
  build

release_app="$release_data/Build/Products/Release-iphonesimulator/OK200.app"
device_release_app="$device_release_data/Build/Products/Release-iphoneos/OK200.app"
release_binary="$release_app/OK200"
if strings "$release_binary" | rg -q \
  'OK200-QA-Fixture|use-ok200-ui-test-fixture|reset-ok200-ui-test-state|use-ok200-invalid-root|hello from ios'; then
  echo "Release binary contains a DEBUG fixture or automation hook" >&2
  exit 1
fi

for built_app in "$release_app" "$device_release_app"; do
  if [[ ! -f "$built_app/PrivacyInfo.xcprivacy" ]]; then
    echo "Release app is missing PrivacyInfo.xcprivacy: $built_app" >&2
    exit 1
  fi

  if ! cmp -s "$privacy_manifest" "$built_app/PrivacyInfo.xcprivacy"; then
    echo "Bundled privacy manifest differs from the reviewed source: $built_app" >&2
    exit 1
  fi

  if [[ "$(plutil -extract ITSAppUsesNonExemptEncryption raw "$built_app/Info.plist")" != "false" ]]; then
    echo "Release app does not declare its non-exempt encryption status: $built_app" >&2
    exit 1
  fi
done

"$script_dir/inspect-release.sh" "$device_release_app" >/dev/null

if rg -q 'DEVELOPMENT_TEAM = [A-Z0-9]+;' "$ios_root/OK200.xcodeproj/project.pbxproj"; then
  echo "The generated project contains a committed development team" >&2
  exit 1
fi

echo "iOS tests, store declarations, exact Release inspection, and signing hygiene passed"
