# 009: Release Confidence Closeout

Status: **active release-closeout plan.** The download page is live and
accepted. Source and release evidence can now be closed in one agent-owned
lane, followed by a small maintainer/device sign-off lane before broad legacy
migration promotion.

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
| Desktop release pipeline | Signed `desktop-v0.1.4` proved private staging, complete artifact validation, signing/notarization, checksums, and one-job publication | The current AppImage, ARM64, and macOS Dock repairs need an exact signed follow-up |
| General CI | Typecheck, lint, and build passed at `3df02a4`; Tauri App CI passed | General CI failed on a randomly malformed Node-generated X.509 certificate |
| Updater UI | Manual and daily-check control flow passed on macOS; a controlled `0.1.2` build installed public `0.1.3`; JSTorrent's shipped cadence and interaction semantics were accepted as the 200 OK reference on 2026-07-31 | The source does not yet implement that accepted cadence, and no actual installed previous-public to current-candidate transition has passed on all recommended desktop paths |
| Updater safety | Tauri signatures and fail-closed release metadata are in place | Secondary MSI/DEB/RPM installs can currently encounter metadata for a different package type |
| Windows extension launch | Installed same-source NSIS plus published extension identity passed popup → host → single desktop instance | Repeat with the exact signed public NSIS and candidate updater transition |
| Linux extension launch | Exact public DEB path passed; source AppImage repair passed locally | Exact public `v0.1.4` AppImage is broken; repeat with the signed follow-up through direct and verified-installer paths |
| macOS extension launch | Native host and app components build; Dock recreate-or-focus has mock-runtime coverage | No recorded browser extension → installed signed app proof, and packaged Dock behavior needs product smoke |
| Android / ChromeOS | Android `v0.1.2` and extension `v0.1.3` are public | The `ok200://launch` intent and Play fallback landed after both tags and have not been store-delivered or tested on ChromeOS |
| Live update service | `updates.ok200.app/health` returned `{"ok":true}` and current `0.1.4` returned HTTP 204 on 2026-07-31 | Route matrix, deployed config equivalence, reason/CFU accounting, and Control Room aggregates need one reconciled proof |
| Documentation | Repository topics and signing runbook are strong | `CLAUDE.md` had stale pre-Rust-release context; private analytics guidance is JSTorrent-centric and Control Room still labels desktop unreleased |

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
- [ ] Verify direct and installer-managed AppImages remain writable and retain
      their stable path, desktop identity, native host, settings, and server
      behavior after update.
- [x] Verify the configured updater public key against the private-key source
      named by the signing runbook without exposing key material.
- [x] Add negative validator tests for malformed metadata, off-release URLs,
      wrong package selections, incomplete target coverage, and missing
      updater signatures.
- [ ] Exercise the runtime verifier against an incorrectly signed candidate
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

- [ ] Regression-check the already accepted exact DEB extension path after
      updater bundle-awareness changes.
- [ ] Inspect MSI, DEB, and RPM metadata and their manual-update presentation.
- [ ] If a native RPM or ARM64 GUI host is available, run the corresponding
      product smoke; otherwise label those paths unaccepted rather than
      delaying the recommended x86_64 paths.
- [ ] Record exact tag, workflow, filenames, sizes, SHA-256 values, host/OS,
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
- [ ] Synchronize version fields in the release commit from a clean accepted
      revision; the release script intentionally performs this immediately
      before tagging.
- [ ] Run the release script and push the single intended desktop tag.
- [ ] Require all test, macOS, Windows, Linux x86_64, and Linux ARM64 matrix
      jobs plus the finalizer to pass.
- [ ] Confirm the release remains non-public until completeness validation and
      that a failed leg cannot leave a production-looking partial release.
- [ ] Download every retained asset, verify `SHA256SUMS`, inspect signatures,
      and verify `latest.json` version, targets, signatures, package choices,
      and URLs.
- [ ] Run A3 and A4 against the public candidate before calling it accepted.
- [ ] Update the owning topics and completed tacticals with immutable evidence.
- [ ] Recheck the already-live download page's resolved links; no redesign is
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

The 2026-07-31 public route audit produced:

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

### Remaining unattended work boundary

The `0.1.5` changelog is prepared and the source candidate is ready for the
release script's version synchronization and signed follow-up lane. Creating
and pushing that desktop tag is intentionally not performed without explicit
publication authorization. Exact candidate install/update,
runtime wrong-signature rejection, and recommended-path extension smoke all
depend on the retained signed artifacts from that run and therefore remain
open in A2, A4, and A6. Store publishing and physical ChromeOS delivery remain
in Lane B.

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
