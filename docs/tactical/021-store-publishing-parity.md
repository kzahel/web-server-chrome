# Store publishing parity with JSTorrent

Topic: store-publishing

Status: implementation and live qualification in progress, 2026-10-29.

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

Pending live qualification. Local publisher regressions cover provenance,
artifact tampering, transactional failure, idempotency, promotion, monotonic
rollouts, pinned plans, timezone windows, vitals hold/halt and Console drift.
