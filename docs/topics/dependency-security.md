# Dependency Security

Topic: dependency-security

Last reviewed: **2026-10-28**. Next review of the remaining Rust warnings:
**2026-11-27**, or earlier when their upstream dependencies change.

## Current source disposition

The initial GitHub review found 142 open Dependabot alerts representing 107
distinct advisories: 4 critical, 60 high, 63 medium, and 15 low. Eleven alerts
referenced the website manifest, 92 the pnpm workspace lockfile, 29 the separate
desktop E2E npm lockfile, and 10 the Rust workspace lockfile. Some advisories
were repeated across manifests or affected version branches.

The October cleanup updates the website to Astro 7.4.2 with Sharp 0.35.5,
desktop/extension build tooling to Vite 8.3.5 and Vitest 4.1.12, Happy DOM to
21.0.4, and the extension's parallel script runner to npm-run-all2. The pnpm
override for tsx 4.23.15 replaces its older esbuild dependency without forcing
an incompatible esbuild version beneath tsx. Node 24 is the development and
website deployment baseline; the workspace requires Node >=22.23.4.

The separately installed desktop E2E runner moves from WebdriverIO 8 to 10.1.0
and uses its supported tsx loader and explicit TypeScript check. This removes
the obsolete Puppeteer/browser-download dependency chain described below.

Rust updates include Rustls 0.23.46, WebPKI 0.103.16, serde_with 3.24.0, tar
0.4.46, Tokio 1.54.1, Tauri 2.12.5, and updater plugin 2.14.1. A fresh RustSec
audit also exposed issues absent from GitHub's initial alert list: quick-xml
parser denial of service, obsolete bundled certificate roots, and Windows ZIP
extraction. The lockfile now contains quick-xml 0.41.0, the 1.0.11 root lists,
and zip 9.1.3. The updater update required the compatible Tauri dependency
refresh; changing only the originally flagged packages would have left these
issues unresolved.

Current locked-source results:

- `pnpm audit`: zero vulnerabilities, including development dependencies.
- `npm audit --prefix desktop/tauri-app/e2e`: zero vulnerabilities.
- `cargo audit --file desktop/Cargo.lock`: zero vulnerability entries, with
  the six informational warnings below still visible.

After [commit da3d4f3](https://github.com/kzahel/web-server-chrome/commit/da3d4f30b92e6d58bd411855ee6fb25c13130ec4)
was pushed to main, GitHub completed dependency-graph reprocessing and reported
**zero open Dependabot alerts**. No alerts were manually dismissed.

These are source dependency results. Existing public desktop, extension, and
ChromeOS Linux artifacts retain their original dependencies until separately
rebuilt, validated, and released. This work does not promote any existing
desktop candidate or change store delivery claims.

## Investigation of alerts without patched versions

### http-cache-semantics: GHSA-ch52-4w7c-c8xp

GitHub listed no patched version and an affected range of <=4.2.0. The old
workspace used it through Astro; the E2E tree used it through cacheable-request.
Astro 7.4.2 resolves 4.3.0, outside that listed range, and the updated E2E tree
no longer contains the package.

This is **not evidence of a confirmed security patch in 4.3.0**. The maintainer
[disputes the report](https://github.com/kornelski/http-cache-semantics/issues/56#issuecomment-5975759591),
explaining that response privacy must be expressed with `Cache-Control:
private`, independently of freshness. GitHub's
[advisory review request](https://github.com/github/advisory-database/issues/10139)
remained open at investigation time. Do not describe the advisory as withdrawn.

The production website consists of static GitHub Pages output. The application
does not expose an Astro server or implement a shared authenticated response
cache through this package. That limits the reported production exposure even
on the old dependency tree. No advisory dismissal or audit suppression is
needed for the current lockfiles. Reassess if SSR, authenticated proxy caching,
or remote build-time content processing is added.

### extract-zip: GHSA-7pqw-9j4j-h8q3 and GHSA-jmr9-qjv8-65gv

The latest published extract-zip was still 2.0.1, affected by both symlink
extraction advisories. The proposed
[final-path symlink fix](https://github.com/max-mapper/extract-zip/pull/160)
was open and unmerged. It addresses one extraction mechanism and must not be
assumed to resolve both advisories.

The old dependency was development-only: WebdriverIO/Puppeteer browser
installation, not the native HTTP server or packaged application. Updating
within WebdriverIO 8 retained it. WebdriverIO 10 resolves
`@puppeteer/browsers` 3.2.6, whose dependency tree no longer uses extract-zip.
The current E2E lockfile contains no extract-zip, so both findings are removed
without an unpublished fork, an unreviewed patch, or an audit exception.

## Remaining Rust informational warnings

The audit still reports these transitive dependencies. None is suppressed.
Zero vulnerability entries must not be described as a warning-free audit.

| Advisory | Dependency | Disposition |
|---|---|---|
| RUSTSEC-2024-0370 | proc-macro-error 1.0.4 | Unmaintained; retain visibility and revisit the owning target-specific macro dependency. |
| RUSTSEC-2026-0192 | ttf-parser 0.25.1 | Unmaintained; retained by the ChromeOS Linux font stack. Review its upstream replacement before changing rendering. |
| RUSTSEC-2026-0371 | zbus_names 4.3.1 | Unmaintained; upstream Linux portal dependency. |
| RUSTSEC-2026-0370 | zvariant 5.10.0 | Unmaintained; upstream Linux portal dependency. |
| RUSTSEC-2026-0372 | zvariant_derive 5.10.0 | Unmaintained; upstream Linux portal dependency. |
| RUSTSEC-2024-0429 | glib 0.18.5 | Unsound VariantStrIter implementation; fixed in >=0.20, but the GTK3/WebKitGTK dependency family requires 0.18. A direct incompatible override would not repair that dependency family. Track the upstream Linux runtime migration; do not claim this warning is fixed or proven unreachable. |

The last warning deserves separate Linux follow-up, not a blanket claim that
the desktop is unaffected. No new allowlist entries were introduced. Future
exceptions must identify the exact advisory and dependency path, reachable
inputs, mitigation, owner, and review/expiry date; unknown findings or expired
exceptions must fail validation.

## Compatibility and rollout

Independently released consumers/producers remain the desktop app/native host,
Chrome Web Store extension, ChromeOS Linux controller and installers, Android
and iOS apps, update service, and static website. This cleanup does not change
their protocols, updater signature/key or endpoint, persisted settings, app
identities, extension allowlists, or installer URLs. The desktop JavaScript
Tauri API/plugin versions stay at their previous versions while the compatible
Rust implementation updates within Tauri 2.

The existing old/current/future compatibility corpus and production parser
tests remain the compatibility window. The website may deploy first; desktop,
extension, and ChromeOS Linux releases can follow independently without
requiring their counterparts to update together. Existing fallback and
unsupported-version behavior is unchanged, and no legacy support is removed.

Before publishing a new desktop artifact, retain signed updater-transition,
native-host/production-extension, and Linux WebKitGTK product acceptance from
the [desktop release topic](desktop-release-readiness.md). Local source checks
do not substitute for those artifact gates.

## Checks and repository protection

The [Dependency Security workflow](../../.github/workflows/dependency-security.yml)
runs both JavaScript lockfile audits and cargo-audit on dependency changes,
pull requests, a weekly schedule, and manual dispatch. Audit errors and
vulnerability entries fail the job. Cargo's informational warnings remain
printed for review; they are not silently filtered out.

[Dependabot configuration](../../.github/dependabot.yml) covers the pnpm
workspace, the separate npm E2E project, Cargo workspace, and GitHub Actions.
Repository settings now enable automatic Dependabot security fixes, secret
scanning, and secret push protection. CodeQL default setup was requested for
JavaScript/TypeScript and Actions; its setup run is
[40653623017](https://github.com/kzahel/web-server-chrome/actions/runs/40653623017).
Rust is not accepted by this repository's CodeQL default-setup API; Rust
dependency coverage is provided by cargo-audit. The JavaScript analysis
completed against the pre-cleanup commit `6b95ecc`; Actions analysis and the
cleanup commit's hosted source/product checks were still queued at closeout.

The first JavaScript analysis produced four separate code-scanning findings:

- [Alert 4](https://github.com/kzahel/web-server-chrome/security/code-scanning/4)
  flags the build-time `startsWith("http://local.ok200.app")` check in
  `extension/vite.config.ts`. This is a **deny/removal filter** over the
  checked-in manifest's development entries, not an allowlist for untrusted
  requests. A broader prefix removes extra entries rather than allowing an
  attacker-controlled origin. The finding appears to be a false positive;
  the strict store-package inspection and packaged-popup smoke pass. It has
  not been dismissed.
- [Alerts 1](https://github.com/kzahel/web-server-chrome/security/code-scanning/1),
  [2](https://github.com/kzahel/web-server-chrome/security/code-scanning/2), and
  [3](https://github.com/kzahel/web-server-chrome/security/code-scanning/3)
  concern DOM-to-HTML handling in `legacy/index.js` and prototype-pollution
  behavior in `legacy/assets/bundle.js`. These require a separate legacy
  source/released-artifact reachability review. They are not fixed or
  dismissed by this dependency cleanup. The legacy migration topic owns any
  resulting release or behavior change.

Local validation passed with Node 26.7.0 and Rust 1.98.1: frozen pnpm install,
workspace typechecks, tests, Biome, builds, desktop source gates, ChromeOS Linux
gates, extension package inspection, and real packaged-popup smoke in the
separately identified Playwright Chrome for Testing. The E2E npm project passes
clean install and typechecking. Actual Tauri/WebKitGTK product E2E requires
Linux and remains a hosted check for this change.
