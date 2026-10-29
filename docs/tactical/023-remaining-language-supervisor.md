# Remaining-language overnight supervisor

Topic: localization

Status: complete, 2026-10-29. Localization queue, aggregate qualification and
all seven final hosted workflows passed. All seventeen remaining locales are
reviewed, qualified, committed and pushed, with nineteen ordinary app locales
including English/German. Started 13:14 UTC; the final locale completed about
19:35 UTC within the ten-hour bound. No model workers remain.

The maintainer requested an overnight supervisor/runbook like JSTorrent after
German device validation and release. The initial slice prepared the campaign;
the maintainer then explicitly authorized its full execution. Publication
authority remains separate.
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
| tr | qualified | [bound evidence](../../localization/qualification/tr.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| ja | qualified | [bound evidence](../../localization/qualification/ja.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| ko | qualified | [bound evidence](../../localization/qualification/ko.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| zh-CN | qualified | [bound evidence](../../localization/qualification/zh-CN.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |
| zh-TW | qualified | [bound evidence](../../localization/qualification/zh-TW.json); 510 resources; 12 actual translation/review sessions; API 28/35, native macOS, iOS and browser gates |

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

The thirteen-language cohort through Turkish
`65b9371634dfe585115cc430d0a7c6661f8d888e` passed all seven hosted workflows,
including [iOS CI](https://github.com/kzahel/web-server-chrome/actions/runs/40931799909).
Japanese then passed full local qualification and committed with its bound
receipt; Korean and the two Chinese variants form the final remaining queue.


## Final aggregate result

All seventeen targets completed, adding 8,670 resources (510 per locale) across
five surfaces. Each has twelve actual independent message author/reviewer
sessions with Sol/high/normal plus independently reviewed shared terminology.
Every current receipt binds the final corrected harness and unchanged reviewed
catalog/source/session inputs; no old receipt was stamped current.

The final aggregate audit verified all nineteen ordinary registrations on every
surface, no previews/pseudo locales, no missing/stale/conflicting/invalid/
unreviewed/terminology issues, all seventeen current native receipts and
sanitized public evidence hashes. Catalog/generation checks, all sixty Python
localization tests, TypeScript checks, workspace tests, lint, ordinary workspace
builds, HTTP/compatibility schema checks and final German/French production
browser regressions passed. Each new locale separately passed Android API
28/35, native macOS menus, iOS UI/unsigned Release, packaged extension and its
own production browser/System-probe gates.

The final locale cohort is `04d3a0b522d30d23f744997e5e9a88dd00bfd3b8`. Component
unreleased changelogs and maintained availability documents describe these
release inputs; no component version, tag, store upload, website/updater
promotion or physical-device/three-OS acceptance claim changed. Raw model,
emulator, browser and iOS evidence remains ignored for audit/resume.

Local macOS browser checks also observed a separate working-tree
`--use-mock-keychain` test-browser flag. That edit is preserved outside this
campaign's commits; it changes browser credential storage, not product code or
assertions. Hosted extension checks exercise the committed browser runner.

## Final hosted CI and cleanup

The complete nineteen-language source and release-input notes at
`01f8c5903668aa31c1b7d3260b464e08b094da17` passed every applicable workflow:

| Workflow | Result |
|---|---|
| CI | [passed](https://github.com/kzahel/web-server-chrome/actions/runs/40942109556) |
| Android CI | [passed](https://github.com/kzahel/web-server-chrome/actions/runs/40942110120) |
| iOS CI | [passed](https://github.com/kzahel/web-server-chrome/actions/runs/40942109468) |
| Extension CI | [passed](https://github.com/kzahel/web-server-chrome/actions/runs/40942109521) |
| Tauri App CI | [passed](https://github.com/kzahel/web-server-chrome/actions/runs/40942109524) |
| ChromeOS Linux CI | [passed](https://github.com/kzahel/web-server-chrome/actions/runs/40942109596) |
| CodeQL | [passed](https://github.com/kzahel/web-server-chrome/actions/runs/40942109003) |

The final locale cohort `04d3a0b522d30d23f744997e5e9a88dd00bfd3b8` also passed
all seven workflows. All seventeen locale commits are retained on `origin/main`.
Owned workers/qualification/browser processes, temporary Android AVDs and the
smoke emulator are gone; no simulators remain booted. No machine-control claims
were acquired by this campaign. The separate mock-keychain browser flag edit
remains uncommitted, with all campaign-owned changes committed and pushed.

Future work covers release/store/localized listings, iOS distribution, and
broader exact-artifact OS/device acceptance.
