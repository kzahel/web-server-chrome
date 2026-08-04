#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$ios_root/.." && pwd)"
testbed_root="${IOS_DEVICE_TESTBED_ROOT:-$(cd "$repo_root/../ios-device-testbed" && pwd)}"
device="$testbed_root/bin/ios-device"
app_path="$ios_root/build/DerivedData/Build/Products/Debug-iphoneos/OK200.app"

"$device" probe
"$device" doctor
"$script_dir/build-device.sh" >/dev/null

session_output="$("$device" session -- bash -lc '
  ios="$IOS_DEVICE_TESTBED_ROOT/bin/ios-device"
  "$ios" install "'"$app_path"'"
  "$ios" launch app.ok200.ios \
    --launch-args -reset-ok200-ui-test-state \
    --launch-args -use-ok200-ui-test-fixture \
    --relaunch
  "$ios" snapshot -i
  "$ios" press id=lan-toggle --settle
  "$ios" press id=start-server --settle
  "$ios" swipe 180 590 180 200 --count 3 --pause-ms 250
  "$ios" snapshot -i
')"
printf '%s\n' "$session_output"

lan_url="$(printf '%s\n' "$session_output" \
  | rg -o 'http://([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]+/' \
  | tail -n 1)"
if [[ -z "$lan_url" ]]; then
  echo "No displayed Wi-Fi URL was found in the physical UI snapshot" >&2
  exit 1
fi

curl --fail --silent --show-error --max-time 5 "$lan_url" | rg -q '200 OK iOS QA'
curl --fail --silent --show-error --max-time 5 "${lan_url}hello.txt" | rg -q 'hello from ios'
range_body="$(curl --fail --silent --show-error --max-time 5 \
  -H 'Range: bytes=0-4' "${lan_url}hello.txt")"
[[ "$range_body" == "hello" ]]
missing_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --max-time 5 "${lan_url}missing.txt")"
[[ "$missing_status" == "404" ]]

"$device" session -- bash -lc '
  ios="$IOS_DEVICE_TESTBED_ROOT/bin/ios-device"
  "$ios" launch app.ok200.ios
  "$ios" home
'

if curl --silent --show-error --max-time 3 "$lan_url" >/dev/null; then
  echo "Server remained reachable after the app entered the background" >&2
  exit 1
fi

echo "Physical LAN fixture, representative HTTP requests, and background stop passed"
