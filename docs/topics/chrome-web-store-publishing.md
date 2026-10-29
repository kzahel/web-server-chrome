# Chrome Web Store publishing

Topic: chrome-web-store-publishing

Status: tag-driven submission and main-only upload staging configured. On
2026-10-29, [release run 40952771672](https://github.com/kzahel/web-server-chrome/actions/runs/40952771672)
submitted the exact browser-accepted nineteen-language 0.1.10 ZIP with keyless
CI authentication. Independent status run 40953185911 confirmed **0.1.10
PENDING_REVIEW / public 0.1.8**. This strictly newer candidate replaced pending
0.1.9 through the maintained cancellation contract. [Tactical 024](../tactical/024-nineteen-language-publication.md)
owns current publication evidence; Tactical 021 records initial staging.

The existing production extension is `lpkjdhnmgkhaabhimpdinmdgejoaejic`.
`extension/fullpubkey.txt` is its public identity; the publisher verifies the
API's key before any write. The separate legacy app remains outside this lane.
Account and cloud identifiers live in the maintainer's private operational
inventory, not in this public repository.

## Observable release contract

`.github/workflows/extension-ci.yml` runs source/package checks and a real
browser check before submitting a tag `extension-v<version>`. The browser
check extracts the same immutable CI artifact later consumed by the publisher;
neither publication nor the GitHub release rebuilds it. The package's version
must match the tag. `build.json` binds the ZIP checksum, source revision,
clean-tree declaration, version and extension ID. The publishing job checks
all of them and requires a tagged commit on main.

The publisher gets a short-lived Chrome Web Store token through GitHub OIDC
and service-account impersonation. It has no stored key or refresh token.
Publishing jobs are serialized. A rerun recognizes an already-published or
pending identical version. An older/equal candidate cannot replace a newer
submission. Only a strictly newer verified candidate can cancel an older
pending/staged candidate, wait for cancellation and submit its replacement.
Cancellation errors, changed submissions, newer publications and processing
failures stop before upload/submission as appropriate. If upload fails after
cancellation, the previous public version remains available; repair and rerun
the failed job rather than issuing another tag.

Submission always uses Google review, automatic publication after approval,
and warning blocking. Successful CI/GitHub release means the candidate was
submitted; Google approval, rollout and installed-copy acceptance remain
separate observations. The GitHub release attaches the exact ZIP, SHA-256,
build record and submission receipt. Listing/privacy/test-instruction changes
still require the developer dashboard before tagging.

The existing extension/controller/native-host compatibility contract is
unchanged; components still update independently. Follow
[`chromeos-extension-launcher.md`](chromeos-extension-launcher.md) and its
store-delivered acceptance gates before claiming a functional rollout.

## One-time setup and read-only verification

Enable the Chrome Web Store API, link the publisher service account in the
developer dashboard, and configure a GitHub `chrome-web-store` environment.
Its non-secret variables are `CWS_WIF_PROVIDER`, `CWS_SERVICE_ACCOUNT` and
`CWS_PUBLISHER_ID`. The workload provider and service-account grant must match
this repository's immutable repo/owner IDs, exact environment subject,
workflow path/ref and main/release-tag constraints. Environment deployment
policies allow main and `extension-v*` only. Use a dedicated provider; do not
widen another repository's condition.

```sh
gh workflow run extension-ci.yml --ref main -f mode=check
```

This main-only mode skips packaging, browser tests, submission and release. It
reads status, verifies the production item/key and retains the sanitized
`chrome-web-store-status` receipt. `mode=package` builds and checks a candidate
without submitting. `mode=stage` on main builds and browser-tests the same
ZIP, then uploads without submitting for review. Staging refuses an active
submission before any write, so listing work cannot cancel a review. All
workflow actions are pinned by commit. To prepare a new candidate without
creating a submission-triggering tag, add its changelog entry and run
`scripts/release-extension.sh VERSION --stage` from clean main. Push main,
then dispatch mode=stage. The receipt records the exact source commit and ZIP
checksum. After inspecting that candidate, an intentional extension-vVERSION
tag on the recorded source commit requests review through the ordinary lane;
do not rerun the version bump against the already prepared version. Tags use the release lane.

For local diagnostics, `extension/scripts/publish-store.mjs check . receipt.json`
accepts `CWS_ACCESS_TOKEN` and `CWS_PUBLISHER_ID` in the environment. Obtain a
short-lived token through [Google's documented CLI impersonation](https://developer.chrome.com/docs/webstore/service-accounts).
Never commit a token or key. Concrete local login and cross-project audit
procedures belong in the private dotfiles CWS runbook when available.

## Verification

`extension/scripts/check.sh` includes the publisher's artifact-integrity and
review/cancellation race tests (about 0.1 seconds), alongside the existing
typecheck, UI tests and package audit. `extension/scripts/browser-check.sh`
accepts `OK200_EXTENSION_ZIP` to inspect/load an existing candidate. Locally
set `CHROME_BIN` to a separately identified test browser; never use the user's
primary installed browser with a temporary profile.

Execution/configuration evidence is recorded in
[Tactical 019](../tactical/019-chrome-web-store-ci-publishing.md).
