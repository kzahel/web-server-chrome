# 020 — Localization foundation and German pilot

Status: **Complete — foundation and German source pilot qualified.**
Authorized October 29, 2026, including implementation,
validation, commits and push. No version tags, store submission or publication.

## Scope and stopping condition

Implement the first two steps of the accepted localization proposal: a reusable
AI translation pipeline and complete German app catalogs for desktop React,
desktop native menus/dialogs, extension popup and Crostini controls, Android,
and native iOS. Keep English the source and fallback. Establish the same target
set as JSTorrent: `de fr es it pt-BR nl sv da cs pl ro ru uk tr ja ko zh-CN zh-TW`.
Only English and the qualified German pilot become available in this slice.

Website routes, store listing translations/screenshots, the other seventeen
translations, legacy Chrome App, HTTP response bodies/directory listings and
developer/installer diagnostics remain subsequent work. Include localized
Crostini launcher metadata and user-facing native launcher messages.

## Implementation sequence

1. Establish a locale registry, terminology, platform-native English catalogs,
   deterministic generation, source-copy guards and pseudo-locale checks.
2. Adapt the MIT-licensed JSTorrent tooling at an explicitly recorded source
   revision. Separate shared snapshot/review logic from platform adapters and
   execution backends. No runtime dependency on the sibling checkout.
3. Provide status/check/generate/export/run/qualify entry points, incremental
   frozen batches, separate translation/review sessions, content-bound review
   provenance, safe idempotent resumption, bounded worker ownership and a single
   deterministic importer. Model execution is explicit; CI makes no model calls.
4. Extract React/extension copy, native menus/dialogs, SwiftUI/controller/errors,
   and permission descriptions. Preserve native Android XML and iOS catalogs;
   share terminology and workflow rather than flattening native formats.
5. Translate and independently review German using the pipeline, resolve all
   validation failures, and qualify built app surfaces before enabling German.
6. Update current topics/runbook, record checks and evidence limits, commit on
   the current branch and push without release tags.

## Invariants and compatibility

- Locale changes affect presentation only: preserve folder grants, server
  lifetime, running state, network bindings, settings and signing identities.
- Each component bundles its own catalogs and can update independently. No
  shared remote catalog, locale handshake or required update order is added.
- Keep existing protocol/status/error values stable. Localize known messages
  at the presentation boundary and retain unknown old/new diagnostics verbatim.
  Additive locale preferences must tolerate absent and unknown future values.
- Locale matching preserves Chinese script distinctions, Brazilian Portuguese,
  ordered system preferences and an English fallback. Pseudo-locales are test
  inputs, never advertised release languages.
- Protect URLs, paths, ports, user names and `200 OK`; use whole sentences,
  locale-appropriate plurals and escaped interpolation.
- Frozen exports bind source/context/placeholder/terminology and current target
  hashes. Imports reject stale or externally edited work and require distinct
  translator/reviewer session identities. No manufactured review attestations.
- Work sessions, prompts and outputs stay ignored. Bounds, locks, interruption
  cleanup and exact resumption are tested. No unconditional retry loop.

## Validation

Run offline pipeline regressions (stale work, placeholders/plurals, independent
review, atomic writes/resume/locks), locale matching and extraction guards,
generated drift and package checks. Run canonical TypeScript, extension browser,
desktop Rust/Crostini, Android and iOS gates appropriate to touched code.
Exercise German in actual production browser assets, native menus and native
mobile tests; test narrow layouts, accessible names, English fallback, regional
matching and preserved running/configuration state. Use owned test browsers and
simulators/emulators, and reap owned processes. Record unavailable signed,
physical-device, Windows/Linux runtime or store-delivery evidence explicitly.

## Execution record

- Initial source audit: Android has 182 English strings and two plural
  resources, RTL support and pseudo-locales. Other app UI needs extraction.
- JSTorrent has nineteen release-input locales on React/native desktop/Android;
  its existing AI runner has no iOS adapter. The iOS adapter is part of this work.


### Completed implementation

- One nineteen-locale target registry, with only English/German in app release
  inputs. Native formats remain native: ICU descriptors/compiled AST, desktop
  JSON, Chrome metadata catalogs, Android XML/plurals and Apple string catalogs.
- Source-aware export/check/import, backend-independent worker plumbing, local
  CLI translation and independent review, kernel-owned import/worker locks,
  bounded cancellation and exact resumption. Working state stays ignored.
  The tested local CLI is 0.160.0; translation used explicit Sol 6.1/high,
  normal speed and workspace-write/no-prompts permissions.
- German has 610 reviewed resources: 255 React, 21 native desktop/launcher,
  three extension metadata, 180 Android and 51 Apple entries. Every pending
  category is zero. Four completed React batches resumed with exact validated
  imports and no new model sessions. No copied translation/review evidence.
- Native desktop preferences and menus stay synchronized. Extension preferences
  are local to its popup/controller. Android retains the running application
  controller across activity recreation and localizes notifications, channels
  and non-Activity contexts before API 33. iOS uses native app-language selection.
- Pseudo catalogs are test-build only. Narrow-layout qualification found and
  fixed popup box sizing, Crostini grid intrinsic-width overflow, clipped
  explanations, keyboard-inaccessible command scrolling and low-contrast labels.
  Shell commands wrap visually without changing their copied text.
- CI and native source gates check reviewed catalogs; package validation checks
  the exact registered extension locale set while continuing to understand old
  English-only manifests. No shared protocol values or HTTP response bodies
  changed; old/current/additive-future compatibility fixtures remain intact.

### Final validation and limits

| Gate | Result / evidence |
|---|---|
| `pnpm i18n:check` | Passed: source/registration/provenance/generation checks and 44 offline workflow regressions |
| `pnpm typecheck`, `pnpm test`, `pnpm check`, `pnpm build` | Passed; 77 TypeScript tests across the locale runtime, extension and desktop |
| Shared HTTP/compatibility fixture validators | Passed all six Node contract checks; native adapters also run in their source gates |
| `desktop/scripts/check.sh` | Passed release-validator, formatting, strict shared-crate Clippy/tests and desktop library tests |
| `desktop/crostini/scripts/check.sh` | Passed Rust/controller, signed-manifest and bootstrap-installer gates |
| Linux Crostini `cargo check --locked --target aarch64-unknown-linux-musl` | Passed including X11 launcher and Latin glyph handling; compile evidence only |
| Real macOS native menu smoke | Passed production application/tray menu construction, German/English live switching and isolated preference persistence; owned app state removed |
| Production frontend browser harness | German, expanded `en-XA`, mirrored `ar-XB` all passed across popup, Crostini and desktop; 18 checks total, with no server mutation during language changes |
| Packaged extension browser smoke | English and German passed with the inspected store-safe ZIP, strict default CSP and Google Chrome for Testing; owned browsers/profiles removed |
| `android/scripts/check.sh` | Passed Debug assembly, JVM tests and lint |
| Owned Android API 28 / API 35 instrumentation | Passed the complete suites on each; translated context, app-open-only server survival across locale recreation and a real HTTP file fetch passed; each temporary emulator/AVD removed |
| `ios/scripts/check.sh` | Passed English and target-language UI/unit tests, bookmark persistence, unsigned simulator/device Release builds, privacy/signing hygiene and generated project checks |

Ignored local reports and screenshots live under `.local/localization/`; actual
translation/reviewer identities and hashes are committed in the per-surface
review ledgers. Production frontend reports identify their deterministic
native/controller fixtures and built-asset hashes. Native HTTP/source gates,
real extension packaging and the real macOS menus supply separate evidence.

No Windows/Linux installed-product run, signed distributed-artifact campaign,
physical phone/Chromebook language check, store submission or publication is
claimed. Existing desktop production acceptance gaps remain with Tactical 015;
iOS store work remains with 017. There is no required component rollout order
and no new legacy-support removal deadline. French and the remaining sixteen
translations are the next campaign; website/store surfaces remain later work.
