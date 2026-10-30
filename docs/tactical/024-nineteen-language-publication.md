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
- iOS 0.1.0 (1): first App Store identity/signing, candidate, metadata,
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
gap remains bounded by the Crostini topic; this language release adds no new
protocol cutover. No ordered all-component deployment is required.

Existing source/compatibility, signed-artifact, package and publishing gates stay
enabled. Store review acceptance and actual availability are distinct from an
API submission; production rollout/deployment evidence is recorded per component.

## Apple prerequisite

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

- Chrome: await Google's review/automatic publication of submitted 0.1.10,
  then verify the store-served version before claiming the new extension round trip.
- Play: answer the pending choice to complete the existing code 9 rollout before
  staging code 10 at 1%, or leave code 10 internal. The publisher will not override
  its unfinished-rollout guard or accelerate a rollout by assumption.
- Apple: Account Holder accepts the updated Program License Agreement. Then
  establish the first app identity, distribution signing/provisioning and exact
  candidate screenshots/metadata, validate/upload, and submit for review under
  the already granted publication authority. No App Store release is claimed.

## Authorized continuation — 2026-10-30

The maintainer accepted Apple's Program License Agreement and explicitly
approved completing Android 0.2.4, then staging 0.2.5 at 1%.

- Play rollout run41012541457 accepted code9 completion. Read-only
  reconciliation41013061441 reports production code9 completed and no committed
  new edit. The immediate code10 promotion41012771219 was rejected at commit
  with `FAILED_PRECONDITION`: existing changes are in review. The failed/unknown
  outcome was reconciled before any retry; code10 is not claimed in production.
  The authorized target remains code10 at 1%, standard-7d, preserving the review.
- Apple membership/certificate/bundle endpoints now succeed. The exact app
  identifier and an app-specific App Store profile were registered using the
  existing valid distribution certificate and matching private key. No
  certificate was created or revoked. The App Store app record was created
  with the source-reviewed name, English primary language, iOS platform and
  stable bundle identity. No agreement or new legal declaration was accepted.
- CI signing secrets and an exact-tag upload environment with required review
  were configured. Native macOS PKCS12 import passes after using compatible
  export encoding for the unchanged certificate/key. The first hosted candidate
  run41013107488 then exposed Bash3.2 parsing of the profile-name regular
  expression. The expression now lives in a quoted variable, and tool-only
  preflight parses each release helper separately before returning. Existing
  locale qualification harness/runtime inputs remain unchanged.
- Tag `ios-v0.1.0-b1` remains immutable. Build2 is the corrected packaging
  candidate; no build has yet been uploaded to Apple. Runtime catalogs,
  protocols, settings, privacy and HTTP behavior are unchanged.
