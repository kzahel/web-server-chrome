#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--distribution] <OK200.app|OK200.xcarchive|OK200.ipa>" >&2
}

distribution=false
if [[ "${1:-}" == "--distribution" ]]; then
  distribution=true
  shift
fi

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

artifact="$1"
if [[ ! -e "$artifact" ]]; then
  echo "Release artifact does not exist: $artifact" >&2
  exit 1
fi

expected_bundle_id="${IOS_EXPECTED_BUNDLE_ID:-app.ok200.ios}"
expected_version="${IOS_EXPECTED_MARKETING_VERSION:-}"
expected_build="${IOS_EXPECTED_BUILD_NUMBER:-}"
expected_team="${IOS_TEAM_ID:-}"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/ok200-ios-inspect.XXXXXX")"

cleanup() {
  if [[ -d "$scratch" ]]; then
    find "$scratch" -depth -delete
  fi
}
trap cleanup EXIT

apps=()
case "$artifact" in
  *.app)
    [[ -d "$artifact" ]] || {
      echo "Expected an application directory: $artifact" >&2
      exit 1
    }
    apps+=("$artifact")
    artifact_kind="app"
    ;;
  *.xcarchive)
    [[ -d "$artifact" ]] || {
      echo "Expected an archive directory: $artifact" >&2
      exit 1
    }
    while IFS= read -r -d '' candidate; do
      apps+=("$candidate")
    done < <(find "$artifact/Products/Applications" -maxdepth 1 -type d -name '*.app' -print0)
    artifact_kind="xcarchive"
    ;;
  *.ipa)
    [[ -f "$artifact" ]] || {
      echo "Expected an IPA file: $artifact" >&2
      exit 1
    }
    ditto -x -k "$artifact" "$scratch/ipa"
    while IFS= read -r -d '' candidate; do
      apps+=("$candidate")
    done < <(find "$scratch/ipa/Payload" -maxdepth 1 -type d -name '*.app' -print0)
    artifact_kind="ipa"
    ;;
  *)
    usage
    exit 1
    ;;
esac

if [[ ${#apps[@]} -ne 1 ]]; then
  echo "Expected exactly one application in the release artifact; found ${#apps[@]}" >&2
  exit 1
fi

app="${apps[0]}"
info="$app/Info.plist"
privacy_manifest="$app/PrivacyInfo.xcprivacy"
[[ -f "$info" ]] || {
  echo "Release application is missing Info.plist" >&2
  exit 1
}
[[ -f "$privacy_manifest" ]] || {
  echo "Release application is missing PrivacyInfo.xcprivacy" >&2
  exit 1
}

read_info() {
  plutil -extract "$1" raw "$info"
}

bundle_id="$(read_info CFBundleIdentifier)"
version="$(read_info CFBundleShortVersionString)"
build="$(read_info CFBundleVersion)"
executable_name="$(read_info CFBundleExecutable)"
minimum_os="$(read_info MinimumOSVersion)"
device_families="$(plutil -extract UIDeviceFamily json -o - "$info" | tr -d '[:space:]')"
executable="$app/$executable_name"

[[ "$bundle_id" == "$expected_bundle_id" ]] || {
  echo "Unexpected bundle identifier: $bundle_id" >&2
  exit 1
}
if [[ -n "$expected_version" && "$version" != "$expected_version" ]]; then
  echo "Unexpected marketing version: $version" >&2
  exit 1
fi
if [[ -n "$expected_build" && "$build" != "$expected_build" ]]; then
  echo "Unexpected build number: $build" >&2
  exit 1
fi
[[ "$minimum_os" == "17.0" ]] || {
  echo "Unexpected minimum iOS version: $minimum_os" >&2
  exit 1
}
[[ "$device_families" == '[1,2]' ]] || {
  echo "Release must support both iPhone and iPad; found $device_families" >&2
  exit 1
}
[[ "$(read_info ITSAppUsesNonExemptEncryption)" == "false" ]] || {
  echo "Release does not declare ITSAppUsesNonExemptEncryption=false" >&2
  exit 1
}
if plutil -extract UIBackgroundModes json -o - "$info" >/dev/null 2>&1; then
  echo "Release unexpectedly declares a background mode" >&2
  exit 1
fi
if plutil -extract NSBonjourServices json -o - "$info" >/dev/null 2>&1; then
  echo "Release unexpectedly declares Bonjour services" >&2
  exit 1
fi

architectures="$(lipo -archs "$executable")"
[[ " $architectures " == *' arm64 '* ]] || {
  echo "Release application is missing arm64: $architectures" >&2
  exit 1
}
[[ " $architectures " != *' x86_64 '* ]] || {
  echo "Release application unexpectedly contains a simulator architecture" >&2
  exit 1
}

if strings "$executable" | rg -q \
  'OK200-QA-Fixture|use-ok200-ui-test-fixture|reset-ok200-ui-test-state|use-ok200-invalid-root|hello from ios'; then
  echo "Release executable contains a DEBUG fixture or automation hook" >&2
  exit 1
fi

privacy_values="$(plutil -p "$privacy_manifest")"
for expected_value in \
  '"NSPrivacyTracking" => false' \
  '"NSPrivacyCollectedDataTypes" => [' \
  '"NSPrivacyAccessedAPICategoryUserDefaults"' \
  '"CA92.1"' \
  '"NSPrivacyAccessedAPICategoryFileTimestamp"' \
  '"3B52.1"'; do
  if ! rg -F -q -- "$expected_value" <<<"$privacy_values"; then
    echo "Bundled privacy manifest is missing expected value: $expected_value" >&2
    exit 1
  fi
done

icons=()
while IFS= read -r -d '' icon; do
  icons+=("$icon")
done < <(find "$app" -maxdepth 1 -type f -name 'AppIcon*.png' -print0)
if [[ ${#icons[@]} -eq 0 ]]; then
  echo "Release application contains no compiled application icons" >&2
  exit 1
fi
for icon in "${icons[@]}"; do
  if sips -g hasAlpha "$icon" | rg -q 'hasAlpha: yes'; then
    echo "Compiled application icon contains an alpha channel: $(basename "$icon")" >&2
    exit 1
  fi
done

if [[ -d "$app/Frameworks" ]] && find "$app/Frameworks" -mindepth 1 -print -quit | rg -q .; then
  echo "Release unexpectedly embeds a third-party framework or library" >&2
  exit 1
fi

signed=false
entitlements="$scratch/entitlements.plist"
signing_details="$scratch/signing-details.txt"
if codesign -d --entitlements :- "$app" >"$entitlements" 2>"$signing_details"; then
  signed=true
fi

profile_expiration="none"
if [[ "$distribution" == true ]]; then
  [[ -n "$expected_team" ]] || {
    echo "IOS_TEAM_ID is required for distribution inspection" >&2
    exit 1
  }
  [[ "$signed" == true ]] || {
    echo "Distribution application is not signed" >&2
    exit 1
  }

  codesign --verify --deep --strict --verbose=2 "$app" >/dev/null
  codesign -d --verbose=4 "$app" 2>"$signing_details"
  rg -q '^Authority=Apple Distribution' "$signing_details" || {
    echo "Release is not signed by an Apple Distribution identity" >&2
    exit 1
  }

  if [[ "$(plutil -extract get-task-allow raw "$entitlements" 2>/dev/null || true)" == "true" ]]; then
    echo "Distribution application has get-task-allow enabled" >&2
    exit 1
  fi
  [[ "$(plutil -extract application-identifier raw "$entitlements")" == "$expected_team.$bundle_id" ]] || {
    echo "Signed application identifier does not match the expected team and bundle" >&2
    exit 1
  }
  [[ "$(plutil -extract 'com\.apple\.developer\.team-identifier' raw "$entitlements")" == "$expected_team" ]] || {
    echo "Signed team identifier does not match IOS_TEAM_ID" >&2
    exit 1
  }

  embedded_profile="$app/embedded.mobileprovision"
  [[ -f "$embedded_profile" ]] || {
    echo "Distribution application is missing its embedded provisioning profile" >&2
    exit 1
  }
  profile="$scratch/profile.plist"
  security cms -D -i "$embedded_profile" >"$profile"
  [[ "$(plutil -extract TeamIdentifier.0 raw "$profile")" == "$expected_team" ]] || {
    echo "Provisioning-profile team does not match IOS_TEAM_ID" >&2
    exit 1
  }
  [[ "$(plutil -extract Entitlements.application-identifier raw "$profile")" == "$expected_team.$bundle_id" ]] || {
    echo "Provisioning profile does not match the release bundle identifier" >&2
    exit 1
  }
  [[ "$(plutil -extract Entitlements.get-task-allow raw "$profile")" == "false" ]] || {
    echo "Provisioning profile is not distribution-only" >&2
    exit 1
  }
  if plutil -extract ProvisionedDevices json -o - "$profile" >/dev/null 2>&1; then
    echo "Provisioning profile unexpectedly contains a device list" >&2
    exit 1
  fi
  if [[ "$(plutil -extract ProvisionsAllDevices raw "$profile" 2>/dev/null || true)" == "true" ]]; then
    echo "Provisioning profile is an enterprise profile, not an App Store profile" >&2
    exit 1
  fi
  profile_expiration="$(plutil -extract ExpirationDate raw "$profile")"
  if [[ "$profile_expiration" < "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" ]]; then
    echo "Provisioning profile is expired" >&2
    exit 1
  fi
fi

binary_hash="$(shasum -a 256 "$executable" | awk '{print $1}')"
printf '%s\n' \
  "artifact_kind=$artifact_kind" \
  "bundle_id=$bundle_id" \
  "version=$version" \
  "build=$build" \
  "minimum_os=$minimum_os" \
  "device_families=iphone,ipad" \
  "architectures=$architectures" \
  "compiled_icons=${#icons[@]}" \
  "privacy_manifest=reviewed-match" \
  "debug_hooks=absent" \
  "embedded_frameworks=absent" \
  "signing=$([[ "$signed" == true ]] && echo present || echo absent)" \
  "distribution=$distribution" \
  "profile_expiration=$profile_expiration" \
  "executable_sha256=$binary_hash"
