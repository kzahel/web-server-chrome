# Android Play publication and rollout

The [topic](../topics/android-play-publishing.md) owns the release contract;
[Tactical 021](../tactical/021-store-publishing-parity.md) owns qualification.
All publishing workflows run from main. They consume permanent, verified
GitHub release assets; they never rebuild or re-sign. Use an Android tag built
by the receipt-aware release lane. Older releases deliberately fail verification.

## Verify setup without a candidate

```sh
gh workflow run android-play-publish.yml --ref main -f track=internal -f status=check
gh workflow run android-play-publish.yml --ref main -f track=production -f status=check
```

Omitting the tag is allowed only for check. This reads the selected track and
all three Reporting metric-set metadata endpoints, then discards the temporary
edit. It does not upload a bundle or commit a store change. Production still
uses its normal GitHub environment review.

## Build and internal release

Prepare the changelog, then run `scripts/release-android.sh VERSION` on clean
main and atomically push main and the local tag. Wait for main CI and tag
Android CI to succeed. The tag only publishes the GitHub candidate.

```sh
gh workflow run android-play-publish.yml --ref main \
  -f tag=android-vVERSION -f track=internal -f status=check
gh workflow run android-play-publish.yml --ref main \
  -f tag=android-vVERSION -f track=internal -f status=completed
```

Check the publication JSON artifact and Play Console independently. Internal
availability and an actual tester installation are distinct evidence. Check
that the internal track is active and its intended tester lists are selected:
a completed API release does not resume a paused track. Track/tester setup
stays Console-owned; the publishing service account deliberately cannot
manage tester lists. Optional
localized notes live in `android/play/release-notes/android-vVERSION.json`, a
language-to-text object. Each language is limited to 500 characters. English
must match the verified tag changelog or explicit dispatch notes. For a long
changelog supply `-f release_notes='Short release notes'`.

## Production promotion

Verify the internal candidate and cross-version acceptance first. Request a
production check, then an explicitly approved staged promotion of the same
bundle; production refuses a fresh upload.

```sh
gh workflow run android-play-publish.yml --ref main \
  -f tag=android-vVERSION -f track=production -f status=check
gh workflow run android-play-publish.yml --ref main \
  -f tag=android-vVERSION -f track=production -f status=inProgress \
  -f fraction=0.01 -f plan=standard-7d
```

Approve the GitHub production environment after reviewing the exact candidate.
`draft` saves a draft; `completed` explicitly releases to the whole selected
track. These are deliberate choices, never implicit fallbacks. Google review
and managed-publishing settings can delay availability after API submission.

## Operate a rollout

```sh
gh workflow run android-play-rollout.yml --ref main \
  -f tag=android-vVERSION -f action=halt
gh workflow run android-play-rollout.yml --ref main \
  -f tag=android-vVERSION -f action=resume
gh workflow run android-play-rollout.yml --ref main \
  -f tag=android-vVERSION -f action=set -f fraction=0.2
gh workflow run android-play-rollout.yml --ref main \
  -f tag=android-vVERSION -f action=complete
gh workflow run android-play-advance.yml --ref main -f mode=report
```

Halt skips production review so stopping a bad rollout is immediate. Other
manual changes require it. Fractions only increase. The schedule reads
`ANDROID_PLAY_ADVANCE_MODE` from `android-play-rollout`, defaulting to report.
Set it to act only after reviewing live vitals and the approved rollout plan;
explicit dispatch also supports act. Both modes preserve an active Console
review, detect drift, and never start a rollout. A halt/mismatch exits nonzero
for GitHub notification; hold is a successful no-op with reasons.

## One-time setup

Enable Android Publisher, Play Developer Reporting, IAM Credentials and STS.
Create dedicated testing/production service accounts without keys or broad
project roles. Play Console permissions apply only to 200 OK: view app
information and release to testing for testing; view information/app quality
and release to production for production (including Google's implied grants).
No financial, user-management or other-app access.

Create a dedicated WIF provider restricted by immutable GitHub repository and
owner IDs, main ref, exact workflow references, allowed event types and exact
environment subjects. Do not change the repository OIDC subject template
without updating the existing Web Store trust too. Bind testing only to
android-play-internal; production to android-play-production, android-play-halt
and android-play-rollout. Use main-only deployment policies on all four.
Require production review; leave halt independent. Set the environment
variables ANDROID_PLAY_WIF_PROVIDER and ANDROID_PLAY_SERVICE_ACCOUNT, and
ANDROID_PLAY_ADVANCE_MODE=report on the rollout environment. Never store a
Google JSON key. Keep concrete identities in private operational inventory.
