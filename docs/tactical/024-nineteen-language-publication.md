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

Pending candidate builds, store receipts, public-asset audits and final CI.
