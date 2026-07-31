# 008: AppImage-First Linux Distribution

Status: **complete. Signed public `v0.1.5` direct and checksum-verified
AppImages pass prior-public update, server, stable native-host/desktop identity,
and production-extension acceptance; evidence is recorded in Tactical 009.**

Topics:

- `desktop-native-core`
- `desktop-release-readiness`
- `legacy-app-migration`

Parent:

- [`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md)

Living state:

- [`../topics/desktop-runtime.md`](../topics/desktop-runtime.md)
- [`../topics/desktop-release-readiness.md`](../topics/desktop-release-readiness.md)
- [`../topics/legacy-app-migration.md`](../topics/legacy-app-migration.md)

## Objective

Make the Linux AppImage the clearly recommended desktop distribution without
removing DEB or RPM alternatives:

1. install and update the recommended path entirely as the current user;
2. make direct and installer-managed AppImages launchable from the Chrome
   extension;
3. expose one stable verified installer and a public download page;
4. keep future release metadata explicit about the recommended package; and
5. prove the exact signed follow-up artifact before promoting desktop broadly.

## Accepted package policy

- **AppImage is the recommended Linux package.** The supported installer puts
  it at `~/.local/bin/200-ok.AppImage`, requires no administrator token, and
  lets Tauri replace the writable AppImage during a signed update.
- **DEB and RPM remain published secondary system packages.** Their
  installation requires administrator privileges and their updates are
  manual unless a future bundle-aware package update policy is accepted.
- **Linux ships x86_64 and ARM64.** ARM64 packages are built natively on
  GitHub's `ubuntu-22.04-arm` runners, which are free for this public
  repository. The download surface reveals ARM64 links only when the resolved
  release actually publishes them, so pre-`0.1.5` releases still present
  x86_64 alone.

This follows the already-shipped JSTorrent policy while retaining native
packages for users who deliberately prefer system installation.

## Implementation

### AppImage identity and native messaging

When running inside an AppImage, the desktop application now:

- canonicalizes and records the real `$APPIMAGE` path under the shared
  `ok200-native` configuration directory;
- copies the native messaging sidecar out of the temporary FUSE mount as
  before;
- installs `~/.local/share/applications/200-ok.desktop` with the recorded
  AppImage as its `Exec` target; and
- copies a stable user-level application icon.

The copied native host now checks, in order:

1. a packaged desktop binary beside itself;
2. the recorded AppImage path;
3. the installer-managed `~/.local/bin/200-ok.AppImage`; and
4. the `gtk-launch 200-ok` desktop identity.

This preserves DEB/RPM behavior and repairs the AppImage-only extension
launcher without depending on a temporary FUSE path.

### Verified user installer

`https://ok200.app/install.sh`:

- resolves the latest public `desktop-v*` release;
- downloads its `SHA256SUMS` and refuses a missing or mismatched AppImage;
- installs the AppImage, extracted host, icon, desktop entry, recorded path,
  and native messaging manifests below the current user's home directory; and
- never invokes `sudo`, `pkexec`, `apt`, `dpkg`, or `rpm`.

The installer also places a stable sibling launch link for compatibility with
the already-published `v0.1.4` native host.

### Download and release surfaces

The static site now has `/download`, resolves the latest public `desktop-v*`
release through the GitHub Releases API, and retains pinned `v0.1.5` fallback
links if discovery fails. Linux presents the verified AppImage installer and
direct AppImage first; DEB/RPM are grouped as administrator-requiring
alternatives. macOS continues to recommend PKG and Windows continues to
recommend the current-user NSIS EXE.

The page also detects the visitor's platform and moves that card first with a
"Detected on this device" badge. Detection is a separate synchronous pass from
release discovery, so it still works when the GitHub API is unreachable, and it
declines to claim a desktop build on Android or ChromeOS. ARM64 links are
hidden only after a *successful* lookup proves the asset absent; a failed
lookup leaves the pinned fallbacks in place.

The homepage hero now leads with a Download call to action. The email signup
remains, demoted to a secondary action beneath it.

Future GitHub release bodies label AppImage as the recommended Linux artifact.
The release validator also rejects Linux updater metadata that does not point
to the release's AppImage, for both `linux-x86_64` and `linux-aarch64`.

## Local validation evidence

On Ubuntu 24.04 x86_64:

- Rust formatting, strict workspace Clippy, workspace tests, TypeScript
  typechecking/tests, release-validation tests, and the Astro production build
  pass;
- the installer downloaded the exact public `v0.1.4` AppImage into an isolated
  home, verified it against the public `SHA256SUMS`, created the expected
  per-user integration, and passed an idempotent rerun;
- an unsigned source AppImage launched from a path containing spaces, recorded
  that path, installed the desktop identity, and kept the browser manifest on
  the stable copied host;
- the stable copied host launched the running AppImage and returned
  `{"action":"launch","ok":true}`; and
- relaunch atomically refreshed the copied host rather than failing with
  `ETXTBSY` while the old helper was executing.

This was the pre-release source proof. The exact signed `v0.1.5` direct and
installer-managed paths later passed the full contract below; see Tactical 009.

## Validation contract

The download page was deployed before the signed follow-up and accepted by the
maintainer on 2026-07-31 because current traffic is low and its fallback points
to the already accepted public `v0.1.4` release. Before broadly promoting the
desktop app:

- Rust formatting, strict Clippy, and workspace tests pass;
- release-validation tests and the Astro production build pass;
- an isolated-home run of the public installer verifies the exact published
  checksum and creates only the expected per-user files;
- direct AppImage launch from an arbitrary writable path records a usable
  stable path and desktop identity;
- the published extension detects the copied host and launches/focuses one
  AppImage process;
- a signed AppImage updates from the previous public version and retains
  settings, native messaging, and serving behavior; and
- the exact follow-up AppImage passes visible start/serve/stop smoke before
  the page is used for broad migration promotion.

## Completed release order

1. The runtime, release policy, download surface, and documentation changes
   landed before the signed follow-up, with the accepted `v0.1.4` fallback.
2. `./scripts/release-desktop.sh 0.1.5` and corrected tagged run
   `30648571816` published the signed follow-up through the fail-closed gate.
3. The exact public AppImage passed clean verified install and signed
   `0.1.4` → `0.1.5` update, including server and production-extension smoke.
4. The website and installer's pinned fallback moved to `desktop-v0.1.5`.
5. Immutable hashes, host evidence, and remaining claim-only gaps are recorded
   in Tactical 009 and the living topics.
