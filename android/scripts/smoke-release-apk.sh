#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <release-apk> <version-name> <output-dir>" >&2
  exit 2
fi

apk="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
expected_version="$2"
output_dir="$3"
package="app.ok200.android"
activity="$package/.MainActivity"

mkdir -p "$output_dir"

capture_diagnostics() {
  adb logcat -d -v threadtime > "$output_dir/release-logcat.txt" 2>/dev/null || true
  adb exec-out screencap -p > "$output_dir/release-screen.png" 2>/dev/null || true
  adb shell uiautomator dump /sdcard/ok200-release-window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/ok200-release-window.xml "$output_dir/release-window.xml" >/dev/null 2>&1 || true
}
trap capture_diagnostics EXIT

adb install -r "$apk" > "$output_dir/install.txt"
adb shell dumpsys package "$package" > "$output_dir/package.txt"
grep -Fq "versionName=$expected_version" "$output_dir/package.txt"

adb shell pm clear "$package" > "$output_dir/clear.txt"
adb shell am start -W -n "$activity" > "$output_dir/launcher.txt"
grep -Fq 'Status: ok' "$output_dir/launcher.txt"
sleep 2
adb shell uiautomator dump /sdcard/ok200-release-window.xml >/dev/null
adb pull /sdcard/ok200-release-window.xml "$output_dir/release-window.xml" >/dev/null
grep -Fq 'content-desc="Start web server"' "$output_dir/release-window.xml"

adb shell am force-stop "$package"
adb shell am start -W -a android.intent.action.VIEW -d 'ok200://launch' > "$output_dir/deep-link.txt"
grep -Fq 'Status: ok' "$output_dir/deep-link.txt"
adb shell pidof "$package" > "$output_dir/pid.txt"
test -s "$output_dir/pid.txt"
adb shell am force-stop "$package"

echo "Exact Android Release APK launched through launcher and ok200://launch; primary control is present"
