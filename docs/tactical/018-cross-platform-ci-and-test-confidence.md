# 018: Cross-Platform CI and Test Confidence

**Status:** implemented on `main`; local validation complete; first hosted
execution of newly added lanes pending the next push
**Topic:** `cross-platform-release-confidence`
**Related topics:** `android-native-kotlin`, `ios-native-swift`,
`desktop-release-readiness`, `chromeos-extension-launcher`,
`chromeos-crostini-launcher`
**Baseline:** clean `main` at `7005ed0`

## Objective

Increase confidence in routine changes and release candidates by improving the
repository-owned code and test structure:

1. give the native iOS app a hosted build/test lane;
2. make local and CI entry points exercise the same component-owned checks;
3. run one language-neutral HTTP behavior corpus against the independent
   Swift, Kotlin, and Rust servers;
4. activate useful product-level tests that exist but are not in CI;
5. test supported old/new combinations across independently released
   components and persisted state; and
6. validate the exact artifacts produced by release workflows before those
   workflows publish them.

This tactical improves automated evidence. It does not redefine a green build
as proof that an app works on every physical device, package manager, store, or
network.

## Accepted policy boundaries

### Direct `main` development remains supported

The repository is maintained by one contributor who pushes directly to
`main`. Branch protection, mandatory pull requests, merge queues, and a
required-check aggregator are not part of this tactical. A failed workflow on
`main` is still a real regression that should be repaired before a release,
but CI configuration must not impose a different development model.

### Testbeds are recommended release evidence, not an unconditional lock

Physical and VM testbeds catch important failures that hosted CI cannot, so a
release should normally run the relevant available testbeds. They are not an
absolute prerequisite for every release. A small, well-covered change or an
urgent bug fix may ship without a new testbed campaign.

When a testbed is skipped, record the component/version, affected behavior,
automated evidence that did run, the reason for skipping, and the remaining
risk. The absence of a testbed result does not fail the release script. It does
limit claims: a skipped physical/store-delivered check cannot be reported as a
pass or used as evidence for that environment.

A testbed run is strongly recommended when a change affects:

- network binding, displayed peer addresses, or external reachability;
- start/stop, background, process, notification, tray, or boot lifetime;
- file pickers, security-scoped bookmarks, SAF, shared storage, or permissions;
- installer, updater, signing, entitlement, package, or store behavior;
- native messaging, extension/controller protocols, deep links, or rollout
  compatibility; or
- a minimum/target OS boundary or platform-specific UI defect.

Skipping is ordinarily reasonable for documentation-only changes, tests and
diagnostics, isolated copy or artwork changes, or a bounded fix whose failed
behavior is reproduced and closed by a lower-level automated regression.

### Workflow hygiene is out of scope

This tactical does not add dependency bots, arbitrary coverage percentages,
branch rules, permissions refactors, action-SHA pinning, or generalized CI
policy work. Those may be useful in a multi-contributor repository, but they
are not the confidence bottleneck here. Work stays focused on product builds,
behavioral tests, artifact inspection, and compatibility.

### Runtime implementations remain independent

Swift, Kotlin, and Rust continue to own their platform runtimes. Shared test
fixtures and externally observable expectations are encouraged; production
server or UI source is not shared as part of this work.

### External mutation remains separately authorized

Creating tags or releases, uploading to stores, changing update routes,
installing public candidates, or mutating physical/VM testbeds still requires
the authority and preparation defined by the owning topic, tactical, or
runbook. Adding CI and test source does not authorize those actions.

## Current baseline

| Surface | Current automated evidence | Gap owned here |
|---|---|---|
| General TypeScript | Ubuntu build, typecheck, Biome, and workspace tests on every `main` push | Keep; avoid treating it as native-platform evidence |
| Android | Debug build, JVM tests, lint, API-30 emulator instrumentation; signed APK/AAB on tags | Add supported-boundary coverage and exact Release artifact inspection/smoke |
| iOS | `ios/scripts/check.sh` passes 26 simulator unit/UI tests plus Release fixture/signing hygiene locally | Add hosted CI, generic-device compile, generated-project drift proof, and useful failure artifacts |
| Desktop | Rust tests/lint, frontend checks, five-platform package matrix, signing and release finalizer | Wire the existing Tauri/WebDriver product suite into CI and preserve exact-package testbed guidance |
| Extension | Build, typecheck, Vitest behavior tests, and package inspection | Add a real-browser packaged-extension lane and cross-version fixtures |
| Crostini | Rust tests, x86_64/ARM64 static builds, signed manifest and artifact validation | Add explicit old/new controller-extension compatibility cases; retain physical Chromebook checks as suggested evidence |

The repository has no hosted iOS workflow. Android CI is present and recently
green; this plan extends it rather than replacing it. The desktop E2E source
under `desktop/tauri-app/e2e/` already exercises settings layout, UI-driven
server start/stop, external requests, CORS, listing, traversal rejection, and
listener shutdown, but no workflow currently runs it.

## Gate model

The implementation should keep four evidence levels distinct:

| Level | Purpose | Expected automation |
|---|---|---|
| Source gate | Catch regressions caused by the current change | Compile, format/lint where already established, unit tests, component UI tests |
| Integration gate | Exercise real runtimes at stable hosted boundaries | Simulator/emulator tests, Tauri WebDriver, real browser, shared HTTP corpus |
| Artifact gate | Prove the bytes proposed for release have the intended identity and contents | Release build, package inspection, signatures where configured, version/permission/manifest checks, checksums |
| Suggested testbed evidence | Cover environments hosted CI cannot faithfully represent | Physical phones/Chromebook, installed desktop packages, real LAN peers, store-delivered components |

Source, integration, and applicable artifact gates should be green at the
candidate revision before a normal release. Suggested testbed evidence may be
passed or explicitly skipped under the policy above.

## Phase 1: Establish component-owned gate entry points

Workflows should primarily orchestrate checked-in scripts rather than hold a
second implementation of the validation logic.

1. Keep `ios/scripts/check.sh` as the canonical iOS source/simulator gate.
2. Add or consolidate documented component-owned commands for Android,
   desktop, extension, and Crostini where workflow-only command sequences have
   drifted from `CLAUDE.md`.
3. Give each command a deterministic non-interactive CI mode and explicit
   output paths. Destination/device selectors may be injected, but assertions
   must remain the same locally and in CI.
4. Separate source checks from signed release and physical-testbed commands.
   A developer must be able to run source gates without signing secrets or a
   connected device.
5. Remove obsolete test entry points only after their useful assertions are
   represented by the canonical command. In particular, reconcile the
   hard-coded desktop `e2e/test-driver.sh` probe with the portable
   `e2e/run-e2e.sh` runner instead of maintaining two paths.
6. Document each canonical command beside its component and from
   `CLAUDE.md`.

Exit criteria:

- every platform has one obvious source gate;
- CI invokes those same commands;
- no source gate requires private signing or testbed state; and
- duplicated workflow/local assertion lists are removed or deliberately
  bounded.

## Phase 2: Add hosted iOS CI

Create `.github/workflows/ios-ci.yml`, triggered by iOS source/project/script
changes on `main` and pull requests if they are used. The workflow should:

1. use a documented macOS/Xcode image and an installed simulator model rather
   than relying on an implicit moving destination;
2. install or select `xcodegen` and other small command dependencies;
3. run `ios/scripts/check.sh`, including Swift unit tests, XCTest UI tests, the
   Release simulator build, DEBUG-fixture rejection, and committed-team
   rejection;
4. regenerate `ios/OK200.xcodeproj` and fail when generation leaves a tracked
   diff, so `project.yml` and the checked-in project cannot silently diverge;
5. add an unsigned Release build for `generic/platform=iOS` to cover device
   architecture and conditional-compilation sanity without credentials;
6. retain the iOS 17.0 deployment target and document that compiling for that
   target is not equivalent to runtime proof on an iOS 17 simulator; and
7. preserve the `.xcresult` bundle or focused diagnostics when a test fails.

The hosted workflow must not import a development team, certificate, profile,
App Store Connect key, device identifier, or testbed configuration. Archive,
distribution signing, TestFlight, and store validation remain in Tactical 017.

Exit criteria:

- an iOS-only change triggers a hosted build/test run;
- the checked-in project is reproducible;
- simulator Debug tests and both simulator/device Release compiles pass; and
- Release still contains no DEBUG fixture or launch hook.

## Phase 3: Create the shared HTTP conformance corpus

Add a repository-owned language-neutral corpus, provisionally under
`tests/http-conformance/`, containing fixture trees, request cases, and
expected externally observable results. It should cover the common contract,
not platform lifecycle or storage APIs.

Initial required cases:

- `GET`, `HEAD`, `OPTIONS`, and unsupported methods;
- root/index precedence and bounded escaped directory listings;
- ordinary files, MIME types, empty files, UTF-8 names, and nested paths;
- missing files and directories;
- ETag, Last-Modified, conditional requests, and byte ranges;
- CORS disabled/enabled and preflight behavior;
- SPA fallback boundaries;
- single decoding, encoded separators, traversal attempts, and symlink escape;
- malformed/oversized request heads, timeout/connection-close behavior where
  deterministic, and bounded concurrency; and
- explicit stop/restart plus automatic port assignment where the adapter owns
  a listener.

Implementation rules:

1. Define a versioned case schema and validate it in the general test lane.
2. Give Swift, Kotlin, and Rust small test adapters that consume the same cases
   while continuing to invoke their native server/storage code.
3. Require each case to be claimed by every applicable runtime or carry an
   explicit platform-specific exclusion with a reason.
4. Keep platform-only behavior—SAF, security-scoped bookmarks, Android
   services, iOS foreground lifetime, desktop tray/updater—inside its native
   suite.
5. Migrate overlapping ad hoc fixtures gradually; do not delete stronger
   native edge cases merely because the common corpus is smaller.
6. Emit a concise per-runtime case summary so a release record can show which
   common contract revision passed.

Exit criteria:

- all three native HTTP implementations run the same required core cases;
- intentional differences are named rather than accidental omissions; and
- a new shared HTTP behavior cannot land in only one applicable runtime
  without a failing test or documented exclusion.

## Phase 4: Activate desktop product E2E coverage

Rehabilitate `desktop/tauri-app/e2e/` as a maintained Linux WebKit/Tauri
integration gate rather than leaving it as dormant development source.

1. Make `run-e2e.sh` portable to the repository checkout and remove the stale
   absolute path in `test-driver.sh` after retaining any unique diagnostic
   value.
2. Install the locked E2E dependencies and `tauri-driver` reproducibly.
3. Run the suite under the required virtual display/WebKit driver on the Linux
   CI image.
4. Keep the existing real UI-to-Rust start, serve, stop, directory listing,
   CORS, traversal, and settings-dialog geometry checks.
5. Add focused regression cases for the current one-window settings and
   background-disabled close contracts where they can be asserted reliably in
   hosted Linux.
6. Capture a screenshot and relevant process/application logs on failure so a
   geometry or lifecycle defect is diagnosable rather than merely retried.
7. Do not infer macOS or Windows WebView acceptance from the Linux result.

Exact installed PKG/NSIS/AppImage behavior and production-extension round
trips remain suggested testbed evidence under Tactical 015 and its runbook.

Exit criteria:

- the checked-in desktop E2E tests run in CI on desktop changes;
- a header-confined settings dialog or broken UI-to-server path fails the
  lane; and
- the E2E runner contains no developer-machine path.

## Phase 5: Strengthen Android hosted and artifact gates

Preserve the existing fast compile/JVM/lint work and improve the boundaries it
does not cover today.

1. Exercise instrumentation at the declared minimum API 26 and target API 36.
   The existing API-30 lane may remain as a fast default or be replaced after
   timing and stability evidence; do not expand the matrix without measuring
   its practical cost.
2. Keep the emulator tests focused on UI/controller/lifecycle contracts that
   require Android. Continue to test protocol and filesystem behavior in the
   faster JVM socket suite.
3. On release tags, validate the exact APK with `apksigner` and the exact AAB
   with Bundletool.
4. Inspect package name, version name/code, min/target SDK, exported deep-link
   activity, permissions, debuggable state, native libraries, and expected
   absence of the retired QuickJS/JNI runtime.
5. Install the exact Release APK on an emulator for a bounded launch,
   deep-link, identity, and primary-control smoke. Do not substitute a Debug
   APK when describing Release artifact evidence.
6. Generate checksums for the APK, AAB, and mapping file and publish only the
   inspected outputs.
7. Keep Pixel/Chromebook storage, notification, background, boot, LAN, and
   store-delivered campaigns as suggested testbed evidence.

Exit criteria:

- hosted tests cover both supported SDK boundaries at an accepted cadence;
- tag output has verified identity/signing/configuration;
- the exact Release APK launches through its supported entry points; and
- published artifacts and checksums are the same files that passed inspection.

## Phase 6: Add real-browser and cross-version contract tests

### Packaged extension in a real browser

Add a hosted Chrome/Chromium lane that loads the built unpacked extension or
the inspected ZIP contents and exercises the actual popup document. Keep
native messaging and ChromeOS-only system behavior mocked only at the browser
boundary; do not replace the existing unit tests.

Cover at least:

- manifest identity, permissions, content-security policy, and packaged file
  set;
- popup boot and Android/desktop/Crostini route selection;
- missing-host and incompatible-controller recovery;
- absence of private development URLs or test hooks; and
- accessible primary actions at the supported popup viewport.

### Independently released producer/consumer pairs

Maintain frozen fixtures for the oldest supported and current contracts:

| Producer / consumer | Required fixtures |
|---|---|
| Chrome extension / desktop native host | launch, ping/status, missing host, old/new message tolerance |
| Chrome extension / Crostini controller | health, claim/session, protocol range, incompatible recovery |
| Crostini installer / signed manifest | current, previous, rollback, architecture, protocol range, unknown fields |
| Desktop app or host / updater metadata | previous-public, current, future/no-downgrade, malformed, wrong package |
| Each app / persisted settings | oldest supported stored form, current form, unknown future fields, invalid recovery |

For every protocol or persisted-schema change:

1. run old producer/new consumer and new producer/old consumer cases where
   both versions may coexist;
2. prefer additive messages, ignored unknown fields, capability negotiation,
   and overlapping version ranges;
3. reject a candidate whose advertised compatibility has no overlap with a
   component users can still receive, unless the maintainer explicitly accepts
   the incompatibility and its user-visible recovery;
4. encode accepted incompatibilities as bounded fixtures with the expected
   clear error/fallback, reason, affected public versions, and removal point;
   and
5. keep binary/store-delivery proof separate from source-level fixture proof.

The already documented temporary protocol-1/protocol-2 Crostini rollout gap is
not silently reopened by this tactical. It should become an explicit historical
compatibility fixture, and future protocol changes must follow the stronger
overlap rule unless another incompatibility is consciously accepted.

Exit criteria:

- the built extension has at least one real-browser hosted test path;
- supported old/new pairs are executable tests rather than prose alone; and
- intentional incompatibility produces a tested recovery path and bounded
  record.

## Phase 7: Make release evidence easy to run and record

Keep release automation strict about source and artifact checks while keeping
testbeds advisory.

1. Extend each component's release `--check` path to print or run its canonical
   source, integration, and artifact gates without publishing.
2. Ensure tag workflows rerun the applicable automated gates at the tagged
   commit rather than relying only on an earlier `main` result.
3. Keep fail-closed draft/finalization behavior where already implemented for
   desktop and Crostini; bring Android and extension artifact inspection to the
   same build-inspect-publish discipline without redesigning their products.
4. Add a short reusable release-evidence template containing:
   component/version/commit, automated run URLs, artifact names and hashes,
   compatibility corpus version, testbeds run, testbeds skipped with reason,
   and remaining claim limits.
5. Have release commands print the relevant testbed commands/runbook links as
   recommendations. They must not silently operate a testbed or fail solely
   because no testbed result was supplied.
6. For urgent fixes, record the regression test that justifies the shortened
   campaign and schedule any deliberately deferred high-risk testbed check.

Suggested testbed mapping:

| Component | Suggested pre-release evidence |
|---|---|
| iOS | `ios/scripts/device-smoke.sh`, real Files selection when storage changed, external LAN peer, foreground/background truth |
| Android | Pixel or representative phone, external LAN peer, permissions/lifetime mode affected by the change; Chromebook when ChromeOS routing changed |
| Desktop | Exact candidate on affected macOS/Windows/Linux package path; real extension when native messaging changed |
| Extension | Exact packaged extension in the affected production browser/platform route |
| Crostini | Chromebook Linux install/update/rollback, shared folder, launcher, content-port forwarding when those areas changed |

Exit criteria:

- one command identifies the automated release gates for each component;
- release records distinguish automated, testbed-passed, skipped, and untested
  claims; and
- skipping a testbed remains possible without disguising the confidence gap.

## Recommended implementation slices

Commit and validate in bounded slices:

1. canonical component gate scripts and documentation;
2. hosted iOS CI plus generic-device/project-drift checks;
3. shared HTTP corpus schema, fixtures, and one adapter at a time;
4. portable desktop E2E runner and Linux CI job;
5. Android SDK-boundary and exact Release artifact gates;
6. real-browser extension tests and cross-version fixture matrix; and
7. release evidence template plus advisory testbed handoff.

Each slice should update the owning runtime/release topic with new evidence or
remaining gaps. Use the existing topic trailer for platform-specific commits
and `Topic: cross-platform-release-confidence` for corpus, shared gate, and
release-evidence commits.

## Completion criteria

This tactical is complete when:

1. iOS changes receive hosted simulator tests and unsigned simulator/device
   Release builds;
2. every component's workflow uses a documented repository-owned gate command;
3. Swift, Kotlin, and Rust pass the same versioned required HTTP corpus;
4. the desktop Tauri/WebDriver suite runs in hosted CI;
5. Android covers accepted SDK boundaries and inspects/smokes the exact Release
   APK/AAB;
6. the packaged extension has a real-browser test lane;
7. supported cross-version and persisted-state combinations have fixtures and
   executable tests;
8. release automation records exact artifacts and automated evidence; and
9. testbed campaigns remain strongly suggested, explicitly recordable, and
   skippable without being misreported as passes.

## Execution record

The seven planned slices were implemented in order:

| Slice | Commit | Result |
|---|---|---|
| Canonical component gates | `50d8559` | Workflows call repository-owned Android, desktop, extension, and Crostini scripts |
| Hosted iOS gate | `b4f7edf` | Simulator tests, simulator/device Release builds, project drift, and failure artifacts |
| Shared HTTP corpus | `dbc4f2a` | Contract `1.0.0`, 28 cases, native Swift/Kotlin/Rust adapters |
| Desktop product E2E | `20c90f9` | Portable Linux Tauri/WebDriver runner and hosted diagnostic lane |
| Android boundaries/artifacts | `2f590e6` | API 26/36 matrix plus exact signed APK/AAB inspection and Release smoke |
| Browser/compatibility | `bc74a5b` | Exact packaged Chrome popup smoke and compatibility corpus `1.0.0` |
| Release evidence | final slice | One component dispatcher, stronger tag dependencies, evidence template, advisory testbed handoff |

Local closeout on 2026-08-05 passed the canonical iOS gate, Android source
gate and instrumentation-test compilation, extension source/package tests and
real installed-Chrome smoke, desktop/native-host/Tauri library tests, Crostini
tests and installer checks, both shared corpus validators, and release-finalizer
tests. Linux-only Tauri E2E, API-26/API-36 runtime instrumentation, hosted iOS,
and tag-only signed artifact jobs remain remote execution evidence: their
workflow definitions are implemented, but no result is claimed until the next
push or applicable tag actually runs them.
