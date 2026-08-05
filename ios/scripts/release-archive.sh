#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: ios/scripts/release-archive.sh --check
       ios/scripts/release-archive.sh --unsigned
       ios/scripts/release-archive.sh --signed [--validate]

--check      Verify tools, project identity, version policy, and configuration.
--unsigned   Run source gates and produce an inspectable unsigned xcarchive.
--signed     Archive and export an App Store IPA using explicit local signing.
--validate   Ask App Store Connect to validate the exported IPA; never uploads it.
USAGE
}

mode="${1:-}"
if [[ "$mode" != "--check" && "$mode" != "--unsigned" && "$mode" != "--signed" ]]; then
  usage
  exit 1
fi
shift

validate=false
if [[ "${1:-}" == "--validate" ]]; then
  validate=true
  shift
fi
if [[ $# -ne 0 || ( "$validate" == true && "$mode" != "--signed" ) ]]; then
  usage
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$ios_root/.." && pwd)"
project="$ios_root/OK200.xcodeproj"
bundle_id="app.ok200.ios"
config="${IOS_RELEASE_CONFIG:-$ios_root/release.local.env}"

if [[ -f "$config" ]]; then
  # shellcheck disable=SC1090
  source "$config"
fi

for command_name in codesign ditto lipo security sips strings xcodebuild xcodegen plutil rg shasum; do
  command -v "$command_name" >/dev/null || {
    echo "Missing required release tool: $command_name" >&2
    exit 1
  }
done

"$script_dir/generate-project.sh" >/dev/null

build_settings="$(xcodebuild \
  -project "$project" \
  -target OK200 \
  -configuration Release \
  -showBuildSettings 2>/dev/null)"

read_setting() {
  sed -n "s/^[[:space:]]*$1 = //p" <<<"$build_settings" | head -n 1
}

actual_bundle_id="$(read_setting PRODUCT_BUNDLE_IDENTIFIER)"
marketing_version="$(read_setting MARKETING_VERSION)"
build_number="$(read_setting CURRENT_PROJECT_VERSION)"
deployment_target="$(read_setting IPHONEOS_DEPLOYMENT_TARGET)"
device_family="$(read_setting TARGETED_DEVICE_FAMILY)"

[[ "$actual_bundle_id" == "$bundle_id" ]] || {
  echo "Unexpected iOS bundle identifier: $actual_bundle_id" >&2
  exit 1
}
[[ "$marketing_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "MARKETING_VERSION must use X.Y.Z: $marketing_version" >&2
  exit 1
}
[[ "$build_number" =~ ^[1-9][0-9]*$ ]] || {
  echo "CURRENT_PROJECT_VERSION must be a positive integer: $build_number" >&2
  exit 1
}
[[ "$deployment_target" == "17.0" ]] || {
  echo "Unexpected iOS deployment target: $deployment_target" >&2
  exit 1
}
[[ "$device_family" == "1,2" ]] || {
  echo "Release must target iPhone and iPad: $device_family" >&2
  exit 1
}
rg -F -q "## $marketing_version ($build_number)" "$ios_root/CHANGELOG.md" || {
  echo "iOS changelog has no entry for $marketing_version ($build_number)" >&2
  exit 1
}

signing_inputs=(IOS_TEAM_ID IOS_PROVISIONING_PROFILE_SPECIFIER)
missing_signing=()
for variable_name in "${signing_inputs[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    missing_signing+=("$variable_name")
  fi
done

distribution_identity="unavailable"
if security find-identity -v -p codesigning 2>/dev/null | rg -q '"Apple Distribution:'; then
  distribution_identity="available"
fi

if [[ "$mode" == "--check" ]]; then
  printf '%s\n' \
    "Release preflight passed" \
    "bundle_id=$bundle_id" \
    "version=$marketing_version" \
    "build=$build_number" \
    "distribution_identity=$distribution_identity"
  if [[ ${#missing_signing[@]} -eq 0 ]]; then
    echo "signing_configuration=complete"
  else
    echo "signing_configuration=missing:${missing_signing[*]}"
  fi
  exit 0
fi

if ! git -C "$repo_root" diff --quiet -- || ! git -C "$repo_root" diff --cached --quiet --; then
  echo "Release archive requires a clean tracked worktree" >&2
  exit 1
fi

"$repo_root/scripts/release-check.sh" ios

commit="$(git -C "$repo_root" rev-parse HEAD)"
short_commit="$(git -C "$repo_root" rev-parse --short=12 HEAD)"
default_output="$ios_root/build/AppStoreRelease/$marketing_version-$build_number-$short_commit"
output_dir="${IOS_RELEASE_OUTPUT_DIR:-$default_output}"
archive="$output_dir/OK200.xcarchive"
evidence="$output_dir/evidence"

if [[ -e "$output_dir" ]]; then
  echo "Release output already exists; choose a new IOS_RELEASE_OUTPUT_DIR: $output_dir" >&2
  exit 1
fi
mkdir -p "$evidence"

common_archive_args=(
  -project "$project"
  -scheme OK200
  -configuration Release
  -destination 'generic/platform=iOS'
  -archivePath "$archive"
  COMPILER_INDEX_STORE_ENABLE=NO
)

if [[ "$mode" == "--unsigned" ]]; then
  xcodebuild "${common_archive_args[@]}" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    -quiet \
    archive

  IOS_EXPECTED_MARKETING_VERSION="$marketing_version" \
    IOS_EXPECTED_BUILD_NUMBER="$build_number" \
    "$script_dir/inspect-release.sh" "$archive" \
    | tee "$evidence/archive-inspection.txt"
  printf '%s\n' "$commit" >"$evidence/git-commit.txt"
  xcodebuild -version >"$evidence/xcode-version.txt"
  echo "Unsigned Release archive and sanitized evidence: $output_dir"
  exit 0
fi

if [[ ${#missing_signing[@]} -ne 0 ]]; then
  echo "Signed archive is missing configuration: ${missing_signing[*]}" >&2
  exit 1
fi
[[ "$distribution_identity" == "available" ]] || {
  echo "No Apple Distribution identity is available in the current keychain search list" >&2
  exit 1
}
[[ "$IOS_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || {
  echo "IOS_TEAM_ID is not a ten-character Apple team identifier" >&2
  exit 1
}
[[ "$IOS_PROVISIONING_PROFILE_SPECIFIER" =~ ^[A-Za-z0-9._ -]+$ ]] || {
  echo "IOS_PROVISIONING_PROFILE_SPECIFIER contains unsupported characters" >&2
  exit 1
}

xcodebuild "${common_archive_args[@]}" \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY='Apple Distribution' \
  PROVISIONING_PROFILE_SPECIFIER="$IOS_PROVISIONING_PROFILE_SPECIFIER" \
  -quiet \
  archive

IOS_TEAM_ID="$IOS_TEAM_ID" \
  IOS_EXPECTED_MARKETING_VERSION="$marketing_version" \
  IOS_EXPECTED_BUILD_NUMBER="$build_number" \
  "$script_dir/inspect-release.sh" --distribution "$archive" \
  | tee "$evidence/archive-inspection.txt"

export_options="$output_dir/ExportOptions.plist"
plutil -create xml1 "$export_options"
plutil -insert method -string app-store-connect "$export_options"
plutil -insert destination -string export "$export_options"
plutil -insert signingStyle -string manual "$export_options"
plutil -insert teamID -string "$IOS_TEAM_ID" "$export_options"
plutil -insert manageAppVersionAndBuildNumber -bool false "$export_options"
plutil -insert stripSwiftSymbols -bool true "$export_options"
plutil -insert uploadSymbols -bool true "$export_options"
/usr/libexec/PlistBuddy -c 'Add :provisioningProfiles dict' "$export_options"
/usr/libexec/PlistBuddy \
  -c "Add :provisioningProfiles:$bundle_id string $IOS_PROVISIONING_PROFILE_SPECIFIER" \
  "$export_options"

export_dir="$output_dir/export"
xcodebuild \
  -exportArchive \
  -archivePath "$archive" \
  -exportOptionsPlist "$export_options" \
  -exportPath "$export_dir" \
  -quiet

ipas=()
while IFS= read -r -d '' candidate; do
  ipas+=("$candidate")
done < <(find "$export_dir" -maxdepth 1 -type f -name '*.ipa' -print0)
if [[ ${#ipas[@]} -ne 1 ]]; then
  echo "Expected exactly one exported IPA; found ${#ipas[@]}" >&2
  exit 1
fi
ipa="${ipas[0]}"

IOS_TEAM_ID="$IOS_TEAM_ID" \
  IOS_EXPECTED_MARKETING_VERSION="$marketing_version" \
  IOS_EXPECTED_BUILD_NUMBER="$build_number" \
  "$script_dir/inspect-release.sh" --distribution "$ipa" \
  | tee "$evidence/ipa-inspection.txt"

ipa_hash="$(shasum -a 256 "$ipa" | awk '{print $1}')"
printf '%s  %s\n' "$ipa_hash" "$(basename "$ipa")" >"$evidence/SHA256SUMS"
printf '%s\n' "$commit" >"$evidence/git-commit.txt"
xcodebuild -version >"$evidence/xcode-version.txt"

if [[ "$validate" == true ]]; then
  : "${ASC_API_KEY_ID:?ASC_API_KEY_ID is required for validation}"
  : "${ASC_API_ISSUER_ID:?ASC_API_ISSUER_ID is required for validation}"
  : "${ASC_API_KEY_PATH:?ASC_API_KEY_PATH is required for validation}"
  [[ -f "$ASC_API_KEY_PATH" ]] || {
    echo "ASC_API_KEY_PATH does not name a readable file" >&2
    exit 1
  }
  xcrun altool --validate-app "$ipa" \
    --type ios \
    --api-key "$ASC_API_KEY_ID" \
    --api-issuer "$ASC_API_ISSUER_ID" \
    --p8-file-path "$ASC_API_KEY_PATH" \
    --output-format json \
    >"$evidence/apple-validation.json"
fi

echo "Signed App Store archive, IPA, and sanitized evidence: $output_dir"
