# Nineteen-language publication

Topic: localization

Status: active, 2026-10-29. The maintainer explicitly requested committing all
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

- Android 0.2.5/code 10: [tag build40952553150](https://github.com/kzahel/web-server-chrome/actions/runs/40952553150)
  passed API26/36 instrumentation, signing, exact Release smoke and artifact gates.
  Public APK/AAB/checksums were independently inspected. The APK contains all
  eighteen translated locale configurations plus default English.
  [Internal publication40953902148](https://github.com/kzahel/web-server-chrome/actions/runs/40953902148)
  accepted the same AAB, SHA256
  `2c74ca0e67a3f978a993554521d6dc0a9e912a87d2ea2f91cdfae75d0f30208b`.
  Production check40952129707 still shows code9 at1%, code6 completed. The
  existing unfinished-rollout guard is retained; maintainer rollout direction
  was requested against this concrete new internal candidate.
- Extension 0.1.10: [release40952771672](https://github.com/kzahel/web-server-chrome/actions/runs/40952771672)
  passed source, exact-package browser, submission and GitHub publication. Public
  ZIP SHA256 is `b7715ea2079a85b7ba317e71d44429ecb97ee7ccefefc761d78c41bf559a022e`,
  with nineteen native locales. A separate status run40953185911 confirmed
  **0.1.10 PENDING_REVIEW / public0.1.8**, replacing pending0.1.9 under the
  maintained strictly-newer candidate contract.
- Crostini0.1.6: [release40953001879](https://github.com/kzahel/web-server-chrome/actions/runs/40953001879)
  published both static architectures, signed manifest and checksum ledger. All
  public checksums and both assets' production-key signature/hash checks passed
  independently through the production Rust verifier. Feed/bootstrap follow-up
  remains pending. No new physical Chromebook acceptance is inferred.
- Desktop0.1.13: [release40953035519](https://github.com/kzahel/web-server-chrome/actions/runs/40953035519)
  is building its serialized five-platform package matrix; source and Linux
  product E2E passed. Draft assets are not treated as a public complete release.
- iOS0.1.0(1): complete source gates and an unsigned Release archive containing
  nineteen language resources passed inspection at sourcea591c85. This artifact
  is not uploadable or distribution-signed. The Apple PLA/account gate remains.

The support page now uses the existing public contact from this app's
[Play listing](https://play.google.com/store/apps/details?id=app.ok200.android),
with GitHub Issues retained. The production build and desktop/mobile layout
smoke pass; deployed-page verification follows the Pages workflow. This closes
the source contact gap without inventing private contact information.

One superseded non-tag desktop candidate run was cancelled to free release
capacity; current main/tag gates remain enabled. All artifacts, model records,
private account outputs and physical-device evidence stay ignored. Final
publication, updater routes, store review/delivery states and CI remain to record.
