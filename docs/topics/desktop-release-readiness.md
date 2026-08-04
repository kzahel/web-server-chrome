# Desktop Release Readiness

> A release is “signed” only when every advertised platform artifact and the
> updater metadata have been produced, inspected, and accepted. Configured
> secrets or a green compile job are not sufficient evidence.

Topic: desktop-release-readiness

Status: **`desktop-v0.1.6` is the current complete signed Rust-core release.
Its five-platform build matrix, platform-signing checks, and one-job finalizer
passed, and all public assets, checksums, and updater metadata were
independently verified. The maintainer directed that packaged functional smoke
be skipped for this release, so `desktop-v0.1.5` remains the latest exact
clean-install, prior-public update, server, native-messaging, and
production-extension acceptance evidence on the recommended macOS app,
Windows NSIS, and Linux AppImage paths.**

Last reconciled: **2026-08-04**.

Implementation sequencing lives in
[Tactical 000](../tactical/000-desktop-native-core-and-release-readiness.md);
the release-pipeline implementation and tagged proof are recorded in
[Tactical 001](../tactical/001-fail-closed-desktop-releases.md), and published
Linux product evidence is recorded in
[Tactical 007](../tactical/007-linux-desktop-validation.md).
The AppImage-first Linux package decision and source repair are recorded in
[Tactical 008](../tactical/008-appimage-first-linux-distribution.md). The final
agent-owned and maintainer/device confidence gates are recorded in
[Tactical 009](../tactical/009-release-confidence-closeout.md).

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

Private deployment and aggregate-statistics context lives in:

- `~/code/dotfiles/machines/pi/README.md` for the Remy service and product
  configuration wiring;
- `~/code/dotfiles/runbooks/update-server-analytics.md` for the shared update
  analytics workflow; and
- `~/code/dotfiles/control-room/README.md` plus
  `~/code/dotfiles/control-room/config/projects.yaml` for sanitized 200 OK
  aggregates and endpoint health.

These are operational pointers, not release evidence by themselves. Raw
events, IPs, CFU IDs, and credentials must not be copied into this repository.

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

The desktop control surface performs signed update discovery and
download/install/relaunch through the Tauri plugins. On 2026-07-31 the
maintainer accepted JSTorrent's shipped cadence and interaction decisions as
the 200 OK policy: a quiet `startup` check five seconds after every app launch,
a quiet `periodic` check every 24 hours while open, always-visible manual
results, and explicit **Install & Restart** / **Later** actions. The native host
retains its independent once-per-24-hours `host` check. Implementation and
local proof began in [Tactical 005](../tactical/005-in-app-desktop-updater.md);
the policy reconciliation and final validation are owned by Tactical 009.

The shipped release implements the accepted cadence and prevents
in-app update from crossing installer/package ownership boundaries. Tauri app,
NSIS, and AppImage bundles may offer signed in-app install. MSI, DEB, RPM, and
unknown bundle types receive an explicit manual-download path; the headless
updater also refuses those package types. Schedule, UI state, bundle policy,
Tauri configuration, release-validator, and native-host cadence tests passed
locally and in the green workflows recorded in Tactical 009. Exact signed
transitions passed on all recommended paths. A packaged runtime downloaded a
deliberately tampered payload bearing a syntactically valid release signature,
rejected it with `The signature verification failed`, and left its executable
hash unchanged.

## Latest release evidence

Public desktop release: **`desktop-v0.1.6`**, published 2026-08-04 from commit
`6dcfbd39fd5202b13f9446bfdfe41c7e3bcdc698`.

- [Public release](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.6)
- [Successful tagged workflow run](https://github.com/kzahel/web-server-chrome/actions/runs/30876353182)
- [Successful general CI run](https://github.com/kzahel/web-server-chrome/actions/runs/30876352014)
- [Published SHA-256 checksums](https://github.com/kzahel/web-server-chrome/releases/download/desktop-v0.1.6/SHA256SUMS)

The desktop test job and macOS arm64, macOS x64, Windows x64, Linux x64, and
Linux ARM64 build jobs passed. The Windows job verified Authenticode
signatures; both macOS jobs verified app signing/notarization and produced
notarized PKGs. The fail-closed finalizer validated the complete draft before
publishing exactly 16 retained files at `2026-08-04T04:23:29Z`.

Every one of the 15 files named by the published `SHA256SUMS` was downloaded
after publication and passed `shasum -a 256 -c`. The manifest itself has
SHA-256 `d2799a853bcd10eb98c7652f4b50fccb335ea53551a04f728541cf098b28ba33`.
`latest.json` reports version `0.1.6`, contains non-empty signatures, and
covers all 15 supported default and package-specific updater targets. Manual
installed-app smoke was not performed at the maintainer's direction; the
detailed `v0.1.5` evidence below remains the functional acceptance baseline.

## Previous functional acceptance: `v0.1.5`

Public desktop release: **`desktop-v0.1.5`**, published 2026-07-31 from commit
`6502cdccfbb2980e250b46fb12fc064a8ea60157`.

- [Public release](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.5)
- [Successful tagged workflow run](https://github.com/kzahel/web-server-chrome/actions/runs/30648571816)
- [Successful general CI run](https://github.com/kzahel/web-server-chrome/actions/runs/30648572832)
- [Published SHA-256 checksums](https://github.com/kzahel/web-server-chrome/releases/download/desktop-v0.1.5/SHA256SUMS)

All tests and macOS arm64, macOS x64, Windows x64, Linux x64, and Linux ARM64
jobs passed. The first tagged attempt exposed a shared `latest.json` upload
race between parallel Tauri Action legs; its private failed draft and tag were
removed without becoming public. Commit `6502cdc` serialized those metadata
uploads. The corrected tag stayed private while the matrix staged its assets,
then the finalizer published exactly 16 retained files at
`2026-07-31T17:15:01Z`.

| Platform/artifact | Exact `v0.1.5` evidence | Conclusion |
|---|---|---|
| macOS app/PKG, arm64 and x64 | Public PKGs pass Installer signature, Gatekeeper, and stapler validation. Public app payloads pass deep/strict code signing, Gatekeeper Notarized Developer ID, and stapler checks. Exact `0.1.4` app updated to `0.1.5`, matched the independent public binary hash, served/stopped, retained settings, and passed Dock plus extension single-instance launch | Recommended signed app path accepted; an attended `/Applications` PKG click/install remains an authorization/UX spot-check |
| macOS DMG, arm64 and x64 | Public containers pass code-sign verification but strict container Gatekeeper reports no notarization | Signed alternative only; PKG remains recommended |
| Windows NSIS EXE and MSI | Both exact downloads report Authenticode `Valid` for Kyle Graehl. Exact `0.1.4` NSIS updated to signed `0.1.5`; clean NSIS install/serve/stop and session-1 uninstall passed; production extension launch twice retained one process. MSI metadata is product `200 OK`, version `0.1.5`, `ALLUSERS=1` | Recommended current-user NSIS accepted; elevated MSI UI remains secondary |
| Linux AppImage x64 | Exact `0.1.4` AppImage updated in place to the independently verified `0.1.5` hash; WebDriver serve/stop, stable path/desktop/native-host retention, extension launch/focus, and checksum-verifying `install.sh` all passed | Recommended x86_64 path accepted |
| Linux DEB/RPM x64 | DEB metadata/install, package-aware manual-update refusal, and production-extension launch passed; RPM metadata/payload inspection reports `200-ok` `0.1.5-1` x86_64 and the expected desktop/host files | Secondary package contract accepted; native RPM-family install remains a claim gap |
| Linux ARM64 packages | Finalizer, checksums, and updater target/URL/signature coverage pass for AppImage, DEB, and RPM | Build/distribution accepted; no physical ARM64 GUI product claim |
| Tauri updater metadata | `latest.json` is version `0.1.5`, has non-empty signatures for every supported package variant, uses app/NSIS/AppImage defaults, and every one of its ten distinct URLs returns an asset from the exact release | Signed metadata and package selection accepted |

Every one of the 15 files named by `SHA256SUMS` was downloaded after
publication and verified; the manifest itself has SHA-256
`1535de2dee80550eb1fa88b1aeb3ba8716bb3667feeb3be94e21324198c7138e`.
GitHub's latest-release API and the live download page resolve to
`desktop-v0.1.5`. After a short post-publication cache warmup, the deployed
updater endpoint returned signed `0.1.5` app, NSIS, and AppImage metadata for
Darwin arm64/x64, Windows x64, and Linux arm64/x64 prior clients. Current
`0.1.5`, future `9.0.0`, and unsupported targets returned HTTP `204`.

This closes the agent-owned desktop release gate. Remaining work is explicitly
outside the recommended unattended path: an attended macOS PKG installation,
subjective tray/autostart review, elevated MSI flow, native RPM installation,
and physical ARM64 product smoke. Store-delivered ChromeOS/Android/extension
and legacy migration decisions remain separate promotion gates in Tactical 009.

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
control path and the existing macOS updater key. This was the historical
control-flow proof before `v0.1.4`; the current exact prior-public acceptance
is the later `0.1.4` → `0.1.5` transition on macOS, Windows, and Linux recorded
above and in Tactical 009.

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

- All five matrix legs succeed: macOS arm64, macOS x64, Windows x64, Linux x64,
  Linux arm64.
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
- Automatic checks never download, install, or restart without an explicit
  user action, and their cross-component cadence is documented and tested.
- Windows MSI and Linux DEB/RPM installations cannot be replaced through an
  updater artifact belonging to NSIS or AppImage; they use an explicit
  managed/manual path unless a bundle-preserving updater is implemented.

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

The `desktop-v0.1.4` run first proved this pipeline shape for the Rust-core
runtime. The corrected `desktop-v0.1.5` run repeated it with Linux ARM64 and
then passed the clean/update product gates on every recommended path.

## Linux post-publication evidence

Native Linux validation is recorded in
[Tactical 007](../tactical/007-linux-desktop-validation.md). On Ubuntu 24.04
x86_64, the exact downloaded DEB installed through `apt`, opened the native GTK
folder chooser, started from the visible control, served an external request
and Rust directory listing, stopped with old-port teardown, persisted its
configuration, remained resident after a normal background close, and
was removed through `apt`; test-created per-user state was backed up
separately. Its installed helper registered with Chromium browsers, passed
framing, and passed a real published-extension popup → native host →
single-instance launch flow.

The exact AppImage launched through FUSE and passed the same visible
start/serve/stop server smoke. Its `--check-update` path correctly reported
current `0.1.4`. The RPM independently matched the public checksum and its
metadata, payload, and dependencies were inspected; it was not installed on
the Debian-family host.

The `v0.1.4` evidence exposed one package-specific correctness defect: the
AppImage copied its
helper to `~/.local/lib/ok200/ok200-host`, but that stable helper no longer
knows the AppImage path and falls back to `gtk-launch 200-ok`. No such desktop
ID exists, so AppImage-only extension launch returns
`{"action":"launch","ok":false}`. Public `v0.1.5` closes that defect: direct
and installer-managed AppImages retain the stable path and desktop identity,
and the production extension launches/focuses exactly one AppImage process.

## Accepted Linux package policy

AppImage is the recommended Linux package. The supported installer is
per-user, checksum-verifies the public release asset, installs no system
files, and does not request administrator privileges. Future release bodies
and `ok200.app/download` present AppImage first.

DEB and RPM remain required release assets but are secondary system packages.
They require administrator privileges to install and are documented as manual
update paths until a bundle-aware package updater is deliberately accepted.
The release validator now also requires each Linux Tauri updater target,
`linux-x86_64` and `linux-aarch64`, to be that architecture's AppImage.

Linux ARM64 packages are built natively on GitHub's `ubuntu-22.04-arm` runners
and are required release assets: `200.OK_{version}_aarch64.AppImage`,
`200.OK_{version}_arm64.deb`, and `200.OK-{version}-1.aarch64.rpm`. Artifact
production and validation are gated in CI, but **no ARM64 product smoke has
been run**. Do not claim ARM64 as an accepted platform until an ARM64 host
installs the published AppImage, serves an external request, and completes an
extension-to-native-host launch.

The shipped `v0.1.5` repair records the real AppImage path, installs a stable
`200-ok.desktop` identity and icon, and teaches the copied native host to launch
the recorded file. Both the direct-download and checksum-verified installer
paths passed update, server, and extension-launch smoke.

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

The `desktop-v0.1.5` exact downloaded EXE and MSI pass independent
Authenticode inspection. Its recommended NSIS also passes prior-public signed
update, clean install, serve/stop, native host plus production-extension
single-instance launch, and complete session-1 silent uninstall. The local
Tauri bundle still uses product-name-derived whitespace filenames; canonical
release names remain the external contract.
