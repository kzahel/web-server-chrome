# 013: Retire the TypeScript CLI

Status: **planned; public website promotion is removed in the precursor site
truth pass, but no TypeScript CLI or engine cleanup has started.**

Related continuing concerns:

- [Product vision](../vision.md)
- [Desktop runtime](../topics/desktop-runtime.md)
- [Android runtime](../topics/android-runtime.md)
- [Product branding](../topics/product-branding.md)

## Objective

Retire the unpublished Node/TypeScript `ok200` CLI and its now-unshared HTTP
engine without turning the internal Rust core development executable into a
separately released product. Preserve only the behavioral evidence that still
improves the supported desktop, Android, and ChromeOS products.

## Decision boundary

The original TypeScript engine was a real cross-runtime implementation used by
the early CLI, Tauri desktop, and embedded-JavaScript Android paths. Desktop
now serves through `ok200-core` in Rust, Android serves through its native
Kotlin implementation, and Crostini reuses the Rust core. The Node CLI is the
TypeScript engine's only remaining runtime consumer.

The `v0.1.1` tag's publish workflow failed at the npm publication step, no
GitHub CLI release was created, and the public npm registry does not contain
`ok200`. Later source added an embedded browser management surface without a
new release. That surface reports a permanently running single server; its
start/stop callbacks do not control the process, and registry configuration
changes do not reconfigure the live listener.

The accepted end state is therefore:

- no public Node/npm CLI product or CLI release lane;
- no `packages/cli` or otherwise-unused `packages/engine` runtime source;
- no website, README, or current-topic claim that `npx ok200` is available;
- retain `desktop/core/src/main.rs` as a repository-only development and smoke
  executable around the supported Rust core; and
- do not publish, package, rename, or independently version that Rust
  development executable as part of this tactical.

## Scope

### C1 — preserve useful behavior evidence

- [ ] Inventory TypeScript-only behavior and tests, including upload and
      self-signed TLS, before deletion.
- [ ] Classify each behavior as supported native-product contract, intentionally
      retired CLI-only capability, or future product work.
- [ ] Move only applicable black-box/security coverage into the Rust and Kotlin
      suites. Do not preserve an implementation solely to call it a reference.
- [ ] Record intentional differences rather than silently weakening existing
      native behavior.

### C2 — remove the unpublished CLI release surface

- [ ] Remove `packages/cli` and its bundle, tests, changelog, package metadata,
      and workspace lockfile entries.
- [ ] Remove `.github/workflows/cli-publish.yml` and
      `scripts/release-cli.sh`.
- [ ] Preserve the historical `v0.1.1` tag and failed workflow record; do not
      rewrite release history.
- [ ] Remove current instructions that tell users to run `npx ok200`.

### C3 — remove the stranded TypeScript engine

- [ ] Confirm no desktop, Android, Crostini, extension, website, or release tool
      imports `@ok200/engine`.
- [ ] Remove `packages/engine` after the applicable compatibility evidence has
      moved or been explicitly retired.
- [ ] Remove the CLI-only HTTP management API and browser transport from the
      shared UI while keeping the Tauri `ServerManager` contract and desktop
      React controls intact.
- [ ] Remove unused shared-UI adapters and dependencies exposed by the retired
      Node path.

### C4 — reconcile current product truth

- [x] Replace the homepage CLI promotion with actionable Desktop, Android,
      ChromeOS, and Chrome Extension choices.
- [x] Remove homepage `npx ok200` instructions and the CLI comparison claim.
- [ ] Reconcile `README.md`, `CLAUDE.md`, `docs/vision.md`, product branding,
      runtime topics, architecture diagrams, release tables, and active
      tacticals with the accepted retirement.
- [ ] Preserve accurate historical references in completed tacticals,
      changelogs, research documents, and Git history.

## Validation

- Root install, typecheck, build, test, and Biome checks pass without the CLI
  and engine workspaces.
- Desktop TypeScript build/tests and the complete Rust workspace pass.
- Android compile, JVM tests, and lint pass if shared documentation or build
  configuration touches that lane.
- No active public surface or current architecture document advertises an npm
  CLI.
- `cargo run -p ok200-core -- --root <fixture> --port 0` still provides the
  intended repository-only native-core smoke path.

## Non-goals

- Publishing a Rust CLI.
- Adding Crostini controller, installer, launcher, authentication, or updater
  behavior to a general-purpose CLI.
- Preserving uploads or TLS merely because they existed in the unshipped
  TypeScript implementation.
- Changing the supported desktop, Android, Crostini, or extension user flow.

## Completion criteria

Close this tactical when the Node CLI, TypeScript engine, release automation,
and current public/documentation claims are gone; applicable behavioral
coverage has moved or been explicitly retired; supported product builds pass;
and the small Rust development CLI remains internal and unreleased.
