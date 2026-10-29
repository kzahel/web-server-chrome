# Store publishing parity with JSTorrent

Topic: store-publishing

Status: complete, 2026-10-29. Infrastructure is configured and the internal
Play publication and Web Store staging lanes have live end-to-end proof.

## Request and scope

Bring 200 OK store publishing up to JSTorrent's level end to end, including
cloud/store authorization and hosted verification. Use Machine Control for
browser-only setup. Reuse the established publisher and regression suite.

1. Repair Android hosted SDK installation; pin release actions and minimize
   job credentials. Bind the signed AAB to its tag, source, successful build
   run and checksums in a permanent GitHub release receipt.
2. Add explicitly dispatched internal/production publishing, same-bundle
   production promotion, transactional review-preserving edits, staged
   rollout set/halt/resume/complete, and scheduled vitals-gated advancement.
3. Configure dedicated keyless Google identities, per-app Play permissions,
   main-only GitHub environments, production review, and report-only default
   advancement. Keep concrete cloud/account identities in private inventory.
4. Add Web Store upload-only staging, preserve the exact browser-tested ZIP,
   and qualify the hosted authentication/package lanes.
5. Qualify hosted Android CI and publish a new signed candidate to internal
   testing; verify the store's resulting state and unchanged production.
   Verify production/rollout access without starting a public rollout.
6. Record evidence, limitations, recovery and ordinary release commands in
   the owning topics/runbook. Commit and push the implementation and evidence.

App Store distribution is separate from JSTorrent parity: JSTorrent provides
no corresponding native iOS release reference. The existing iOS upload lane
and Tactical 017 remain the owner of that follow-up.

## Compatibility and rollout

No application protocol, package identity, upload key, persisted setting or
supported OS range changes. Android and extension releases remain independent;
old/new combinations retain the existing compatibility corpus. Existing
GitHub Android assets stay downloadable; pre-receipt artifacts are deliberately
ineligible for this publisher and remain usable through the old manual route.
New artifacts use the same asset names plus additive build.json. No store
publication starts from a main push or Android tag. Production promotion uses
the exact bundle previously accepted on internal, with no rebuild/re-sign.

A scheduled job never starts a rollout. It follows the plan pinned when an
explicit promotion started, holds on insufficient evidence or Console drift,
and can halt a regression. Production review and report mode are intentional
configuration defaults. Reconcile ambiguous commits in Console; never blindly
retry a store commit or overwrite the release assets. Legacy manual uploads
remain possible; automated rollout pauses when Play and its ledger disagree.

## Execution evidence

The implementation, configuration and candidate/store qualification are
complete. All concrete cloud/account identities and
private Console URLs are recorded in the private operational inventory.

| Evidence | Result |
|---|---|
| Python publisher/signing regressions | 50 pass: provenance, tampering, transactional failure, idempotency, promotion, monotonic resume/set, ambiguous tracks, pinned plans, timezones, empty/low evidence, vitals hold/halt and Console drift |
| Web Store publisher regressions | 10 pass, including staging without review/cancellation and rejection during active review |
| Local source gates | Android and extension canonical release preflights pass; actionlint, shell syntax, repository lint and diff checks pass |
| Real signing gate | Released android-v0.2.1 APK verifies against the pinned upload certificate using build-tools 36.0.0 and the new parser |
| [Internal access](https://github.com/kzahel/web-server-chrome/actions/runs/40857290379) | Pass: track read and all three Reporting metric sets; no committed edit |
| [Production access](https://github.com/kzahel/web-server-chrome/actions/runs/40858556347) | Pass through production environment review: same API checks; production remains code 6 |
| [Scheduled report](https://github.com/kzahel/web-server-chrome/actions/runs/40857298047) | Pass: idle, no production rollout; code 6 remains completed |
| [Web Store authentication](https://github.com/kzahel/web-server-chrome/actions/runs/40856529157) | Pass: production identity/key verified; public extension remains 0.1.8 |
| Cloud/GitHub configuration | Independently read back: no user-managed service-account keys, dedicated active provider, intended workflow/event/ref/subject condition and environment bindings, four main-only environments, production reviewer, report-only advancement |

The internal track was initially paused at code 2 (0.1.0). Its shared tester
list is now selected alongside the retained legacy selection; no list
memberships or other apps' selections changed. The track was resumed
only after the new candidate became available. Tester contacts stay private.

## Qualification repairs

The first signed candidate, android-v0.2.2/code 7, passed source and API 26/36
instrumentation but stopped before upload at the old single-format signer
parser ([run](https://github.com/kzahel/web-server-chrome/actions/runs/40857286225)).
The gate now accepts numbered and SDK-range certificate output, requires every
signer to match the pinned upload certificate, rejects a public-key digest as
certificate proof, and resolves the exact installed build-tools 36.0.0 rather
than searching arbitrary SDK versions. Both formats are documented in the
[AOSP release verifier](https://android.googlesource.com/platform/build/+/6d0576122a/tools/releasetools/check_target_files_signatures.py).
Failure diagnostics are retained even when validation stops the release.

Tags were kept immutable: 0.2.2 was not moved; 0.2.3 is an unsubmitted,
build-only intermediate candidate. The final qualification candidate is
android-v0.2.4/code 9, whose tagged commit is exactly the atomically pushed
main tip, so full main CI can establish its exact source. No provenance or
signer gate was bypassed. Store/source jobs use a fixed Ubuntu 24.04 image.

## Qualified Android candidate

[Tag run 40860447200](https://github.com/kzahel/web-server-chrome/actions/runs/40860447200)
passed all source checks, API 26/36 instrumentation, signed APK/AAB validation,
and exact Release APK smoke. [Exact-source main CI](https://github.com/kzahel/web-server-chrome/actions/runs/40860447271)
also passed. The permanent [android-v0.2.4 release](https://github.com/kzahel/web-server-chrome/releases/tag/android-v0.2.4)
contains APK, AAB, mapping, checksums and build.json. The candidate was verified
again locally; the exact AAB also passed jarsigner verification.

[Internal publication 40862888034](https://github.com/kzahel/web-server-chrome/actions/runs/40862888034)
verified provenance before Google authentication, uploaded the same signed
bundle, committed the internal track update and recorded its deployment.

- Version: 0.2.4/code 9; package and signing identity unchanged.
- Source: 99b0dd25b2b991d552f8e4e9d8c3602d49c4f10f.
- AAB: 4,112,787 bytes.
- SHA-256: 1b4d799e329a6a4537bda320a7e92b0e17b2f7c536306ce0fd7bed8ef0726bfe.
- Publication receipt matches the release receipt and downloaded AAB digest.
- [Repeat publication 40863554296](https://github.com/kzahel/web-server-chrome/actions/runs/40863554296)
  passed and returned unchanged, proving the live rerun is a no-op.
- Console independently confirmed the internal track Active, latest 0.2.4,
  Available to internal testers after explicit track resumption.
- A fresh production Console observation still shows 6 (0.2.1). No public
  rollout or production submission was started.
- GitHub Latest remains desktop-v0.1.11; the Android candidate uses latest=false.

No physical Play-delivered installation is claimed. The actual signed APK
was exercised by hosted smoke; internal availability and installed-device
acceptance remain distinct. Production promotion, actual Google review and
real rollout/vitals observations are future release actions, with the
configured reviewer/report defaults preserved. iOS remains Tactical 017.

Machine Control's host claim was released and independently read back as
available after Console verification. No further desktop control is needed.

## Qualified Web Store candidate

[Stage run 40860233306](https://github.com/kzahel/web-server-chrome/actions/runs/40860233306)
passed package checks, actual Chrome browser acceptance, OIDC authentication
and upload. Receipt: staged-upload, reviewSubmitted=false. The downloaded ZIP,
build record and store receipt independently agree:

- Version: 0.1.9; extension identity unchanged.
- Source: ad3692b6bb8239e0a2d217e5b1817dc1046084c0.
- ZIP: 181,642 bytes.
- SHA-256: 486504ba9dd99d97a1c99c51dcd56ef8a6b0746a11b1bbd4f54d44c5dd3560e8.
- Independent shared CWS API observation at 2026-10-29 11:00 UTC: public 0.1.8,
  no submission, no warning or takedown. No extension release tag was created.

The dashboard's Chrome gallery origin refuses CDP scripting. Qualification
uses the real upload receipt and independent authenticated status API; no
foreground/locked-desktop workaround was used. An intentional tag on the
recorded candidate source is the next public-review action, not part of setup.
