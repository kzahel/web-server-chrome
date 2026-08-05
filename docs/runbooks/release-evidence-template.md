# Release Evidence Template

Copy this short ledger into the owning tactical/topic or a release record. Do
not mark a testbed as passed when it was skipped or not available.

## Candidate

| Field | Value |
|---|---|
| Component / version | |
| Tag / full commit | |
| Compatibility corpus | |
| Change risk | Network / lifecycle / storage / installer-updater / protocol / OS boundary / other |

## Automated evidence

| Gate | Result | Run URL or local command |
|---|---|---|
| Canonical source gate | Pass / fail | |
| Hosted integration gate | Pass / fail / not applicable | |
| Exact artifact inspection | Pass / fail / pending / not applicable | |

| Artifact filename | SHA-256 | Identity/signature result |
|---|---|---|
| | | |

## Suggested testbed evidence

| Environment and exact candidate | Status | Evidence or skip reason | Remaining claim limit |
|---|---|---|---|
| | Passed / failed / skipped / untested | | |

For an urgent fix, name the automated regression that justifies the shortened
campaign and the deferred high-risk check, if any. A skip never becomes a pass:
state which physical, store-delivered, LAN, package, or OS claim remains open.
