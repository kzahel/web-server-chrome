# 008: AppImage-First Linux Distribution

Status: **source candidate and local Linux validation complete; signed
follow-up release and public download deployment pending.**

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
release through the GitHub Releases API, and retains pinned `v0.1.4` fallback
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

This validates the source repair and installer behavior but does not substitute
for testing the exact signed follow-up artifact or a real signed update.

## Validation contract

Before deploying the download page or broadly promoting the desktop app:

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
  `ok200.app/download` is deployed.

## Release order

1. Land the runtime, `v0.1.5` changelog, release-policy, and documentation
   changes. Hold the `website/` changes, the README download-link edit, and the
   Pages-workflow edit separately because any `website/**` push to `main`
   automatically deploys GitHub Pages.
2. From a clean tree, run `./scripts/release-desktop.sh 0.1.5` to publish the
   signed desktop follow-up through the existing fail-closed gate.
3. Test the exact public AppImage as a clean install and signed update.
4. Update the website and installer's pinned fallback tag to the accepted
   release, then land those changes; the existing Pages workflow deploys them.
5. Update the living topics and this tactical with the release tag, hashes,
   CI run, and public deployment evidence.
