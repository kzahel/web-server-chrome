# Localization workflow

English is the source and fallback. `localization/locales.json` owns the target
languages and per-surface availability. All nineteen locales are qualified app
release inputs: `en de fr es it pt-BR nl sv da cs pl ro ru uk tr ja ko zh-CN zh-TW`.
The [completed campaign record](../docs/tactical/023-remaining-language-supervisor.md)
links the seventeen new content/harness-bound qualification receipts. Store
publication remains separate. No catalog is fetched from a service at runtime.

## Everyday commands

```bash
source ~/.profile
pnpm install --frozen-lockfile
pnpm i18n:status
pnpm i18n:generate
pnpm i18n:check
```

Status separates availability from missing, stale, conflicting, invalid,
unreviewed and terminology-affected resources. The checker rejects unreviewed
shipping catalogs, missing runtime counterparts, pseudo-locale registration,
hardcoded JSX copy and generated drift. Native source gates also check their
catalogs with Python alone. CI never calls a model.

## Catalog ownership

| Surface | Authored runtime source | Generated output |
|---|---|---|
| Desktop and extension React | `localization/catalogs/web/{locale}.json` ICU descriptors | `packages/i18n/src/generated.ts`, precompiled ICU AST |
| Desktop menus/dialogs and Crostini launcher | `localization/catalogs/desktop/{locale}.json`, English context in `en.comments.json` | Rust catalog table and localized Linux launcher fields |
| Extension manifest | `localization/catalogs/extension/{locale}.json` | Chrome `_locales/<tag>/messages.json` |
| Android | `android/app/src/main/res/values*/strings.xml` | App language list and resource-filter input |
| iOS | `ios/200OK/Resources/{Localizable,InfoPlist}.xcstrings` | Generated project language list and Xcode's native resources |

Add whole messages with meaningful context, named arguments and ICU plural/select
branches where needed. Do not concatenate grammatical sentence fragments. Keep
product names, shell commands, URLs, paths, ports and protocol identifiers intact.
Translate display labels, never wire enums, HTTP content or user filenames.

Apple messages currently use plain string units and native printf placeholders.
The adapter rejects unsupported plural/device variations explicitly; extend it
with round-trip tests when the first such product message is introduced. It
must never flatten or discard a native variation silently.

## Register and translate another language

1. Use the existing canonical target tag in `localeDefinitions`. Create
   `localization/terminology/<tag>.json` following the German schema, but write
   that language's own register/formality and preferred terminology. Shared
   English definitions live in `localization/glossary.json`. Independently review
   new terminology alongside the messages; German guidance is not a default.
2. Add Android's resource destination and actual target plural categories to
   `localization/android/locales.json`. Examples: `values-pt-rBR` and
   `values-zh-rTW`. The registry uses canonical `pt-BR` and `zh-TW` tags; Chrome
   output uses underscores. Preserve Simplified/Traditional script distinctions.
3. Author offline before advertising the language. Export incremental work to
   a new ignored campaign directory:

   ```bash
   python3 scripts/localization.py export --locale fr --all-surfaces \
     --work-dir .local/localization/fr-campaign
   python3 scripts/localization.py run --locale fr --all-surfaces \
     --work-dir .local/localization/fr-campaign --model gpt-6.1-sol \
     --effort high --concurrency 2 --resume
   ```

   The local runner uses the existing ChatGPT CLI login. The model is explicit;
   normal speed and workspace-write/no-prompts permissions are explicit too.
   It does not change global settings or choose another account/provider.
   Separate sessions translate and review every batch. Human feedback is welcome
   but not required to substitute for missing independent model review.
4. Resolve every pending category, then stage the target in the relevant
   `supportedLocales` lists and regenerate. Native desktop and extension locales
   require a matching React catalog. `previewLocales` can track authoring state;
   ordinary generation packages shipping lists only. A candidate registration
   is local preparation, not a release or evidence of qualification.
5. Qualify the candidate before committing its shipping registration:

   ```bash
   python3 scripts/localization.py qualify --locale fr --all-surfaces
   ```

   Use repeated `--surface` arguments for a bounded platform run. Qualification
   runs deterministic checks, production frontend browser tests, applicable native
   source gates, owned Android API 28/35 emulators, native iOS UI/Release checks, and
   the packaged extension browser check. On macOS it also drives the production
   native menu builder in a separate temporary app identity. Install the matching
   Android system image and Playwright browser first. A missing tool/testbed is a
   failure to qualify, never an inferred pass. Store exact evidence and remaining
   OS/device claims in the tactical/topic before enabling a release candidate.

Changing English or relevant terminology requires fresh incremental exports.
Unrelated glossary edits do not invalidate every message. Do not stamp hashes
current, copy another locale's review identity or manually edit a reviewed
translation without sending it through another independent review.

## Low-level export/review/import

```bash
python3 scripts/localization.py export web de --batch-size 80 \
  --out-dir .local/translations/de-web-next
python3 scripts/localization.py validate-response web de \
  --job JOB.json --response REVIEWED.json
python3 scripts/localization.py import web de --job JOB.json \
  --response REVIEWED.json --translator model/session-a --reviewer model/session-b
python3 scripts/localization.py check web de
```

`desktop`, `extension`, `android` and `ios` use the same interface. JSON is an
exchange format, not another runtime catalog. Jobs bind source/context,
argument contracts, relevant terminology and existing target hashes. Responses
must contain exactly the requested keys. ICU validation preserves arguments,
selector meaning and rich-text scopes; Android preserves positional formats and
locale-specific plural quantities; Apple preserves native printf arguments.

A catalog importer takes a kernel-owned lock; all Apple locales share one lock
because they share their catalog files. Each replacement is atomic. An
interruption between catalog and review-ledger writes becomes a detected hash
conflict. Frozen exports refuse changed output files. Explicit `prune` retires
obsolete entries while retaining their review history.

## Resumption and worker ownership

Keep prompts, responses, session logs, ownership and state under ignored
`.local/`. Worker state includes private machine paths and is never committed.
Only reviewed catalogs and content-bound review provenance are tracked.

The runner bounds batches to 100 resources, at most four batches per worker,
at most three workers per invocation, and a finite timeout. Keep total model
concurrency at most three across simultaneous owners. Prefer the campaign front
instead: it runs surfaces sequentially with one owner.

Rerun the exact command/work directory to resume. Completed responses and actual
model/session evidence are revalidated; exact previously imported work is
recognized without creating another session. Changed source, jobs, candidates,
settings or outputs fail instead of being silently accepted. Use a new campaign
snapshot for changed input. Invalid results stop for inspection, with no endless
retry loop. Ctrl+C/SIGTERM terminates and joins owned worker groups. Never unlink
an active lock file. The local model runner currently supports macOS/Linux;
offline authoring/checking is portable.

## Runtime and pseudo-locale checks

```bash
node scripts/qualify-localization.mjs --locale de
VITE_OK200_PSEUDO_LOCALES=1 node scripts/qualify-localization.mjs --locale en-XA
VITE_OK200_PSEUDO_LOCALES=1 node scripts/qualify-localization.mjs --locale ar-XB
# Restore/check ordinary assets after a pseudo run:
node scripts/qualify-localization.mjs --locale de
OK200_TEST_LOCALE=de extension/scripts/browser-check.sh
android/scripts/localization-smoke.sh
OK200_TEST_LOCALE=de ios/scripts/check.sh
```

Browser tests use bundled Playwright Chromium, production assets and isolated
profiles. The frontend harness supplies deterministic native/controller fixtures
and checks switching/persistence, retained running/folder state, accessibility
and narrow layout. This is UI evidence, separate from real HTTP/runtime gates.
The packaged extension runner exercises the actual extension and native-host
recovery with Chrome's default CSP. Pseudo languages require the explicit test
build flag and never appear in ordinary product lists.

Android smoke owns, stops and deletes one temporary emulator; it never chooses
an attached phone or a developer AVD. Override
`OK200_LOCALIZATION_SYSTEM_IMAGE`/`OK200_LOCALIZATION_EMULATOR_PORT` explicitly
when needed. Its runtime test fetches a real served file across locale-driven
activity recreation when filesystem permission is available; the owned runner
supplies that permission only on its emulator. Android includes shipping
languages in the base bundle for offline selection, including before API 33.

macOS native menus can be exercised without launching the ordinary application:

```bash
cargo run --manifest-path desktop/Cargo.toml -p ok200-desktop \
  --example localization_smoke -- "$PWD/.local/native-language.json"
```

The debug-only harness uses the production menu builder, an isolated app
identity, no server/plugins/native-host registration, and removes its preference
directory. Evidence from macOS, a Linux cross-compile, simulators or emulators
must not be described as Windows/Linux installed-product, physical-device or
store-delivered acceptance.

## Supervised overnight queue

Use [the overnight runbook](../docs/runbooks/localization-overnight.md) and
`python3 scripts/localization-campaign.py plan --check-env` for the frozen
French-first campaign queue (completed on 2026-10-29). Preserve its frozen
evidence when checking/resuming; use fresh incremental jobs when English or
relevant terminology changes. Planner/status/verify/handoff launch no
workers; a supervising agent executes checked argv and records qualified
locales. Full receipts bind exact source/catalog/ledger/runtime-harness inputs
and require both owned Android API 28/35 runs plus macOS/iOS gates. No store
publication is part of the campaign.
