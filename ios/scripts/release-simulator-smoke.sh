#!/usr/bin/env bash
set -euo pipefail

# A separate XCTest runner drives a production Release app through normal UI.
# No DEBUG launch hooks, selected-root injection, or existing simulator reuse.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$ios_root/.." && pwd)"
for tool in xcodebuild xcodegen xcrun python3 rg; do
  command -v "$tool" >/dev/null
done
mkdir -p "$ios_root/build"
output="$(mktemp -d "$ios_root/build/release-smoke.XXXXXX")"
simulator=""
cleanup() {
  local result=$?
  trap - EXIT
  if [[ -n "$simulator" ]]; then
    xcrun simctl terminate "$simulator" app.ok200.ios >/dev/null 2>&1 || true
    xcrun simctl shutdown "$simulator" >>"$output/cleanup.log" 2>&1 || true
    if ! xcrun simctl delete "$simulator" >>"$output/cleanup.log" 2>&1; then
      echo "Failed to remove owned simulator; see $output/cleanup.log" >&2
      result=1
    fi
  fi
  printf 'exit_code=%s\n' "$result" >"$output/result.txt"
  echo "Release smoke evidence: $output"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

xcrun simctl list -j >"$output/simulators-before.json"
python3 - "$output/simulators-before.json" >"$output/selection.txt" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
runtimes = [r for r in data['runtimes'] if r.get('isAvailable') and r['name'].startswith('iOS ')]
runtime = max(runtimes, key=lambda r: tuple(map(int, r['version'].split('.'))))
phones = [d for d in data['devicetypes'] if d['name'].startswith('iPhone')]
phone = next((d for d in phones if d['name'] == 'iPhone 17 Pro Max'), phones[-1])
print(runtime['identifier'])
print(phone['identifier'])
PY
runtime="$(sed -n '1p' "$output/selection.txt")"
device_type="$(sed -n '2p' "$output/selection.txt")"
simulator="$(xcrun simctl create "200OK-Release-Smoke-$(basename "$output")" "$device_type" "$runtime")"
printf '%s\n' "$simulator" >"$output/owned-simulator.txt"
xcrun simctl boot "$simulator"
xcrun simctl bootstatus "$simulator" -b >"$output/boot.log" 2>&1

app="${IOS_RELEASE_SMOKE_APP:-}"
if [[ -z "$app" ]]; then
  "$script_dir/generate-project.sh" >"$output/generate-app.log" 2>&1
  xcodebuild -project "$ios_root/OK200.xcodeproj" -scheme OK200 \
    -configuration Release -destination "platform=iOS Simulator,id=$simulator" \
    -derivedDataPath "$output/AppDerivedData" CODE_SIGNING_ALLOWED=NO \
    ONLY_ACTIVE_ARCH=YES build >"$output/build-app.log" 2>&1
  app="$output/AppDerivedData/Build/Products/Release-iphonesimulator/OK200.app"
fi
[[ "$(plutil -extract DTPlatformName raw "$app/Info.plist")" == iphonesimulator ]]
[[ "$(plutil -extract CFBundleIdentifier raw "$app/Info.plist")" == app.ok200.ios ]]
[[ "$(plutil -extract MinimumOSVersion raw "$app/Info.plist")" == 17.0 ]]
[[ "$(plutil -extract ITSAppUsesNonExemptEncryption raw "$app/Info.plist")" == false ]]
cmp "$ios_root/200OK/Resources/PrivacyInfo.xcprivacy" "$app/PrivacyInfo.xcprivacy"
executable="$app/$(plutil -extract CFBundleExecutable raw "$app/Info.plist")"
strings "$executable" >"$output/binary-strings.txt"
if rg -q 'OK200-QA-Fixture|use-ok200-ui-test-fixture|reset-ok200-ui-test-state|use-ok200-invalid-root|hello from ios' "$output/binary-strings.txt"; then
  echo "Simulator Release contains a DEBUG fixture or automation hook" >&2
  exit 1
fi
if [[ -d "$app/Frameworks" ]] && find "$app/Frameworks" -mindepth 1 -print -quit | rg -q .; then
  echo "Simulator Release unexpectedly embeds frameworks" >&2
  exit 1
fi
# Simulator actool icons may contain alpha even when the source and device
# icons do not. Distribution-only architecture/icon/signing checks remain in
# inspect-release.sh, which must separately pass for the exact device IPA.
{
  printf 'platform=iphonesimulator\nconfiguration=Release-no-debug-hooks\n'
  printf 'version=%s\nbuild=%s\n' \
    "$(plutil -extract CFBundleShortVersionString raw "$app/Info.plist")" \
    "$(plutil -extract CFBundleVersion raw "$app/Info.plist")"
  printf 'architectures=%s\n' "$(lipo -archs "$executable")"
  printf 'executable_sha256=%s\n' "$(shasum -a 256 "$executable" | awk '{print $1}')"
  printf 'privacy_manifest=reviewed-match\ndebug_hooks=absent\nembedded_frameworks=absent\n'
} >"$output/artifact-inspection.txt"
git -C "$repo_root" rev-parse HEAD >"$output/source-commit.txt"
git -C "$repo_root" diff --binary -- ios >"$output/source-ios.diff"
printf '%s\n' "$app" >"$output/app-path.txt"
xcrun simctl install "$simulator" "$app"

# Seed only this disposable simulator's OS Files provider. The app receives
# access later through the real UIDocumentPicker, never through its defaults.
xcrun simctl launch "$simulator" com.apple.DocumentsApp >"$output/files-launch.log"
provider="$(xcrun simctl get_app_container "$simulator" com.apple.DocumentsApp groups | awk -F '\t' '$1 == "group.com.apple.FileProvider.LocalStorage" {print $2}')"
[[ -n "$provider" && "$provider" == *"/Devices/$simulator/data/Containers/Shared/AppGroup/"* ]]
fixture="$provider/File Provider Storage/200OK-Smoke-Website"
mkdir -p "$fixture/directory"
cat >"$fixture/index.html" <<'HTML'
<!doctype html><html lang="en"><meta charset="utf-8"><title>200 OK Release Smoke</title><h1>200 OK Release Smoke</h1><p>A local read-only website served by the Release app.</p><a href="hello.txt">Text fixture</a></html>
HTML
printf 'hello from release smoke\n' >"$fixture/hello.txt"
printf 'nested fixture\n' >"$fixture/directory/nested.txt"
mkdir -p "$output/Project"
xcodegen --spec "$ios_root/ReleaseSmoke/project.yml" --project "$output/Project" \
  --project-root "$ios_root/ReleaseSmoke" >"$output/generate-tests.log" 2>&1
xcodebuild -project "$output/Project/OK200ReleaseSmoke.xcodeproj" \
  -scheme ReleaseSmoke -configuration Release \
  -destination "platform=iOS Simulator,id=$simulator" \
  -parallel-testing-enabled NO -derivedDataPath "$output/TestDerivedData" \
  CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES \
  -resultBundlePath "$output/Smoke.xcresult" test >"$output/test.log" 2>&1
xcrun xcresulttool export attachments --path "$output/Smoke.xcresult" \
  --output-path "$output/attachments" >"$output/attachments.log" 2>&1
echo "Release Files/HTTP/preview/settings/lifecycle smoke passed"
