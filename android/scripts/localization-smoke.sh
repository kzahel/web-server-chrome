#!/usr/bin/env bash
# Own one disposable emulator; never select an attached phone or a developer AVD.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
source "$HOME/.profile"
source "$script_dir/android-env.sh"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
avd_name="ok200-localization-$$"
port="${OK200_LOCALIZATION_EMULATOR_PORT:-5580}"
serial="emulator-$port"
case "$(uname -m)" in arm64|aarch64) image_arch="arm64-v8a" ;; *) image_arch="x86_64" ;; esac
image="${OK200_LOCALIZATION_SYSTEM_IMAGE:-system-images;android-35;google_apis;$image_arch}"
work="$repo_root/.local/localization/android-emulator"
mkdir -p "$work"
if adb devices | awk '{ print $1 }' | rg -Fxq "$serial"; then
  echo "Requested test port is already occupied: $port" >&2
  exit 1
fi
emulator_pid=""
cleanup() {
  if [[ -n "$emulator_pid" ]]; then
    adb -s "$serial" emu kill >/dev/null 2>&1 || true
    kill "$emulator_pid" 2>/dev/null || true
    wait "$emulator_pid" 2>/dev/null || true
  fi
  avdmanager delete avd -n "$avd_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
printf 'no\n' | avdmanager create avd -n "$avd_name" -k "$image" --device pixel_5 > "$work/create.log" 2>&1
emulator -avd "$avd_name" -port "$port" -no-window -no-audio -no-snapshot -gpu swiftshader_indirect > "$work/emulator.log" 2>&1 &
emulator_pid=$!
ready=0
for ((attempt=0;attempt<180;attempt++)); do
  if [[ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; then ready=1; break; fi
  if ! kill -0 "$emulator_pid" 2>/dev/null; then echo "Owned emulator exited; see $work/emulator.log" >&2; exit 1; fi
  sleep 1
done
[[ "$ready" == "1" ]] || { echo "Owned emulator did not boot" >&2; exit 1; }
(cd "$repo_root/android" && ./gradlew assembleDebug > "$work/install.log" 2>&1)
adb -s "$serial" install -r "$repo_root/android/app/build/outputs/apk/debug/app-debug.apk" >> "$work/install.log" 2>&1
api="$(adb -s "$serial" shell getprop ro.build.version.sdk | tr -d '\r')"
if ((api >= 30)); then adb -s "$serial" shell appops set app.ok200.android MANAGE_EXTERNAL_STORAGE allow; fi
"$script_dir/test.sh" --integration --device "$serial"
echo "Locale ${OK200_TEST_LOCALE:-de}: recreation/HTTP and the full instrumentation suite passed on owned API $api"
