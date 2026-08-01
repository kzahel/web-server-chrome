# Commit Topics

Registry of topic strings used in `Topic:` commit trailers. This is not an
index of `docs/topics/`, though a continuing concern normally uses the same
slug in both places.

Keep each string exact across its commit series so
`git log --grep "Topic: ..."` finds the chain.

- `desktop-native-core` — replace the desktop webview-hosted TypeScript HTTP
  engine with a Rust core shared by the Windows, macOS, and Linux Tauri builds.
- `desktop-release-readiness` — make desktop CI, signing, notarization,
  updater metadata, and published artifacts fail closed and independently
  verifiable.
- `legacy-app-migration` — use the final Chrome App update window to route
  legacy users to a working platform-specific replacement without abusive
  reminder behavior or misleading product claims.
- `android-native-kotlin` — replace Android's embedded QuickJS/TypeScript HTTP
  runtime with a native Kotlin server while maintaining a tested, broadly
  compatible feature contract with desktop.
