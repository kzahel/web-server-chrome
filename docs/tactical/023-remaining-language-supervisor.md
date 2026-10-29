# Remaining-language overnight supervisor

Topic: localization

Status: setup implemented, 2026-10-29; the translation campaign has not started.

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

Setup validation passes: fourteen campaign/orchestration regressions, all 58
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
browser regression. No model workers, scheduler or publication were started by
this supervisor setup.

| Locale | State | Evidence/commit |
|---|---|---|
| fr | queued | French canary is the first supervised execution step |
| es, it, pt-BR, nl, sv, da, cs, pl, ro, ru, uk, tr, ja, ko, zh-CN, zh-TW | queued | Follow manifest order after French qualifies |

Compatibility is additive and presentation-only. English/German and completed
locales remain available, independently released apps/extensions keep their
existing protocols and settings, and no lockstep store deployment is required.
