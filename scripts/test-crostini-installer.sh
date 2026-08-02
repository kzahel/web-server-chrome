#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALLER="$REPO_ROOT/website/public/install-crostini.sh"

bash -n "$INSTALLER"

TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT
export OK200_CROSTINI_INSTALLER_LIB_ONLY=1
# shellcheck source=/dev/null
source "$INSTALLER"
unset OK200_CROSTINI_INSTALLER_LIB_ONLY

base64_line() {
    base64 < "$1" | tr -d '\n'
}

make_signature() {
    local mode="$1"
    local data="$2"
    local output="$3"
    local message="$TEST_DIR/message-$mode"
    local signature="$TEST_DIR/signature-$mode.raw"
    local packet="$TEST_DIR/signature-$mode.packet"
    local algorithm
    if [ "$mode" = "prehashed" ]; then
        algorithm='\105\104'
        openssl dgst -blake2b512 -binary "$data" > "$message"
    else
        algorithm='\105\144'
        cp "$data" "$message"
    fi
    openssl pkeyutl -sign -inkey "$TEST_DIR/test.key" \
        -rawin -in "$message" -out "$signature"
    printf "$algorithm" > "$packet"
    printf '\001\002\003\004\005\006\007\010' >> "$packet"
    cat "$signature" >> "$packet"
    {
        echo 'untrusted comment: test release signature'
        base64_line "$packet"
        echo
        echo 'trusted comment: test fixture'
        dd if=/dev/zero bs=64 count=1 status=none | base64 | tr -d '\n'
        echo
    } > "$output"
}

openssl genpkey -algorithm Ed25519 -out "$TEST_DIR/test.key" >/dev/null 2>&1
openssl pkey -in "$TEST_DIR/test.key" -pubout -outform DER \
    -out "$TEST_DIR/test-public.der" >/dev/null 2>&1
printf '\105\144' > "$TEST_DIR/test-public.packet"
printf '\001\002\003\004\005\006\007\010' >> "$TEST_DIR/test-public.packet"
tail -c 32 "$TEST_DIR/test-public.der" >> "$TEST_DIR/test-public.packet"
TEST_PUBLIC_KEY=$(base64_line "$TEST_DIR/test-public.packet")

printf 'signed metadata\n' > "$TEST_DIR/data"
for mode in legacy prehashed; do
    make_signature "$mode" "$TEST_DIR/data" "$TEST_DIR/$mode.minisig"
    verify_minisign \
        "$TEST_DIR/data" "$TEST_DIR/$mode.minisig" \
        "$TEST_PUBLIC_KEY" "$TEST_DIR"
done
printf 'tampered metadata\n' > "$TEST_DIR/tampered"
if verify_minisign \
    "$TEST_DIR/tampered" "$TEST_DIR/prehashed.minisig" \
    "$TEST_PUBLIC_KEY" "$TEST_DIR" 2>/dev/null; then
    echo "FAIL: installer accepted a tampered signed message" >&2
    exit 1
fi

printf 'fixture binary\n' > "$TEST_DIR/ok200-crostini-x86_64-unknown-linux-musl"
FIXTURE_SIZE=$(wc -c < "$TEST_DIR/ok200-crostini-x86_64-unknown-linux-musl" | tr -d ' ')
FIXTURE_SHA=$(sha256sum "$TEST_DIR/ok200-crostini-x86_64-unknown-linux-musl" | awk '{ print $1 }')
cat > "$TEST_DIR/release.manifest" <<EOF
ok200-crostini-release-v1
version=0.1.0
tag=crostini-v0.1.0
repository=kzahel/web-server-chrome
source_commit=0123456789abcdef0123456789abcdef01234567
controller_protocol=1
extension_protocol_min=1
extension_protocol_max=1
runtime=linux-musl-static
x86_64_asset=ok200-crostini-x86_64-unknown-linux-musl
x86_64_sha256=$FIXTURE_SHA
x86_64_size=$FIXTURE_SIZE
aarch64_asset=ok200-crostini-aarch64-unknown-linux-musl
aarch64_sha256=$FIXTURE_SHA
aarch64_size=$FIXTURE_SIZE
manifest_asset=ok200-crostini-release.manifest
signature_asset=ok200-crostini-release.manifest.minisig
EOF
parse_manifest "$TEST_DIR/release.manifest" x86_64
test "$RELEASE_VERSION" = "0.1.0"
test "$RELEASE_ASSET" = "ok200-crostini-x86_64-unknown-linux-musl"
test "$RELEASE_SHA256" = "$FIXTURE_SHA"
test "$RELEASE_SIZE" = "$FIXTURE_SIZE"

cp "$TEST_DIR/release.manifest" "$TEST_DIR/bad.manifest"
sed -i.bak 's/runtime=linux-musl-static/runtime=linux-gnu/' "$TEST_DIR/bad.manifest"
if parse_manifest "$TEST_DIR/bad.manifest" x86_64 2>/dev/null; then
    echo "FAIL: installer accepted incompatible runtime metadata" >&2
    exit 1
fi

ENCODED_MANIFEST=$(base64_line "$TEST_DIR/release.manifest")
ENCODED_SIGNATURE=$(base64_line "$TEST_DIR/prehashed.minisig")
printf '{"schemaVersion":1,"manifest":"%s","signature":"%s"}\n' \
    "$ENCODED_MANIFEST" "$ENCODED_SIGNATURE" > "$TEST_DIR/envelope.json"
test "$(extract_envelope_field manifest "$TEST_DIR/envelope.json")" = "$ENCODED_MANIFEST"
test "$(extract_envelope_field signature "$TEST_DIR/envelope.json")" = "$ENCODED_SIGNATURE"

version_is_older 1.2.2 1.2.3
version_is_older 0.9.9 1.0.0
if version_is_older 1.2.3 1.2.3 || version_is_older 2.0.0 1.9.9; then
    echo "FAIL: installer rollback comparison is incorrect" >&2
    exit 1
fi

echo "Crostini bootstrap installer integrity tests passed."
