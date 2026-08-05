# Tactical 017: iOS Store Readiness

**Status:** repository preparation active; no App Store Connect or distribution mutation performed
**Topic:** `ios-native-swift`
**Baseline:** `c6a5f94`
**Scope:** distribution identity, App Store packaging, TestFlight/review evidence,
and exact store-delivered validation for the device-accepted native iOS MVP

## Objective

Take the implemented and physically accepted **200 OK Web Server** iOS MVP
from a development-signed app to a controlled App Store release without
changing its foreground-only, read-only product contract or weakening the
validation established by Tactical 016.

The continuing runtime contract and accepted development-build evidence live
in [`../topics/ios-runtime.md`](../topics/ios-runtime.md). This tactical must not
describe the app as published until an exact store-delivered build is installed
and accepted.

## Scope controls

This tactical includes:

- verifying or reserving `app.ok200.ios` in the correct Apple developer and App
  Store Connect account;
- explicit version/build-number policy and distribution signing/provisioning;
- reproducible Release archive, validation, export, and upload commands;
- App Store privacy answers and privacy manifest review against actual code;
- product name, category, age rating, support/privacy URLs, keywords,
  description, foreground-lifecycle explanation, and review notes;
- reviewed iPhone/iPad screenshot requirements and accessibility presentation;
- internal TestFlight installation and the complete foreground/LAN/Files matrix
  on the distributed candidate;
- submission/review issue handling; and
- exact App Store-delivered installation and post-publication acceptance.

It excludes new runtime features, uploads/deletion, authentication, TLS,
Bonjour, background modes, shared cross-platform code, and speculative store
metadata not supported by the app. Any runtime defect discovered in a
distributed candidate is repaired in the iOS source and revalidated through
Tactical 016's gates before another upload.

## Required authority boundary

App Store Connect identity creation, agreements, certificates, distribution
profiles, uploads, TestFlight distribution, submission, pricing/availability,
and publication mutate external account state. Each must be explicitly
authorized and use the maintainer-selected account/team. No Apple account,
team identifier, certificate, private key, provisioning profile, device
identifier, issuer, or API key is committed to this repository.

## Progress record

On 2026-08-05, the first non-mutating repository slice closed the source-level
privacy and policy gaps:

- `PrivacyInfo.xcprivacy` now declares no tracking or collected data and gives
  the required reasons for app-owned preferences and metadata reads from the
  folder the user selected;
- the bundle declares `ITSAppUsesNonExemptEncryption` false based on the
  current plain-HTTP, system-framework implementation;
- the opaque 1024-pixel App Store icon no longer carries an alpha channel;
- the app exposes stable Privacy, Feedback & support, and Source code · MIT
  destinations, and simulator UI coverage requires those controls; and
- the website source includes the app-specific privacy policy and footer link.

The canonical iOS check owns manifest inclusion, encryption metadata, and icon
format checks in both simulator and generic-device Release products. This is
source evidence only: the privacy route is not live until the website deploys,
App Store Connect answers have not been entered, and no account identity,
credential, signed archive, or upload has been created by this slice.

The complete canonical iOS check and production Astro build passed after this
slice; the latter emitted `/privacy.html` alongside the existing stable routes.
The physical smoke rerun remains pending because the testbed readiness probe
reported that its selected phone was disconnected.

The second repository slice adds the machine-neutral
[`../runbooks/ios-app-store-archive.md`](../runbooks/ios-app-store-archive.md),
an explicit version/build changelog contract, and checked archive tooling. The
tooling has a non-mutating preflight, a credential-free unsigned rehearsal,
and a manual-signing path that generates its private export options only under
the ignored evidence tree. Its exact-artifact inspector accepts an `.app`,
`.xcarchive`, or `.ipa` and fails closed on bundle/version/platform drift,
simulator slices, icon alpha, privacy-manifest drift, DEBUG hooks, unexpected
embedded frameworks, distribution entitlement/profile mismatches, or an
expired/non-App-Store profile.

The unsigned device Release app, an unsigned Release `.xcarchive`, and an
IPA-shaped extraction harness passed the inspector on 2026-08-05. No signed
archive or export has run: preflight truthfully reports that the local Apple
Distribution identity and per-app signing configuration are unavailable. The
signed path can optionally request Apple validation only after an attended
identity/profile checkpoint and an App Store Connect app record exist.

The third repository slice adds `scripts/release-ios.sh` and the dispatch-only
`iOS App Store Candidate` workflow. The local helper checks or prepares an
exact `ios-vX.Y.Z-bN` tag without pushing it. The workflow defaults to
`build-only`; validation and upload are separate explicit selections, upload
also requires the exact `UPLOAD` confirmation and the
`ios-app-store-upload` environment, and a pushed tag alone cannot start it.

CI signing setup uses a disposable keychain and fails unless the imported
Apple Distribution certificate, selected team, exact `app.ok200.ios` App Store
profile, distribution entitlements, expiry, and profile certificate all agree.
The signed archive/IPA is reinspected before delivery, while an always-run
cleanup removes the decoded `.p12`, installed profile, `.p8`, and keychain.
The workflow has no App Review, tester, pricing, availability, or publication
operation. Its secret-dependent path remains intentionally unexecuted until
the attended Apple identity and credential checkpoints.

## Implementation sequence

### 1. Freeze product and distribution identity

1. Confirm the App Store listing name **200 OK Web Server**, compact in-app
   **200 OK** treatment, bundle identifier `app.ok200.ios`, SKU, primary
   language, category, and target territories.
2. Confirm `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`, minimum iOS 17.0,
   supported device families/orientations, and a repeatable increment policy.
3. Keep development-team selection injected. Add distribution configuration
   only through ignored local/CI secrets and documented commands.

### 2. Close privacy, policy, and metadata

1. Audit linked frameworks, entitlements, capabilities, network behavior,
   persistence, Files access, clipboard/share behavior, and diagnostics against
   Apple's current privacy-manifest and required-reason API rules.
2. Complete App Privacy answers from actual data flow. Do not infer tracking,
   analytics, account, upload, or cloud behavior that the app does not have.
3. Prepare support/privacy URLs, description, keywords, category, age rating,
   copyright, and review notes.
4. Explain in listing and review notes that serving is plain HTTP, read-only,
   local/foreground-only, and stops when the app backgrounds. Do not imply
   indefinite background service or internet exposure.

### 3. Produce and inspect the exact Release archive

1. Add a documented Release archive/export path with explicit output and no
   developer-machine identifiers in tracked files.
2. Validate bundle metadata, icons, launch behavior, entitlements, embedded
   profiles/frameworks, architecture, version/build, privacy manifest, and the
   absence of DEBUG fixtures and launch hooks.
3. Install an exported distribution-equivalent build where Apple tooling
   permits and rerun the product-owned tests plus physical foreground/LAN/Files
   campaign before upload.

### 4. Prepare screenshots and accessibility evidence

1. Capture required current App Store device sizes from the exact candidate,
   using real product states and no private file names, addresses, accounts, or
   device identifiers.
2. Review light/dark appearance, larger Dynamic Type, VoiceOver order and
   speech, contrast, localization resilience, and iPad layout.
3. Keep competitor screenshots as feasibility context only; preserve the
   native 200 OK layout and branding.

### 5. TestFlight acceptance

1. Upload only after explicit authorization and successful archive validation.
2. Install the exact TestFlight build on a supported physical phone and rerun
   folder selection/bookmark, LAN Off/On, external HTTP, preview, stop/restart,
   background, and invalid-root recovery.
3. Record Apple processing warnings, beta review state, build identity, and
   remaining device/provider gaps without storing private account data.

### 6. Review and store-delivered proof

1. Submit only after explicit go-ahead with final review notes and support
   surfaces live.
2. Reconcile any review feedback without adding an unrelated background mode
   or broadening file access.
3. After publication, install the exact App Store build and repeat the external
   LAN and lifecycle acceptance matrix. Confirm the public listing, version,
   support/privacy links, and delivered bundle match the accepted candidate.
4. Update the iOS topic and top-level status claims only after this proof.

## Exit criteria

- App Store identity and metadata are complete and reviewed.
- A reproducible validated Release archive contains no DEBUG fixture, test
  hook, private signing selection, or unintended entitlement.
- Privacy declarations and review notes match observed app behavior.
- Required screenshot/device/accessibility surfaces are reviewed.
- The exact TestFlight build passes physical Files/LAN/lifecycle acceptance.
- Review is approved and the exact App Store-delivered build passes the same
  post-publication acceptance.
- README, vision, branding, and the iOS topic distinguish published evidence
  from source/TestFlight evidence at every intermediate state.

## Review gates

Pause for maintainer direction before reserving identifiers, accepting
agreements, creating distribution credentials, uploading a build, adding
testers, submitting for review, changing price/availability, or publishing.
Pause for product review if Apple policy feedback would require a capability,
entitlement, data flow, or runtime behavior outside the accepted iOS topic.
