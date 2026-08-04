#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$ios_root/.." && pwd)"
testbed_root="${IOS_DEVICE_TESTBED_ROOT:-$(cd "$repo_root/../ios-device-testbed" && pwd)}"
testbed_config="$testbed_root/config.local"
derived_data="$ios_root/build/DerivedData"

if [[ ! -f "$testbed_config" ]]; then
  echo "Missing ignored testbed configuration: $testbed_config" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$testbed_config"
: "${IOS_DEVICE_TESTBED_TEAM_ID:?IOS_DEVICE_TESTBED_TEAM_ID is required}"

"$script_dir/generate-project.sh"

xcodebuild \
  -project "$ios_root/OK200.xcodeproj" \
  -scheme OK200 \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$derived_data" \
  -quiet \
  DEVELOPMENT_TEAM="$IOS_DEVICE_TESTBED_TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build

app_path="$derived_data/Build/Products/Debug-iphoneos/OK200.app"
if [[ ! -d "$app_path" ]]; then
  echo "Expected signed app was not produced: $app_path" >&2
  exit 1
fi

printf '%s\n' "$app_path"
