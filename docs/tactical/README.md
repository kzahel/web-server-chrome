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
| [`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md) | historical parent record; continuing release/store work moved to 009 and 011 | Sequence the completed desktop Rust-core migration and original release/legacy dependency graph |
| [`001-fail-closed-desktop-releases.md`](001-fail-closed-desktop-releases.md) | complete; `desktop-v0.1.4` tagged proof accepted | Stage signed desktop assets in a draft, validate completeness, and publish once |
| [`002-standalone-rust-http-core.md`](002-standalone-rust-http-core.md) | complete | Build a Tauri-independent native HTTP core and development CLI |
| [`003-native-desktop-control-surface.md`](003-native-desktop-control-surface.md) | complete; macOS smoke accepted | Cut the desktop control surface over to Rust state with native folder selection and safe lifecycle UX |
| [`004-portrait-desktop-polish-and-directory-listing.md`](004-portrait-desktop-polish-and-directory-listing.md) | complete; macOS smoke accepted | Restore the portrait control appliance, canonical branding, calm lifecycle UX, and browser-like Rust directory listing |
| [`005-in-app-desktop-updater.md`](005-in-app-desktop-updater.md) | complete; `v0.1.5` cross-platform transitions and safety accepted | Provide manual and daily update checks, in-app status, and signed update-and-restart flow |
| [`006-windows-desktop-validation.md`](006-windows-desktop-validation.md) | historical unsigned validation; signed `v0.1.5` closure in Tactical 009 | Build and drive the Rust-core app and unsigned installers on Windows, separating source smoke from signed-release evidence |
| [`007-linux-desktop-validation.md`](007-linux-desktop-validation.md) | historical `v0.1.4` evidence; AppImage defect closed by `v0.1.5` in Tactical 009 | Validate the exact public Linux packages, installed extension bridge, and package-specific remaining gaps |
| [`008-appimage-first-linux-distribution.md`](008-appimage-first-linux-distribution.md) | complete; signed `v0.1.5` direct/installer AppImage accepted | Make AppImage the verified per-user Linux default and repair its extension launch path |
| [`009-release-confidence-closeout.md`](009-release-confidence-closeout.md) | desktop artifact lane complete; desktop repair delegated to 015; maintainer/store migration lane active | Separate agent-owned release gates from maintainer/device sign-off and record the final go/no-go ledger |
| [`010-native-kotlin-android-server.md`](010-native-kotlin-android-server.md) | complete; QuickJS/JNI fully removed; phone/tablet AVD gates passed | Replace Android's former QuickJS/TypeScript runtime with one native Kotlin server and align the core desktop/Android feature contract |
| [`011-extension-launcher-and-chromeos-network-readiness.md`](011-extension-launcher-and-chromeos-network-readiness.md) | active; source candidate physically accepted, final artifact/store proof open | Close launcher/store loose ends and make ChromeOS Android URLs truthful and externally usable |
| [`012-chromeos-crostini-fallback.md`](012-chromeos-crostini-fallback.md) | active release closeout; public component and core physical transactions complete, deferred lifecycle proofs remain | Provide a verified mini-Rust Linux fallback for ChromeOS users without Google Play, with bundled extension setup/control, Launcher, shared-folder, and LAN-port guidance |
| [`013-retire-typescript-cli.md`](013-retire-typescript-cli.md) | complete; CLI, engine, release lane, browser transport, and current claims removed | Retire the unpublished Node/TypeScript CLI and engine while preserving the internal Rust core development CLI |
| [`014-chromeos-crostini-product-completion.md`](014-chromeos-crostini-product-completion.md) | active parent sequencing tactical | Finish the ChromeOS Linux folder, lifetime, control UI, URL, uninstall, accessibility, and physical-testbed experience |
| [`015-desktop-production-validation.md`](015-desktop-production-validation.md) | active; `v0.1.6` functional acceptance failed | Repair the desktop settings/lifecycle defects and accept the next exact public release with the production updater, website, and real store extension on all three desktop OSes |
| [`016-native-swift-ios-app.md`](016-native-swift-ios-app.md) | complete; native MVP and physical-device acceptance passed | Build a standalone native SwiftUI/Swift iOS app and prove foreground serving over a real LAN through the physical-device testbed |
| [`017-ios-store-readiness.md`](017-ios-store-readiness.md) | planned follow-up; external store mutations require explicit authorization | Package, distribute, review, and accept the exact App Store-delivered iOS build |
