# 007: Linux Desktop Validation

Status: **historical `v0.1.4` DEB/AppImage evidence. Signed `v0.1.5` closes the
AppImage relaunch defect and passes exact AppImage/DEB updater and production
extension acceptance in Tactical 009. Native RPM and physical ARM64 product
smoke remain claim-only gaps.**

Topics:

- `desktop-native-core`
- `desktop-release-readiness`

Parent:

- [`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md)

Living state:

- [`../topics/desktop-runtime.md`](../topics/desktop-runtime.md)
- [`../topics/desktop-release-readiness.md`](../topics/desktop-release-readiness.md)

## Objective

Exercise the exact public Linux `desktop-v0.1.4` artifacts on a native Linux
host, separating server/package acceptance from updater and package-specific
native-messaging gaps.

The observable exit contract was:

1. independently download and checksum the public AppImage, DEB, and RPM;
2. install and launch the DEB through the host package manager;
3. select a folder through the native GTK chooser, start through the visible
   UI, fetch from outside the webview, stop, and prove old-port teardown;
4. exercise persistence, background lifecycle, native-host framing, and a real
   extension-to-host launch;
5. launch and serve through the AppImage itself;
6. inspect the RPM without treating an Ubuntu-side metadata query as a native
   RPM install; and
7. record updater and package-specific gaps without broadening the result.

## Preflight and environment

The checkout was clean at
`5d081d108d2634b3783aa601533ac9f9b52a37c3`, on `main` tracking
`origin/main`. The release tag targets
`2b7f41624109e2d1a464944e71b13bfae29ceebc`.

The host was:

- Ubuntu `24.04.4 LTS` (`noble`), x86_64;
- kernel `7.0.0-28-generic`;
- WebKitGTK `2.52.3`;
- headless X11 through Xvfb plus Openbox for normal close-window behavior;
- `tauri-driver 2.0.6` for published-binary webview automation; and
- Google Chrome for Testing `145.0.7632.6` through Playwright Core `1.58.2`
  for the extension invocation.

`200-ok` was not installed before the run. The DEB was removed afterward.
Product-owned state created during the run was moved to the run's temporary
backup, and no product process or listener remained.

## Exact public artifacts

All files were downloaded from the public
[`desktop-v0.1.4`](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.4)
release and passed `sha256sum -c SHA256SUMS --ignore-missing`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `200.OK_0.1.4_amd64.AppImage` | 86,239,736 | `96b2ba594aa1b1321b3a8ad7f5e967e05bb7a72fcf2a308bdedc14cd7d947fcf` |
| `200.OK_0.1.4_amd64.deb` | 9,244,904 | `7e28b1a9fb2266cdde0187556ec12d6f97c76f70c5539670f1d736b4bc3b3c64` |
| `200.OK-0.1.4-1.x86_64.rpm` | 9,244,513 | `5b2ae5b97e8ddc39a76a26899108332ccf6a966720d52e1c68d6f5565309d831` |

The DEB reports package `200-ok`, version `0.1.4`, architecture `amd64`, and
dependencies on GTK 3, WebKitGTK 4.1, and AppIndicator 3. Its installed payload
contains `/usr/bin/ok200-desktop`, `/usr/bin/ok200-host`, the desktop entry,
and the expected icon set.

The RPM reports package `200-ok-0.1.4-1.x86_64`, the equivalent two binaries,
desktop entry, icons, and native GTK/WebKit/AppIndicator dependencies. It has
no RPM package signature; the published SHA-256 file is the recorded Linux
integrity mechanism. The RPM was not installed because this host is
Debian-family rather than an RPM-native clean environment.

## DEB product smoke

The public DEB installed normally through `apt`, resolving its declared
dependencies. The app launched as the installed `/usr/bin/ok200-desktop`
binary and rendered the compact `410x700` Wry/WebKitGTK control surface.

The product flow passed:

| Check | Result | Evidence |
|---|---|---|
| Native folder selection | Pass | The visible **Choose…** control opened `Choose Folder to Serve`; the GTK chooser selected the checkout without calling `server_update_config` for the root. |
| Automatic port and visible Start | Pass | The visible port control committed `0`; the visible Start switch produced loopback ports including `37145`, `42277`, and `36775`. |
| External file serving | Pass | `GET /docs/vision.md` returned 200, `text/markdown; charset=utf-8`, the exact file body, and `server: ok200`. |
| Directory listing | Pass | `GET /docs/` returned the Rust-generated listing containing `topics/` and `tactical/`. |
| Visible Stop and teardown | Pass | The visible Stop switch returned state to `stopped`, cleared `actualPort`, and the old port refused requests. |
| Persistence | Pass | A full exit/relaunch restored the selected root, port `0`, loopback host, and directory-listing option from `server.json`. |
| Background lifecycle | Pass | A normal window-manager Alt-F4 hid the window while one desktop PID remained. |
| Native host framing/launch | Pass | The exact installed sidecar returned handshake version `0.1.4`, pong, and `{"action":"launch","ok":true}`; it restored the hidden single existing window without leaving a second desktop process. |

The runtime registered `app.ok200.native.json` for the existing Google Chrome,
Chromium, Brave, and Edge configuration roots. Each manifest allowed only
extension `lpkjdhnmgkhaabhimpdinmdgejoaejic` and pointed to
`/usr/bin/ok200-host`.

### Real extension invocation

The exact public `extension-v0.1.3` ZIP was downloaded separately; its SHA-256
was
`59b510b0d53f99b109a2603933afd5beebee6ea7f2b2e7719dd8c0f958591fb6`.
Chrome Web Store packages receive their identity from the store, so the
extracted ZIP has no manifest `key`. For an unpacked test only, the published
extension RSA public key was injected into the extracted manifest to reproduce
the production ID. The published JavaScript and other package files were not
rebuilt or changed.

The isolated Chromium profile needed a copy of the app-created manifest under
that profile's `NativeMessagingHosts` directory because Chromium resolves
native-host manifests relative to an explicit non-default `--user-data-dir`.
The copied manifest bytes and installed host path were unchanged.

The browser test then passed end to end:

- service worker URL:
  `chrome-extension://lpkjdhnmgkhaabhimpdinmdgejoaejic/sw.js`;
- popup: `Desktop app detected (v0.1.4).`;
- popup action: **Open 200 OK**;
- result: `App launched!`;
- desktop process count after launch: one; and
- visible app-window count after launch: one.

This proves extension popup → service worker → Chromium native messaging →
exact installed helper → desktop single-instance focus for the DEB path.

## AppImage product smoke

The exact AppImage was made executable and launched through its FUSE runtime.
Its mounted executable rendered the same persisted control surface. Using the
visible switch, it bound `127.0.0.1:36611`, served the exact
`/docs/vision.md` body with the expected headers, stopped, and left the old
port closed.

The AppImage emitted host-system GVFS module warnings about
`g_task_set_static_name` and DRI3 acceleration warnings under Xvfb. The tested
UI, HTTP, stop, persistence, and current updater-check flows still completed.
These warnings are recorded for compatibility follow-up, not classified as a
functional failure from this run.

The AppImage's headless `--check-update` mode exited successfully and wrote
`{"available":false}` for current `0.1.4`. This proves native current-version
detection, not an installed update transition.

The AppImage correctly detected its temporary FUSE mount, copied its sidecar
to `~/.local/lib/ok200/ok200-host`, made it executable, and changed the
browser manifests to that stable path.

### AppImage native-host relaunch defect

The stable copied AppImage host cannot launch or focus an AppImage-only
installation. Its Linux launch logic looks for a desktop binary beside the
copied host and then calls:

```text
gtk-launch 200-ok
```

No sibling desktop binary exists under `~/.local/lib/ok200`, and the published
desktop entry is named `200 OK.desktop`, not `200-ok.desktop`. On this host:

```text
gtk-launch: no such application 200-ok
```

The exact stable sidecar consequently returned:

```json
[
  {"action":"handshake","name":"ok200-host","version":"0.1.4"},
  {"action":"launch","ok":false,"error":"could not find 200 OK app"}
]
```

This is a product correctness defect in the AppImage native-messaging path.
It does not invalidate the AppImage's server smoke or the passing DEB
extension path, but it blocks a blanket claim that extension launch works for
every published Linux package. A repair needs a persistent route from the
stable helper to the AppImage, or a reliably installed desktop identity that
the helper actually launches.

## Accepted evidence and remaining gaps

Accepted from this run:

- exact public DEB install, native chooser, visible start/serve/stop,
  persistence, background lifecycle, package removal, and extension launch;
- exact public AppImage launch and visible start/serve/stop;
- independent checksums for all three Linux assets;
- RPM payload and dependency inspection; and
- native current-version updater check.

Still open:

- publish and retest the AppImage-only native-messaging repair implemented in
  [Tactical 008](008-appimage-first-linux-distribution.md);
- install/launch the RPM on a clean RPM-family system;
- exercise an actual installed signed `0.1.3` → `0.1.4` update and verify
  post-update settings, serving, identity, and native messaging;
- tray-menu and autostart behavior on a normal desktop session; and
- broader LAN, CORS, SPA, range, conditional-request, and resource measurements
  beyond the bounded smoke performed here.
