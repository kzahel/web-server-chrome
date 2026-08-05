#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 7 ]; then
  echo "Usage: $0 <apk> <aab> <mapping.gz> <version-name> <version-code> <bundletool.jar> <output-dir>" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
android_root="$(cd "$script_dir/.." && pwd)"
apk="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
aab="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
mapping="$(cd "$(dirname "$3")" && pwd)/$(basename "$3")"
expected_version="$4"
expected_code="$5"
bundletool="$(cd "$(dirname "$6")" && pwd)/$(basename "$6")"
output_dir="$7"

find_sdk_tool() {
  local tool="$1"
  if command -v "$tool" >/dev/null 2>&1; then
    command -v "$tool"
    return
  fi
  local sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
  if [ -n "$sdk_root" ]; then
    local match
    match="$(find "$sdk_root" -type f -name "$tool" 2>/dev/null | sort | tail -1)"
    if [ -n "$match" ]; then
      echo "$match"
      return
    fi
  fi
  echo "Required Android SDK tool is missing: $tool" >&2
  exit 2
}

for file in "$apk" "$aab" "$mapping" "$bundletool"; do
  if [ ! -s "$file" ]; then
    echo "Release input is missing or empty: $file" >&2
    exit 1
  fi
done

apksigner="$(find_sdk_tool apksigner)"
apkanalyzer="$(find_sdk_tool apkanalyzer)"
mkdir -p "$output_dir"

"$apksigner" verify --verbose --print-certs "$apk" > "$output_dir/apk-signature.txt"
actual_apk_cert="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$output_dir/apk-signature.txt" | head -1 | tr '[:upper:]' '[:lower:]')"
expected_cert="${EXPECTED_CERT_SHA256:-$(tr -d '[:space:]' < "$android_root/release/expected-upload-cert-sha256.txt")}"
if [ "$actual_apk_cert" != "$expected_cert" ]; then
  echo "APK signer mismatch: expected $expected_cert, got $actual_apk_cert" >&2
  exit 1
fi

keytool -printcert -jarfile "$aab" > "$output_dir/aab-certificate.txt"
actual_aab_cert="$(sed -n 's/^[[:space:]]*SHA256: //p' "$output_dir/aab-certificate.txt" | head -1 | tr -d ':' | tr '[:upper:]' '[:lower:]')"
if [ "$actual_aab_cert" != "$expected_cert" ]; then
  echo "AAB signer mismatch: expected $expected_cert, got $actual_aab_cert" >&2
  exit 1
fi

java -jar "$bundletool" validate --bundle="$aab" > "$output_dir/aab-validation.txt"
java -jar "$bundletool" dump manifest --bundle="$aab" > "$output_dir/aab-manifest.xml"
"$apkanalyzer" manifest print "$apk" > "$output_dir/apk-manifest.xml"

assert_equal() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" != "$expected" ]; then
    echo "$label mismatch: expected $expected, got $actual" >&2
    exit 1
  fi
}

assert_equal "APK application id" "app.ok200.android" "$("$apkanalyzer" manifest application-id "$apk")"
assert_equal "APK version name" "$expected_version" "$("$apkanalyzer" manifest version-name "$apk")"
assert_equal "APK version code" "$expected_code" "$("$apkanalyzer" manifest version-code "$apk")"
assert_equal "APK minimum SDK" "26" "$("$apkanalyzer" manifest min-sdk "$apk")"
assert_equal "APK target SDK" "36" "$("$apkanalyzer" manifest target-sdk "$apk")"
assert_equal "APK debuggable state" "false" "$("$apkanalyzer" manifest debuggable "$apk")"

for manifest in "$output_dir/apk-manifest.xml" "$output_dir/aab-manifest.xml"; do
  for expected in \
    'package="app.ok200.android"' \
    "android:versionName=\"$expected_version\"" \
    "android:versionCode=\"$expected_code\"" \
    'android:minSdkVersion="26"' \
    'android:targetSdkVersion="36"' \
    'android:name="app.ok200.android.MainActivity"' \
    'android:exported="true"' \
    'android:name="android.intent.action.VIEW"' \
    'android:name="android.intent.category.BROWSABLE"' \
    'android:scheme="ok200"' \
    'android:host="launch"' \
    'android:usesCleartextTraffic="true"'; do
    if ! grep -Fq "$expected" "$manifest"; then
      echo "Manifest $(basename "$manifest") is missing $expected" >&2
      exit 1
    fi
  done
  if grep -Eiq 'android:debuggable="true"|DebugRpcProvider|app\.ok200\.debug\.rpc' "$manifest"; then
    echo "Release manifest contains debug-only material: $manifest" >&2
    exit 1
  fi
done

"$apkanalyzer" manifest permissions "$apk" | sort > "$output_dir/apk-permissions.txt"
diff -u "$android_root/release/expected-permissions.txt" "$output_dir/apk-permissions.txt"

unzip -Z1 "$apk" > "$output_dir/apk-files.txt"
unzip -Z1 "$aab" > "$output_dir/aab-files.txt"
grep '^lib/.*\.so$' "$output_dir/apk-files.txt" | sort > "$output_dir/apk-native-libraries.txt"
grep '^base/lib/.*\.so$' "$output_dir/aab-files.txt" | sed 's#^base/##' | sort > "$output_dir/aab-native-libraries.txt"
diff -u "$android_root/release/expected-native-libraries.txt" "$output_dir/apk-native-libraries.txt"
diff -u "$android_root/release/expected-native-libraries.txt" "$output_dir/aab-native-libraries.txt"

for archive in "$apk" "$aab"; do
  if unzip -Z1 "$archive" | grep -Eiq 'quickjs|jstorrent.*engine|libok200|DebugRpcProvider|app\.ok200\.debug\.rpc'; then
    echo "Release archive contains a retired or debug runtime: $archive" >&2
    exit 1
  fi
done
if { unzip -p "$apk" classes.dex; unzip -p "$aab" base/dex/classes.dex; } | strings | \
  grep -Eiq 'QuickJS|DebugRpcProvider|app\.ok200\.debug\.rpc'; then
  echo "Release bytecode contains a retired or debug runtime" >&2
  exit 1
fi

gzip -t "$mapping"
for file in "$apk" "$aab" "$mapping"; do
  digest="$(sha256sum "$file" | awk '{print $1}')"
  printf '%s  %s\n' "$digest" "$(basename "$file")"
done > "$output_dir/SHA256SUMS"

cat > "$output_dir/summary.txt" <<EOF
package=app.ok200.android
version_name=$expected_version
version_code=$expected_code
min_sdk=26
target_sdk=36
debuggable=false
signer_sha256=$expected_cert
apk=$(basename "$apk")
aab=$(basename "$aab")
mapping=$(basename "$mapping")
EOF

echo "Validated exact Android Release APK/AAB for $expected_version ($expected_code)"
cat "$output_dir/SHA256SUMS"
