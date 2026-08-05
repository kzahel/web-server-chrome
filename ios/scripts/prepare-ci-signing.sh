#!/usr/bin/env bash
set -euo pipefail

for command_name in base64 openssl plutil rg security shasum; do
  command -v "$command_name" >/dev/null || {
    echo "Missing required signing setup tool: $command_name" >&2
    exit 1
  }
done

if [[ "${1:-}" == "--check" ]]; then
  echo "Ephemeral iOS signing setup tools are available"
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 1
fi

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${IOS_TEAM_ID:?IOS_TEAM_ID is required}"
: "${IOS_CERTIFICATE_P12_BASE64:?IOS_CERTIFICATE_P12_BASE64 is required}"
: "${IOS_CERTIFICATE_PASSWORD:?IOS_CERTIFICATE_PASSWORD is required}"
: "${IOS_PROVISIONING_PROFILE_BASE64:?IOS_PROVISIONING_PROFILE_BASE64 is required}"
: "${MACOS_KEYCHAIN_PASSWORD:?MACOS_KEYCHAIN_PASSWORD is required}"

[[ "$IOS_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || {
  echo "IOS_TEAM_ID is not a ten-character Apple team identifier" >&2
  exit 1
}

umask 077
material_dir="$RUNNER_TEMP/ok200-ios-signing-material"
keychain="$RUNNER_TEMP/ok200-ios-signing.keychain-db"
profile_dir="$HOME/Library/MobileDevice/Provisioning Profiles"
installed_profile="$profile_dir/ok200-ios-$GITHUB_RUN_ID.mobileprovision"

if [[ -e "$material_dir" || -e "$keychain" || -e "$installed_profile" ]]; then
  echo "Ephemeral iOS signing paths already exist" >&2
  exit 1
fi
mkdir -p "$material_dir" "$profile_dir"

p12="$material_dir/distribution.p12"
profile_source="$material_dir/profile.mobileprovision"
profile_plist="$material_dir/profile.plist"
distribution_pem="$material_dir/distribution.pem"
profile_cert_der="$material_dir/profile-cert.der"

printf '%s' "$IOS_CERTIFICATE_P12_BASE64" | base64 --decode >"$p12"
printf '%s' "$IOS_PROVISIONING_PROFILE_BASE64" | base64 --decode >"$profile_source"

security create-keychain -p "$MACOS_KEYCHAIN_PASSWORD" "$keychain"
security unlock-keychain -p "$MACOS_KEYCHAIN_PASSWORD" "$keychain"
security set-keychain-settings -lut 3600 "$keychain"
security import "$p12" \
  -k "$keychain" \
  -P "$IOS_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security >/dev/null
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$MACOS_KEYCHAIN_PASSWORD" \
  "$keychain" >/dev/null
security list-keychains -d user -s "$keychain"

identity_count="$(security find-identity -v -p codesigning "$keychain" | rg -c '"Apple Distribution:' || true)"
[[ "$identity_count" == "1" ]] || {
  echo "Expected exactly one Apple Distribution identity in the ephemeral keychain" >&2
  exit 1
}
security find-certificate -a -c 'Apple Distribution' -p "$keychain" >"$distribution_pem"
openssl x509 -in "$distribution_pem" -noout -checkend 0 >/dev/null || {
  echo "Apple Distribution certificate is expired" >&2
  exit 1
}
openssl x509 -in "$distribution_pem" -noout -subject -nameopt RFC2253 \
  | rg -q "(^|,)OU=$IOS_TEAM_ID(,|$)" || {
    echo "Apple Distribution certificate does not belong to IOS_TEAM_ID" >&2
    exit 1
  }

security cms -D -i "$profile_source" >"$profile_plist"
[[ "$(plutil -extract TeamIdentifier.0 raw "$profile_plist")" == "$IOS_TEAM_ID" ]] || {
  echo "Provisioning profile does not belong to IOS_TEAM_ID" >&2
  exit 1
}
[[ "$(plutil -extract Entitlements.application-identifier raw "$profile_plist")" == "$IOS_TEAM_ID.app.ok200.ios" ]] || {
  echo "Provisioning profile does not match app.ok200.ios" >&2
  exit 1
}
[[ "$(plutil -extract Entitlements.get-task-allow raw "$profile_plist")" == "false" ]] || {
  echo "Provisioning profile is not distribution-only" >&2
  exit 1
}
if plutil -extract ProvisionedDevices json -o - "$profile_plist" >/dev/null 2>&1; then
  echo "Provisioning profile unexpectedly contains devices" >&2
  exit 1
fi
if [[ "$(plutil -extract ProvisionsAllDevices raw "$profile_plist" 2>/dev/null || true)" == "true" ]]; then
  echo "Provisioning profile is for enterprise distribution" >&2
  exit 1
fi
profile_expiration="$(plutil -extract ExpirationDate raw "$profile_plist")"
if [[ "$profile_expiration" < "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" ]]; then
  echo "Provisioning profile is expired" >&2
  exit 1
fi

distribution_fingerprint="$(openssl x509 -in "$distribution_pem" -outform DER | shasum -a 256 | awk '{print $1}')"
profile_certificate_count=0
profile_certificate_match=false
while plutil -extract "DeveloperCertificates.$profile_certificate_count" raw "$profile_plist" \
  2>/dev/null | base64 --decode >"$profile_cert_der"; do
  profile_fingerprint="$(shasum -a 256 "$profile_cert_der" | awk '{print $1}')"
  if [[ "$distribution_fingerprint" == "$profile_fingerprint" ]]; then
    profile_certificate_match=true
  fi
  profile_certificate_count=$((profile_certificate_count + 1))
done
[[ "$profile_certificate_count" -gt 0 && "$profile_certificate_match" == true ]] || {
  echo "Provisioning profile does not contain the imported distribution certificate" >&2
  exit 1
}

profile_name="$(plutil -extract Name raw "$profile_plist")"
[[ "$profile_name" =~ ^[A-Za-z0-9._ -]+$ ]] || {
  echo "Provisioning profile name contains unsupported characters" >&2
  exit 1
}
cp "$profile_source" "$installed_profile"
chmod 600 "$installed_profile"

printf '%s\n' \
  "IOS_PROVISIONING_PROFILE_SPECIFIER=$profile_name" \
  "IOS_RELEASE_KEYCHAIN_PATH=$keychain" \
  "IOS_RELEASE_PROFILE_PATH=$installed_profile" \
  >>"$GITHUB_ENV"

echo "Ephemeral Apple Distribution identity and matching App Store profile are ready"
