# ChromeOS Crostini Fallback

Status: **scoped; physical x86_64 feasibility now includes the complete
disposable offline handoff from a cached non-terminal Launcher app through a
stopped Crostini VM and local external-message page into a dormant extension
worker. The extension launch/optional-permission slice is implemented, but no
supported Rust controller/graphical launcher helper, installer, setup/control
product, or release artifact ships yet.**

Last updated: **2026-08-02**.

Topic: `chromeos-crostini-launcher`

Related continuing concern:

- [ChromeOS extension launcher](../topics/chromeos-extension-launcher.md)
- [ChromeOS Crostini launcher/controller](../topics/chromeos-crostini-launcher.md)
- [Extension and ChromeOS release closeout](011-extension-launcher-and-chromeos-network-readiness.md)
- [Desktop runtime](../topics/desktop-runtime.md)

## Objective

Give ChromeOS users who cannot or do not want to enable Google Play a small,
honest, supportable local web-server path through the Linux development
environment. The result should install from one documented Terminal command,
appear in the ChromeOS Launcher, open its local browser surface, and explain the
one additional ChromeOS port-forwarding step required for other LAN devices.

This fallback does not make the extension the HTTP server. It does not require
developer mode, Android, npm, the desktop AppImage, mDNS, UPnP, or public
Internet exposure.

## Product recommendation

Build this path around the existing Tauri-independent Rust `ok200-core`, not
the published Node CLI or the full desktop AppImage:

- publish verified `x86_64` and `aarch64` Linux binaries from a sufficiently
  old glibc baseline or as static musl builds;
- install per-user under `~/.local/bin` with a versioned, checksum-verifying
  `https://ok200.app/install-crostini.sh` script;
- install a non-terminal `.desktop` launcher with the real 200 OK icon;
- have a small launcher helper briefly map a branded startup window, start or
  focus the controller, wait for its local control surface, and open it in
  Chrome. The controller stays headless, but the mapped window is required for
  reliable repeat launches on the tested ChromeOS build;
- default to a Linux-owned folder such as `~/Downloads`, which appears under
  **Linux files** in the ChromeOS Files app;
- explain **Share with Linux** before accepting ChromeOS My Files or Drive
  paths; and
- keep LAN ingress off until the user explicitly enables it and adds the same
  TCP port under **Settings -> About ChromeOS -> Developers -> Linux
  development environment -> Port forwarding**.

The extension should eventually own a full-page ChromeOS setup and control UI,
while the Crostini binary runs as a small authenticated headless controller.
Essential install, start, recovery, update, and uninstall guidance must be
bundled in the extension so it remains readable offline; the website mirrors
that content but is not its only copy. Request any optional local-host
permission only after the user chooses **Use the Linux version**, and do not
ship discovery or automatic claim until a physical prototype proves the exact
hostname, CORS, permission, origin, and token behavior.

The provisional first install uses one Terminal command to run a verified
per-user installer. After registration, the user normally clicks **200 OK
Linux** in the ChromeOS Launcher. ChromeOS can wake Linux through that installed
`.desktop` app; the extension itself cannot start the VM. The complete user
journey, security boundary, and recovery copy live in the focused Crostini
topic.

## Why not the existing Linux products

The Node `ok200` CLI is a capable TypeScript server with an embedded management
UI, but it requires Node 18 or later and introduces npm installation and update
behavior into the fallback. The current desktop AppImage has a complete native
picker and UI, but it is substantially larger, brings WebKit/GUI packaging
dependencies, and has not been accepted inside Crostini.

The Rust workspace already contains a standalone CLI in
`desktop/core/src/main.rs`. It is currently documented as development-only,
but it has the right server boundary and options for a small Crostini product.
It lacks the product controller, persisted settings, single-instance behavior,
folder-selection workflow, installer, icon, update path, and release artifacts.
Those are the implementation slice; the HTTP core does not need to be
rewritten.

## Physical evidence: Play disabled

The Stable ChromeOS testbed was exercised with the exact unpacked
`extension-v0.1.4` ZIP after removing Google Play and Android apps through
ChromeOS Settings. Removal warned that downloaded Android apps and local app
data would be deleted; the user explicitly authorized that destructive test.

Observed behavior:

- the extension popup did not change, as expected from the public-API
  detection boundary;
- **Open installed Android app** opened a blank `intent:` tab, the same failure
  seen when Play was enabled but 200 OK was absent;
- **Install or other ChromeOS options** reliably opened
  `https://ok200.app/chromeos`;
- **View on Google Play** opened ChromeOS's Google Play setup and current Terms
  dialog rather than a passive web listing; and
- Settings continued to show **Google Play Store** as a setup entry. Its
  presence therefore does not mean Play is enabled.

The owned options route is a sufficient reliable escape hatch for the
submitted extension, but its next copy revision should say that the Play link
may ask the user to turn Play back on. Users who deliberately decline Play
should be told to skip both Android actions. If the Play entry is absent or
administrator-blocked, the Android route is unavailable.

The policy-disabled and Play-unsupported device fixtures remain untested. The
owned HTTPS route is independent of Play and is the accepted fallback for
those states.

## Physical evidence: Crostini

The same Chromebook has an existing default Crostini environment. The test
used ChromeOS milestone 150 with a Debian 12 `penguin` container on x86_64.
The temporary server, launcher entries, LAN port-forwarding entry, build tree,
and processes were removed after the test; the Linux VM was returned to its
stopped state.

### Runtime and packaging

- Rust `ok200-core` built from the current repository inside Crostini with
  `cargo build --locked --release -p ok200-core`.
- The resulting dynamically linked x86_64 binary was 2,404,648 bytes and had
  five reported dynamic dependency lines.
- It served both Linux `~/Downloads` and an already shared ChromeOS folder.
- Chrome opened the exact directory listing at both
  `http://localhost:18080/` and `http://penguin.linux.test:18080/`.

This proves the native core is small and functional. It does not prove the
future release binaries on ARM64 or across older supported Crostini images.

### Networking

- ChromeOS host loopback reached a Crostini listener on `0.0.0.0:18080`
  without any manual setting.
- A second physical LAN client timed out at the Chromebook's Wi-Fi IPv4 and
  port before ChromeOS port forwarding was enabled.
- Adding TCP port `18080` under ChromeOS's Linux **Port forwarding** page made
  the same external request return HTTP 200.
- Removing that entry made external ingress time out again.

This matches Google's current documentation: Linux must be running, and
ChromeOS's explicit port-forwarding list controls access from phones or other
computers on the LAN. The user-facing address is the Chromebook host IPv4 plus
the forwarded port, not a Crostini guest address.

References:

- [Set up Linux on a Chromebook](https://support.google.com/chromebook/answer/9145439)
- [ChromeOS port forwarding](https://developers.google.com/chromeos/app-development/develop/port-forwarding)
- [Systems supporting Linux on ChromeOS](https://www.chromium.org/chromium-os/chrome-os-systems-supporting-linux/)

Chromium currently says that, unless otherwise specified, ChromeOS devices
launched in 2019 or later support Linux. Work/school policy, child/secondary
profiles, older hardware, and user choice still prevent treating Crostini as a
universal fallback.

### Launcher and files

A temporary user `.desktop` entry appeared in ChromeOS app search. A
non-terminal wrapper successfully:

1. launched the Rust server;
2. waited for the local URL to answer; and
3. used `xdg-open` to show the directory listing in Chrome.

A `Terminal=true` user-installed entry appeared in search but opened an empty
Terminal instead of executing its command, while the distribution-owned Htop
entry worked. Do not base the product on a terminal-mode desktop entry. The
non-terminal controller/launcher path passed once; the later repeat-cold test
below refined the recommended shape to include a transient graphical window.

A second disposable fixture tested the missing cold path. With all Terminal
surfaces and the controller tab closed, `termina` stopped, and the fixture URL
unreachable, the cached app remained in the ChromeOS Launcher. Clicking it
woke the VM/container, started one user service, and opened the exact local
page in Chrome without opening Terminal. A repeated click while active did not
start a second service in this fixture. This proves stopped-VM wake after the
Linux app has been registered; it does not yet prove persistence after a full
ChromeOS reboot/login or the accepted local external-message handoff into the
extension UI.

A direct follow-up test established what not to use: `xdg-open` on the
installed extension's `chrome-extension://...` UI URL failed through ChromeOS
Garcon with `Failure in OpenUrl`, `xdg-open` reported no available method, and
no extension target opened. The production launcher must open its own
`http://penguin.linux.test:<control-port>/launch-chromeos` page, which then
wakes the extension through `runtime.sendMessage`.

The external-message fixture then exposed a second lifecycle boundary. A
direct windowless wrapper and a detached systemd launcher, with both startup
notification settings, each launched once but did not receive another host
`LaunchContainerApplication` request after the UI closed and the VM was
stopped again. A fresh `Terminal=false` entry that mapped an auto-closing
**Opening 200 OK Web Server…** test window passed two consecutive full stopped-
VM launch cycles, each ending with one service and one extension controller
tab. The production launcher therefore needs a tiny branded graphical startup
surface; its controller can remain headless.

The default Linux home is visible under **Linux files**. ChromeOS-owned folders
must be shared with Linux before the server can read them. An MVP can safely
serve `~/Downloads`; serving arbitrary ChromeOS folders needs an explicit
shared-folder selection and path UX rather than pretending a browser directory
picker grants a persistent Linux filesystem path.

## Implementation ledger

### C1 - productionize the native binary

- [ ] Give the Crostini binary a stable product name and release identity
      without silently replacing the feature-richer npm CLI.
- [ ] Add version output, persisted configuration, single-instance locking,
      clear bind failures, and machine-readable readiness/status.
- [ ] Preserve localhost-only as the safe default; make LAN binding explicit.
- [ ] Build and test x86_64 and ARM64 assets against the oldest claimed
      Crostini runtime.
- [ ] Publish SHA-256 manifests and reject unverified downloads.

### C2 - create install, update, and uninstall paths

- [ ] Add a source-controlled installer modeled on JSTorrent's Crostini
      installer: architecture selection, immutable release URL, checksum
      verification, per-user install, and `--uninstall`.
- [ ] Install the branded icon, a non-terminal `.desktop` launcher, and the
      transient graphical startup helper proved necessary on M150.
- [ ] Make repeated installation an idempotent update.
- [ ] Remove only files owned by the installer and never delete served user
      content or the Crostini environment.

### C3 - complete the launcher/controller UX

- [x] Prove with a disposable physical fixture that a cached non-terminal
      ChromeOS Launcher app can wake a stopped VM/container, start one
      controller service, and open its local browser UI without Terminal.
- [x] Prove with a second disposable fixture that the local page wakes a
      dormant extension worker, hands off to the bundled controller page,
      and reconnects after stopped-VM wake.
- [x] Reject direct and detached windowless launcher commands after each
      launched only once per ChromeOS login, then prove a transient mapped
      startup window permits two consecutive stopped-VM launch cycles with one
      controller tab and service each time.
- [ ] Repeat warm, stopped-VM, and full-reboot/login tests with the production
      Rust controller and prove its local launch page wakes a dormant extension
      worker and focuses one extension control surface.
- [ ] Provide start, stop, root, port, localhost/LAN, directory-listing, CORS,
      and SPA settings at the existing native-core capability level.
- [ ] Start with Linux `~/Downloads`; document **Linux files** and **Share with
      Linux**, then add a tested shared-folder selection flow.
- [ ] Present the Chromebook host IPv4 instructions and exact ChromeOS
      port-forwarding path when LAN is enabled.
- [ ] Explain that the installed Launcher item wakes Linux, retain a
      Terminal-once recovery path, and prove behavior after a full ChromeOS
      reboot before finalizing systemd policy.
- [ ] Do not silently keep serving a folder after the user believes the app has
      stopped.

### C4 - integrate the website and extension

- [ ] Bundle a full-page Crostini setup/recovery guide in the extension with
      supported-device caveats, Linux setup, one verified install command,
      Launcher instructions, Linux-files guidance, and LAN forwarding.
- [ ] Mirror the bundled guide on an owned Crostini website page without making
      the extension depend on that page at runtime.
- [ ] Update `/chromeos` from **Future option** only after the exact installer
      and both architecture assets pass.
- [ ] Add the **Use the Linux version** route and ChromeOS-specific control UI;
      do not claim direct launch or automatic controller detection until its
      physical protocol gates pass.
- [x] Add the exact `penguin.linux.test` launch-page origin to
      `externally_connectable`, accept only a narrow open/focus message, and
      keep normal launch independent of `ok200.app` and Internet access; the
      physical M150 disposable handoff passed.
- [x] Declare controller access under `optional_host_permissions` rather than
      required host access, request it from a contextual controller page, and
      physically record the exact additional-permission prompt and successful
      health request.
- [ ] Physically inspect a packed update for install/update warning changes and
      prove a fresh-install denial path. M150 showed no separate Local Network
      Access prompt for the successful extension-origin controller request.
- [ ] Test Android-installed, Play-enabled/app-absent, Play-disabled, and
      Crostini paths together so Crostini does not obscure the recommended
      Android route.

## Acceptance matrix

| Gate | Required evidence |
|---|---|
| Install | Fresh default Debian Crostini on x86_64 and ARM64 installs one verified command without npm or developer mode |
| Launcher | Disposable stopped-VM wake and two consecutive cold launches with a transient mapped startup window passed; windowless user launchers became stale after one host launch, and direct `chrome-extension://` handoff failed. The production graphical helper/local HTTP bridge must still pass repeat running, stopped, and full-reboot/login launch and focus one extension control surface without Terminal |
| Files | Linux `~/Downloads` and one ChromeOS folder explicitly shared with Linux serve exact fixtures; unshared paths fail clearly |
| Local browser | `localhost` or the accepted stable Crostini hostname reaches the server without a ChromeOS LAN port entry |
| LAN off | A second device cannot reach the server through the Chromebook LAN address |
| LAN on | After the documented ChromeOS port entry, a second device fetches the exact fixture at the shown Chromebook IPv4 and port |
| Lifecycle | Stop, reboot, Linux shutdown, suspend/resume, port conflict, update, and uninstall are truthful and leave no unintended listener |
| Extension | Bundled instructions and `penguin.linux.test` launch work offline; external messaging adds no install/update warning; optional host plus any Local Network Access prompts are contextual; deterministic discovery, exact-origin claim/token, and control UI pass physically |
| Unsupported | Managed/child/secondary/old-device copy directs users to another supported device without a dead loop |

## Release boundary

This tactical does not authorize a tag, website deployment, extension update,
or release upload. The current submitted Android and extension releases remain
valid without Crostini. Crostini becomes a public supported option only after
the acceptance matrix passes on exact release artifacts.
