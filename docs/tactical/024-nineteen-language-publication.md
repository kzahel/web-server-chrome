# Nineteen-language publication

Topic: localization

Status: publication executed where available; external store gates remain,
2026-10-29. The maintainer explicitly requested committing all
remaining changes and publishing every product/store lane after Tactical 023
completed all seventeen new languages and green CI. This is separate publication
authority following the completed source campaign.

## Candidates and sequence

- Android 0.2.5 / code 10: signed immutable GitHub candidate, internal-first
  Play delivery, then production promotion under the existing rollout policy.
- Extension 0.1.10: exact browser-accepted package submitted to Chrome Web Store
  through the keyless tag lane; Google review/public availability observed separately.
- Desktop 0.1.13: signed/notarized complete packages, fail-closed finalization,
  public checksums, website and old/current/future updater-route verification.
- Crostini 0.1.6: signed static x86_64/ARM64 artifacts, manifest/checksums and
  compatible updater/bootstrap routes.
- iOS 0.1.0 (2): first App Store identity/signing, candidate, metadata,
  screenshots, upload and review subject to actual Apple account gates.

The remaining isolated macOS mock-keychain browser change is committed. Local
smokes in Tactical 023 already exercised it; release gates repeat the exact
packaged-extension browser check. Raw account/device/credential/artifact data
remain ignored/private. No secrets or machine inventory are committed.

## Compatibility and rollout

These are additive offline-catalog releases. Existing desktop native messaging,
extension/controller protocols, Android intents, persisted settings, folder
grants and HTTP behavior remain unchanged. Old/new components continue to update
independently, with English fallback and unknown future language preferences
preserved. The previously accepted protocol-1 store-extension/protocol-2 Crostini
gap retains recovery for lagging installed copies in the Crostini topic;
both protocol-2 counterparts are now publicly available. This language release
adds no new protocol cutover. No ordered all-component deployment is required.

Existing source/compatibility, signed-artifact, package and publishing gates stay
enabled. Store review acceptance and actual availability are distinct from an
API submission; production rollout/deployment evidence is recorded per component.

## Initial Apple prerequisite (resolved 2026-10-30)

A read-only API check found no App Store record for `app.ok200.ios`. Membership
endpoints reject bundle-ID/certificate access with `PLA_NOT_ACCEPTED`: Apple
requires the Account Holder to accept the updated Program License Agreement.
Local Apple Distribution signing and app-specific provisioning are absent. The
maintainer was notified while the other publication lanes continue. No account
agreement was accepted, credential revoked, or alternate key chosen to evade
this account-level gate.

## Execution evidence

- Android 0.2.5/code 10: [tag build 40952553150](https://github.com/kzahel/web-server-chrome/actions/runs/40952553150)
  passed API 26/36 instrumentation, signing, exact Release smoke and artifact gates.
  Public APK/AAB/checksums were independently inspected. The APK contains all
  eighteen translated locale configurations plus default English.
  [Internal publication 40953902148](https://github.com/kzahel/web-server-chrome/actions/runs/40953902148)
  accepted the same AAB, SHA256
  `2c74ca0e67a3f978a993554521d6dc0a9e912a87d2ea2f91cdfae75d0f30208b`.
  Production check 40952129707 still shows code 9 at 1%, code 6 completed. The
  existing unfinished-rollout guard is retained; maintainer rollout direction
  was requested against this concrete new internal candidate. The report-only
  scheduled advance run 40955676820 passed without changing the rollout.
- Extension 0.1.10: [release40952771672](https://github.com/kzahel/web-server-chrome/actions/runs/40952771672)
  passed source, exact-package browser, submission and GitHub publication. Public
  ZIP SHA256 is `b7715ea2079a85b7ba317e71d44429ecb97ee7ccefefc761d78c41bf559a022e`,
  with nineteen native locales. A separate status run 40953185911 confirmed
  **0.1.10 PENDING_REVIEW / public 0.1.8**, replacing pending 0.1.9 under the
  maintained strictly-newer candidate contract.
- Crostini 0.1.6: [release40953001879](https://github.com/kzahel/web-server-chrome/actions/runs/40953001879)
  published both static architectures, signed manifest and checksum ledger. All
  public checksums and both assets' production-key signature/hash checks passed
  independently through the production Rust verifier. All six old/current/future feed routes pass on both architectures; the
  bootstrap fallback is deployed at 0.1.6. No new physical Chromebook acceptance is inferred.
- Desktop 0.1.13: [release40953035519](https://github.com/kzahel/web-server-chrome/actions/runs/40953035519)
  passed its serialized five-platform signed package matrix, Linux product E2E
  and fail-closed finalizer; the release is public. All sixteen GitHub asset
  digests and the checksum ledger match independent downloads. Both macOS
  architectures pass app/PKG signing, Gatekeeper and stapler inspection. All
  twenty old/current/future default updater routes pass. The public download
  page and both installer fallbacks are deployed (run 40956523938) and verified
  over production HTTPS. A real signed 0.1.12 → 0.1.13 macOS ARM64 update
  completed after its normal administrator sheet; the installed executable
  SHA256 exactly matches the independent public payload
  `e70bdeafa5267b3c6fdf0ff0ea9c628dc43fe916cf47457e28cbd9a4eda243dc`.
- iOS 0.1.0 (1): complete source gates and an unsigned Release archive containing
  nineteen language resources passed inspection at source a591c85. This artifact
  is not uploadable or distribution-signed. The Apple PLA/account gate remains.

The support page now uses the existing public contact from this app's
[Play listing](https://play.google.com/store/apps/details?id=app.ok200.android),
with GitHub Issues retained. The production build and desktop/mobile layout
smoke pass. Pages run 40954989265 deployed both pages; direct HTTPS checks
confirm the real support page, contact link, updated policy and no redirect. This closes
the source contact gap without inventing private contact information.

One superseded non-tag desktop candidate run was cancelled to free release
capacity; current main/tag gates remain enabled. All artifacts, model records,
private account outputs and physical-device evidence stay ignored. Store review/delivery states retain the explicit limits below.

## Play-delivered physical maintenance smoke

The physical Pixel updated from 0.2.4 to 0.2.5/code 10 through the actual Play
Store interface. Package inspection reports `com.android.vending` as installer.
Existing German preference, SAF folder grant and server settings survived.
The visible French controls started serving the dedicated existing smoke folder;
an external LAN fetch returned HTTP 200. Switching to Japanese while running
preserved the endpoint and identical bytes (SHA256
`e5147c1d0c37ccf836cb675264f86fcfc6fa26583e6ac13959831ff24c86521a`).
Japanese stop removed the external listener. The phone was restored to German,
server stopped, with its existing folder and preferences retained. No app-data
reset or direct APK install substituted for store delivery.

## CI observation

The support-only commit's iOS run 40954989231 initially failed before executing
tests because its hosted runner exposed no matching iOS simulator destination.
The failed job was rerun without weakening checks or changing app/test source.
The exact release builds and app-language qualification remain independently
recorded above and in Tactical 023. The unchanged rerun passed completely, including simulator tests, unsigned
Release products and archive preflight: [40954989231](https://github.com/kzahel/web-server-chrome/actions/runs/40954989231).

A final independent Chrome status run 40957111539 still reports 0.1.10 pending
review / 0.1.8 public. A final Apple membership probe still rejects bundle-ID
and certificate access with `PLA_NOT_ACCEPTED`; no App Store record exists.
These are external completion gates, not successful store publication.

## Installed macOS maintenance smoke

The claimed macOS ARM64 VM began powered off with the preceding system-wide
0.1.12 installation. Normal startup and the production signed updater reached
the expected administrator sheet. The stored appliance credential was submitted
through Machine Control's one-shot authorization lease, and the updater
completed/restarted into the exact public 0.1.13 binary. The installed app passes
deep/strict signing and Gatekeeper. Existing German preference, folder path,
port, loopback binding and other server settings survived. The preceding
campaign's temporary fixture was absent after reboot; only that dedicated
fixture was recreated for this smoke.

The actual nineteen-option language selector includes every new language.
Spanish settings and native menus agree, and the visible outside-home warning
plus explicit start confirmation work. Start served the exact fixture through
HTTP 200 on loopback; visible stop removed that listener. This is a bounded
macOS maintenance smoke, not fresh full three-OS or physical Chromebook
acceptance. The exact new store-extension/native-host round trip remains
unavailable while Google review is pending.

The website/fallback commit b0cfa83 passed CI 40956532922,
Crostini 40956509553 and Push 40956510377. Website 40956523938 and final read-only
Chrome check 40957111539 passed. Store availability remains bounded by the
explicit pending gates above; green workflows do not imply review approval.

Spanish settings persisted through the visible Quit action and a real relaunch.
The desktop was restored to German and stopped, with its original server
settings retained. The app was quit normally; campaign-created fixture/logs
were removed, the initially powered-off VM was shut down, and its exclusive
claim was released. No desktop ownership is retained.

## Remaining external actions

- Chrome: 0.1.10 is now PUBLISHED and the public CRX matches the accepted
  runtime/resources with nineteen locales. Exact installed-store-copy functional
  acceptance remains separate from the verified public download.
- Play: the maintainer superseded the earlier staged plan with code 10 at
  **100%** on 2026-10-30. The full-production submission is blocked by Google
  review, as recorded below. Resume the exact approved code 10/completed
  promotion after review clears and live candidate/track checks still match.
  Do not cancel the review or ask for the same choice again.
- Apple: the PLA, contact and rights prerequisites are complete. The maintainer
  accepted Simulator Release smoke for submission because no iPhone is available;
  that smoke passes. Build 2 is submitted, WAITING_FOR_REVIEW; reconcile Apple
  review and the manual release. No App Store availability or
  physical TestFlight pass is claimed.

## Authorized continuation — 2026-10-30

The maintainer accepted Apple's Program License Agreement and explicitly
approved completing Android 0.2.4, then staging 0.2.5 at 1%.

- Play rollout run 41012541457 accepted code 9 completion. Read-only
  reconciliation 41013061441 reports production code 9 completed and no committed
  new edit. The immediate code 10 promotion41012771219 was rejected at commit
  with `FAILED_PRECONDITION`: existing changes are in review. The failed/unknown
  outcome was reconciled before any retry; code 10 is not claimed in production.
  The authorized target remains code 10 at 1%, standard-7d, preserving the review.
- Apple membership/certificate/bundle endpoints now succeed. The exact app
  identifier and an app-specific App Store profile were registered using the
  existing valid distribution certificate and matching private key. No
  certificate was created or revoked. The App Store app record was created
  with the source-reviewed name, English primary language, iOS platform and
  stable bundle identity. No agreement or new legal declaration was accepted.
- CI signing secrets and an exact-tag upload environment with required review
  were configured. Native macOS PKCS12 import passes after using compatible
  export encoding for the unchanged certificate/key. The first hosted candidate
  run 41013107488 then exposed Bash3.2 parsing of the profile-name regular
  expression. The expression now lives in a quoted variable, and tool-only
  preflight parses each release helper separately before returning. Existing
  locale qualification harness/runtime inputs remain unchanged.
- Tag `ios-v0.1.0-b1` remains immutable. Build2 is the corrected packaging
  candidate; no build has yet been uploaded to Apple. Runtime catalogs,
  protocols, settings, privacy and HTTP behavior are unchanged.

## Corrected iOS candidate and store preparation

[Candidate 41014160636](https://github.com/kzahel/web-server-chrome/actions/runs/41014160636)
passed complete source checks, ephemeral existing-identity signing, archive/IPA
inspection, Apple validation and reviewed-environment upload from immutable
`ios-v0.1.0-b2` at `fd478345d0a22ecc16f62e3bd2e456864b611460`.
Independent inspection of the downloaded exact IPA passed distribution/profile
matching, arm64, iOS 17 minimum, both device families, reviewed privacy and
absence of DEBUG hooks/embedded frameworks. All nineteen `.lproj` resources
are present. IPA SHA256:
`cdc6f30ac67b6f0ca8e092044cf22ea2405db0896ee55fa26ace754d8fc6ba39`.
Apple accepted upload without errors, processed build 2 VALID and reports
non-exempt encryption false. The exact build is attached to App Store 0.1.0
and a private internal TestFlight group with automatic build access and tester
notifications disabled. No tester invitations were sent.

The reviewed English name/subtitle/description/keywords/URLs and Developer Tools
plus Utilities categories are saved. The No Data Collected response is published
and independently read back from the privacy page with its publication time.
Age answers retain conservative unrestricted web access YES; all other
content/capabilities are NONE/NO with no override. Apple's API reports legacy
17+, Brazil 16 and France 18. These factual product declarations do not replace
the outstanding maintainer Content Rights answer.

Free pricing in 175 regions and all-region availability after release are
configured. Release remains manual after approval. Both required highest-size
Release screenshots are captured from the same build 2 source (no DEBUG fixture),
visually inspected and pass native dimensions/no-alpha checks. Both Apple
assets processed COMPLETE. Their source/provenance lives with
[`ios/store/screenshots`](../../ios/store/screenshots/README.md). The two
dedicated capture simulators were shut down and removed.

An unsubmitted review draft was created for Apple's metadata preflight. Adding
the version reported exactly two associated gaps: missing Content Rights and
missing App Review detail. The required private contact phone and rights choice
were requested from the maintainer; contact/notes are prepared without inventing
phone or rights values. The configured physical iPhone is disconnected, so the
exact TestFlight Files/LAN/lifecycle gate remains open and reconnection was
requested. The draft is independently verified unsubmitted; no App Review
submission or public availability is inferred.

Main source at fd47834 passed CI 41013872743, CodeQL 41013872286 and
iOS 41013872973. A final read-only Chrome check 41016485291 passed and still reports
0.1.10 pending review / 0.1.8 public. The physical Pixel and macOS
smokes above remain specific to their released artifacts.

## Content Rights approval — 2026-10-30 09:00 UTC

After reviewing the explanation, the maintainer explicitly agreed to
**Does not use third-party content**. The app-level declaration was saved and
independently read back using the explicit `contentRightsDeclaration` field.
Fresh unsubmitted-review preflight no longer reports that missing declaration;
its remaining associated error is the absent App Review detail. The private
contact phone is still needed before completing that detail. The configured
iPhone remains disconnected, so physical TestFlight acceptance is still open.
No App Review submission was made.

A fresh Google Console observation still shows release0.2.4 in review. The
approved code10/1% promotion remains pending that review; no blind retry or
review cancellation was performed. The temporary read-only browser tab and
bounded host claim were closed/released after the check.

## Simulator substitution and complete private contact — 2026-10-30

The maintainer provided the private App Review phone and requested Simulator
smoke instead of waiting for an unavailable iPhone. The phone is saved only in
App Store Connect and ignored private evidence. Apple accepted the complete
review detail; fresh preflight staged exactly version 0.1.0/build 2 in the
unsubmitted draft without another metadata gap.

`ios/scripts/release-simulator-smoke.sh` and the separate `ios/ReleaseSmoke`
project now reproduce a production Release smoke through native XCTest. They
also run sequentially after the existing source/archive checks in iOS CI,
retaining the result bundle and inspection/log evidence. They
create their own iPhone Simulator, seed only its OS Files provider, choose the
fixture through the real document picker and drive normal controls. No app
test hooks, preference injection or production project dependency were added.
Current app/runtime/catalog sources match immutable `ios-v0.1.0-b2`.

The final test passed on iPhone 17 Pro Max / iOS 26.5 in 52.917 seconds:
first-run folder restriction, actual Files grant, automatic port, CORS, exact
index/text bytes, range 206, missing 404, POST 405, preview page, stop and
disconnection, persisted folder/port/CORS/LAN/stopped state after relaunch, and
background disconnection plus stopped explanation after return. Cache-free
requests originate in the independent test runner. Background checks first
wait for the OS background state and bound asynchronous listener shutdown to
five seconds. Screenshots of running, preview and stopped states were visually
inspected. Private evidence is `ios/build/release-smoke.tsjvHC/Smoke.xcresult`;
the runner exited zero and removed its own Simulator.

Harness bring-up exposed native picker single/double tap semantics, text
selection and Safari Close/Done differences. Strict fixture-byte assertions
caught selecting the parent folder. Those driver fixes and bounded lifecycle
synchronization require no production app change. Simulator-specific artifact
inspection avoids applying device-only architecture/icon-alpha rules; exact
device-IPA distribution inspection remains independently required and passed.
An initial concurrent standard source-suite attempt hit a Simulator app-launch
Busy/preflight error; it is rerun sequentially on a fresh owned Simulator.

This is source-equivalent Simulator Release evidence, not installation of the
signed IPA/TestFlight build or physical Wi-Fi/Local Network permission proof.
The maintainer accepted that bounded gap for submission. The historical native
MVP physical evidence remains separate, and post-publication store delivery
must still be checked. No shared runtime/protocol/settings changes or new
cross-version rollout dependency were introduced.

The sequential fresh-owned-Simulator standard `ios/scripts/check.sh` rerun
passed all unit/UI, Release build/inspection, privacy and signing-hygiene
checks. That Simulator was also removed; no booted Simulator or desktop-control
claim remains from this work.

At **2026-10-30 09:41:50 UTC**, the existing exact-version review draft was
submitted under the maintainer's publication authority. Before mutation the
API confirmed one READY_FOR_REVIEW item for 0.1.0, processed VALID build 2
and MANUAL release. Submission succeeded, then independent GETs confirmed both
submission and App Store version **WAITING_FOR_REVIEW**, still attached to
build 2 with MANUAL release. No additional agreement block was returned.
Approval/public release and physical store-delivered testing remain pending.

Hosted follow-up 41035368184 passed 27/29 existing source tests, then failed
the invalid-bookmark input-readiness and translated start/status UI assertions
before reaching the new Release smoke. The retained result bundle was inspected;
this is not recorded as a passing CI run. CI now explicitly creates and fully
boots an isolated iPhone 17 Pro before running the unchanged source suite, and
removes that exact Simulator in always-run cleanup, matching the fresh/booted
local precondition. Existing qualification harnesses and all product assertions
remain unchanged. The clean hosted rerun must pass before closeout.

Read-only Chrome check 41035739695 succeeds and still reports submitted 0.1.10
PENDING_REVIEW / public 0.1.8. A fresh Google Console observation after Apple
submission still reports release 0.2.4 in review; code10/1% remains authorized
and pending, with no review cancellation or blind promotion retry. Its owned
background tab, browser control and host claim were released.

Fresh-Simulator hosted follow-up 41036932586 passed 28/29 tests but still
recorded a switch tap with no observed start in the lifecycle test. Its result
bundle was inspected, including source failure locations. The Debug UI driver
now uses the unique accessibility identifier across SwiftUI AX type changes,
requires an observed switch/status effect and retries once only when neither
changed. It recognizes the deliberate invalid-bookmark error as an effect, so
the retry does not restart failed operations or toggle an already changed
state. The lifecycle case also waits for OS background state before reopening.
Behavior assertions remain strict, and failures after the bounded retry fail CI.

This post-campaign driver repair changes the current harness fingerprint.
The nineteen-language qualification evidence remains tied to the historical
qualified source and uploaded immutable candidates; it is not rewritten or
claimed to have run this later driver. Product/runtime/catalog inputs and
all already published/submitted artifacts are unchanged. Fresh standard source
and Release smoke checks plus hosted CI verify the subsequent test-only change.

## Chrome Web Store publication and public delivery — 2026-10-30

[Read-only check 41041629830](https://github.com/kzahel/web-server-chrome/actions/runs/41041629830)
now reports **0.1.10 PUBLISHED**, with no pending submission. An independent
download through Google's public extension-update endpoint delivers CRX3
0.1.10, default English plus eighteen translations. CRX SHA256 is
`90874323e3b92f25351a6ce7713eb58445ce02e79a5953405331cccce77deb81`;
its ZIP payload SHA256 is
`d15c31a8ba2472642e14c0cf260c2515b97fa52cdb6fc89700ead8f321ade0a8`.

The independent public GitHub ZIP still matches accepted candidate SHA256
`b7715ea2079a85b7ba317e71d44429ecb97ee7ccefefc761d78c41bf559a022e`.
Comparing every packaged file finds no missing files and no changed runtime
or locale bytes. Google's only changes are `manifest.json.update_url` and an
additional `_metadata/verified_contents.json`. This establishes public delivery
of the accepted package without claiming a new installed-store-copy/native-host
functional round trip. Existing app/controller compatibility is unchanged.

A fresh Google Console check still shows 0.2.4 in review; code10/1% remains
pending that review. The owned tab/browser control/host claim were released.
Apple still reports version 0.1.0/build 2 WAITING_FOR_REVIEW with manual release.

## Hosted Release smoke build handoff

The repaired source UI driver passed the hosted standard source suite and
archive preflight on 759921a and a61bc39. The superseded 759921a run was
canceled after its new Release-smoke step exceeded eighteen minutes. Retained
artifact logs show boot completed, followed by a stall in Xcode 26.6
`CompileAssetCatalogVariant thinned` for the redundant device-specific app
build. No Release smoke test had started; this is not a recorded test pass or
an observed product failure.

CI now passes the canonical generic Simulator Release product already built
and checked by `ios/scripts/check.sh` to the independent UI runner. The source
Simulator is removed first. Standalone default builds also use a generic
Simulator destination with an explicit host architecture. Phase messages expose
progress, and XCTest cases have a five-minute execution bound. Source/runtime,
catalogs, signing and the uploaded App Store candidate remain unchanged.

The revised standalone default (generic Release build plus the final driver
and bounded execution) passes locally in
`ios/build/release-smoke.K0MKup/Smoke.xcresult`, exits zero, and removes its
owned Simulator. Hosted follow-up uses the already inspected canonical Release
app, preserving its recorded executable hash instead of rebuilding it.

## Green hosted closeout

The final source/test-tooling revision a9c9a6f passes
[general CI 41044327639](https://github.com/kzahel/web-server-chrome/actions/runs/41044327639),
[CodeQL 41044328364](https://github.com/kzahel/web-server-chrome/actions/runs/41044328364)
and [iOS CI 41044327611](https://github.com/kzahel/web-server-chrome/actions/runs/41044327611).
The preceding functionally equivalent iOS run 41043927389 also passes.

The final hosted lane passes standard unit/UI tests, Simulator/device Release
build and hygiene checks, archive preflight, source-Simulator removal, the
independent production Release smoke, generated-project drift checks and
evidence upload. The downloaded `ios-release-smoke` artifact independently
reports **1 test passed, 0 failed, 0 skipped**, 185.809 seconds and cleanup
`exit_code=0`. All HTTP, Files, preview, persistence and lifecycle assertions
passed. The canonical Simulator app is version 0.1.0/build 2, universal
x86_64/arm64, with reviewed privacy and absent DEBUG hooks/frameworks;
executable SHA256 is
`209fea566f1f73a085c5cd90ced6c90faf765fef6668b13a6edc4a10c591abc0`.
That Simulator hash is separate from the already recorded signed device IPA.

Local Simulator inventory is empty of booted devices, and the final browser
check releases its owned tab/control/claim. App/runtime/catalog source remains
unchanged from the uploaded immutable iOS candidate. Final Apple readback still
reports **0.1.0 (2) WAITING_FOR_REVIEW / MANUAL**. Public Chrome 0.1.10 delivery
is complete; the existing Play-review constraint and exact physical iPhone /
installed-store-copy acceptance limits above remain explicit.

## Android full-production authorization — 2026-10-30

The maintainer explicitly requested Android release at **100% now**, replacing
the earlier code 10/1% direction. The target is the unchanged internally
Play-delivered and physically tested **0.2.5/code 10** AAB, SHA256
`2c74ca0e67a3f978a993554521d6dc0a9e912a87d2ea2f91cdfae75d0f30208b`.
No rebuild, new signing identity, runtime/protocol/settings change or coordinated
component update is needed. Existing independently released peers remain
compatible under the source/cross-version evidence above.

[Production precheck 41110868956](https://github.com/kzahel/web-server-chrome/actions/runs/41110868956)
passed exact-tag/source CI and immutable-candidate verification, reporting code 9
completed and code 10 already known to Play.
[Full-production submission 41110992191](https://github.com/kzahel/web-server-chrome/actions/runs/41110992191)
used the normal reviewed production environment and `status=completed`, with
no upload or staged fraction. Google rejected the commit with
`FAILED_PRECONDITION`: existing changes remain in review. The sanitized failure
receipt explicitly requires reconciliation before retry; no successful code 10
production release or public availability is claimed.

[Read-only reconciliation 41111131415](https://github.com/kzahel/web-server-chrome/actions/runs/41111131415)
returned `access_verified`, production code 9 completed, and code 10 known.
The failed promotion left the production track unchanged. Preserve the active
review and retry the same candidate with `status=completed` only after review
clears and fresh candidate/track checks match; no further release-direction
approval is required. Scheduled advancement stays report-only.
