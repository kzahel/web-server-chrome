use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use semver::Version;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::CONTROLLER_PROTOCOL_VERSION;

pub const RELEASE_MANIFEST_NAME: &str = "ok200-crostini-release.manifest";
pub const RELEASE_SIGNATURE_NAME: &str = "ok200-crostini-release.manifest.minisig";
pub const UPDATE_ENDPOINT: &str = "https://updates.ok200.app/crostini/manifest";
pub const RELEASE_REPOSITORY: &str = "kzahel/web-server-chrome";
pub const EXTENSION_PROTOCOL_VERSION: u16 = 2;

const MANIFEST_HEADER: &str = "ok200-crostini-release-v1";
const RELEASE_RUNTIME: &str = "linux-musl-static";
const MAX_MANIFEST_BYTES: usize = 64 * 1024;
const MAX_SIGNATURE_BYTES: usize = 16 * 1024;
const MAX_RELEASE_ASSET_BYTES: u64 = 64 * 1024 * 1024;
const UPDATE_TIMEOUT_SECONDS: &str = "30";
const PRODUCTION_MINISIGN_PUBLIC_KEY: &str =
    "RWSK1rRTqNNgKReeJCiqkdVaRCFFOSTEI1yVRK/nU10foAzYGTZAK5oc";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseAsset {
    pub arch: String,
    pub name: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseManifest {
    pub version: Version,
    pub tag: String,
    pub repository: String,
    pub source_commit: String,
    pub controller_protocol: u16,
    pub extension_protocol_min: u16,
    pub extension_protocol_max: u16,
    pub runtime: String,
    pub x86_64: ReleaseAsset,
    pub aarch64: ReleaseAsset,
}

impl ReleaseManifest {
    pub fn asset_for_arch(&self, arch: &str) -> Result<&ReleaseAsset, String> {
        match arch {
            "x86_64" => Ok(&self.x86_64),
            "aarch64" => Ok(&self.aarch64),
            _ => Err(format!(
                "unsupported architecture {arch}; expected x86_64 or aarch64"
            )),
        }
    }

    pub fn asset_url(&self, arch: &str) -> Result<String, String> {
        let asset = self.asset_for_arch(arch)?;
        Ok(format!(
            "https://github.com/{}/releases/download/{}/{}",
            self.repository, self.tag, asset.name
        ))
    }
}

#[derive(Clone, Debug)]
pub struct VerifiedRelease {
    pub manifest: ReleaseManifest,
    pub manifest_bytes: Vec<u8>,
    pub signature: String,
}

impl VerifiedRelease {
    pub fn verify_asset(&self, path: &Path, arch: &str) -> Result<(), String> {
        verify_asset_file(path, self.manifest.asset_for_arch(arch)?)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReleaseEnvelope {
    schema_version: u16,
    version: String,
    published_at: String,
    manifest: String,
    signature: String,
}

pub fn current_architecture() -> Result<&'static str, String> {
    match std::env::consts::ARCH {
        "x86_64" => Ok("x86_64"),
        "aarch64" => Ok("aarch64"),
        arch => Err(format!(
            "unsupported architecture {arch}; expected x86_64 or aarch64"
        )),
    }
}

pub fn parse_release_manifest(bytes: &[u8]) -> Result<ReleaseManifest, String> {
    if bytes.is_empty() || bytes.len() > MAX_MANIFEST_BYTES {
        return Err("release manifest has an invalid size".to_owned());
    }
    let text =
        std::str::from_utf8(bytes).map_err(|_| "release manifest is not valid UTF-8".to_owned())?;
    if !text.ends_with('\n') || text.contains('\r') {
        return Err("release manifest must use canonical LF-terminated lines".to_owned());
    }
    let lines: Vec<&str> = text.lines().collect();
    const KEYS: [&str; 16] = [
        "version",
        "tag",
        "repository",
        "source_commit",
        "controller_protocol",
        "extension_protocol_min",
        "extension_protocol_max",
        "runtime",
        "x86_64_asset",
        "x86_64_sha256",
        "x86_64_size",
        "aarch64_asset",
        "aarch64_sha256",
        "aarch64_size",
        "manifest_asset",
        "signature_asset",
    ];
    if lines.len() != KEYS.len() + 1 || lines.first() != Some(&MANIFEST_HEADER) {
        return Err("release manifest has an unsupported shape".to_owned());
    }
    let mut values = Vec::with_capacity(KEYS.len());
    for (line, expected_key) in lines[1..].iter().zip(KEYS) {
        let (key, value) = line
            .split_once('=')
            .ok_or_else(|| format!("release manifest line {expected_key} is malformed"))?;
        if key != expected_key || value.is_empty() || value.contains('=') {
            return Err(format!(
                "release manifest expected one canonical {expected_key} value"
            ));
        }
        values.push(value);
    }

    let version = Version::parse(values[0])
        .map_err(|_| "release manifest version is not semantic versioning".to_owned())?;
    if !version.pre.is_empty() || !version.build.is_empty() {
        return Err("release manifest version must be a final numeric release".to_owned());
    }
    let tag = values[1].to_owned();
    if tag != format!("crostini-v{version}") {
        return Err("release manifest tag does not match its version".to_owned());
    }
    if values[2] != RELEASE_REPOSITORY {
        return Err("release manifest repository is not trusted".to_owned());
    }
    if values[3].len() != 40 || !is_lower_hex(values[3]) {
        return Err("release manifest source commit is invalid".to_owned());
    }
    let controller_protocol = parse_protocol(values[4], "controller_protocol")?;
    let extension_protocol_min = parse_protocol(values[5], "extension_protocol_min")?;
    let extension_protocol_max = parse_protocol(values[6], "extension_protocol_max")?;
    if controller_protocol != CONTROLLER_PROTOCOL_VERSION {
        return Err(format!(
            "release requires unsupported controller protocol {controller_protocol}"
        ));
    }
    if extension_protocol_min > EXTENSION_PROTOCOL_VERSION
        || extension_protocol_max < EXTENSION_PROTOCOL_VERSION
        || extension_protocol_min > extension_protocol_max
    {
        return Err("release is incompatible with this extension protocol".to_owned());
    }
    if values[7] != RELEASE_RUNTIME {
        return Err("release runtime is unsupported".to_owned());
    }
    if values[14] != RELEASE_MANIFEST_NAME || values[15] != RELEASE_SIGNATURE_NAME {
        return Err("release metadata asset names are unsupported".to_owned());
    }

    Ok(ReleaseManifest {
        version,
        tag,
        repository: values[2].to_owned(),
        source_commit: values[3].to_owned(),
        controller_protocol,
        extension_protocol_min,
        extension_protocol_max,
        runtime: values[7].to_owned(),
        x86_64: parse_asset("x86_64", values[8], values[9], values[10])?,
        aarch64: parse_asset("aarch64", values[11], values[12], values[13])?,
    })
}

pub fn verify_signed_release(
    manifest_bytes: &[u8],
    signature_text: &str,
) -> Result<VerifiedRelease, String> {
    verify_signed_release_with_key(
        manifest_bytes,
        signature_text,
        PRODUCTION_MINISIGN_PUBLIC_KEY,
    )
}

fn verify_signed_release_with_key(
    manifest_bytes: &[u8],
    signature_text: &str,
    public_key_base64: &str,
) -> Result<VerifiedRelease, String> {
    if signature_text.is_empty() || signature_text.len() > MAX_SIGNATURE_BYTES {
        return Err("release signature has an invalid size".to_owned());
    }
    let public_key = PublicKey::from_base64(public_key_base64)
        .map_err(|error| format!("embedded release public key is invalid: {error}"))?;
    let signature = Signature::decode(signature_text)
        .map_err(|error| format!("release signature is invalid: {error}"))?;
    public_key
        .verify(manifest_bytes, &signature, false)
        .map_err(|error| format!("release signature verification failed: {error}"))?;
    let manifest = parse_release_manifest(manifest_bytes)?;
    Ok(VerifiedRelease {
        manifest,
        manifest_bytes: manifest_bytes.to_vec(),
        signature: signature_text.to_owned(),
    })
}

pub fn verify_release_files(
    manifest_path: &Path,
    signature_path: &Path,
    asset_path: &Path,
    arch: &str,
) -> Result<VerifiedRelease, String> {
    let manifest_bytes = std::fs::read(manifest_path).map_err(|error| {
        format!(
            "could not read release manifest {}: {error}",
            manifest_path.display()
        )
    })?;
    let signature = std::fs::read_to_string(signature_path).map_err(|error| {
        format!(
            "could not read release signature {}: {error}",
            signature_path.display()
        )
    })?;
    let release = verify_signed_release(&manifest_bytes, &signature)?;
    release.verify_asset(asset_path, arch)?;
    Ok(release)
}

pub fn check_for_update() -> Result<Option<VerifiedRelease>, String> {
    let current = Version::parse(env!("CARGO_PKG_VERSION"))
        .map_err(|error| format!("installed version is invalid: {error}"))?;
    let arch = current_architecture()?;
    let query_version = if current.pre.is_empty() {
        current.to_string()
    } else {
        "0.0.0".to_owned()
    };
    let url = format!("{UPDATE_ENDPOINT}/{arch}/{query_version}");
    let output = Command::new("curl")
        .args([
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--max-time",
            UPDATE_TIMEOUT_SECONDS,
            "--max-filesize",
            &MAX_MANIFEST_BYTES.to_string(),
            &url,
        ])
        .output()
        .map_err(|error| format!("could not run curl for update check: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(if detail.is_empty() {
            format!("update check failed with {}", output.status)
        } else {
            format!("update check failed: {detail}")
        });
    }
    if output.stdout.is_empty() {
        return Ok(None);
    }
    let release = decode_release_envelope(&output.stdout)?;
    if release.manifest.version <= current {
        return Ok(None);
    }
    Ok(Some(release))
}

pub struct StagedUpdate {
    pub release: VerifiedRelease,
    pub binary_path: PathBuf,
    pub manifest_path: PathBuf,
    pub signature_path: PathBuf,
    staging_dir: PathBuf,
}

impl Drop for StagedUpdate {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.staging_dir);
    }
}

pub fn download_update(release: VerifiedRelease) -> Result<StagedUpdate, String> {
    let arch = current_architecture()?;
    let asset = release.manifest.asset_for_arch(arch)?;
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "could not determine the user config directory".to_owned())?
        .join("ok200-crostini")
        .join("updates");
    std::fs::create_dir_all(&config_dir)
        .map_err(|error| format!("could not create update staging directory: {error}"))?;
    let staging_dir = config_dir.join(format!("staging-{}", Uuid::new_v4().simple()));
    std::fs::create_dir(&staging_dir)
        .map_err(|error| format!("could not create private update staging: {error}"))?;
    set_private_directory(&staging_dir)?;

    let binary_path = staging_dir.join(&asset.name);
    let url = release.manifest.asset_url(arch)?;
    let output = Command::new("curl")
        .args([
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--max-time",
            UPDATE_TIMEOUT_SECONDS,
            "--max-filesize",
            &asset.size.to_string(),
            "--output",
        ])
        .arg(&binary_path)
        .arg(&url)
        .output()
        .map_err(|error| format!("could not run curl for update download: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(if detail.is_empty() {
            format!("update download failed with {}", output.status)
        } else {
            format!("update download failed: {detail}")
        });
    }
    release.verify_asset(&binary_path, arch)?;
    make_executable(&binary_path)?;
    verify_binary_version(&binary_path, &release.manifest.version)?;

    let manifest_path = staging_dir.join(RELEASE_MANIFEST_NAME);
    let signature_path = staging_dir.join(RELEASE_SIGNATURE_NAME);
    std::fs::write(&manifest_path, &release.manifest_bytes)
        .map_err(|error| format!("could not stage release manifest: {error}"))?;
    std::fs::write(&signature_path, &release.signature)
        .map_err(|error| format!("could not stage release signature: {error}"))?;
    Ok(StagedUpdate {
        release,
        binary_path,
        manifest_path,
        signature_path,
        staging_dir,
    })
}

fn decode_release_envelope(bytes: &[u8]) -> Result<VerifiedRelease, String> {
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err("update response is too large".to_owned());
    }
    let envelope: ReleaseEnvelope = serde_json::from_slice(bytes)
        .map_err(|error| format!("update response is invalid: {error}"))?;
    if envelope.schema_version != 1 {
        return Err(format!(
            "unsupported update response schema {}",
            envelope.schema_version
        ));
    }
    if envelope.published_at.is_empty() || envelope.published_at.len() > 64 {
        return Err("update response has an invalid publication date".to_owned());
    }
    let manifest_bytes = BASE64
        .decode(envelope.manifest)
        .map_err(|_| "update response manifest is not valid base64".to_owned())?;
    let signature_bytes = BASE64
        .decode(envelope.signature)
        .map_err(|_| "update response signature is not valid base64".to_owned())?;
    if manifest_bytes.len() > MAX_MANIFEST_BYTES || signature_bytes.len() > MAX_SIGNATURE_BYTES {
        return Err("update response metadata exceeds its size limit".to_owned());
    }
    let signature = String::from_utf8(signature_bytes)
        .map_err(|_| "update response signature is not valid UTF-8".to_owned())?;
    let release = verify_signed_release(&manifest_bytes, &signature)?;
    if envelope.version != release.manifest.version.to_string() {
        return Err("update response version does not match its signed manifest".to_owned());
    }
    Ok(release)
}

fn parse_asset(arch: &str, name: &str, sha256: &str, size: &str) -> Result<ReleaseAsset, String> {
    let expected_name = format!("ok200-crostini-{arch}-unknown-linux-musl");
    if name != expected_name {
        return Err(format!("release {arch} asset name is unsupported"));
    }
    if sha256.len() != 64 || !is_lower_hex(sha256) {
        return Err(format!("release {arch} SHA-256 is invalid"));
    }
    let size = size
        .parse::<u64>()
        .map_err(|_| format!("release {arch} size is invalid"))?;
    if size == 0 || size > MAX_RELEASE_ASSET_BYTES {
        return Err(format!("release {arch} size is outside the allowed range"));
    }
    Ok(ReleaseAsset {
        arch: arch.to_owned(),
        name: name.to_owned(),
        sha256: sha256.to_owned(),
        size,
    })
}

fn parse_protocol(value: &str, name: &str) -> Result<u16, String> {
    value
        .parse::<u16>()
        .map_err(|_| format!("release manifest {name} is invalid"))
}

fn is_lower_hex(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn verify_asset_file(path: &Path, asset: &ReleaseAsset) -> Result<(), String> {
    let metadata = std::fs::metadata(path).map_err(|error| {
        format!(
            "could not inspect release asset {}: {error}",
            path.display()
        )
    })?;
    if !metadata.is_file() || metadata.len() != asset.size {
        return Err(format!(
            "release asset {} has size {}, expected {}",
            path.display(),
            metadata.len(),
            asset.size
        ));
    }
    let mut file = File::open(path)
        .map_err(|error| format!("could not open release asset {}: {error}", path.display()))?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("could not hash release asset: {error}"))?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    let actual = format!("{:x}", digest.finalize());
    if actual != asset.sha256 {
        return Err(format!(
            "release asset {} failed SHA-256 verification",
            path.display()
        ));
    }
    Ok(())
}

fn verify_binary_version(path: &Path, expected: &Version) -> Result<(), String> {
    let output = Command::new(path)
        .arg("--version")
        .output()
        .map_err(|error| format!("could not run downloaded binary self-test: {error}"))?;
    if !output.status.success() {
        return Err("downloaded binary version self-test failed".to_owned());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim() != format!("ok200-crostini {expected}") {
        return Err("downloaded binary version does not match its manifest".to_owned());
    }
    Ok(())
}

#[cfg(unix)]
fn set_private_directory(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("could not secure update staging directory: {error}"))
}

#[cfg(not(unix))]
fn set_private_directory(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("could not make downloaded update executable: {error}"))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(asset: &[u8]) -> Vec<u8> {
        let sha = format!("{:x}", Sha256::digest(asset));
        format!(
            "{MANIFEST_HEADER}\n\
             version=0.1.0\n\
             tag=crostini-v0.1.0\n\
             repository={RELEASE_REPOSITORY}\n\
             source_commit=0123456789abcdef0123456789abcdef01234567\n\
             controller_protocol=2\n\
             extension_protocol_min=2\n\
             extension_protocol_max=2\n\
             runtime={RELEASE_RUNTIME}\n\
             x86_64_asset=ok200-crostini-x86_64-unknown-linux-musl\n\
             x86_64_sha256={sha}\n\
             x86_64_size={}\n\
             aarch64_asset=ok200-crostini-aarch64-unknown-linux-musl\n\
             aarch64_sha256={sha}\n\
             aarch64_size={}\n\
             manifest_asset={RELEASE_MANIFEST_NAME}\n\
             signature_asset={RELEASE_SIGNATURE_NAME}\n",
            asset.len(),
            asset.len()
        )
        .into_bytes()
    }

    #[test]
    fn parses_canonical_release_manifest_and_selects_assets() {
        let parsed = parse_release_manifest(&manifest(b"trusted asset")).unwrap();
        assert_eq!(parsed.version, Version::new(0, 1, 0));
        assert_eq!(
            parsed.asset_for_arch("aarch64").unwrap().name,
            "ok200-crostini-aarch64-unknown-linux-musl"
        );
        assert!(parsed.asset_for_arch("mips").is_err());
    }

    #[test]
    fn rejects_manifest_reordering_unknown_fields_and_incompatibility() {
        let canonical = String::from_utf8(manifest(b"asset")).unwrap();
        assert!(
            parse_release_manifest(canonical.replace("tag=crostini-v0.1.0\n", "").as_bytes())
                .is_err()
        );
        assert!(parse_release_manifest(
            canonical
                .replace("runtime=linux-musl-static", "runtime=linux-gnu")
                .as_bytes()
        )
        .is_err());
        assert!(parse_release_manifest(
            canonical
                .replace("extension_protocol_max=2", "extension_protocol_max=1")
                .as_bytes()
        )
        .is_err());
    }

    #[test]
    fn frozen_release_manifest_contract_covers_versions_architectures_and_protocols() {
        let corpus: serde_json::Value =
            serde_json::from_str(include_str!("../../../tests/compatibility/corpus-v1.json"))
                .expect("compatibility corpus");
        let cases = corpus["crostiniRelease"]["cases"]
            .as_array()
            .expect("Crostini release fixtures");

        for fixture in cases {
            let kind = fixture["kind"].as_str().expect("fixture kind");
            if kind == "install-version" {
                continue;
            }

            let mut text = String::from_utf8(manifest(b"fixture asset")).unwrap();
            if let Some(replacements) = fixture["replace"].as_array() {
                for replacement in replacements {
                    let pair = replacement.as_array().expect("replacement pair");
                    text = text.replace(
                        pair[0].as_str().expect("replacement source"),
                        pair[1].as_str().expect("replacement target"),
                    );
                }
            }
            if let Some(addition) = fixture["append"].as_str() {
                text.push_str(addition);
            }

            let result = parse_release_manifest(text.as_bytes()).and_then(|release| {
                if kind == "architecture" {
                    release
                        .asset_for_arch(fixture["architecture"].as_str().expect("architecture"))
                        .map(|_| ())
                } else {
                    Ok(())
                }
            });
            if fixture["accept"] == true {
                assert!(result.is_ok(), "{} failed: {result:?}", fixture["id"]);
            } else {
                let error = result.expect_err("fixture must be rejected");
                assert!(
                    error.contains(fixture["errorContains"].as_str().expect("expected error")),
                    "{} unexpected error: {error}",
                    fixture["id"]
                );
            }
        }
    }

    #[test]
    fn verifies_release_asset_size_and_hash() {
        let temp = tempfile::tempdir().unwrap();
        let asset_path = temp.path().join("asset");
        std::fs::write(&asset_path, b"trusted asset").unwrap();
        let release = parse_release_manifest(&manifest(b"trusted asset")).unwrap();
        verify_asset_file(&asset_path, &release.x86_64).unwrap();
        std::fs::write(&asset_path, b"tampered asset").unwrap();
        assert!(verify_asset_file(&asset_path, &release.x86_64).is_err());
    }

    #[test]
    fn verifies_known_minisign_signature_and_rejects_tampering() {
        // Public test vector from minisign-verify's documentation.
        let public_key = "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
        let signature = "untrusted comment: signature from minisign secret key\n\
RUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\n\
trusted comment: timestamp:1633700835\tfile:test\tprehashed\n\
wLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ==\n";
        let key = PublicKey::from_base64(public_key).unwrap();
        let decoded = Signature::decode(signature).unwrap();
        key.verify(b"test", &decoded, false).unwrap();
        assert!(key.verify(b"tampered", &decoded, false).is_err());
    }

    #[test]
    fn production_public_key_is_parseable() {
        PublicKey::from_base64(PRODUCTION_MINISIGN_PUBLIC_KEY).unwrap();
    }
}
