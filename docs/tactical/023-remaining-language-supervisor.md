# Remaining-language overnight supervisor

Topic: localization

Status: execution active, 2026-10-29. Maintainer explicitly authorized the full
remaining-language run, commits/pushes and final green-CI verification. Started
13:14 UTC with the frozen plan, existing local ChatGPT login, and no prior live
worker owners. The bounded runbook applies; remote CI verification is explicitly
included by the latest maintainer instruction.

The maintainer requested an overnight supervisor/runbook like JSTorrent after
German device validation and release. This slice prepares the campaign without
silently launching all seventeen languages or granting it publication authority.
Continuing instructions live in the [overnight runbook](../runbooks/localization-overnight.md).

## Implementation

- Manifest: French first, then the same sixteen remaining JSTorrent target
  locales, across five product surfaces. 510 English resources per locale,
  8,670 remaining translations; shared glossary, explicit register, Android
  qualifiers/plurals and System-language probes.
- Planner/status/verify/handoff/record commands: frozen normalized English
  source/context and implementation, checked exact argv arrays, safe ignored
  state paths, bounded local ChatGPT workers and no model calls from the planner
  or CI. Existing translator/reviewer provenance and ownership rules remain.
- Qualification receipts bind source, target, ledger and harness inputs;
  complete ordinary registrations and all five runtime gates are required.
  Owned Android API 28/35 runs are serialized. The production browser harness
  tests System matching from profile probes, language switching, persistence,
  serving-state retention, layout and accessibility with its bundled browser.
- No store/version/tag/signing/website actions, arbitrary physical devices,
  global power changes, quota rerouting, fabricated review or unbounded retries.
  Ten-hour supervisor bound; disk/ownership checks and explicit resume handoff.

## Validation and execution ledger

Setup validation passes: fifteen campaign/orchestration regressions, all 59
localization Python tests plus deterministic catalog/generation checks, lint,
TypeScript checks, workspace unit tests and the real German built-browser
regression (System matching, popup/Crostini/desktop switching, persistence,
state retention, layout/Axe). The planner's real environment preflight,
plan/verify/status/handoff round trip reports 17 queued, zero qualified, and
zero workers started. An intentionally stale development plan was rejected;
its state was preserved separately before creating the current plan.

The full per-locale API 28/35/iOS/native sequence is a requirement for upcoming
execution; setup tests exercise its orchestration and failure/no-receipt paths.
No new locale's native runtime acceptance is inferred from setup or the German
browser regression. Explicit pseudo-browser qualification remains available,
while ordinary qualification rejects an ambient pseudo-build flag. No model workers, scheduler or publication were started by
this supervisor setup.

| Locale | State | Evidence/commit |
|---|---|---|
| fr | qualified | [bound evidence](../../localization/qualification/fr.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| es | qualified | [bound evidence](../../localization/qualification/es.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| it | queued | Preserve frozen jobs and manifest order |
| pt-BR | queued | Preserve frozen jobs and manifest order |
| nl | queued | Preserve frozen jobs and manifest order |
| sv | queued | Preserve frozen jobs and manifest order |
| da | queued | Preserve frozen jobs and manifest order |
| cs | queued | Preserve frozen jobs and manifest order |
| pl | queued | Preserve frozen jobs and manifest order |
| ro | queued | Preserve frozen jobs and manifest order |
| ru | queued | Preserve frozen jobs and manifest order |
| uk | queued | Preserve frozen jobs and manifest order |
| tr | queued | Preserve frozen jobs and manifest order |
| ja | queued | Preserve frozen jobs and manifest order |
| ko | queued | Preserve frozen jobs and manifest order |
| zh-CN | queued | Preserve frozen jobs and manifest order |
| zh-TW | queued | Preserve frozen jobs and manifest order |

Compatibility is additive and presentation-only. English/German and completed
locales remain available, independently released apps/extensions keep their
existing protocols and settings, and no lockstep store deployment is required.

## Early campaign correction: extension manifest bounds

Chrome's [manifest description contract](https://developer.chrome.com/docs/extensions/reference/manifest/description)
caps localized descriptions at 132 characters. The existing German catalog was
136; French's independently reviewed version is exactly 132. Translation import
and packaged locale validation now enforce description/name bounds, and worker
guidance states them. German is repaired through a fresh independent translation/
review job. Existing source strings, protocol/settings and published artifacts
are unchanged. The old frozen plan is preserved and explicitly reconciled for
these validator/prompt/harness changes; no completed runtime receipt is reused.

The first French qualification passed Android API 28/35, then exposed a Rust test that treated `fr-FR` as an unknown locale. The fixture
now uses reserved unknown `zz-ZZ`; French registration correctly resolves to
French. The frozen plan was explicitly reconciled for that test-only edit,
and the complete qualification is rerun before recording a receipt.

Shared terminology for all seventeen languages (187 concepts) was authored by
Sol/high/normal session `01a187cc-c910-7a42-859c-19a0b96c7e68` and independently
reviewed in `01a187ce-2a7c-7551-a021-95e87fa89535`. Per-locale terminology
review records retain exact candidate/final hashes and actual identities.
Sanitized qualification records bind all five source/catalog/review inputs,
actual message-session identities, harness/plan hashes and native/browser gates.
Raw jobs, worker logs and platform evidence remain ignored/private.
