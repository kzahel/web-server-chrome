# Desktop Release Readiness

> A release is “signed” only when every advertised platform artifact and the
> updater metadata have been produced, inspected, and accepted. Configured
> secrets or a green compile job are not sufficient evidence.

Topic: desktop-release-readiness

Status: **`desktop-v0.1.4` is a complete signed Rust-core release and proves
the fail-closed artifact/publication gate. Clean-system acceptance of the exact
published Windows installers and the `0.1.3` → `0.1.4` updater transition
remain pending before broad migration promotion.**

Last reconciled: **2026-07-28**.

Implementation sequencing lives in
[Tactical 000](../tactical/000-desktop-native-core-and-release-readiness.md);
the release-pipeline implementation and tagged proof are recorded in
[Tactical 001](../tactical/001-fail-closed-desktop-releases.md).

## Source of truth

The operator runbook is:

```text
~/code/dotfiles/runbooks/desktop-code-signing.md
```

It covers JSTorrent, 200 OK, and Yep Anywhere. It records secret names, source
material, identities, regeneration procedures, and verification commands; it
does not store secret values. JSTorrent and Yep Anywhere are useful workflow
references, but this repository must keep its own release gate current.

The runbook's stale 200 OK tag pattern and unsigned-release wording were
corrected on 2026-07-28. This repository uses `desktop-v*`, as declared by
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
was signed. Values remain intentionally opaque. The current values have now
also been exercised by the successful CI signing audit below.

Repository configuration currently preserves:

- Tauri identifier `app.ok200.desktop`;
- Apple Developer ID application signing identity;
- Azure account/certificate profile `kylegraehl` /
  `jstorrent-profile`;
- updater endpoint `https://updates.ok200.app/tauri/...`; and
- a Tauri updater public key that matches the local 200 OK key material named
  by the runbook.

The shipped Rust-core release keeps the identifier, updater key, and endpoint
so installed desktop apps can update in place.

The desktop control surface now performs manual checks with
`X-Check-Reason: manual`, successful launch checks at most once per 24 hours
with `X-Check-Reason: app-launch`, and signed download/install/relaunch through
the Tauri plugins. Implementation and local proof are recorded in
[Tactical 005](../tactical/005-in-app-desktop-updater.md).

## Latest release evidence

Public desktop release: **`desktop-v0.1.4`**, published 2026-07-28 from commit
`2b7f416`.

- [Public release](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.4)
- [Successful tagged workflow run](https://github.com/kzahel/web-server-chrome/actions/runs/30381126333)
- [Published SHA-256 checksums](https://github.com/kzahel/web-server-chrome/releases/download/desktop-v0.1.4/SHA256SUMS)

All test and macOS arm64, macOS x64, Windows x64, and Linux x64 jobs passed.
The release stayed private while the matrix staged 19 assets. The finalizer
validated the exact installer set, GitHub digests, updater version/platform
coverage, signatures, and URLs; generated checksums and exact download links;
removed detached signatures only after metadata validation; and then published
13 retained assets from one job.

| Platform/artifact | Evidence | Historical conclusion |
|---|---|---|
| macOS app bundles, arm64 and x64 | CI `codesign`, `spctl`, and stapler checks passed for both apps | App payloads are Developer ID signed and notarized |
| macOS PKG, arm64 and x64 | CI and an independent post-publication download passed `pkgutil --check-signature`, `spctl --type install`, and stapler validation | PKG is the accepted recommended macOS installer |
| macOS DMG, arm64 and x64 | Downloaded containers pass `codesign --verify` | Signed alternative; PKG remains recommended because the DMG container is not held to the same stapled-ticket claim |
| Windows NSIS EXE and MSI | CI reported Authenticode `Valid`, publisher `CN=Kyle Graehl`, for both build outputs; canonical uploaded names and published digests/checksums passed the finalizer | Signed Windows artifacts are published; independent Windows inspection of the exact downloads remains |
| Linux AppImage/DEB/RPM | All three canonical assets are published and their downloaded hashes match `SHA256SUMS` | Build availability and updater coverage proven; native Linux product smoke remains |
| Tauri updater metadata | `latest.json` is version `0.1.4`, covers macOS arm64/x64, Windows x64, and Linux x64 with non-empty signatures and on-release URLs; Windows defaults to NSIS | Complete signed updater metadata published |

Every retained release asset was downloaded after publication and matched
`SHA256SUMS`. GitHub's latest-release API resolves to `desktop-v0.1.4`.
The deployed updater endpoint returns `0.1.4` with a signature and the expected
platform artifact to clients reporting `0.1.3`, including the NSIS EXE on
Windows, and returns HTTP `204` to clients already reporting `0.1.4`.

This proves artifact completeness, signing/notarization in CI, checksum
integrity after download, publication ordering, and deployed metadata routing.
It does not replace clean-system product acceptance. Still required:

- run `Get-AuthenticodeSignature` against the exact downloaded EXE and MSI on
  Windows, then clean-install/serve/uninstall the recommended NSIS build;
- perform an actual installed `0.1.3` → `0.1.4` signed update and verify
  settings, identity, native messaging, and serving afterward; and
- complete native Linux install/serve/update smoke. Tray-only Windows checks
  and the secondary elevated MSI flow remain separate known gaps.

## Historical `v0.1.3` baseline

Previous public desktop release: **`desktop-v0.1.3`**, created 2026-02-27.

- [Public release](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.3)
- [Tagged release workflow run](https://github.com/kzahel/web-server-chrome/actions/runs/22505197089)
- [Successful untagged post-Windows-profile-fix run](https://github.com/kzahel/web-server-chrome/actions/runs/22517103949)

| Platform/artifact | Evidence | Current conclusion |
|---|---|---|
| macOS app bundles, arm64 and x64 | Extracted app is Developer ID signed with hardened runtime and timestamp; `codesign`, `spctl`, and stapler validation passed; bundled sidecar validates | App payload is signed and notarized |
| macOS DMG, arm64 and x64 | DMG is signed, but the downloaded container has no stapled ticket and fails the strict container acceptance check | Do not call the DMG artifact fully verified |
| macOS PKG | No package is present; workflow searches below `desktop/tauri-app/src-tauri/target/`, while the Cargo workspace emits under `desktop/target/` | Workflow path bug blocks the advertised PKG |
| Windows EXE/MSI | No Windows artifact exists in `v0.1.3`; that tagged run used the wrong Azure certificate profile | That release has no Windows installer; closed by `v0.1.4` |
| Windows post-fix CI | Commit `3b02f9c` changed the profile to `jstorrent-profile`; the 2026-07-28 untagged audit inspected the newly built EXE and MSI with `Get-AuthenticodeSignature` | Credentials and signed output were proven before the complete `v0.1.4` release |
| Linux AppImage/DEB/RPM | Artifacts are present | Build availability proven; Linux has no equivalent platform signing claim |
| Tauri updater metadata | `latest.json` and per-artifact updater signatures exist, but the platform list follows the partial release and omits Windows | Updater metadata is signed but incomplete |

The `v0.1.3` release body also generates download URLs using filenames such as
`200+OK_...` and `200-ok_...`, while the uploaded Tauri artifacts use
`200.OK_...`. Advertised links can therefore 404 even when an artifact exists.

## Local updater control-flow proof

On 2026-07-28, the production-asset macOS review build reached the deployed
Remy service with distinct `app-launch` and `manual` reasons. A repeated launch
inside the persisted 24-hour window produced no request, and a manual current
check rendered the expected in-app `0.1.3` current result.

A controlled build reporting `0.1.2` then discovered, downloaded, verified,
installed, and relaunched the signed public `0.1.3` macOS updater artifact
through the new “Update and restart” action. This proves the UI/plugin/server
control path and the existing macOS updater key. The signed Rust-core
`v0.1.4` candidate and deployed metadata now exist, but the actual installed
public `0.1.3` → `0.1.4` transition and its post-update behavior still need to
be exercised, as do Windows/Linux updater flows.

## `v0.1.3` CI and publication defects

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

The `v0.1.4` tagged run proves the workflow fixes defects 1–5 and 8: release
credentials were required, all assets staged privately, both PKGs were
required and notarized, the complete asset/updater set passed validation,
exact links and checksums were generated, and only one final job published.
The preferred PKG satisfies the macOS installer gate despite the narrower DMG
container claim. CI inspected both Windows signatures; independent inspection
of the exact downloaded Windows files remains part of clean-system acceptance.

## Current CI signing proof

Commit `2dcd4db` fixed the Rust `1.97` Clippy failure and made the signing lane
verify its own output. The resulting 2026-07-28 runs passed:

- [Tauri App CI run 30379994625](https://github.com/kzahel/web-server-chrome/actions/runs/30379994625)
  completed every test and Linux, macOS arm64, macOS x64, and Windows build
  job successfully; and
- [general CI run 30379994627](https://github.com/kzahel/web-server-chrome/actions/runs/30379994627)
  completed successfully.

The Tauri run is direct credential and output evidence:

- both macOS application builds were Developer ID signed, accepted by Apple
  notarization, stapled, accepted by `spctl`, and validated by `codesign`;
- each DMG passed `codesign` verification;
- the Windows NSIS EXE and MSI each reported Authenticode status `Valid` and
  publisher `CN=Kyle Graehl`; and
- updater artifact signing was enabled with the repository's 200 OK key.

The Apple identities and Azure Trusted Signing account/profile match the
known-good JSTorrent workflow. The updater key intentionally does not match
JSTorrent: it is a per-application trust root, and the configured public key
matches the local 200 OK key material named by the shared runbook. Yep Anywhere
was not used as authoritative signing evidence.

The audit also corrected two release-only configuration hazards:

- Tauri Action `v0` accepts `assetNamePattern`, not
  `releaseAssetNamePattern`; the old input was ignored with a workflow warning.
- `updaterJsonPreferNsis: true` now makes the Windows updater metadata select
  the recommended NSIS installer instead of MSI.

That untagged run did not exercise release-only behavior. The later
`desktop-v0.1.4` tagged run did: it proved the PKG/finalizer path, canonical
asset naming, and NSIS updater selection described above.

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

## Implemented pipeline shape

1. Build and sign matrix artifacts without publishing a production release.
2. Upload them to an Actions artifact or draft release.
3. Run a single completeness/metadata validation job with `if: always()`.
4. Keep or mark the draft failed if any required leg or validation fails.
5. Publish and update the release body only after the gate passes.
6. Promote update-server metadata only after the public artifact set is
   immutable and verified.

The `desktop-v0.1.4` run proves this pipeline shape for the Rust-core runtime.
Clean-system installation and update acceptance remain product gates rather
than artifact-publication uncertainties.

## Windows local post-fix evidence

Native Windows remediation and unsigned installed-product evidence are
recorded in
[Tactical 006](../tactical/006-windows-desktop-validation.md). On 2026-07-28,
source checks passed with Tauri CLI `2.11.4` / Rust `tauri` `2.11.5`, and both
unsigned `0.1.3` NSIS and MSI bundles built successfully.

The accepted package policy is:

- Tauri's standard **current-user NSIS EXE is the recommended Windows
  installer**. It installs under `%LOCALAPPDATA%` without requiring an
  administrator token.
- Tauri's standard **WiX MSI is a secondary system-wide installer**. It
  retains its normal elevation requirement for managed or administrator-led
  deployment.
- No custom installer UI or dual-scope chooser is required for the initial
  release.
- Windows-created query-user firewall rules remain owned by Windows. The
  non-elevated current-user uninstaller does not try to remove security-policy
  records; optional explicitly elevated cleanup can be evaluated separately.

The installed per-user NSIS application passed native folder selection,
external HTTP serving, both SPA and directory-listing routing modes, stop and
old-port teardown, settings persistence, background/single-instance lifecycle,
headless updater service flow, native-messaging registration/framing/launch,
and real unpacked-extension invocation. The development extension key was
corrected to the published extension identity and is now asserted during every
Vite build. Uninstall now gracefully requests application shutdown, terminates
only exact product process trees as a fallback, and removes installed binaries,
native-messaging state, saved server configuration, and WebView data even when
the desktop and helper began resident in the background.

The `desktop-v0.1.4` release proves the canonical uploaded Windows names,
complete asset gate, NSIS update metadata, and Azure signing lane. The local
Tauri bundle still uses product-name-derived whitespace filenames. The exact
downloaded EXE and MSI now need independent Windows-side signature inspection
and the recommended NSIS package needs clean-system install/serve/uninstall
acceptance.
