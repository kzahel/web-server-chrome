# ChromeOS Crostini Launcher and Controller

Topic: chromeos-crostini-launcher

Status: **the product shape and provisional user flow are accepted, and a
physical x86_64 ChromeOS experiment proved that an installed non-terminal
Linux `.desktop` entry can wake a fully stopped Crostini VM/container, start a
user service, and open Chrome without opening Terminal. The production Rust
controller, installer, extension control UI, ARM64 artifact, and full-reboot
proof do not exist yet, so this remains a future option rather than a shipped
fallback.**

Last reconciled: **2026-08-02**.

The bounded implementation and acceptance ledger lives in
[Tactical 012](../tactical/012-chromeos-crostini-fallback.md). The parent
extension's Android/Play routing and unsupported-device messaging remain owned
by [`chromeos-extension-launcher.md`](chromeos-extension-launcher.md). The
server implementation should reuse the Tauri-independent Rust boundary owned
by [`desktop-runtime.md`](desktop-runtime.md), without installing the desktop
Tauri application.

## Product decision

The Play-free ChromeOS product should have three cooperating surfaces:

```text
Chrome extension (setup + control UI)
              |
              | local authenticated control protocol
              v
Crostini Rust controller service ----> Rust HTTP server instance
              ^                              |
              |                              v
ChromeOS Launcher `.desktop` app       user-selected folder
```

- The extension owns the ChromeOS-specific setup instructions and normal
  configuration UI. It remains a launcher/controller, not the HTTP server.
- A small headless Rust process inside the default Crostini container owns
  persisted settings, server lifecycle, status, and the local control API. It
  should embed or call the existing `ok200-core` rather than require Node/npm
  or install the full Tauri/AppImage desktop product.
- A branded `Terminal=false` `.desktop` entry installed in Crostini is the
  post-install ChromeOS Launcher surface. ChromeOS, not the extension, can use
  that registered Linux app to wake a stopped VM/container and execute its
  launcher command.
- Starting the controller must not silently start serving the last folder.
  The controller can remain available while Linux is running, but the content
  server starts only after an explicit user action or an independently
  accepted opt-in auto-start setting.

The extension cannot start the Crostini VM through a public extension API and
must never claim that it can. The installed Linux Launcher item is the key
mechanism that removes the need to reopen Terminal after every shutdown.

## Offline setup requirement

All essential guidance for enabling Linux, installing 200 OK, starting it,
recovering from a failed launch, updating, and uninstalling must be bundled as
static extension assets. The extension's setup wizard must remain readable
when the website is unavailable.

This is **offline documentation**, not a promise of an offline first install.
The first installer invocation needs a network connection to download and
verify the architecture-specific binary unless a future extension release
deliberately bundles those binaries. `ok200.app` should mirror the same guide
for discovery and support, but the website must not be the only copy.

The setup content should avoid remote scripts, fonts, screenshots, or dynamic
configuration that would make the extension page incomplete offline. Links to
Google's current help and the owned website are useful optional references.

## Provisional first-install user flow

The exact words and paths need physical validation, but this is the accepted
flow to prototype:

1. On ChromeOS, the extension presents two independent choices:
   **Open installed Android app** and **Use the Linux version**. It does not
   infer whether Google Play, Android, or Linux is supported or enabled.
2. **Use the Linux version** opens a full extension tab containing the bundled
   setup wizard. It explains that Linux availability varies on older,
   managed, child, and secondary-profile devices, and that ChromeOS Flex has
   no Android route but may offer Linux on supported hardware.
3. If Linux is not set up, the wizard walks the user through **Settings ->
   About ChromeOS -> Developers -> Linux development environment -> Set up**.
   If that entry is absent or blocked, it gives an honest unsupported/policy
   explanation and links to another supported device rather than looping.
4. For the one-time installation, the user opens Terminal and pastes one
   owned command, provisionally:

   ```sh
   curl -fsSL https://ok200.app/install-crostini.sh | bash
   ```

   Before shipping, the displayed command and installer behavior must be
   versioned, source-controlled, and tested. A download-then-run alternative
   should be documented for users who do not want a pipe to a shell.
5. The installer detects `x86_64` or `aarch64`, downloads an immutable release
   asset plus its checksum manifest, verifies it, and installs only per-user
   files under `~/.local` and the user's service configuration. It installs
   the controller binary, branded icon, user service, and non-terminal
   `.desktop` entry. It should not require `sudo`, npm, developer mode, or
   changes outside the Linux container.
6. The wizard waits for the local controller on a small documented list of
   well-known endpoints. Only after the user selects the Linux path should the
   extension request any optional local-host permission that the final
   protocol requires.
7. A fresh controller accepts the exact production extension origin as its
   first controller, issues a random persistent token, and then closes the
   unclaimed state. The expected path needs no pairing code. The CLI must
   provide explicit status, reset-controller, and token-rotation recovery.
8. When connected, the extension changes from install guidance to the
   ChromeOS control UI. The initial root is a safe Linux-owned folder such as
   `~/Downloads`; choosing a ChromeOS folder first explains **Share with
   Linux** and validates the translated `/mnt/chromeos/...` path.
9. The user explicitly presses **Start server**. The UI shows both the local
   browser URL and, only when LAN mode is enabled, the Chromebook host address
   plus ChromeOS's separate Linux port-forwarding instructions.
10. Terminal may be closed after installation. The controller and server
    continue according to the displayed state while the Crostini session is
    running.

Provisional setup copy:

> First-time setup needs an Internet connection and one Terminal command.
> After setup, open **200 OK Linux** from your Chromebook Launcher.

> Don't see Linux in Settings? Your Chromebook, account, or administrator may
> not allow it. You can still use 200 OK on Android or another desktop device.

## Provisional everyday and reboot flow

After installation:

1. The user clicks **200 OK Linux** in the ChromeOS Launcher.
2. ChromeOS wakes the default Linux VM/container if it is stopped and runs the
   non-terminal launch command.
3. The command starts or focuses the single controller service and waits for
   its authenticated health endpoint.
4. It opens or focuses the extension's ChromeOS control page. Whether
   `xdg-open` can directly focus a `chrome-extension://` page is not yet
   proved. The fallback is a tiny controller-served local bootstrap page with
   an explicit **Open 200 OK extension** action and offline recovery text.
5. The controller reports the content server's true stopped/running state. It
   does not resume serving merely because Linux was woken.

Until a complete ChromeOS reboot/login test passes with the production
launcher, the bundled recovery text should also say:

> If **200 OK Linux** does not start, open Terminal once, close its window when
> Linux finishes starting, and try the 200 OK Launcher item again.

The user should not normally have to keep a Terminal window open. A full OS
reboot requires the user to sign back into ChromeOS, but the installed Linux
app is expected—not yet proved—to remain registered in the Launcher.

## Provisional controller discovery and claim contract

The first prototype should prefer a small deterministic endpoint list over
broad port scanning. Each endpoint must return an exact product identifier,
protocol version, instance identifier, and claim state from `/health`; an
unrelated process on the same port is a collision, not a controller.

Any prototype must preserve this security boundary:

- bind the control API only to Crostini/ChromeOS-local interfaces needed by
  the accepted bridge;
- allow requests only from the exact production extension origin/ID, not
  arbitrary web pages and never wildcard CORS;
- require an unguessable token after the initial claim;
- restrict the unclaimed window to fresh install/reset and make repeated
  claims idempotent for the accepted extension identity;
- keep the control port separate from the served-content port and never tell
  users to add the control port to ChromeOS LAN forwarding; and
- provide an explicit local reset path rather than an undocumented backdoor.

Chrome host permissions, ChromeOS's newer local-network permission behavior,
the exact hostname (`penguin.linux.test`, loopback, or both), CORS/preflight,
and extension-origin claim behavior need a physical end-to-end prototype
before the protocol is accepted. Auto-claim is a desired UX, not evidence that
these browser security details already work.

## ChromeOS-specific control UI

The extension should use a full-page ChromeOS interface rather than squeeze
setup and server controls into the current launcher popup. It may share
protocol types, validation rules, copy, and styling with desktop, but it should
not force the desktop Tauri UI or Android Compose structure onto ChromeOS.

Minimum controls:

- connection/install status and recovery;
- selected root with Linux-files and **Share with Linux** guidance;
- start/stop and truthful single-instance status;
- content port, localhost/LAN bind, directory listing, CORS, and SPA options;
- local URL and copy/open action;
- Chromebook IPv4 plus Linux port-forwarding guidance for LAN mode;
- version, update, logs/diagnostics, reset, and uninstall instructions.

The controller can implement a local filesystem browser rooted in approved
Linux/shared locations. A browser directory picker in the extension cannot by
itself grant the Linux daemon a stable filesystem path.

## Physical launcher experiment

On 2026-08-02, the physical Stable ChromeOS testbed (milestone 150, x86_64,
Debian 12 `penguin`) used a disposable Python HTTP controller fixture, a
systemd user service, the real 200 OK icon, a wrapper, and a
`Terminal=false` `.desktop` entry.

Warm-path observations:

- ChromeOS indexed the entry as an installed Launcher app with the branded
  icon;
- clicking it started the one user service and opened
  `http://penguin.linux.test:18181/` in Chrome; and
- clicking the Launcher item while it was already active did not create a
  second service or an additional launch event in this fixture.

Cold-path procedure and result:

1. All Terminal surfaces and the controller browser tab were closed.
2. `vmc stop termina` stopped the VM, and the controller URL no longer
   answered.
3. The cached **200 OK Cold Start Probe** remained visible in the ChromeOS
   Launcher.
4. Clicking it started the VM/container, made the service active, recorded a
   new launch, and opened the exact controller page in Chrome.
5. No Terminal window was opened or kept alive.

This proves the central `.desktop` wake mechanism after registration. It does
not prove persistence after a full ChromeOS reboot/login, production Rust
single-instance behavior, direct extension-page focus, update behavior, or
other CPU architectures. The fixture, service, transferred files, and browser
surface were removed, and the test VM was returned to its stopped state.

A separate earlier experiment found that a user `Terminal=true` desktop entry
opened an empty Terminal rather than reliably executing its command. The
product must use a non-terminal launcher.

## LAN behavior

Crostini guest addresses are implementation details and must not be presented
as the user-facing LAN address. The accepted flow is:

1. explicitly enable LAN binding in 200 OK;
2. listen inside Crostini on the selected content port;
3. instruct the user to add that same TCP port under **Settings -> About
   ChromeOS -> Developers -> Linux development environment -> Port
   forwarding**; and
4. show the Chromebook host's IPv4 address and forwarded content port.

The control port remains local and is never forwarded. Automatic UPnP is a
separate future concern owned by
[`internet-exposure-and-port-mapping.md`](internet-exposure-and-port-mapping.md)
and does not replace ChromeOS's explicit Crostini port-forwarding gate.

## Update, uninstall, and recovery contract

- Re-running the verified installer performs an idempotent update and preserves
  settings unless a documented migration fails closed.
- The controller exposes its version and can tell the extension that an update
  is available; it must not silently execute an unverified download.
- Uninstall disables/stops the owned user service and removes only files named
  in the installer manifest. It never removes served content, shared-folder
  settings in ChromeOS, or the user's Linux environment.
- Port collision, unsupported architecture, missing Linux integration,
  permission denial, and corrupt configuration produce actionable offline
  messages and commands.
- A CLI status/reset command remains available when the extension cannot
  connect.

## Remaining acceptance gates

Before changing **Future option** to a supported public route:

- [ ] Build the production Rust controller around `ok200-core` with persisted
      settings, explicit content-server lifecycle, readiness, and locking.
- [ ] Publish verified x86_64 and ARM64 binaries compatible with the oldest
      claimed Crostini baseline.
- [ ] Test the source-controlled installer and uninstall path in fresh default
      Crostini environments on both architectures.
- [ ] Install the real `.desktop` launcher and prove warm launch, stopped-VM
      launch, and full ChromeOS reboot/login launch with one controller.
- [ ] Prove whether the launcher can focus the extension control page; accept
      and test the local bootstrap-page fallback if it cannot.
- [ ] Prototype extension discovery, optional host permission, CORS/preflight,
      exact-origin auto-claim, token persistence/rotation, port collisions, and
      controller reset on the physical Chromebook.
- [ ] Test Linux `~/Downloads`, one explicitly shared ChromeOS folder, and
      clear rejection of an unshared path.
- [ ] Test start/stop, logout, Linux shutdown, suspend/resume, port conflict,
      update, uninstall, and recovery without an unintended content listener.
- [ ] Validate Chromebook-host IPv4 presentation and explicit content-port
      forwarding from a second LAN device; never forward the control API.
- [ ] Validate the bundled setup/recovery instructions offline, including
      unsupported, policy-blocked, and ChromeOS Flex wording.

## References

- [Set up Linux on a Chromebook](https://support.google.com/chromebook/answer/9145439)
- [Linux on ChromeOS FAQ](https://developers.google.com/chromeos/app-development/develop/linux-on-chromeos-faq)
- [ChromeOS Linux port forwarding](https://developers.google.com/chromeos/app-development/develop/port-forwarding)
- [Cross-origin network requests in Chrome extensions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Declare optional extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)

## Release boundary

This topic does not authorize a tag, website deployment, extension update, or
store upload. The submitted Android and extension releases remain valid
without Crostini. The maintainer owns approval of the future public route and
all release/store actions after the acceptance gates pass.
