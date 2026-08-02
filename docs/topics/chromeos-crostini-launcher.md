# ChromeOS Crostini Launcher and Controller

Topic: chromeos-crostini-launcher

Status: **the product shape and provisional user flow are accepted. A physical
x86_64 ChromeOS prototype now proves the full disposable launch handoff: an
installed non-terminal Linux `.desktop` entry can wake a fully stopped
Crostini VM/container, start one user service, open its local
`penguin.linux.test` bridge, wake a dormant extension worker, and open or focus
one extension controller surface without Terminal or Internet. Reliable
repeat launch requires a brief transient graphical Linux splash; a completely
windowless launcher became stale after its first host launch. A checked-in
pure-Rust graphical launcher and `.desktop` template now pass warm and two
consecutive stopped-VM launches on the physical x86_64 testbed, including
failure/retry and the extension handoff. The narrow extension bridge and
optional runtime host-permission slice are also implemented, but the
production Rust controller, installer, setup/control UI, ARM64 artifact,
packed-update warning proof, and full-reboot proof do not exist yet. This
remains a future option rather than a shipped fallback.**

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
              | optional authenticated control access
              v
Crostini Rust controller service ----> Rust HTTP server instance
              ^                              |
              |                              v
ChromeOS Launcher `.desktop` app       user-selected folder
              |
              v
controller-served launch page --external message--> extension worker
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
  launcher command. The launcher helper briefly maps a branded **Opening 200
  OK…** window, then closes it after the browser handoff so ChromeOS observes a
  complete graphical-app lifecycle. The controller itself remains headless.
  The implemented helper lives in
  [`desktop/crostini`](../../desktop/crostini), uses the X11 protocol directly
  with DPI-aware embedded glyphs, and adds no GTK, Tauri, `xmessage`, or Xlib
  runtime dependency.
- After the controller answers, the launcher opens its static
  `http://penguin.linux.test:<control-port>/launch-chromeos` page. That page
  sends one external message to wake the extension, whose service worker opens
  or focuses the bundled ChromeOS control UI. No website or persistent
  extension polling is required.
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

Everyday launch must also work offline. The installed `.desktop` entry opens a
controller-served local handoff page rather than depending on
`ok200.app/launch-chromeos`. The owned website may expose the same external
message bridge for installation and diagnostics, but it is not the primary or
fallback launch dependency.

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
   well-known endpoints. Merely allowing the local launch page to message the
   extension uses `externally_connectable`, not host access. Only after the
   user selects the Linux path does the extension explain and request its
   optional permission for direct controller requests.
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

Provisional permission copy:

> Allow 200 OK to communicate with your Chromebook's Linux environment at
> `penguin.linux.test`. This private address stays on your Chromebook.

## Provisional everyday and reboot flow

After installation:

1. The user clicks **200 OK Linux** in the ChromeOS Launcher.
2. ChromeOS wakes the default Linux VM/container if it is stopped and runs the
   non-terminal launch helper, which briefly displays **Opening 200 OK…**.
3. The helper starts or focuses the single controller service and waits for
   its exact readiness endpoint.
4. It uses `xdg-open` on the controller's local
   `http://penguin.linux.test:<control-port>/launch-chromeos` page.
5. That page sends an `open-linux-controller` external message to the exact
   production extension ID. The event wakes the Manifest V3 service worker,
   which opens or focuses the bundled extension UI, closes the local bridge
   tab, and then returns to idle. The transient Linux splash closes as well.
6. On first use, the UI requests optional controller-host access with the
   explanation above. A denial leaves setup and recovery guidance available
   and does not affect the Android/desktop launcher paths.
7. The controller reports the content server's true stopped/running state. It
   does not resume serving merely because Linux was woken.

Until a complete ChromeOS reboot/login test passes with the production
launcher, the bundled recovery text should also say:

> If **200 OK Linux** does not start, open Terminal once, close its window when
> Linux finishes starting, and try the 200 OK Launcher item again.

The user should not normally have to keep a Terminal window open. A full OS
reboot requires the user to sign back into ChromeOS, but the installed Linux
app is expected—not yet proved—to remain registered in the Launcher.

## Implemented launcher contract

The checked-in `ok200-crostini launch` command fixes the first executable
contract while the controller remains unfinished:

- map the `app.ok200.crostini` X11 window before starting any background work;
- propagate `DESKTOP_STARTUP_ID` through `_NET_STARTUP_ID` and match the
  `.desktop` entry's `StartupWMClass`;
- queue `app.ok200.crostini-controller.service` with nonblocking
  `systemctl --user start`, then poll rather than tying the window event loop to
  systemd startup;
- validate the exact product, protocol version, and safe instance identifier
  at `127.0.0.1:20080/health` before opening anything;
- use `xdg-open` on
  `http://penguin.linux.test:20080/launch-chromeos` only after validation;
- remain mapped for at least two seconds on success, then exit while the
  controller service continues; and
- remain open on failure with readable detail plus **Try Again** and **Close**.

Port `20080` and the service name are provisional but now form one concrete
integration target for the controller and installer. A process collision on
that port fails closed because an unrelated or malformed health response is
not opened as 200 OK. The controller must eventually own any persisted port
migration rather than making the extension scan arbitrary listeners.

The installer must render the checked-in `.desktop.in` template by replacing
its binary placeholder with a validated absolute per-user path; desktop entry
`Exec` fields do not expand `~` or `$HOME`. The physical fixture used that
rendered absolute path.

## Accepted local launch bridge

The launch handoff and controller permission are deliberately separate:

```json
{
  "externally_connectable": {
    "matches": ["http://penguin.linux.test/*"]
  },
  "optional_host_permissions": ["http://penguin.linux.test/*"]
}
```

The existing extension already declares
[`externally_connectable`](../../extension/public/manifest.json) and handles
[`runtime.onMessageExternal`](../../extension/src/sw.ts) for the owned website
and legacy migration. The Crostini path extends that mechanism to the exact
local hostname.

`externally_connectable` lets the matching page initiate extension messaging;
it does not grant the extension read/change access to that host. Chrome's
permission documentation identifies required `host_permissions` and content
script matches as warning sources, while optional host permissions are granted
at runtime. The expected result is therefore no new scary install/update
warning merely for the launch handoff, followed by one contextual permission
request only for users who select Linux. The exact packed candidate must prove
the displayed warning text and confirm that existing users are not disabled.

The local page sends only a narrow message such as:

```js
chrome.runtime.sendMessage(EXTENSION_ID, {
  type: "open-linux-controller",
  port,
  instanceId,
});
```

The service worker registers `runtime.onMessageExternal` at top level,
validates the exact sender URL and message schema, rate-limits repeated opens,
and performs only the harmless open/focus action. The message never carries a
folder path, controller bearer token, or configuration mutation. The extension
UI independently authenticates to the controller after it opens.

Chrome terminates an idle Manifest V3 service worker and revives it for
incoming events, so neither a persistent background page nor periodic Linux
health polling is part of this design. The UI may poll or hold a connection
only while it is visible.

Chrome 142 and newer also gate some local-network requests behind a browser
Local Network Access prompt. The physical M150 prototype must establish
whether extension-origin requests to `penguin.linux.test` show that prompt in
addition to the optional extension host prompt and what recovery is possible
when either is denied.

Rejected launch directions:

- direct `xdg-open chrome-extension://...` is physically rejected by the
  ChromeOS Crostini URL handoff;
- an `ok200.app`-only bridge makes routine launch depend on Internet access;
- persistent extension polling wastes resources and conflicts with the
  Manifest V3 lifecycle; and
- proxying every controller operation through a long-lived external-message
  page could avoid host permission, but would keep the bridge tab alive and
  add a second RPC layer. It is not the recommended first implementation.

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
the exact `penguin.linux.test` CORS/preflight behavior, optional permission
copy, and extension-origin claim behavior need a physical end-to-end prototype
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

This proves one registered `.desktop` cold activation. The later
external-message experiment below found that a windowless user app did not
remain reliably launchable after a second manual VM stop and established the
transient graphical-window requirement. This first fixture does not prove
persistence after a full ChromeOS reboot/login, production Rust
single-instance behavior, update behavior, or other CPU architectures. Its
service, transferred files, and browser surface were removed, and the test VM
was returned to its stopped state.

A follow-up physical check ran `xdg-open` on the installed extension's direct
`chrome-extension://...` UI URL from `penguin`. ChromeOS Garcon reported
`Failure in OpenUrl`, `xdg-open` reported no available method, and no extension
target opened. The product must use the accepted HTTP launch bridge rather than
direct extension-scheme navigation. The Terminal surface used for that check
was closed and the VM was stopped afterward.

### External-message and optional-permission prototype

On the same 2026-08-02 M150 testbed, a second disposable controller fixture on
port `18182` served `/launch-chromeos` and `/health`. The unpacked production-ID
extension included the exact `penguin.linux.test` external-message allowlist,
a narrow launch-message validator, a bundled controller connection page, and
an optional host permission requested only from a user-clicked button.

Observed results:

- the local bridge page called `runtime.sendMessage` and woke the extension,
  which opened its bundled controller page and closed the bridge tab;
- the first controller request showed exactly **“Read and change your data on
  penguin.linux.test”** under Chrome's additional-permissions dialog;
- after **Allow**, the extension fetched the exact product/protocol/instance
  health response successfully. The fixture recorded no `Origin` header on
  this host-permission-authorized request;
- ChromeOS M150 showed no separate Local Network Access prompt for this
  extension-origin `penguin.linux.test` request, including with Fetch's target
  address space set to `local`;
- after the controller tab and Terminal were closed, the extension worker was
  inactive and `termina` was fully stopped. Clicking the installed Launcher
  app woke Linux and the dormant worker, opened the controller page, and
  reconnected without a Terminal window;
- the extension opened a fresh controller tab and closed the Linux-owned
  bridge tab, which avoids retaining the local bridge as the control surface;
- the local bridge used no website resource, so the everyday handoff worked
  without an `ok200.app` dependency.

The first repeated-launch build exposed an important API boundary: without the
warning-bearing `tabs` permission, `tabs.query()` omits URLs even for the
extension's own tabs. The retained implementation uses
`runtime.getContexts()` to find its own controller document, plus an in-flight
guard, so it can focus one page without requesting browsing-history access.

The launcher lifecycle needed a second round of testing. A direct windowless
wrapper, a detached systemd one-shot, and both `StartupNotify=false` and
`StartupNotify=true` desktop entries each launched correctly once. After the
controller tab was closed and `termina` was stopped again, ChromeOS did not
send a second `LaunchContainerApplication` request for those user apps, so they
could not wake Linux a second time during the same login session. Detaching
`xdg-open` was not enough.

A fifth fresh desktop identity briefly mapped an `xmessage` window saying
**Opening 200 OK Web Server…**, performed the same local bridge handoff, and
closed the window automatically. That fixture passed two consecutive full
`vmc stop termina` cycles: its launch log advanced from the first to the
second run, each click restarted the VM/container, and each run ended with one
controller service and one extension tab. `xmessage` is test scaffolding, not
an accepted production dependency. The checked-in Rust launcher described
below now replaces that scaffold.

The Rust replacement was built and exercised on the same physical M150,
Debian 12 x86_64 environment. Its optimized, unstripped binary was 963,960
bytes and `ldd` reported only libc, libgcc, the ELF loader, and the kernel
VDSO. It talks to X11 through pure Rust and draws its own small bitmap surface,
so the test did not depend on the installed `xmessage` binary or GUI toolkit
packages.

The first visual run exposed ChromeOS's 230-DPI X11 surface: unscaled X core
fonts produced a tiny, poorly rendered window. The retained implementation
derives its scale from the X screen's pixel and physical dimensions and embeds
its glyphs. The resulting working and failure surfaces were readable at the
Chromebook's current display scale. With the controller unit deliberately
removed, the window stayed open with the systemd failure and both controls;
after restoring the unit, **Try Again** started the controller and completed
the browser handoff. ChromeOS's automation accessibility tree exposed the
window and its standard close control but not the custom-drawn text or buttons;
screen-reader and keyboard recovery therefore remain acceptance gaps.

For the final binary, a warm activation reused the controller's existing PID,
focused one extension controller tab, and left no launcher process. Two
consecutive cold cycles began with `termina` fully stopped. The host's
`LaunchContainerApplication` count advanced from 16 to 17 to 18; each cycle
woke the VM/container, started one controller fixture service, opened one
extension surface, and let the two-second launcher exit. The test used the
checked-in extension bridge and a disposable Python controller that implemented
the fixed health/page contract. It therefore proves the production-shaped Rust
launcher, not the still-missing production controller. All disposable services,
files, extension state, and build directories were removed, the VM was stopped,
and the ChromeOS testbed returned 8/8 healthy.

This proves the disposable external-message, runtime-permission, health-check,
dormant-worker, repeat stopped-VM, graphical-launcher lifecycle, and
single-surface mechanics. It does **not** prove a packed install/update has
unchanged warning text, permission behavior on older Chrome milestones, denial
recovery after a fresh install, a production authenticated controller, full
ChromeOS reboot/login, ARM64, or Internet-free first installation. The
disposable extension, services, Launcher entries, and transferred fixtures
were removed after testing.

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
- [x] Implement the pure-Rust, DPI-aware transient graphical launcher and
      `.desktop` template without GTK, Tauri, `xmessage`, or Xlib runtime
      dependencies; prove failure/retry, warm reuse, and two consecutive
      stopped-VM extension handoffs on physical x86_64 ChromeOS.
- [ ] Publish verified x86_64 and ARM64 binaries compatible with the oldest
      claimed Crostini baseline.
- [ ] Test the source-controlled installer and uninstall path in fresh default
      Crostini environments on both architectures.
- [ ] Install the checked-in `.desktop` launcher and helper through the real
      installer, repeat the proved warm/stopped paths with the production
      controller, and prove full ChromeOS reboot/login launch with one
      controller.
- [ ] Repeat the now-proved disposable warm and stopped-VM launch handoff with
      the production controller, then add full ChromeOS reboot/login proof.
- [x] Prototype the exact `externally_connectable` launch, optional host
      permission, extension health request, dormant-worker wake, Local Network
      Access behavior, and single-surface focus on the physical Chromebook.
- [ ] Add and prove exact-origin claim, token persistence/rotation, port
      collisions, controller reset, and fresh-install permission denial.
- [ ] Pack an update candidate and prove the local external-message allowlist
      adds no install/update warning; record the exact contextual optional-host
      and any Local Network Access prompts.
- [ ] Test Linux `~/Downloads`, one explicitly shared ChromeOS folder, and
      clear rejection of an unshared path.
- [ ] Test start/stop, logout, Linux shutdown, suspend/resume, port conflict,
      update, uninstall, and recovery without an unintended content listener.
- [ ] Validate keyboard and screen-reader behavior for the transient launcher;
      its current custom-drawn body is not exposed through ChromeOS's
      automation accessibility tree.
- [ ] Validate Chromebook-host IPv4 presentation and explicit content-port
      forwarding from a second LAN device; never forward the control API.
- [ ] Validate the bundled setup/recovery instructions offline, including
      unsupported, policy-blocked, and ChromeOS Flex wording.

## References

- [Set up Linux on a Chromebook](https://support.google.com/chromebook/answer/9145439)
- [Linux on ChromeOS FAQ](https://developers.google.com/chromeos/app-development/develop/linux-on-chromeos-faq)
- [ChromeOS Linux port forwarding](https://developers.google.com/chromeos/app-development/develop/port-forwarding)
- [ChromiumOS Garcon application integration](https://chromium.googlesource.com/chromiumos/platform2/+/HEAD/vm_tools/garcon/)
- [Cross-origin network requests in Chrome extensions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Message passing with externally connectable pages](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#external-webpage)
- [Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Declare optional extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Request optional permissions at runtime](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome Local Network Access prompt](https://developer.chrome.com/blog/local-network-access)

## Release boundary

This topic does not authorize a tag, website deployment, extension update, or
store upload. The submitted Android and extension releases remain valid
without Crostini. The maintainer owns approval of the future public route and
all release/store actions after the acceptance gates pass.
