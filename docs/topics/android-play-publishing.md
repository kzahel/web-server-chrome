# Android Play publishing

Topic: store-publishing

Status: implemented/configured and qualified end to end (2026-10-29).
Android 0.2.5/code 10 is available on the internal track through successful
[publication 40953902148](https://github.com/kzahel/web-server-chrome/actions/runs/40953902148).
The physical Pixel updated through Google Play, retaining preferences and its
folder grant. French/Japanese external HTTP serving passed with identical bytes.
Production check 40952129707 still reports 0.2.4/code 9 at 1%, with the previous
completed baseline 0.2.1/code 6. The unfinished-rollout guard remains enabled;
the maintainer's choice to finish that rollout or retain the new internal build
is pending. Advancement stays report-only. [Tactical 024](../tactical/024-nineteen-language-publication.md)
owns current evidence; Tactical 022 retains the German release and Tactical 021
infrastructure qualification. Private account identities stay in operational inventory.

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
