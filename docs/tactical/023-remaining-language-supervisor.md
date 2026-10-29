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
| it | qualified | [bound evidence](../../localization/qualification/it.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| pt-BR | qualified | [bound evidence](../../localization/qualification/pt-BR.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| nl | qualified | [bound evidence](../../localization/qualification/nl.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| sv | qualified | [bound evidence](../../localization/qualification/sv.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| da | qualified | [bound evidence](../../localization/qualification/da.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| cs | qualified | [bound evidence](../../localization/qualification/cs.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| pl | qualified | [bound evidence](../../localization/qualification/pl.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| ro | qualified | [bound evidence](../../localization/qualification/ro.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| ru | qualified | [bound evidence](../../localization/qualification/ru.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| uk | qualified | [bound evidence](../../localization/qualification/uk.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
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


## Hosted iOS state-wait correction

The Danish cohort's hosted iOS run failed the translated serving test after a
start tap: the status was still German “Gestoppt” when the immediate assertion
expected “Läuft”. The archived xcresult identifies this assertion; forty other
configuration/test executions passed. Local qualification had passed, exposing
a timing-dependent test race on the hosted runner. UI assertions now wait up to
ten seconds for the expected status predicate before continuing, including the
existing English lifecycle tests. There is no fixed sleep or runtime behavior
change.

The queue was stopped after Czech's initial full qualification, with no model
workers or native run interrupted. Only the UI test's frozen fingerprint was
explicitly reconciled; English/context, terminology, catalog jobs and worker
settings remain unchanged. Old plans/results are preserved privately. Every
previously completed locale must pass a fresh **full** qualification before its
completion/evidence is recorded against the revised harness; Czech will also
qualify again before its first commit. Hosted CI must pass the corrected source
before this correction is considered closed.

All seven prior locales (French, Spanish, Italian, Brazilian Portuguese, Dutch,
Swedish and Danish) passed fresh full qualification on 2026-10-29 against the
corrected harness. Their current tracked receipts retain the same reviewed
translation/session inputs and new actual native/browser run hashes. The
remaining queue resumes from Czech, with its initial review outputs preserved.

The corrected source commit `61741bd80e20c4cc57d00eb7e49093c1c635431e` passed
[hosted iOS CI](https://github.com/kzahel/web-server-chrome/actions/runs/40910200301),
main CI and CodeQL. This closes the synchronization correction; no retry of the
known-racing source is used as acceptance.


## Hosted iOS switch-input follow-up

The Romanian cohort's hosted iOS result failed the English background lifecycle
test while waiting for its initial Running state; the translated serving test
passed. The retained event record places a center tap at the server switch, but
the recording and accessibility snapshots keep its value at `0`, status Stopped,
valid fixture selected, and no error or background-stop message. Waiting for the
label alone therefore did not resolve the missed-input case.

The UI driver now waits for an existing, enabled, hittable server switch and
taps its visible thumb once, using its current value to select the thumb side.
It preserves the bounded status assertions and never retries a toggle, skips a
test, changes app behavior, or relaxes lifecycle acceptance. The same input
helper is used by translated serving and existing lifecycle/recovery tests.

Russian completed its full local qualification and commit before the queue was
stopped. Ukrainian web workers were stopped and joined through their owner,
leaving frozen jobs and cancelled state for exact resume. Only the UI test
fingerprint was explicitly reconciled again; old plans/results remain private.
All eleven completed locales require fresh full qualification against this
input correction before current completion records are accepted. Hosted CI of
the corrected source is required as well.

French passed the complete five-surface qualification with the revised input
helper before this test-only correction was committed. The remaining ten prior
locales are being requalified serially; their old records keep their original
hashes until actual new native/browser runs finish. Hosted verification of the
correction runs alongside this bounded local refresh.

The input-driver correction commit
`69fd5527d63a86eb16c3b1e5776e8d9470423fb0` passed all seven applicable hosted
workflows, including [iOS CI](https://github.com/kzahel/web-server-chrome/actions/runs/40921097045)
and [Android CI](https://github.com/kzahel/web-server-chrome/actions/runs/40921096616).
Their first attempts failed before tests (missing hosted iOS simulator; corrupt
Android emulator SDK download); each failed job was rerun once on a fresh
runner and passed. Source and assertions were unchanged for those retries.

All eleven completed locales passed fresh full five-surface qualification
against the input-driver correction: French, Spanish, Italian, Brazilian
Portuguese, Dutch, Swedish, Danish, Czech, Polish, Romanian and Russian. Current
completion records and tracked receipts bind the revised harness and new actual
native/browser runs; reviewed catalogs and session identities are unchanged.
Ukrainian resumes from its preserved frozen jobs, followed by the final five
locales.
