# Desktop Release Readiness

> A release is “signed” only when every advertised platform artifact and the
> updater metadata have been produced, inspected, and accepted. Configured
> secrets or a green compile job are not sufficient evidence.

Topic: desktop-release-readiness

Status: **signing is configured, but the latest public desktop release is
partial and does not pass the release gate below.**

Last reconciled: **2026-07-28**.

Implementation sequencing lives in
[Tactical 000](../tactical/000-desktop-native-core-and-release-readiness.md).

## Source of truth

The operator runbook is:

```text
~/code/dotfiles/runbooks/desktop-code-signing.md
```

It covers JSTorrent, 200 OK, and Yep Anywhere. It records secret names, source
material, identities, regeneration procedures, and verification commands; it
does not store secret values. JSTorrent and Yep Anywhere are useful workflow
references, but this repository must keep its own release gate current.

The runbook currently misstates 200 OK's tag pattern on line 30. This repository
uses `desktop-v*`, as declared by
`.github/workflows/tauri-app-ci.yml` and the release script.

## Configured credentials and identity

As of 2026-07-28, the GitHub repository has all expected secret **names**:

- macOS certificate/keychain:
  `MACOS_CERTIFICATE_P12_BASE64`,
  `MACOS_CERTIFICATE_PASSWORD`, `MACOS_KEYCHAIN_PASSWORD`;
- App Store Connect notarization:
  `ASC_API_KEY_P8_BASE64`, `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`;
- Windows Azure Trusted Signing:
  `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`; and
- Tauri updater:
  `TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Secret presence does not prove that a credential is current or that the output
was signed. Values remain intentionally opaque.

Repository configuration currently preserves:

- Tauri identifier `app.ok200.desktop`;
- Apple Developer ID application signing identity;
- Azure account/certificate profile `kylegraehl` /
  `jstorrent-profile`;
- updater endpoint `https://updates.ok200.app/tauri/...`; and
- a Tauri updater public key that matches the local 200 OK key material named
  by the runbook.

The Rust-core migration must keep the identifier, updater key, and endpoint so
installed desktop apps can update in place.

## Latest release evidence

Public desktop release: **`desktop-v0.1.3`**, created 2026-02-27.

- [Public release](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.3)
- [Tagged release workflow run](https://github.com/kzahel/web-server-chrome/actions/runs/22505197089)
- [Successful untagged post-Windows-profile-fix run](https://github.com/kzahel/web-server-chrome/actions/runs/22517103949)

| Platform/artifact | Evidence | Current conclusion |
|---|---|---|
| macOS app bundles, arm64 and x64 | Extracted app is Developer ID signed with hardened runtime and timestamp; `codesign`, `spctl`, and stapler validation passed; bundled sidecar validates | App payload is signed and notarized |
| macOS DMG, arm64 and x64 | DMG is signed, but the downloaded container has no stapled ticket and fails the strict container acceptance check | Do not call the DMG artifact fully verified |
| macOS PKG | No package is present; workflow searches below `desktop/tauri-app/src-tauri/target/`, while the Cargo workspace emits under `desktop/target/` | Workflow path bug blocks the advertised PKG |
| Windows EXE/MSI | No Windows artifact exists in `v0.1.3`; that tagged run used the wrong Azure certificate profile | Latest public release has no Windows installer |
| Windows post-fix CI | Commit `3b02f9c` changed the profile to `jstorrent-profile`; a later untagged CI build completed the Windows signing/build path | Encouraging build evidence, not a released signature inspection |
| Linux AppImage/DEB/RPM | Artifacts are present | Build availability proven; Linux has no equivalent platform signing claim |
| Tauri updater metadata | `latest.json` and per-artifact updater signatures exist, but the platform list follows the partial release and omits Windows | Updater metadata is signed but incomplete |

The release body also generates download URLs using filenames such as
`200+OK_...` and `200-ok_...`, while the uploaded Tauri artifacts use
`200.OK_...`. Advertised links can therefore 404 even when an artifact exists.

## Known CI and publication defects

1. Tauri Action creates a non-draft GitHub release from each matrix leg before
   overall completeness is known.
2. `finalize-release` requires the entire matrix. If one leg fails, finalization
   is skipped and a partial public release remains visible.
3. Finalization removes `.sig` assets and writes a table, but does not validate
   `latest.json` version, platform coverage, URLs, or embedded signatures.
4. The macOS PKG lookup uses the wrong Cargo target root.
5. The generated download table does not derive names from actual release
   assets.
6. The strict DMG notarization/stapling gate does not pass.
7. No released Windows EXE/MSI has been inspected with
   `Get-AuthenticodeSignature`.
8. The workflow's generic “flaky DMG” failure annotation can mask unrelated
   macOS failures; the underlying step log must remain authoritative.

## Required release gate

A desktop tag may be made public only after all of these pass.

### Build and completeness

- All four matrix legs succeed: macOS arm64, macOS x64, Windows x64, Linux x64.
- Expected installer and updater artifacts are present exactly once.
- Release-table links are generated from or checked against actual asset names.
- `latest.json` version equals the tag and includes every supported updater
  target.
- Every updater URL returns the expected artifact and every signature field is
  non-empty.
- A failed matrix leg leaves a draft release or deletes/withdraws the incomplete
  release; it must not look production-ready.

### macOS

- `codesign --verify --deep --strict --verbose=2` passes on the app.
- `spctl` accepts the app as Notarized Developer ID.
- The native messaging sidecar and nested executables validate.
- The preferred public installer, PKG or DMG, passes its matching signature and
  notarization/stapling checks.
- If DMG stapling remains unreliable, publish PKG as the recommended installer
  and stop advertising the DMG as equivalent until its gate passes.

### Windows

- `Get-AuthenticodeSignature` reports `Valid` for the released EXE and MSI.
- Publisher identity is the expected Kyle Graehl certificate.
- A clean Windows VM installs, launches, serves a file, and uninstalls.

### Updater

- An installed previous public build discovers the candidate.
- Tauri verifies the updater signature and installs it.
- Application identity, settings, native messaging registration, and server
  workflow survive the update.
- A malformed or incorrectly signed test manifest is rejected.

### Product smoke

- The app selects a root, starts and stops a server, and serves an external
  request on each OS.
- Extension-to-native-host launch works on macOS, Windows, and Linux.
- The release is tested once from a clean install and once as an update.

## Recommended pipeline shape

1. Build and sign matrix artifacts without publishing a production release.
2. Upload them to an Actions artifact or draft release.
3. Run a single completeness/metadata validation job with `if: always()`.
4. Keep or mark the draft failed if any required leg or validation fails.
5. Publish and update the release body only after the gate passes.
6. Promote update-server metadata only after the public artifact set is
   immutable and verified.

The signing setup should be repaired before the desktop engine rewrite. A
small signed release candidate using the current runtime proves distribution
independently; a later Rust-core candidate then changes one risk axis at a
time.
