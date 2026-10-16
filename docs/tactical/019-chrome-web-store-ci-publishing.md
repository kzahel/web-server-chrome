# 019 — Chrome Web Store CI publishing

Status: implemented locally; cloud configuration and hosted verification pending.
Owning topic: [Chrome Web Store publishing](../topics/chrome-web-store-publishing.md).

## Objective and scope

The maintainer requested a shared private extension inventory and working CI
publishing for YepAnywhere, Machine Control, JSTorrent and Web Server. This
repository already built store-safe packages and GitHub releases but required
manual Web Store uploads. Add automatic submission through the same keyless
Google pattern used by the other repositories, without publishing a new version
or changing extension behavior, permissions or compatibility.

## Completion conditions

- Source/package checks and browser smoke accept the exact immutable upload ZIP.
- Tag publication validates clean-source/checksum/item identity, safely handles
  review replacement/reruns and retains a receipt.
- Main-only read-only authentication succeeds against the linked production
  item after private Google/GitHub configuration.
- Current release guidance identifies asynchronous review and dashboard-only work.

## Ordered work and evidence

### 1 — bind publication to the accepted package

Build one candidate with a source/checksum record, transfer it to browser smoke,
then download that same artifact into the publisher and GitHub release jobs.
The publisher is adapted from Yep Anywhere's same-author MIT implementation;
its state-transition and integrity tests are retained because cancellation,
concurrent approval and retry ordering are consequential release boundaries.

### 2 — configure and verify keyless access

Use a dedicated repository-bound WIF provider and environment variables in the
private deployment inventory. Run `mode=check`; do not issue an extension tag.
Record its workflow URL and source revision after it succeeds. A live submission
will only be exercised on the next separately authorized release.

### 3 — document and validate the release path

Local checks: publisher race/integrity tests, extension typecheck/UI tests,
store-package validation, exact-ZIP browser smoke, touched-file formatting and
workflow actionlint. Record final results below. This is release tooling; it
does not change input/navigation paths or require new sequential-typing tests.

Local validation passed on 2026-10-16: extension typecheck and 58 UI/logic
tests; eight publisher race/integrity tests (0.05 s); strict package validation;
source-built and prebuilt exact-ZIP browser smoke in separately identified
Playwright Chrome for Testing 154; actionlint, shell syntax and touched-file
Biome checks. No extension runtime files changed and no release tag was made.

The first hosted run exposed the existing package helper resolving a relative
output after changing into temporary staging. Resolve the output at entry so
the CI working-directory-relative invocation creates the requested artifact.
The failed run did not reach publication; rerun hosted acceptance after repair.

The next hosted run passed package/browser assertions but failed removing the
temporary profile while Chromium helpers finished writing. Teardown now waits
for closed browser stdio and retries transient directory-removal races. This
changes cleanup only, not an assertion or test time budget.
