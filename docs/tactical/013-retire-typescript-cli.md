# 013: Retire the TypeScript CLI

Status: **complete on 2026-08-03. The unpublished Node/TypeScript CLI, engine,
release lane, and browser-management transport are removed. The Rust core
development executable remains repository-only and passed its smoke check.**

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
Kotlin implementation, and Crostini reuses the Rust core. Before this tactical,
the Node CLI was the TypeScript engine's only remaining runtime consumer.

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

## Behavior disposition

The pre-deletion audit classified the TypeScript coverage as follows:

| Classification | Disposition |
|---|---|
| Supported native contract | Static files, indexes, MIME types, directory listings, missing-file behavior, encoded paths, `GET`/`HEAD`, traversal and symlink containment, ETags/ranges, HTTP/1.1 reuse, SPA fallback, CORS/`OPTIONS`, bounded requests, and lifecycle failures remain covered by Rust and/or Kotlin real-socket tests. |
| Coverage made explicit during retirement | Rust and Kotlin now request a percent-encoded UTF-8 filename and assert a missing-file `HEAD` has no body. Rust now proves two HTTP/1.1 requests reuse one connection; Android already had that socket-level case. |
| Intentionally retired CLI-only behavior | Node argument handling, process-signal shutdown, the server registry, `/_api` management/authentication, browser UI asset serving, and direct/HTTP shared-UI adapters had no supported product consumer. |
| Intentionally retired hidden capability | PUT/POST uploads and Node-generated self-signed TLS were never exposed as supported native desktop or Android contracts. Future uploads or TLS require product-specific decisions. |
| Implementation-specific evidence | TypeScript parser/writer, Node filesystem/socket/certificate adapters, in-memory filesystem, token bucket, and event-emitter unit tests do not define native implementation requirements. |

The TypeScript engine allowed the filesystem root `/`; both native products
reject a filesystem root as a deliberate containment policy. That test was not
ported. Android also remains read-only, and unsupported methods remain an
explicit native contract rather than inheriting the CLI's upload path.

## Scope

### C1 — preserve useful behavior evidence

- [x] Inventory TypeScript-only behavior and tests, including upload and
      self-signed TLS, before deletion.
- [x] Classify each behavior as supported native-product contract, intentionally
      retired CLI-only capability, or future product work.
- [x] Move only applicable black-box/security coverage into the Rust and Kotlin
      suites. Do not preserve an implementation solely to call it a reference.
- [x] Record intentional differences rather than silently weakening existing
      native behavior.

### C2 — remove the unpublished CLI release surface

- [x] Remove `packages/cli` and its bundle, tests, changelog, package metadata,
      and workspace lockfile entries.
- [x] Remove `.github/workflows/cli-publish.yml` and
      `scripts/release-cli.sh`.
- [x] Preserve the historical `v0.1.1` tag and failed workflow record; do not
      rewrite release history.
- [x] Remove current instructions that tell users to run `npx ok200`.

### C3 — remove the stranded TypeScript engine

- [x] Confirm no desktop, Android, Crostini, extension, website, or release tool
      imports `@ok200/engine`.
- [x] Remove `packages/engine` after the applicable compatibility evidence has
      moved or been explicitly retired.
- [x] Remove the CLI-only HTTP management API and browser transport from the
      shared UI while keeping the Tauri `ServerManager` contract and desktop
      React controls intact.
- [x] Remove unused shared-UI adapters and dependencies exposed by the retired
      Node path.

### C4 — reconcile current product truth

- [x] Replace the homepage CLI promotion with actionable Desktop, Android,
      ChromeOS, and Chrome Extension choices.
- [x] Remove homepage `npx ok200` instructions and the CLI comparison claim.
- [x] Reconcile `README.md`, `CLAUDE.md`, `docs/vision.md`, product branding,
      runtime topics, architecture diagrams, release tables, and active
      tacticals with the accepted retirement.
- [x] Preserve accurate historical references in completed tacticals,
      changelogs, research documents, and Git history.

## Implementation record

- Repository search found no runtime import of `@ok200/engine`. The extension
  retained only a stale workspace dependency and Vite alias; both are removed.
- `packages/cli`, `packages/engine`, the npm publish workflow, and CLI release
  script are removed. The lockfile and root type-check command now reflect the
  remaining five pnpm workspaces.
- The shared React controls retain `ServerManager` and the Tauri context. The
  unused `DirectServerManager`, CLI-only `HttpServerManager`, standalone
  browser entry/build, and CLI-only configuration fields are removed.
- Current product and contributor documentation describes the Rust/Kotlin
  runtime boundary and internal smoke executable. Completed tacticals,
  changelogs, the `v0.1.1` tag, and explicitly historical plans remain intact.

## Validation

- [x] `pnpm install --frozen-lockfile`, root type-check, all production builds,
      all 52 frontend tests, and Biome checks pass across the five remaining
      pnpm workspaces.
- [x] The desktop frontend build/tests, strict Rust formatting and Clippy, and
      all 65 Rust workspace tests pass. The added Rust real-socket cases pass.
- [x] Android debug Kotlin compilation, JVM tests (including the added native
      server cases), and debug lint pass.
- [x] Repository search finds no runtime `@ok200/engine` reference, workspace
      entry, release workflow, or active public/current-architecture claim that
      an npm CLI is available. Explicitly historical records remain.
- [x] `cargo run -p ok200-core -- --root .. --port 0 --quiet` selected an
      ephemeral loopback port; an external `HEAD /README.md` returned `200 OK`,
      and Ctrl-C stopped it cleanly.
- [x] Historical tag `v0.1.1` remains present and unchanged.

## Non-goals

- Publishing a Rust CLI.
- Adding Crostini controller, installer, launcher, authentication, or updater
  behavior to a general-purpose CLI.
- Preserving uploads or TLS merely because they existed in the unshipped
  TypeScript implementation.
- Changing the supported desktop, Android, Crostini, or extension user flow.

## Completion criteria

The Node CLI, TypeScript engine, release automation, and current
public/documentation claims are gone. Applicable behavioral coverage moved or
was explicitly retired, supported product builds pass, and the small Rust
development CLI remains internal and unreleased. This tactical is closed.
