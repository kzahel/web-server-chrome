# iOS Changelog

The iOS marketing version is user-visible and follows `X.Y.Z`. The build
number is a positive integer and increases for every App Store Connect upload,
including rejected and internal-only candidates. Neither value is reused after
an upload. Both canonical values live in `ios/project.yml`; regenerate the
Xcode project after changing them and add the matching entry here.

## 0.1.0 (1) — Unreleased

- Initial native iPhone and iPad application.
- Select a Files directory and serve it read-only over localhost or the local
  network while the app remains in the foreground.
- Directory listings, CORS, SPA fallback, in-app preview, copy, and share
  controls.
- Privacy, feedback/support, and MIT-licensed source links.
