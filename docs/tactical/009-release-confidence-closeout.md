# 009: Release Confidence Closeout

Status: **desktop signing/publication lane complete; desktop functional repair
and maintainer/store migration lanes active.** Signed `desktop-v0.1.6` is
public and its automated release and public-asset gates pass. Later exact
packaged smoke passes core serving and integration but fails the hard
main-window settings/recovery rule: Windows/Linux settings layout is broken,
background=false close stays resident on every OS, and Windows no-tray
relaunch can wedge invisible processes. `v0.1.5` remains the accepted
prior-public update and production-extension baseline. Store-delivered
ChromeOS/Android/extension, the desktop repair release, and the final legacy
migration decision remain active.

The bounded desktop repair and exact post-production rerun are now owned by
[Tactical 015](015-desktop-production-validation.md) and the repository-owned
[desktop production validation runbook](../runbooks/desktop-production-validation.md).
This tactical retains the broader release/store/migration ledger and the
historical evidence; do not close the desktop functional row here from signing
evidence alone.

Topics:

- `desktop-native-core`
- `desktop-release-readiness`
- `legacy-app-migration`

Parent:

- [`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md)

Living state:

- [`../topics/desktop-runtime.md`](../topics/desktop-runtime.md)
- [`../topics/desktop-release-readiness.md`](../topics/desktop-release-readiness.md)
- [`../topics/legacy-app-migration.md`](../topics/legacy-app-migration.md)

Planning baseline: clean `main` at `3df02a4` on 2026-07-31.

## Objective

Produce the smallest credible body of evidence needed to finish the current
release campaign:

1. restore deterministic green source and release CI;
2. make updater behavior safe and explicit for every installer type;
3. prove the exact signed desktop follow-up on the recommended macOS,
   Windows, and Linux paths, including update and extension launch;
4. reconcile live update routing and sanitized statistics with the deployed
   service;
5. ship and verify the extension-to-Android ChromeOS route before using it as
   a migration destination; and
6. leave current public and private documentation sufficient for a fresh
   agent session to continue without rediscovering infrastructure.

This tactical separates work an agent can execute end to end from checks that
need the maintainer's store accounts, physical ChromeOS environment, or
subjective product approval.

## Scope controls

- `https://ok200.app/download` is live and accepted. It returned HTTP 200 on
  2026-07-31. Do not reopen general download-page design; only correct a
  broken or unsafe destination.
- Low current traffic does not require a separate beta program. One
  fail-closed signed follow-up may become the public candidate, then receive
  exact post-publication acceptance before broad migration promotion.
- The recommended paths are macOS PKG/app, Windows current-user NSIS, and
  Linux AppImage. These are release gates.
- Windows MSI and Linux DEB/RPM are secondary packages. They must be safe and
  honestly described, but attended secondary-package smoke does not delay the
  recommended-path release unless it reveals shared corruption or identity
  risk.
- ARM64 artifacts remain build-gated. Missing physical ARM64 product smoke
  restricts the acceptance claim; it does not block an x86_64 migration
  destination if the site and release notes say so clearly.
- Compatibility benchmarking, broader feature work, and issue-backlog cleanup
  stay outside this closeout unless they expose a release or security defect.

## Current evidence and gaps

| Surface | Accepted evidence | Remaining confidence gap |
|---|---|---|
| Desktop release pipeline | `desktop-v0.1.6` five-leg matrix, finalizer, 16-asset publication, and independent checksum/updater-metadata inspection pass | Artifact gate is complete; exact later packaged smoke failed functional acceptance and requires a repair tag |
| General CI | Deterministic DER repair and all source/release workflows passed at the release revision | None |
| Updater UI | JSTorrent cadence/UX is implemented and unit-tested; exact `0.1.4` → `0.1.5` transitions pass on every recommended path | Optional subjective presentation spot-check only |
| Updater safety | Package-aware policy, negative validators, live no-downgrade routes, and runtime tampered-payload signature rejection pass | None for recommended packages; managed secondary packages remain manual by design |
| Windows desktop | `v0.1.6` exact NSIS Authenticode, clean install, chooser, serve/stop, persistence, native registration, and uninstall pass; `v0.1.5` production extension launch remains accepted | `v0.1.6` settings modal is clipped; background=false plus no tray can wedge invisible processes; no real `v0.1.6` production-extension round trip |
| Linux desktop | `v0.1.6` exact ARM64 AppImage passes native ARM64 VM server, updater, autostart, tray, persistence, quit, and direct host launch; `v0.1.5` production extension paths remain accepted | Settings modal is visually clipped into the header; background=false remains resident; physical ARM64, native RPM-family, and real `v0.1.6` extension claims remain open |
| macOS desktop | `v0.1.6` exact arm64 app/PKG signing evidence and extracted app settings/server/updater/tray/native-host smoke pass; `v0.1.5` production extension launch remains accepted | background=false remains tray-resident; attended `/Applications` PKG install and real `v0.1.6` extension round trip remain open |
| Android / ChromeOS | Corrected native-Kotlin `v0.2.1` and launcher extension `v0.1.4` pass exact release inspection and were reportedly submitted to Play and the Chrome Web Store | Store review, rollout, and controlled store-delivered proof remain open; Tactical 011 owns the closeout |
| Live update service | Deployed config/hash, health, reason/CFU accounting, Control Room aggregates, and final `0.1.5` route/asset matrix agree | None; keep normal operational monitoring |
| Documentation | Repository topics and this tactical record the immutable `v0.1.6` signing success, later functional failures, and the retained `v0.1.5` update/extension baseline | Update with the desktop repair and store/legacy state as they change |

The certificate failure is a real low-probability encoder defect, not a Dock
regression. `derInteger` does not remove redundant leading zero bytes from the
random serial number. The same OpenSSL `ERR_OSSL_ASN1_ILLEGAL_PADDING` failure
reproduced locally on generation 162.

## Gate meanings

- **Release gate:** must pass before the next desktop tag is treated as an
  accepted public release.
- **Promotion gate:** may use the public candidate during testing, but must
  pass before the legacy app sends users broadly to that destination.
- **Claim gate:** does not block recommended-path release or promotion; it
  limits what the website, release notes, and migration copy may claim.

## Lane A — agent-owned end-to-end work

These tasks do not need subjective maintainer testing. Work that publishes a
tag or store artifact still requires explicit authorization for that external
state change, but does not require the maintainer to operate the test.

### A1 — restore deterministic source confidence

Gate: **release**.

- [x] Canonicalize DER INTEGER encoding for self-signed certificate serials.
- [x] Add a deterministic regression case for redundant leading zeros rather
      than relying on a probabilistic stress loop.
- [x] Exercise certificate parsing, SANs, validity, serial uniqueness, and
      private/public key matching under the CI Node version.
- [x] Run the complete TypeScript, Rust, extension, website, and relevant
      Android checks from a clean tree.
- [x] Require both general CI and Tauri App CI to be green at the candidate
      revision; do not rerun a random failure into apparent acceptance.

Exit evidence: commit, focused regression output, full validation commands,
and green workflow URLs.

### A2 — make the updater contract explicit and package-aware

Gate: **release**.

The maintainer accepted JSTorrent's shipped updater behavior as the product
policy reference on 2026-07-31. Mirror these decisions while retaining 200
OK's existing inline visual treatment:

- automatic checks discover availability only; they never download, install,
  or restart without an explicit user action;
- manual checks always run and always show current, available, or failure
  state;
- the app performs a silent `startup` check five seconds after every launch and
  a silent `periodic` check every 24 hours while it remains open;
- the native host retains its independent at-most-once-per-24-hours `host`
  check and records the attempt before network I/O, matching JSTorrent's
  existing host behavior;
- automatic current/offline results are quiet, while an available update is
  visible in the existing control surface; and
- an available update offers explicit **Install & Restart** and **Later**
  actions, with visible progress and a recoverable failure state.

Implementation/audit work:

- [x] Inventory every request producer and reason: `startup`, `periodic`,
      `manual`, headless `host`, and any installer or command-line path.
- [x] Make the accepted per-producer cadence, CFU ID use, quiet/visible result
      behavior, and concurrency guard explicit and unit-tested.
- [x] Record the exact information transmitted and retained. Keep private
      analytics aggregate-only outside Remy; do not copy raw IPs or CFU IDs
      into repository evidence.
- [x] Detect installed bundle/package type before offering installation.
- [x] Keep signed in-app installation enabled for macOS app updates, Windows
      current-user NSIS, and writable AppImages.
- [x] Ensure a system-wide Windows MSI cannot silently switch into a
      current-user NSIS install. Give MSI users an honest managed/manual path
      unless a real MSI-preserving updater is implemented.
- [x] Ensure DEB/RPM users are not offered installation of an AppImage over
      their package-managed app. Show a manual package/download path instead.
- [x] Verify direct and installer-managed AppImages remain writable and retain
      their stable path, desktop identity, native host, settings, and server
      behavior after update.
- [x] Verify the configured updater public key against the private-key source
      named by the signing runbook without exposing key material.
- [x] Add negative validator tests for malformed metadata, off-release URLs,
      wrong package selections, incomplete target coverage, and missing
      updater signatures.
- [x] Exercise the runtime verifier against an incorrectly signed candidate
      and record the rejection. Current/future versions and unsupported
      target/arch inputs already fail safe at the live route.

Exit evidence: an accepted updater behavior table by package type, automated
schedule/safety tests, and negative signature/metadata results.

### A3 — reconcile the live update service and statistics

Gate: **promotion**.

- [x] Compare the deployed Remy product configuration with
      [`../../update-server/web-server.json`](../../update-server/web-server.json)
      and record the resolved revision/hash without exposing service secrets.
- [x] Verify service/systemd health and the public HTTPS health endpoint.
- [x] Exercise a route matrix for Darwin/Windows/Linux, x86_64/ARM64, previous,
      current, and future versions. Previous supported versions must receive
      complete signed metadata; current/future versions must not downgrade;
      unsupported inputs must fail safely.
- [x] Verify every returned URL is an immutable asset from the expected GitHub
      release and matches the published checksum.
- [x] Generate clearly identified test checks for each request reason and
      confirm the live aggregate records the intended product, version,
      target, architecture, reason, and unique-install semantics.
- [x] Compare Control Room's sanitized 200 OK aggregate against a direct
      aggregate computed on Remy for the same time window. Record totals and
      version buckets only.
- [x] Update private operational docs so 200 OK does not depend on adapting a
      JSTorrent-only command by memory:
      - `~/code/dotfiles/runbooks/update-server-analytics.md`;
      - `~/code/dotfiles/machines/pi/README.md`;
      - `~/code/dotfiles/control-room/README.md`; and
      - `~/code/dotfiles/control-room/config/projects.yaml`.
- [x] Mark the Control Room desktop surface released and keep Chrome Web
      Store/Google Play data explicitly separate from updater active-install
      estimates.
- [x] Keep repository docs linked to the private paths above, never to secret
      values, raw events, or machine-specific credentials.

Current access preflight passed on 2026-07-31: `ssh pi` reached host `remy`,
the `web-server-chrome` log source existed, and the user service reported
active.

Exit evidence: timestamped route table, release/checksum identities,
aggregate comparison, and committed public/private documentation links.

### A4 — prove desktop install, update, and extension launch

Gate: **release** for recommended paths; **claim** for secondary packages and
ARM64 hardware.

For each recommended path, test the exact downloaded signed candidate, not a
same-source unsigned substitute:

| Platform | Required agent-operated proof |
|---|---|
| macOS | Verify signature/notarization/stapling; clean PKG install; select/start/external fetch/stop; background and single-instance lifecycle; Dock recreate/focus; extension popup → native host → one app; installed prior public version → candidate update with settings and serving retained |
| Windows | Download exact NSIS and inspect Authenticode; clean current-user install/serve/stop/uninstall on REX; published extension identity → registered host → one app; installed prior public NSIS → candidate update with settings and serving retained |
| Linux x86_64 | Verify checksum; test direct AppImage and `install.sh` in isolated homes; select/start/external fetch/stop; copied native host and published extension identity launch/focus one process; prior AppImage → candidate signed update with settings and serving retained |

Unattended host access accepted on 2026-07-31:

- Windows 11 uses `~/code/winvm-testbed`; begin every session with
  `~/code/winvm-testbed/bin/winvm doctor`. The full SSH, desktop relay, and UI
  preflight passed before this closeout run.
- Linux x86_64 uses `ssh laptop`; the checkout at
  `/home/kgraehl/code/web-server-chrome` was a clean `main` checkout during
  preflight.

Also:

- [x] Regression-check the already accepted exact DEB extension path after
      updater bundle-awareness changes.
- [x] Inspect MSI, DEB, and RPM metadata and their manual-update presentation.
- [ ] If a native RPM or ARM64 GUI host is available, run the corresponding
      product smoke; otherwise label those paths unaccepted rather than
      delaying the recommended x86_64 paths.
- [x] Record exact tag, workflow, filenames, sizes, SHA-256 values, host/OS,
      install source, extension identity, updater source version, and result.

### A5 — prove the Android and extension candidates without store claims

Gate: **promotion**.

- [x] Add unit coverage for the ChromeOS branch: native messaging is skipped,
      the action uses the `ok200://launch` Android intent, and absence falls
      back to the correct Play package.
- [x] Build and inspect the exact extension ZIP. Verify version, public
      extension identity, permissions, popup copy, intent, Play URL, and no
      private/stale destination.
- [x] Build and inspect the exact Android APK/AAB. Verify package, version,
      deep-link manifest, permissions, signing expectations, and changelog.
- [x] On an Android emulator or attached physical device, launch
      `ok200://launch`, verify a single app instance reaches the usable control
      surface, and run a bounded select/start/external fetch/stop smoke.
- [x] Exercise an Android package upgrade with `adb install -r` and verify
      persisted configuration and file access behavior. Record that this
      proves Android package compatibility, not Google Play delivery.
- [x] Keep the source/device result distinct from the physical ChromeOS and
      store-delivery gate in Lane B.

### A6 — produce and inspect the signed follow-up

Gate: **release**. External publication requires explicit maintainer
authorization.

- [x] Prepare the `0.1.5` desktop changelog from the accepted source revision.
- [x] Synchronize version fields in the release commit from a clean accepted
      revision; the release script intentionally performs this immediately
      before tagging.
- [x] Run the release script and push the single intended desktop tag.
- [x] Require all test, macOS, Windows, Linux x86_64, and Linux ARM64 matrix
      jobs plus the finalizer to pass.
- [x] Confirm the release remains non-public until completeness validation and
      that a failed leg cannot leave a production-looking partial release.
- [x] Download every retained asset, verify `SHA256SUMS`, inspect signatures,
      and verify `latest.json` version, targets, signatures, package choices,
      and URLs.
- [x] Run A3 and A4 against the public candidate before calling it accepted.
- [x] Update the owning topics and completed tacticals with immutable evidence.
- [x] Recheck the already-live download page's resolved links; no redesign is
      part of this step.

## Interim execution evidence — 2026-07-31 source candidate

- Commits `2360ab2`, `28a7a2c`, and `d955576` close the random DER failure,
  implement the accepted updater policy/package boundary, and harden the
  ChromeOS/store extension build respectively.
- Node `v22.23.2` parsed 256 generated certificates, confirmed both default
  SANs, found 256 unique serials, and verified each certificate/public key
  against its generated private key. The deterministic DER regression remains
  the permanent test.
- Root TypeScript typecheck, Biome, all production builds, 83 engine tests
  including real socket tests, nine CLI end-to-end tests, ten desktop updater
  tests, and five extension routing tests passed. Strict Rust Clippy and all
  46 desktop workspace tests passed. Android compile, JVM tests, lint, debug
  APK, and debug AAB builds passed.
- An ad-hoc packaged macOS app was recognized as an in-app-update-capable app
  bundle and both `--check-update` and `--auto-update` safely reported current
  `0.1.4` from the live service. This is package-policy/source evidence, not
  signed candidate acceptance.
- A side-by-side debug build on the attached Pixel 9 cold-launched from
  `ok200://launch`; a second launch was delivered to the existing activity.
  It served a pushed repository file through ADB port forwarding with an exact
  SHA-256 match. Reinstall with `adb install -r` retained the chosen root and
  port, then serving passed again. The temporary side-by-side app and test
  directory were removed, the Play-installed app was preserved, and the
  Android emulator was shut down.
- The Play-installed `0.1.2` app on that device does not resolve
  `ok200://launch`, confirming that source/device proof cannot replace the
  store-delivery gate.
- The Chrome Web Store-form candidate build contains the Android intent and
  exact Play package fallback, omits the development key/origin and source
  maps, and produced a 601,595-byte ZIP with SHA-256
  `a2faee82a76e9b3a596e930af05ceab25df758c15df5276cc1f26c8f6c91c081`.
  Its manifest version remains `0.1.3`, so this is pre-version-bump inspection
  rather than the final store artifact.
- The rebuilt normal Android debug APK is package `app.ok200.android`, version
  `0.1.2` / code `4`, declares `ok200://launch`, and has SHA-256
  `9b0c7c9e69a0acbf6aa893d8dae70f65067c5caf46840ef998c91529f9983828`.
  The corresponding debug AAB has SHA-256
  `b22d337e7af30617018320661f0b7ef87eb82f90a5f1b2fe2ee658970954a4df`.
  These are source/package compatibility evidence, not Play-signed artifacts.
- On Ubuntu x86_64, the source revision passed desktop/extension tests, Rust
  formatting, strict Clippy, and all Rust tests. An ad-hoc debug AppImage was
  recognized as an in-app-update-capable AppImage and safely reported current
  from the live server. The same build's extracted DEB binary refused
  `--auto-update` with the manual-package result, proving the real Tauri bundle
  marker reaches the package policy rather than relying only on a unit-test
  argument.
- On the Windows 11 VM, after the required `winvm doctor` preflight, the exact
  source revision passed desktop typecheck and ten updater tests, five
  extension-routing tests, and all eleven release-validator tests. The pushed
  CI revision then compiled the full Windows Tauri app and reported both
  Authenticode checks valid. No untagged artifact is retained, so this is
  pre-publication source/signing-lane evidence rather than exact install smoke.

### Pushed workflow evidence

All workflows passed at source revision `d955576` without rerunning the
certificate failure away:

- [General CI run 30645010184](https://github.com/kzahel/web-server-chrome/actions/runs/30645010184)
- [Extension CI run 30645010151](https://github.com/kzahel/web-server-chrome/actions/runs/30645010151)
- [Android CI run 30645010147](https://github.com/kzahel/web-server-chrome/actions/runs/30645010147)
- [Tauri App CI run 30645010145](https://github.com/kzahel/web-server-chrome/actions/runs/30645010145)

The Tauri run passed desktop tests and the Linux, Windows, macOS arm64, and
macOS x64 build legs. Its Windows leg exercised Azure signing and verified the
NSIS/MSI Authenticode outputs; both macOS legs exercised signing,
notarization, stapling, and app verification. As an untagged run it correctly
skipped release publication and finalization.

### Updater trust and live-service evidence

The configured updater public-key string exactly matches the public-key file
for `~/ok200-tauri.key` named by the private signing runbook after ignoring
line termination. Both normalized inputs have SHA-256
`32b7ecbb9fb798b9a0874218bc4c69f592aef4c5a8ce7e946d8996289e291006`;
no private key or public-key contents were printed or copied here.

The Remy user service was active and both its loopback host-routed health check
and `https://updates.ok200.app/health` returned `{"ok":true}`. The deployed
product symlink resolves to this repository's `update-server/web-server.json`;
both sides have SHA-256
`72c44889643613bb088afcc989fde527174b44f5a87677542cc3249345fd62a7`.
The service checkout revision was `5634050`; its only dirty state was the
expected untracked runtime `products.d/` directory.

The 2026-07-31 pre-release baseline route audit produced:

| Request | Result | Accepted interpretation |
|---|---:|---|
| Darwin arm64 `0.1.3` | 200 | Immutable `desktop-v0.1.4` app updater, signature present, checksum match |
| Darwin x64 `0.1.3` | 200 | Immutable `desktop-v0.1.4` app updater, signature present, checksum match |
| Windows x64 `0.1.3` | 200 | Immutable `desktop-v0.1.4` current-user NSIS updater, signature present, checksum match |
| Linux x64 `0.1.3` | 200 | Immutable `desktop-v0.1.4` AppImage updater, signature present, checksum match |
| Linux arm64 `0.1.3` | 204 | Expected public-baseline gap: `0.1.4` predates ARM64 artifacts; the follow-up must close it |
| Current Darwin `0.1.4` | 204 | No reinstall/downgrade |
| Future Windows `9.0.0` | 204 | No downgrade |
| Unsupported Windows arm64 / FreeBSD | 204 | Safe no-update result |
| Invalid version | 400 | Safe validation failure |

A clearly identified synthetic client sent `startup`, `periodic`, `manual`,
and `host` checks across Darwin, Windows, and Linux. A sanitized same-client
summary on Remy contained four events, four reasons, three targets, the
expected two architectures, product `web-server-chrome`, current version
`0.1.4`, and no available update. Raw identifiers and addresses remain only on
Remy.

The direct seven-day operational summary and a freshly collected Control Room
sample agreed exactly: 77 checks, approximately 25 identified clients, and
version buckets `0.1.2: 1`, `0.1.3: 36`, `0.1.4: 39`, `9.0.0: 1`. The
future-version row is the identified downgrade probe, not a real release.
Every 200 OK Control Room collector reported success, and the desktop surface
is now `released`. Private runbooks and the product-specific wrapper shipped
in dotfiles commit `ec99450`; the laptop service was rebuilt, restarted, and
health-checked at that revision. Store audience data remains explicitly out of
scope for these updater estimates.

## Desktop `v0.1.5` release execution — 2026-07-31

The maintainer explicitly authorized desktop publication. The release script
created version commit `53c76c6`, but the first tagged run
[30648013341](https://github.com/kzahel/web-server-chrome/actions/runs/30648013341)
exposed a race: parallel Tauri Action legs uploaded the shared `latest.json`
asset concurrently. The failed draft never became public. The exact failed
draft/tag were removed, commit `6502cdc` added `max-parallel: 1` for release
metadata uploads, and `desktop-v0.1.5` was recreated at
`6502cdccfbb2980e250b46fb12fc064a8ea60157`.

The corrected [tagged Tauri run
30648571816](https://github.com/kzahel/web-server-chrome/actions/runs/30648571816),
[general CI run
30648572832](https://github.com/kzahel/web-server-chrome/actions/runs/30648572832),
and [untagged Tauri audit
30648572171](https://github.com/kzahel/web-server-chrome/actions/runs/30648572171)
all passed. The finalizer published the [public
release](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.5)
at `2026-07-31T17:15:01Z` only after all test, macOS arm64/x64, Windows x64,
Linux x64, and Linux ARM64 legs completed.

### Immutable public artifact inventory

Every file named in the public `SHA256SUMS` was downloaded independently and
passed `shasum -a 256 -c`. The checksum manifest itself is 1,347 bytes with
SHA-256 `1535de2dee80550eb1fa88b1aeb3ba8716bb3667feeb3be94e21324198c7138e`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `200.OK-0.1.5-1.aarch64.rpm` | 9,444,175 | `67a5886413b52af03cacc5352a0f7f5e3bc89c932eccb487f753e499222e22cc` |
| `200.OK-0.1.5-1.x86_64.rpm` | 9,253,090 | `13f426c4905a3d2434e2809d855bacd4ae78e4022e04b80230c933684b736be9` |
| `200.OK_0.1.5_aarch64.AppImage` | 84,593,160 | `d19bd9de573112912f1f6010f485f358e284e74b2a69ee3305720a887cfe782b` |
| `200.OK_0.1.5_aarch64.dmg` | 8,477,437 | `5f8ee5d22196ffca762ef691eb436db28e5e1cb22c5fc948a7719e34239a0209` |
| `200.OK_0.1.5_amd64.AppImage` | 86,239,736 | `e1ca3c735b5914d3d55b155bf615d4c9505cd98fbef8343677f10baa61b9c2ac` |
| `200.OK_0.1.5_amd64.deb` | 9,253,638 | `088a9789a5a9b79daff6eba5e782b3edc3d366f412598f19cf5142d421c64f01` |
| `200.OK_0.1.5_arm64.deb` | 9,442,656 | `a6d014e2ad098c8963b304e667154949b2e46f3f43e0b780a2c61b2286a2e9ae` |
| `200.OK_0.1.5_x64-setup.exe` | 6,404,640 | `6cf857e6c99b52f71ca008ac184dd5f73d3837afaf858bb5c866c85b40954b55` |
| `200.OK_0.1.5_x64.dmg` | 9,026,111 | `0374d11769caf381c044841cb2524fd276b73b50de3c790d5537d4669db08229` |
| `200.OK_0.1.5_x64.msi` | 9,015,296 | `f912f57f38aa18b69989c9042018d0650fb744bacd7d3aaedd8e1a46d6bf71cf` |
| `200.OK_aarch64.app.tar.gz` | 8,091,891 | `5aeef0bf0c6d94878932115c9394d732dad449c6518d2ba65b293b3c1c0ffaf7` |
| `200.OK_x64.app.tar.gz` | 8,572,069 | `48d364ecbf59bf6ec57b36e2a55448bc45fbd715596a9f44d08221b7f744a8be` |
| `200_OK_0.1.5_aarch64.pkg` | 7,858,882 | `1699fa6d9a7360a342cb84e522c748fbb8b681d635a1e247d598f5e707dd54c0` |
| `200_OK_0.1.5_x64.pkg` | 8,421,280 | `cf3ec54baff35e40521070697189b744ea0602402eb94c2a87962e4f1df912cd` |
| `latest.json` | 10,035 | `f4af71034176752601131cb5ceaf68d95e7c8c8d543b232ee16d4c8843961255` |

`latest.json` reports version `0.1.5`, contains non-empty signatures, and
selects app tarballs for macOS, current-user NSIS for Windows, and AppImage for
Linux while retaining package-specific variants. All ten distinct updater
URLs return assets from the exact public release. After a brief
post-publication cache warmup, live routes returned signed `0.1.5` metadata for
Darwin arm64/x64, Windows x64, and Linux arm64/x64 prior clients. Current
`0.1.5`, future `9.0.0`, Windows arm64, and FreeBSD returned HTTP `204`.

### Exact product acceptance

- **macOS arm64, macOS 26.5.2:** both PKGs pass Installer signature,
  Gatekeeper, and stapler validation. The exact signed public app passes
  deep/strict signing, Notarized Developer ID Gatekeeper, and stapler checks.
  An exact public `0.1.4` app performed the live signed update to `0.1.5`; its
  installed executable hash exactly matched the independently extracted
  public `0.1.5` binary. The updated app retained configuration, served and
  stopped an exact-hash fixture, recreated/focused its Dock window, passed
  native framing, and passed production extension ID
  `lpkjdhnmgkhaabhimpdinmdgejoaejic` launch with one process. Installing the
  PKG into `/Applications` itself requires attended administrator
  authentication and remains a manual spot-check.
- **Windows 11 x64 (`~/code/winvm-testbed`):** the exact NSIS and MSI downloads
  report Authenticode `Valid` for Kyle Graehl. An installed exact public
  `0.1.4` NSIS updated through the logged-in session to signed `0.1.5`, retained
  the controlled server configuration, served/stopped an exact-hash fixture,
  passed host handshake/ping/launch, and passed two production-extension
  launches with one desktop process. A fresh exact public NSIS then repeated
  serve/stop and session-1 silent uninstall removed all product binaries,
  state, native-host registry keys, and processes. MSI metadata reports product
  `200 OK`, version `0.1.5`, and `ALLUSERS=1`; its elevated UI remains
  secondary.
- **Ubuntu 24.04 x86_64 (`ssh laptop`, host `zblinux`):** an exact public
  `0.1.4` AppImage updated in place to the independent public `0.1.5` hash and
  then reported current. The updated AppImage passed WebDriver
  start/serve/stop, retained configuration, stable AppImage path, desktop
  identity, and copied native host, and passed the production extension twice
  with one process. The checksum-verifying `install.sh` installed the same
  public AppImage and host into an isolated home; a forced API failure selected
  its pinned `desktop-v0.1.5` fallback and still verified the exact public
  AppImage hash. The exact DEB reports package
  `200-ok`, version `0.1.5`, architecture `amd64`; it refused in-app replacement
  with the explicit manual-package message and passed the production extension
  path through `/usr/bin/ok200-host`. RPM inspection reports `200-ok`,
  `0.1.5-1`, `x86_64`, and the expected app/host payload. The test DEB was
  removed afterward.
- **Runtime signature safety:** a disposable unsigned packaged app used the
  production updater public key and a local endpoint that served a 60-byte
  tampered payload with the valid signature of a different public artifact.
  The runtime downloaded it, returned `Install failed: The signature
  verification failed`, and left the executable SHA-256 unchanged. Production
  endpoint configuration was restored immediately after building the fixture.

## Desktop `v0.1.6` release execution — 2026-08-04

The maintainer authorized publication and directed that manual packaged smoke
be skipped. Release commit `6dcfbd39fd5202b13f9446bfdfe41c7e3bcdc698`
and tag `desktop-v0.1.6` produced the [successful tagged Tauri
run](https://github.com/kzahel/web-server-chrome/actions/runs/30876353182)
and [successful general CI
run](https://github.com/kzahel/web-server-chrome/actions/runs/30876352014).
The desktop test job and all five macOS arm64/x64, Windows x64, and Linux
arm64/x64 build legs passed. Windows Authenticode and macOS signing,
notarization, and PKG checks passed. The finalizer published the [public
release](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.6)
only after validating the complete draft.

The public release contains 16 retained files. All 15 entries in its
`SHA256SUMS` were independently downloaded and verified; the manifest SHA-256
is `d2799a853bcd10eb98c7652f4b50fccb335ea53551a04f728541cf098b28ba33`.
`latest.json` reports `0.1.6`, has non-empty signatures, and covers all 15
supported default and package-specific targets. This establishes build,
signing, publication, integrity, and updater-metadata evidence. The maintainer
later requested the packaged smoke that had initially been skipped; its result
is recorded below.

## Desktop `v0.1.6` post-publication smoke — 2026-08-04

Exact public artifacts were exercised on macOS ARM64, Windows 11 ARM64 running
the x64 NSIS build through Windows emulation, and Ubuntu 24.04 ARM64. All three
passed public checksum identity, app launch, native folder selection, exact
external HTTP serving, branded directory listing, 404 behavior, stop/old-port
teardown, persisted server configuration, and cleanup. Platform-specific
signing/install checks passed: macOS code-sign/Gatekeeper/notarization/stapling
for the app and PKG, Windows Authenticode plus visible NSIS install/silent
uninstall, and Linux direct ARM64 AppImage FUSE launch.

The main-window app settings were then exercised, including autostart, Run in
Background, icon visibility, manual update, and in-app Quit. The results expose
release defects:

- Windows WebView2 constrains the fixed settings overlay to the blurred header
  strip, so the canonical settings route is not normally usable.
- Linux WebKitGTK also shows only the dimmed header even though AT-SPI
  initially reports ideal dialog bounds; focus/interaction can reveal
  individual controls in the header strip while the rest remains clipped.
  Both engines match `AppSettings` being nested beneath the `backdrop-blur`
  header, which creates a containing block for fixed descendants.
- On macOS, Windows, and Linux, setting Run in Background false and closing the
  last window leaves `ok200-desktop` running instead of exiting.
- Linux no-tray relaunch recovers the existing one-process app, but Windows
  no-tray relaunch can leave the original invisible and accumulate additional
  stuck normal and `--quit-for-uninstall` processes. Exact-process force stop
  was required before the otherwise clean NSIS uninstall.

Mac and Linux direct native-host framing/launch passed; Windows native-host
registration and `--check-update` passed. The production extension was absent
from all testbed profiles, so the real `v0.1.6` extension round trip was not
repeated. AppImage startup also logged a host GVFS module/GLib symbol mismatch;
local chooser and serving still passed, so treat it as a packaging warning to
investigate rather than the functional gate failure.

The complete evidence table and artifact hashes live in
[`../topics/desktop-release-readiness.md`](../topics/desktop-release-readiness.md).
All smoke-created state was removed; MacVM returned to suspended, and WinVM
and LinuxVM returned to stopped.

### Remaining unattended work boundary

There are now open unattended desktop release blockers. Portal the settings
dialog outside the blurred header, make background=false last-window close
exit, add Windows no-tray one-window/one-process relaunch coverage, and publish
an exact repaired release before desktop promotion. Store publishing and
physical ChromeOS delivery remain in Lane B, as do subjective installer
spot-checks and secondary MSI/RPM/physical-ARM64 claims. The Android emulator
is shut down; future Android device work should use the attached physical
device as requested.

## Lane B — maintainer/device sign-off

These checks need Kyle because they depend on subjective UX approval, an
authenticated store console/profile, physical ChromeOS behavior, or OS UI
that the approved automation cannot reach.

### B1 — optional updater experience spot-check

Gate: **none**. JSTorrent's cadence and interaction decisions are already
accepted. A maintainer may still spot-check 200 OK's captured or live inline
presentation, but this does not block release or promotion when the automated
behavior and platform transitions pass.

### B2 — small desktop UI checks automation cannot reach

Gate: **promotion** for the recommended app; otherwise **claim**.

- [ ] On macOS, confirm the packaged candidate feels correct when closed,
      reopened from the Dock, shown from menu/tray, and quit.
- [ ] On Windows, confirm tray Show App, checkmarks, Quit, Start at Login, and
      tray-triggered manual update result on the recommended NSIS install.
- [ ] MSI UAC install/uninstall is optional secondary-package evidence unless
      it reveals shared installer or identity damage.
- [ ] Normal Linux tray/autostart review is optional claim evidence; it does
      not replace the agent's AppImage extension/update gate.

### B3 — physical ChromeOS and store-delivered Android proof

Gate: **promotion to ChromeOS users**.

The 2026-08-01 unpacked-extension/public-APK probe passed installed-app launch
and external serving through the Chromebook's LAN IPv4, but exposed two
blockers: the app displayed an unreachable ARC-private IPv4, and the missing-app
primary intent left Play on its generic home surface. Detailed evidence and the
cleanup sequence live in
[Tactical 011](011-extension-launcher-and-chromeos-network-readiness.md). These
source/sideload results do not close the store-delivery gate below. The Android
address defect is now fixed and physically accepted in source; the missing-app
extension route and exact store-delivered Android candidate remain open.

- [ ] From an existing store-installed extension, verify the updated extension
      arrives through Chrome Web Store delivery.
- [ ] With the Play app installed, click the extension action and confirm it
      opens/focuses one 200 OK Android app instance.
- [ ] Start the server in the Android app and fetch a known file from outside
      the app.
- [ ] Without the Android app installed, confirm the action reaches the exact
      Google Play listing rather than a dead intent/error page.
- [ ] Install/update the Android candidate through the chosen Google Play test
      or production track and confirm configuration/file access still works.

An Android emulator or unpacked extension is useful agent evidence but cannot
close this physical ChromeOS/store-delivery gate.

### B4 — authenticated publication and legacy migration decisions

Gate: **promotion**.

- [ ] Upload/promote the accepted extension ZIP in Chrome Web Store and the
      accepted AAB in Google Play Console; complete any declarations or review
      steps that require the account holder.
- [ ] Confirm the store-served versions match the inspected artifacts.
- [ ] Choose the final legacy reminder contract. The standing recommendation
      is one install-time notice, no more than weekly reminders, explicit
      remind-later, and silence after replacement detection.
- [ ] Export the currently served legacy package, approve the exact migration
      ZIP diff/copy, and submit it with time for one corrective version before
      2026-08-31.
- [ ] Verify the store-delivered legacy update on an existing controlled
      installation.
- [ ] Give the final go/no-go for broad migration messaging after the desktop
      and ChromeOS destination gates are recorded.

## Final go/no-go ledger

| Gate | Owner | Blocks |
|---|---|---|
| Deterministic green source and workflows | Agent | Desktop release |
| Accepted JSTorrent-style cadence, signature rejection, and package-aware updater | Agent | Desktop release/promotion |
| Complete signed candidate and exact recommended-path install/update/extension smoke | Agent after publication authorization | Desktop release |
| Live routes, deployed config, and sanitized aggregate reconciliation | Agent | Broad promotion |
| Physical ChromeOS + store-delivered Android/extension flow | Maintainer/device | ChromeOS promotion |
| Legacy cadence, submission, and controlled delivery | Maintainer/store | Legacy campaign completion |
| MSI, native RPM, and physical ARM64 smoke | Agent/maintainer as hardware permits | Claims only unless a shared defect appears |

## Completion criteria

Close this tactical when:

- the source and release workflows are green without rerunning a known random
  defect away;
- the updater has the accepted documented/tested app and host cadences and
  cannot cross package ownership boundaries;
- one exact signed desktop follow-up passes clean install, installed update,
  serving, and extension launch on macOS, Windows NSIS, and Linux AppImage;
- live update routes and sanitized statistics agree with the immutable release
  and deployed config;
- the store-delivered extension/Android ChromeOS destination passes on a real
  device before it is promoted;
- the legacy reminder policy is accepted;
- the final legacy package is submitted and delivered to a controlled install;
  and
- repository topics, tactical records, `CLAUDE.md`, and the linked private
  runbooks agree on current releases, operations, evidence, and remaining
  claim-only gaps.
