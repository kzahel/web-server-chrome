# Android Play publishing

Topic: store-publishing

Status: All Files Access appeal **submitted 2026-11-01**, with a signed-release
Android 12 demonstration video. Updated English listing and permission declaration
were saved; Console confirms **3 changes sent for review**, including the
pre-existing authorized 0.2.4 full rollout. Review and appeal outcomes remain
pending. The rejected submission was reconciled as 0.2.4/code 9, submission 6.
No new binary was uploaded for this response. [Tactical 025](../tactical/025-android-storage-access-review.md)
owns this execution record; the runtime topic owns the retained feature decision.

The following track/operation evidence was last reconciled on 2026-10-30:
Android 0.2.5/code 10 is available on the internal track through successful
[publication 40953902148](https://github.com/kzahel/web-server-chrome/actions/runs/40953902148).
The physical Pixel updated through Google Play, retaining preferences and its
folder grant. French/Japanese external HTTP serving passed with identical bytes.
On 2026-10-30 the maintainer approved completing 0.2.4/code 9 and then staging
0.2.5/code 10 at 1%. Completion run 41012541457 was API-accepted; read-only
reconciliation 41013061441 reports code 9 completed. The immediate code 10 edit
was rejected at commit because Google already has changes in review. Console
independently shows 0.2.4 in review. Later on 2026-10-30 the maintainer
explicitly superseded the staged target with **0.2.5/code 10 at 100%**. Production check 41110868956 confirmed
code 9 completed and code 10 known to Play. Full-production submission
41110992191 passed candidate/provenance checks but Google rejected its commit
with `FAILED_PRECONDITION`: changes are still in review. Read-only
reconciliation 41111131415 confirms code 9 remains completed and code 10 known;
no code 10 production change was committed. The approved target
remains code 10 completed (100%); no further rollout-direction approval is
needed when review clears and exact candidate/track checks still match.
Preserve the review, reconcile before retrying, and retain all guards.
Scheduled advancement stays report-only. [Tactical 024](../tactical/024-nineteen-language-publication.md)
owns current evidence; Tactical 022 retains the German release and Tactical 021
infrastructure qualification. Private account identities stay in operational inventory.

## All Files Access review

**Accepted decision, 2026-11-01:** retain `MANAGE_EXTERNAL_STORAGE` and defend
in-place whole-storage serving as a core capability. The [runtime decision](android-runtime.md#storage-access-policy-evidence)
distinguishes ordinary selected-subfolder serving from complete internal
shared-storage, Downloads, and SD-card trees. Android 11+ SAF restrictions
prevent the latter grants; MediaStore does not supply equivalent arbitrary
non-media tree access. This is evidence for Google's eligibility assessment,
not a guarantee of approval. Do not claim backup, remote editing, protected
app-private access, or every file on the device.

The linked enforcement email and Console were inspected through Machine Control.
Console confirmed All Files Access Permission policy: **Access to device storage
not required**, with the previous version remaining available. Submission activity
identified the rejected October 29 submission as 0.2.4/code 9, rejected November 1.
The original technical declaration explained only activation (SAF by default and
a checkbox), rather than why narrower alternatives lose the complete-tree mode.
The old listing likewise omitted whole-storage serving.

The maintainer explicitly authorized the video, supporting changes and appeal.
The **incorrect decision** appeal was submitted November 1, 2026 at **12:57 PM
Console time**. Both the “Appeal submitted” result and “View submitted appeal”
receipt were independently read back. The 935-character explanation identifies
the blocked roots, root-level/new top-level content, non-media access, user
controls, and the published exception where alternatives substantially impair
core functionality. It links the unlisted 30-second review video. Google says
replies go to the account owner and may take up to seven days. No extra contacts
were added. Exact text, private account/issue identifiers and video URL remain
in ignored operational receipts, not public Git history.

The declaration now has a 422/500-character feature answer, a 493/500-character
technical answer and the new video URL; **Core functionality** remains selected.
Save success and exact field values were verified. English listing source is
maintained in [`android/play/store-listing/en-US`](../../android/play/store-listing/en-US/).
The 77-character short description and 2,323-character full description were
saved and read back before submission. Publishing overview confirms **Changes
in review / 3 changes sent for review**: both descriptions and the pre-existing,
previously authorized **0.2.4 Start full rollout**. The updated All Files
declaration appears under information to be considered in that review. No
new version, bundle, staged fraction, image asset, or privacy URL was introduced.
Managed publishing remains off; approval may publish the submitted changes.

The actually linked [privacy policy](https://graehlarts.com/privacy.html) was
updated and deployed from its owning website repository. It explains Android
permission scope, selected roots, read-only HTTP, network exposure, revocation,
protected private data, and no developer-operated file upload. **Android LAN
access defaults on**; serving starts explicitly and the user can disable LAN
before starting. An initial draft incorrectly said off and was corrected before
submission, including in the live policy. The separate Apple-oriented policy
page in this repository is not the Play-linked policy.

The uploaded video uses the signed, non-debuggable GitHub release APK for
0.2.4/code 9 from the rejected AAB's source. It shows Android 12's three blocked
picker selections, the real Settings grant, and external same-Wi-Fi downloads
from internal storage, Downloads and an SD-card file reached through `/storage`.
This is not a Play-delivered APK acceptance run. Anonymous video lookup verified
reviewer access. The current release's direct SD-root discovery limitation and
the separately tested source fix are explicit in Tactical 025.

Next: await the appeal/review response, then reconcile Console and the exact
track/candidate before another promotion. The approved eventual target remains
0.2.5/code 10 at 100%; no code 10 production submission was performed here.
Do not replace immutable 0.2.4/0.2.5 artifacts with the newly edited source.
If Google requests more evidence, reuse the exact-release receipts and answer
the concrete eligibility question. Permission removal requires a new explicit
product decision and persisted-root/boot migration planning. Google's
[policy](https://support.google.com/googleplay/android-developer/answer/10467955?hl=en)
and [declaration guidance](https://support.google.com/googleplay/android-developer/answer/9214102?hl=en)
remain the external eligibility contract.

## Release contract

Android tags build signed APK/AAB candidates after source and instrumentation
checks. They do not change Play. The existing signer, package, supported OS
range and asset names remain unchanged. Additive build.json binds the AAB
SHA-256 to its exact source, tag, version and successful build run; SHA256SUMS
covers the receipt too. Published candidate assets must never be replaced.
Android releases use latest=false so the existing desktop GitHub Latest/updater path is preserved.

Play publication is explicitly dispatched from main. Before Google auth, the
publisher requires a successful exact-source main CI run, a successful tag-push
Android CI run, a tag on main, matching tagged Gradle versions and matching
permanent GitHub release assets. Older candidates lacking a receipt remain
manual-only; this is an intentional fail-closed compatibility boundary.

Internal publication may upload. Production only promotes a bundle Play
already holds, comparing Play's SHA-256 with the same candidate. Credentials
are short-lived OIDC/WIF tokens, with separate app-scoped testing/production
service accounts and exact workflow/ref/environment restrictions. Build jobs
receive no Play credentials. Production changes require GitHub environment
review; halt has a separate main-only environment without review delay.

Each operation uses one edit, validates before commit, discards uncommitted
edits on failure, and never retries an ambiguous commit. ERROR_IF_IN_REVIEW
preserves an existing Google review. Downgrades, unrelated drafts, unfinished
rollouts and decreasing rollout fractions fail closed. See Google's
[edit commit contract](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit).
A successful submission is not a claim of approval or store availability.

## Staged rollout

`android/play-rollout.json` provides standard-7d: 1%, 5%, 20%, 50%, 100%, with
24/24/48/48 hours minimum dwell. An explicit promotion pins its steps in the
GitHub deployment ledger (`play-production`, task `play-release`). Later edits
to the plan file do not change an active rollout. No scheduled job starts a
rollout. Console drift pauses automation until explicitly reconciled.

The daily advancer defaults to report mode. Act mode makes at most one step
or halts a regression. Rates use user-weighted daily user-perceived crash/ANR
metrics, a minimum 200 user-days, absolute limits and comparison with the
previous production version. Reporting uses the API's daily Los Angeles
calendar/freshness, not a UTC approximation. JSTorrent's report-count fallback
is available when Play publishes no rates: it compares affected user-days
with the previous version scaled to rollout fraction. It is a weaker signal
than exposure-based rates and is identified in the receipt. Missing/stale
freshness holds. Keep report mode until the app's live evidence is reviewed.

## Operations and recovery

Follow `docs/runbooks/android-play-publishing.md`. Listing, declarations,
pricing, countries, tester membership and app review remain separate Console
concerns. Existing extension/controllers and store apps keep updating
independently under the compatibility corpus; no coordinated app update is
required by publishing infrastructure.

Every attempted CLI operation with a receipt path leaves a sanitized failure
receipt too. Mutating failures explicitly require reconciliation before retry;
an exception does not establish whether the store committed the change.
For an uncertain commit, inspect Play and the receipt before another dispatch.
If Play changed but ledger recording failed, record/acknowledge the exact
current rollout through the rollout workflow before scheduled advancement.
Do not rebuild, replace candidate assets, lower version codes or cancel an
in-review submission to make a retry succeed. Manual Console releases remain
supported; the advancer detects and pauses on divergence.
