#!/usr/bin/env bash
set -euo pipefail

# 200 OK ChromeOS Linux installer.
# Usage: curl -fsSL https://ok200.app/install-crostini.sh | bash
#
# The HTTPS bootstrap script carries the release public key. It verifies the
# detached Minisign signature over the canonical release manifest, then checks
# the selected static binary's signed size and SHA-256 before executing it.

UPDATE_ENDPOINT="https://updates.ok200.app/crostini/manifest"
FALLBACK_TAG="crostini-v0.1.0"
REPOSITORY="kzahel/web-server-chrome"
MANIFEST_NAME="ok200-crostini-release.manifest"
SIGNATURE_NAME="ok200-crostini-release.manifest.minisig"
MINISIGN_PUBLIC_KEY="RWSK1rRTqNNgKReeJCiqkdVaRCFFOSTEI1yVRK/nU10foAzYGTZAK5oc"
MAX_METADATA_BYTES=65536
MAX_ASSET_BYTES=67108864

if [ -t 1 ]; then
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    GREEN='' YELLOW='' RED='' BOLD='' NC=''
fi

info() { echo -e "${GREEN}==>${NC} ${BOLD}$*${NC}"; }
warn() { echo -e "${YELLOW}warning:${NC} $*"; }
error() { echo -e "${RED}error:${NC} $*" >&2; }

hex_bytes() {
    od -An -tx1 | tr -d ' \n'
}

decode_base64_to() {
    local value="$1"
    local output="$2"
    if ! printf '%s' "$value" | base64 -d > "$output" 2>/dev/null; then
        error "Release metadata contains invalid base64."
        return 1
    fi
}

# Verify the data signature. Minisign's optional trusted comment is not used as
# release data; every trusted field lives inside the signed manifest itself.
verify_minisign() {
    local data_file="$1"
    local signature_file="$2"
    local public_key="$3"
    local scratch_dir="$4"
    local public_binary="$scratch_dir/minisign-public.bin"
    local signature_binary="$scratch_dir/minisign-signature.bin"
    local public_der="$scratch_dir/minisign-public.der"
    local signature_raw="$scratch_dir/minisign-signature.raw"
    local signed_message="$scratch_dir/minisign-message.bin"

    if [ "$(awk 'END { print NR }' "$signature_file")" -ne 4 ] ||
       ! sed -n '1p' "$signature_file" | grep -q '^untrusted comment:' ||
       ! sed -n '3p' "$signature_file" | grep -q '^trusted comment:'; then
        error "Release signature has an invalid Minisign shape."
        return 1
    fi
    local signature_line
    signature_line=$(sed -n '2p' "$signature_file")
    decode_base64_to "$public_key" "$public_binary"
    decode_base64_to "$signature_line" "$signature_binary"
    if [ "$(wc -c < "$public_binary" | tr -d ' ')" -ne 42 ] ||
       [ "$(wc -c < "$signature_binary" | tr -d ' ')" -ne 74 ]; then
        error "Release key or signature has an invalid encoded size."
        return 1
    fi

    local public_key_id signature_key_id signature_algorithm
    public_key_id=$(dd if="$public_binary" bs=1 skip=2 count=8 status=none | hex_bytes)
    signature_key_id=$(dd if="$signature_binary" bs=1 skip=2 count=8 status=none | hex_bytes)
    signature_algorithm=$(dd if="$signature_binary" bs=1 count=2 status=none | hex_bytes)
    if [ "$public_key_id" != "$signature_key_id" ]; then
        error "Release signature was made by a different key."
        return 1
    fi

    # ASN.1 SubjectPublicKeyInfo prefix for a raw Ed25519 public key.
    printf '\060\052\060\005\006\003\053\145\160\003\041\000' > "$public_der"
    dd if="$public_binary" bs=1 skip=10 count=32 status=none >> "$public_der"
    dd if="$signature_binary" bs=1 skip=10 count=64 status=none > "$signature_raw"
    case "$signature_algorithm" in
        4544) openssl dgst -blake2b512 -binary "$data_file" > "$signed_message" ;;
        4564) cp "$data_file" "$signed_message" ;;
        *)
            error "Release signature uses an unsupported algorithm."
            return 1
            ;;
    esac
    if ! openssl pkeyutl -verify -pubin -keyform DER \
        -inkey "$public_der" -sigfile "$signature_raw" \
        -rawin -in "$signed_message" >/dev/null 2>&1; then
        error "Release signature verification failed."
        return 1
    fi
}

manifest_value() {
    local key="$1"
    local manifest="$2"
    local values
    values=$(sed -n "s/^${key}=//p" "$manifest")
    if [ -z "$values" ] || [ "$(printf '%s\n' "$values" | wc -l | tr -d ' ')" -ne 1 ]; then
        error "Release manifest has invalid ${key}."
        return 1
    fi
    printf '%s' "$values"
}

parse_manifest() {
    local manifest="$1"
    local arch="$2"
    local expected_keys actual_keys
    expected_keys='version
tag
repository
source_commit
controller_protocol
extension_protocol_min
extension_protocol_max
runtime
x86_64_asset
x86_64_sha256
x86_64_size
aarch64_asset
aarch64_sha256
aarch64_size
manifest_asset
signature_asset'
    actual_keys=$(sed -n '2,$s/=.*//p' "$manifest")
    if [ "$(sed -n '1p' "$manifest")" != "ok200-crostini-release-v1" ] ||
       [ "$actual_keys" != "$expected_keys" ]; then
        error "Release manifest has an unsupported shape."
        return 1
    fi

    RELEASE_VERSION=$(manifest_value version "$manifest")
    RELEASE_TAG=$(manifest_value tag "$manifest")
    RELEASE_REPOSITORY=$(manifest_value repository "$manifest")
    local source_commit controller_protocol extension_min extension_max runtime
    source_commit=$(manifest_value source_commit "$manifest")
    controller_protocol=$(manifest_value controller_protocol "$manifest")
    extension_min=$(manifest_value extension_protocol_min "$manifest")
    extension_max=$(manifest_value extension_protocol_max "$manifest")
    runtime=$(manifest_value runtime "$manifest")
    if [[ ! "$RELEASE_VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] ||
       [ "$RELEASE_TAG" != "crostini-v${RELEASE_VERSION}" ] ||
       [ "$RELEASE_REPOSITORY" != "$REPOSITORY" ] ||
       [[ ! "$source_commit" =~ ^[0-9a-f]{40}$ ]] ||
       [ "$controller_protocol" != "1" ] ||
       [ "$extension_min" != "1" ] ||
       [ "$extension_max" != "1" ] ||
       [ "$runtime" != "linux-musl-static" ] ||
       [ "$(manifest_value manifest_asset "$manifest")" != "$MANIFEST_NAME" ] ||
       [ "$(manifest_value signature_asset "$manifest")" != "$SIGNATURE_NAME" ]; then
        error "Release manifest identity or compatibility validation failed."
        return 1
    fi

    RELEASE_ASSET=$(manifest_value "${arch}_asset" "$manifest")
    RELEASE_SHA256=$(manifest_value "${arch}_sha256" "$manifest")
    RELEASE_SIZE=$(manifest_value "${arch}_size" "$manifest")
    if [ "$RELEASE_ASSET" != "ok200-crostini-${arch}-unknown-linux-musl" ] ||
       [[ ! "$RELEASE_SHA256" =~ ^[0-9a-f]{64}$ ]] ||
       [[ ! "$RELEASE_SIZE" =~ ^[0-9]+$ ]] ||
       [ "$RELEASE_SIZE" -le 0 ] ||
       [ "$RELEASE_SIZE" -gt "$MAX_ASSET_BYTES" ]; then
        error "Release manifest has invalid ${arch} asset metadata."
        return 1
    fi
}

extract_envelope_field() {
    local field="$1"
    local envelope="$2"
    sed -n "s/.*\"${field}\":\"\([A-Za-z0-9+\/=]*\)\".*/\1/p" "$envelope"
}

version_is_older() {
    local candidate="$1"
    local current="$2"
    local candidate_major candidate_minor candidate_patch
    local current_major current_minor current_patch
    IFS=. read -r candidate_major candidate_minor candidate_patch <<< "$candidate"
    IFS=. read -r current_major current_minor current_patch <<< "$current"
    local candidate_parts=("$candidate_major" "$candidate_minor" "$candidate_patch")
    local current_parts=("$current_major" "$current_minor" "$current_patch")
    local index
    for index in 0 1 2; do
        if ((10#${candidate_parts[$index]} < 10#${current_parts[$index]})); then
            return 0
        fi
        if ((10#${candidate_parts[$index]} > 10#${current_parts[$index]})); then
            return 1
        fi
    done
    return 1
}

download_release_metadata() {
    local requested_version="$1"
    local arch="$2"
    local temp_dir="$3"
    local manifest="$temp_dir/$MANIFEST_NAME"
    local signature="$temp_dir/$SIGNATURE_NAME"

    if [ -n "$requested_version" ]; then
        local requested_tag="crostini-v${requested_version#v}"
        local base_url="https://github.com/${REPOSITORY}/releases/download/${requested_tag}"
        info "Downloading release metadata for ${requested_tag}..."
        curl -fSL --proto '=https' --proto-redir '=https' --max-time 30 \
            --max-filesize "$MAX_METADATA_BYTES" \
            "${base_url}/${MANIFEST_NAME}" -o "$manifest"
        curl -fSL --proto '=https' --proto-redir '=https' --max-time 30 \
            --max-filesize "$MAX_METADATA_BYTES" \
            "${base_url}/${SIGNATURE_NAME}" -o "$signature"
        return
    fi

    local envelope="$temp_dir/release-envelope.json"
    info "Checking the signed ChromeOS Linux release channel..."
    if curl -fsSL --proto '=https' --proto-redir '=https' --max-time 30 \
        --max-filesize "$MAX_METADATA_BYTES" \
        "${UPDATE_ENDPOINT}/${arch}/0.0.0" -o "$envelope"; then
        local encoded_manifest encoded_signature
        encoded_manifest=$(extract_envelope_field manifest "$envelope")
        encoded_signature=$(extract_envelope_field signature "$envelope")
        if [ -z "$encoded_manifest" ] || [ -z "$encoded_signature" ]; then
            error "Update service returned an invalid release envelope."
            return 1
        fi
        decode_base64_to "$encoded_manifest" "$manifest"
        decode_base64_to "$encoded_signature" "$signature"
        return
    fi

    warn "Update service is unavailable; trying the pinned ${FALLBACK_TAG} release."
    local fallback_url="https://github.com/${REPOSITORY}/releases/download/${FALLBACK_TAG}"
    curl -fSL --proto '=https' --proto-redir '=https' --max-time 30 \
        --max-filesize "$MAX_METADATA_BYTES" \
        "${fallback_url}/${MANIFEST_NAME}" -o "$manifest"
    curl -fSL --proto '=https' --proto-redir '=https' --max-time 30 \
        --max-filesize "$MAX_METADATA_BYTES" \
        "${fallback_url}/${SIGNATURE_NAME}" -o "$signature"
}

if [ "${OK200_CROSTINI_INSTALLER_LIB_ONLY:-}" = "1" ]; then
    return 0 2>/dev/null || exit 0
fi

REQUESTED_VERSION=""
HAS_VERSION=""
ACTION="install"
PURGE=""
while [ "$#" -gt 0 ]; do
    case "$1" in
        --version)
            [ "$#" -ge 2 ] || { error "--version requires a value"; exit 1; }
            REQUESTED_VERSION="${2#v}"
            HAS_VERSION="1"
            shift 2
            ;;
        --check) ACTION="check"; shift ;;
        --rollback) ACTION="rollback"; shift ;;
        --uninstall) ACTION="uninstall"; shift ;;
        --purge) PURGE="--purge"; shift ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

if [ -n "$REQUESTED_VERSION" ] && [[ ! "$REQUESTED_VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    error "Version must use numeric semantic versioning, such as 0.1.0."
    exit 1
fi
if [ -n "$PURGE" ] && [ "$ACTION" != "uninstall" ]; then
    error "--purge is valid only with --uninstall."
    exit 1
fi
if [ -n "$HAS_VERSION" ] && [ "$ACTION" != "install" ] && [ "$ACTION" != "check" ]; then
    error "--version is valid only for install or check."
    exit 1
fi

INSTALLED_BINARY="${HOME}/.local/bin/ok200-crostini"
if [ "$ACTION" = "uninstall" ]; then
    if [ ! -x "$INSTALLED_BINARY" ]; then
        info "200 OK Linux is not installed."
        exit 0
    fi
    if [ -n "$PURGE" ]; then
        "$INSTALLED_BINARY" uninstall --purge
    else
        "$INSTALLED_BINARY" uninstall
    fi
    exit 0
fi
if [ "$ACTION" = "rollback" ]; then
    if [ ! -x "$INSTALLED_BINARY" ]; then
        error "200 OK Linux is not installed."
        exit 1
    fi
    "$INSTALLED_BINARY" rollback
    exit 0
fi

if [ "$(uname -s)" != "Linux" ]; then
    error "This installer is for the ChromeOS Linux environment."
    exit 1
fi
case "$(uname -m)" in
    x86_64|amd64) ARCH="x86_64" ;;
    aarch64|arm64) ARCH="aarch64" ;;
    *) error "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac
for command_name in curl openssl base64 dd od awk sed grep tr sha256sum wc mktemp; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        error "$command_name is required by the verified installer."
        exit 1
    fi
done

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
download_release_metadata "$REQUESTED_VERSION" "$ARCH" "$TEMP_DIR"
MANIFEST_PATH="$TEMP_DIR/$MANIFEST_NAME"
SIGNATURE_PATH="$TEMP_DIR/$SIGNATURE_NAME"
verify_minisign "$MANIFEST_PATH" "$SIGNATURE_PATH" "$MINISIGN_PUBLIC_KEY" "$TEMP_DIR"
parse_manifest "$MANIFEST_PATH" "$ARCH"
if [ -n "$REQUESTED_VERSION" ] && [ "$RELEASE_VERSION" != "$REQUESTED_VERSION" ]; then
    error "Requested ${REQUESTED_VERSION}, but the signed manifest is ${RELEASE_VERSION}."
    exit 1
fi
info "Verified signed release manifest for 200 OK Linux ${RELEASE_VERSION}."

if [ -x "$INSTALLED_BINARY" ]; then
    INSTALLED_VERSION_OUTPUT=$("$INSTALLED_BINARY" --version) || {
        error "The installed 200 OK Linux binary did not pass its version self-test."
        exit 1
    }
    if [[ ! "$INSTALLED_VERSION_OUTPUT" =~ ^ok200-crostini\ ((0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))$ ]]; then
        error "The installed 200 OK Linux binary reported an invalid version."
        exit 1
    fi
    INSTALLED_VERSION="${BASH_REMATCH[1]}"
    if version_is_older "$RELEASE_VERSION" "$INSTALLED_VERSION"; then
        error "Refusing to replace installed ${INSTALLED_VERSION} with older signed release ${RELEASE_VERSION}. Use the local rollback command for the retained previous version."
        exit 1
    fi
fi

if [ "$ACTION" = "check" ]; then
    echo "Latest signed ChromeOS Linux release: ${RELEASE_VERSION}"
    if [ -x "$INSTALLED_BINARY" ]; then
        "$INSTALLED_BINARY" --version
    fi
    exit 0
fi

ASSET_PATH="$TEMP_DIR/$RELEASE_ASSET"
ASSET_URL="https://github.com/${RELEASE_REPOSITORY}/releases/download/${RELEASE_TAG}/${RELEASE_ASSET}"
info "Downloading ${RELEASE_ASSET}..."
curl -fSL --proto '=https' --proto-redir '=https' --max-time 120 \
    --max-filesize "$RELEASE_SIZE" "$ASSET_URL" -o "$ASSET_PATH"
ACTUAL_SIZE=$(wc -c < "$ASSET_PATH" | tr -d ' ')
ACTUAL_SHA256=$(sha256sum "$ASSET_PATH" | awk '{ print $1 }')
if [ "$ACTUAL_SIZE" != "$RELEASE_SIZE" ] || [ "$ACTUAL_SHA256" != "$RELEASE_SHA256" ]; then
    error "Downloaded binary failed its signed size or SHA-256 check."
    exit 1
fi
chmod 700 "$ASSET_PATH"
if [ "$("$ASSET_PATH" --version)" != "ok200-crostini ${RELEASE_VERSION}" ]; then
    error "Downloaded binary version does not match its signed manifest."
    exit 1
fi
info "Verified ${RELEASE_ASSET}."
"$ASSET_PATH" install-release "$MANIFEST_PATH" "$SIGNATURE_PATH"

echo
info "200 OK Linux ${RELEASE_VERSION} is installed."
echo "Open ‘200 OK Web Server’ from the ChromeOS Launcher."
echo "The web server remains stopped until you press Start in the extension."
echo
echo "Useful commands:"
echo "  ok200-crostini check-update"
echo "  ok200-crostini update"
echo "  ok200-crostini rollback"
echo "  ok200-crostini uninstall"
echo "  ok200-crostini uninstall --purge"
