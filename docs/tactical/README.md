# Implementation Tactical Documents

Bounded implementation plans and execution records live here.

Use zero-padded numeric prefixes for new tactical documents:
`000-topic.md`, `001-next-topic.md`, and so on. Keep one active implementation
slice per document when practical. A parent sequencing tactical is acceptable
when it explicitly delegates bounded follow-up slices and remains an index,
deadline ledger, and completion record.

Completed tacticals remain as historical execution records. Update the living
documents under [`../topics/`](../topics/README.md) when current status,
decisions, evidence, or recommended next work changes.

## Current tacticals

| Tactical | Status | Purpose |
|---|---|---|
| [`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md) | active parent; desktop `v0.1.5` accepted, store/legacy lane remains | Sequence release/signing hardening, desktop Rust-core migration, launcher fixes, and the final legacy Chrome App migration window |
| [`001-fail-closed-desktop-releases.md`](001-fail-closed-desktop-releases.md) | complete; `desktop-v0.1.4` tagged proof accepted | Stage signed desktop assets in a draft, validate completeness, and publish once |
| [`002-standalone-rust-http-core.md`](002-standalone-rust-http-core.md) | complete | Build a Tauri-independent native HTTP core and development CLI |
| [`003-native-desktop-control-surface.md`](003-native-desktop-control-surface.md) | complete; macOS smoke accepted | Cut the desktop control surface over to Rust state with native folder selection and safe lifecycle UX |
| [`004-portrait-desktop-polish-and-directory-listing.md`](004-portrait-desktop-polish-and-directory-listing.md) | complete; macOS smoke accepted | Restore the portrait control appliance, canonical branding, calm lifecycle UX, and browser-like Rust directory listing |
| [`005-in-app-desktop-updater.md`](005-in-app-desktop-updater.md) | complete; `v0.1.5` cross-platform transitions and safety accepted | Provide manual and daily update checks, in-app status, and signed update-and-restart flow |
| [`006-windows-desktop-validation.md`](006-windows-desktop-validation.md) | historical unsigned validation; signed `v0.1.5` closure in Tactical 009 | Build and drive the Rust-core app and unsigned installers on Windows, separating source smoke from signed-release evidence |
| [`007-linux-desktop-validation.md`](007-linux-desktop-validation.md) | historical `v0.1.4` evidence; AppImage defect closed by `v0.1.5` in Tactical 009 | Validate the exact public Linux packages, installed extension bridge, and package-specific remaining gaps |
| [`008-appimage-first-linux-distribution.md`](008-appimage-first-linux-distribution.md) | complete; signed `v0.1.5` direct/installer AppImage accepted | Make AppImage the verified per-user Linux default and repair its extension launch path |
| [`009-release-confidence-closeout.md`](009-release-confidence-closeout.md) | desktop release lane complete; maintainer/store migration lane active | Separate agent-owned release gates from maintainer/device sign-off and record the final go/no-go ledger |
