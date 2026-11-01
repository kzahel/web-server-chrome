# Android storage access review

Topic: store-publishing

Status: authorized response executed **2026-11-01**; appeal and publication
review pending Google. Runtime/source improvements are validated and await a
future binary release. Continuing truth belongs to the
[Android runtime](../topics/android-runtime.md#storage-access-policy-evidence)
and [Play publishing](../topics/android-play-publishing.md#all-files-access-review)
topics.

## Decision and scope

The maintainer explicitly retained whole-storage HTTP serving as core and
authorized the recommendations, video upload, supporting copy and appeal
submission. SAF is useful for ordinary subfolders but cannot provide equivalent
complete internal-storage, Downloads and reliable SD-card roots on Android 11+.
The argument concerns missing capability, not just convenience or performance.
Google still decides policy eligibility. Permission removal was not authorized
as the default response.

The linked email and Console were inspected through the common Machine Control
CLI in the existing signed-in browser. Console reconciled rejected submission
6 to **0.2.4/code 9**, submitted October 29 and rejected November 1. Existing
0.2.4 full-rollout work was already pending; 0.2.5/code 10 remained internal,
with previously authorized eventual 100% production promotion blocked by review.

## Exact-release evidence

The Moto X4 has Android 9 and cannot prove Android 11 restrictions. A Moto G
Power (2022), Android 12/API 31, with removable storage supplied the modern
comparison. Private device/card selectors remain outside Git.

The immutable signed GitHub `android-v0.2.4` APK is non-debuggable and verifies
against the checked-in upload certificate. Source is
`99b0dd25b2b991d552f8e4e9d8c3602d49c4f10f`, build run
[40860447200](https://github.com/kzahel/web-server-chrome/actions/runs/40860447200).
APK SHA-256:
`b94ec092bfac8797cd5b81379deb89b03459387ce5351cfe4a1b7a1baa4a0380`.
AAB SHA-256:
`1b4d799e329a6a4537bda320a7e92b0e17b2f7c536306ce0fd7bed8ef0726bfe`.
This is the rejected bundle's source/version, not a Play-delivered APK claim.

Normal UI showed the disabled selection of primary shared-storage root,
Downloads itself and the removable-card root. The real Settings switch granted
All Files Access; no debug RPC or app-op grant was used for the final video.
External Mac requests over Wi-Fi fetched the same owned 70-byte non-media
fixture from primary root, Downloads root and SD-card content through selected
`/storage`. All returned HTTP 200 and SHA-256
`faa653138133bf07b72e548f0f325b8f497aa3f15b5a53fa8d71be4544a309e9`.
The release cannot discover the card directly on this Moto when parent directory
listing is denied. The video accurately labels its `/storage` route; direct-card
selection is a separate source fix below.

A 30-second, 1920×1080 captioned video combines these real captures and HTTP
results. Timing is edited; the actual Settings sequence is shown at 2×.
Unrelated file names, addresses and card identifiers were redacted, then key
frames and the contact sheet were visually reviewed. The unlisted YouTube
publication succeeded and anonymous oEmbed lookup returned the exact title.
Video SHA-256:
`fdd086e5802516f3202dab1195cd80c5646b7f504e91e9acf741da8fc7369b9e`.
The video URL, capture inputs and private receipts stay under ignored
`.local/play-storage-review/2026-11-01/`; they are not public Git artifacts.

## Copy and submissions completed

- Saved and verified the 422-character feature explanation, 493-character
  technical explanation and new video in the All Files declaration. Core
  functionality remains the sole declared purpose.
- Saved the English short/full listing descriptions from
  [`android/play/store-listing/en-US`](../../android/play/store-listing/en-US/),
  explaining complete-tree serving, permission alternatives, read-only limits,
  explicit sharing and actual network defaults. Existing image assets stayed
  unchanged.
- Deployed the actually Play-linked `graehlarts.com/privacy.html` policy from
  its owning repository. Final deployment commit
  `fbae29baae45534037911204662da7ae17100963` was built by GitHub Pages and
  independently fetched live. An initial incorrect LAN-default sentence was
  corrected; Android defaults LAN on, while sharing starts explicitly.
- Submitted the **incorrect decision** appeal. Console's receipt reads
  **Nov 1, 2026, 12:57 PM**. Exact 935-character text and video link were
  verified before submission and again in “View submitted appeal”. Account
  owner receives the response; no extra contacts were added. Google estimates
  up to seven days.
- Publishing overview subsequently confirmed **3 changes sent for review** and
  **Changes in review**: English short/full descriptions plus the pre-existing,
  previously authorized **0.2.4 Start full rollout**. The updated All Files
  declaration is listed as accompanying review information. Managed publishing
  remains off. Approval/public availability is not yet established.

No new binary, tag, version code or 0.2.5 production promotion was created.
Existing immutable candidates and fail-closed publication guards remain intact.

## Source improvements and validation

The main screen now exposes **Storage / SD card** beside ordinary folder
selection and routes missing permission to Android Settings. Advanced explains
which complete-root mode requires the permission. The filesystem picker uses
SDK-guarded mounted `StorageManager` volumes to discover readable removable
cards even when `/storage` cannot be listed. Broad-root warnings cover canonical
removable-volume roots. Filesystem authority and read-only HTTP checks remain
enforced by the existing controller and tree implementations.

Three changed strings were independently translated/reviewed for all eighteen
shipping non-English locales using the established provenance workflow.
Validation completed:

- `android/scripts/check.sh`: Debug build, JVM tests, lint and catalog gates pass.
- Owned localization/integration harness: all seven instrumentation tests pass
  on API 35/German and API 28/Japanese, including persisted-settings compatibility.
- Native localization validator passes all nineteen catalogs/review ledgers.
- Physical source Debug run on Android 12: action visible without broad grant,
  real permission Settings flow, OS-labeled card shortcut, broad-root disclosure,
  direct SD-root selection and same-Wi-Fi HTTP 200 with expected bytes.
- `git diff --check` passes.

Source Debug evidence is not attributed to the submitted signed-release video.
No protocol, persisted setting, root encoding, grant or update-feed schema was
changed. Old/new independently released components keep existing overlap; no
ordered rollout or legacy removal is required. API 30+ volume calls are guarded;
older-device fallback and compatibility fixtures passed on API 28.

## Cleanup and remaining work

Stopped the physical server, removed the task-installed app (absent initially),
deleted only the three owned fixture files, restored original rotation settings,
and removed owned remote captures/XML. Owned emulator and recorder processes
were reaped. No unrelated attached device was modified.

Await Google's appeal and review decisions, then reconcile exact Console and
track state before retrying the already authorized code 10 production target.
A future binary release must use a new version/tag for the source improvements;
do not replace an immutable candidate. A request to remove the permission would
need a new decision and explicit saved-root/boot migration design.
