# ChromeOS Crostini Launcher and Controller

Topic: chromeos-crostini-launcher

Status: **the Play-free Linux choice now has public protocol-2 controller
release `crostini-v0.1.5`, public GitHub extension release
`extension-v0.1.8`, and a deployed signed update feed. Both static controller
architectures, the signed manifest, and the checksum ledger pass CI and
independent signature/hash verification. Earlier exact public and
production-shaped tests own the x86_64 ChromeOS and ARM64 Linux runtime,
Launcher, permission/claim, server lifecycle, LAN, reinstall, and purge
evidence; native ARM Chromebook and exact `0.1.5` physical acceptance remain
open. The existing protocol-1 bootstrap intentionally fails closed against
the protocol-2 feed. A tested protocol-2 bootstrap switch is prepared but must
deploy with the matching Chrome Web Store `0.1.8` rollout so users cannot
install an incompatible controller/extension pair.**

Last reconciled: **2026-08-04**.

Unreleased source now labels the registered ChromeOS Linux Launcher item
**200 OK Web Server**, with **Web Server** as its generic name and explicit
web/server/HTTP search keywords. The stable
`app.ok200.crostini.desktop` identity, `ok200-crostini` command, service,
package, controller role, and compact UI treatment do not change.

The released fallback's implementation and acceptance ledger lives in
[Tactical 012](../tactical/012-chromeos-crostini-fallback.md). The active
product-completion and physical-acceptance plan lives in
[Tactical 014](../tactical/014-chromeos-crostini-product-completion.md). The
parent extension's Android/Play routing and unsupported-device messaging remain
owned by [`chromeos-extension-launcher.md`](chromeos-extension-launcher.md).
The server implementation should reuse the Tauri-independent Rust boundary
owned by [`desktop-runtime.md`](desktop-runtime.md), without installing the
desktop Tauri application.

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
- **Controller service** means that Rust process. **Control UI** means the
  extension page that operates it. Documentation and code should preserve
  those distinct names rather than overloading “controller.” Prefer one
  `ok200-crostini` release artifact. The combined source binary now exposes
  `launch`, `controller`, `status`, `reset-controller`, `install`, and
  `uninstall`, plus signed `check-update`, `update`, and local `rollback`;
  independent token rotation remains open. One artifact keeps the launcher and
  service from drifting across independently installed versions.
- A branded `Terminal=false` `.desktop` entry installed in Crostini is the
  post-install ChromeOS Launcher surface. ChromeOS, not the extension, can use
  that registered Linux app to wake a stopped VM/container and execute its
  launcher command. The launcher helper briefly maps a quiet branded
  **Launching…** window, then closes it after the browser handoff so ChromeOS
  observes a complete graphical-app lifecycle. The controller itself remains
  headless. The implemented helper lives in
  [`desktop/crostini`](../../desktop/crostini), uses the X11 protocol directly
  with DPI-aware pure-Rust font rasterization, and adds no GTK, Tauri,
  `xmessage`, or Xlib runtime dependency.
- The `.desktop` entry's searchable system label is
  **200 OK Web Server**, with generic name **Web Server** and explicit
  web/server/HTTP keywords. **200 OK Linux** may still describe the component
  in technical or platform context, but is not the Launcher label.
- After the controller answers, the launcher opens its static
  `http://penguin.linux.test:<control-port>/launch-chromeos` page. That page
  sends one external message to wake the extension, whose service worker opens
  or focuses the bundled ChromeOS control UI. No website or persistent
  extension polling is required.
- Starting the controller must not silently start serving the last folder.
  The controller can remain available while Linux is running, but the content
  server starts only after an explicit user action or an independently
  accepted opt-in auto-start setting.
- The server's primary control is an accessible on/off switch, consistent with
  the desktop and Android applications. Closing the final extension control
  surface stops the content server by default. **Keep serving when controls
  close** is an explicit preference and defaults off; a controller-owned
  authenticated session lease or equivalent mechanism enforces the default
  even when Chrome or the extension exits without a cleanup callback.
- The controller service is installed as a static on-demand systemd user unit:
  no `[Install]` target, `systemctl enable`, or `loginctl enable-linger`. The
  ChromeOS Launcher helper explicitly starts it. `Restart=always` may keep an
  explicitly started controller alive and restart it after a verified binary
  update, while an explicit `systemctl stop` or VM shutdown keeps it stopped.
  Install and uninstall must not alter the account-wide linger setting because
  another Linux application may own it.

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
   **Use ChromeOS Linux** and **Open installed Android app**. It does not
   infer whether Google Play, Android, or Linux is supported or enabled.
2. **Use ChromeOS Linux** opens a full extension tab containing the bundled
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
   should be documented for users who do not want a pipe to a shell:

   ```sh
   curl -fsSLO https://ok200.app/install-crostini.sh
   less install-crostini.sh
   bash install-crostini.sh
   ```
5. The installer detects `x86_64` or `aarch64`, downloads an immutable release
   asset plus its signed manifest, verifies its signature and SHA-256, and
   installs only per-user files under `~/.local` and the user's service
   configuration. It installs the combined binary, a stable command shim,
   local uninstaller/rollback helper, branded icon, static user unit, and
   non-terminal `.desktop` entry. It should not require `sudo`, npm, developer
   mode, or changes outside the Linux container. It starts the controller once
   at the end because this installer invocation is explicit, but does not
   enable it for later Linux starts.
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
   `~/Downloads/200 OK`. A controller-backed picker browses friendly **Linux
   files** and **Shared Chromebook folders** roots instead of asking the user
   to type a path.
9. Choosing a ChromeOS-owned folder explains **Share with Linux** in context.
   When the user returns from Files, the waiting picker rechecks automatically
   and presents the newly shared folder; a manual **Check again** action is only
   a recovery fallback.
10. The user explicitly turns on the server switch. The UI shows an actionable
    local URL and, only when LAN mode is enabled and the Chromebook host address
    is known, a copyable LAN URL plus ChromeOS's separate Linux port-forwarding
    instructions.
11. Terminal may be closed after installation. Closing the transient Launcher
    helper has no effect on content. Closing the final extension control UI
    stops serving by default; **Keep serving when controls close** is the
    visible, explicit opt-in for a run that should continue while Crostini is
    running.

Provisional setup copy:

> First-time setup needs an Internet connection and one Terminal command.
> After setup, open **200 OK Web Server** from your Chromebook Launcher.

> Don't see Linux in Settings? Your Chromebook, account, or administrator may
> not allow it. You can still use 200 OK on Android or another desktop device.

Provisional permission copy:

> Allow 200 OK to communicate with your Chromebook's Linux environment at
> `penguin.linux.test`. This private address stays on your Chromebook.

## Provisional everyday and reboot flow

After installation:

1. The user clicks **200 OK Web Server** in the ChromeOS Launcher.
2. ChromeOS wakes the default Linux VM/container if it is stopped and runs the
   non-terminal launch helper, which briefly displays **Launching…**.
3. The helper starts or focuses the single controller service and waits for
   its exact readiness endpoint.
4. It uses `xdg-open` on the controller's local
   `http://penguin.linux.test:<control-port>/launch-chromeos` page.
5. That page sends an `open-linux-controller` external message to the exact
   production extension ID. The event wakes the Manifest V3 service worker.
   If setup, host permission, or controller claim is incomplete, it opens or
   focuses the bundled setup UI in a normal Chrome tab. Otherwise it opens or
   focuses one dedicated Chrome popup control window. In either case it closes
   the local bridge tab and then returns to idle. The transient Linux splash
   closes as well.
6. On first use, the UI requests optional controller-host access with the
   explanation above. A denial leaves setup and recovery guidance available
   and does not affect the Android/desktop launcher paths.
7. The controller reports the content server's true stopped/running state. It
   does not resume serving merely because Linux was woken.

Until a complete ChromeOS reboot/login test passes with the production
launcher, the bundled recovery text should also say:

> If **200 OK Web Server** does not start, open Terminal once, close its window when
> Linux finishes starting, and try the 200 OK Launcher item again.

The user should not normally have to keep a Terminal window open. A full OS
reboot requires the user to sign back into ChromeOS, but the installed Linux
app is expected—not yet proved—to remain registered in the Launcher.

The service does not start merely because Terminal or another Linux app wakes
the container. The user must click **200 OK Web Server** after a reboot or VM stop;
that explicit action starts the service and opens the control UI.

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

Chrome 142 and newer may also gate local-network requests behind a browser
Local Network Access prompt. The physical M150 prototype showed only the
optional extension host-permission dialog for this extension-origin
`penguin.linux.test` request, not a second Local Network Access prompt. The
product must still handle denial and re-request guidance, and packed-extension
testing must preserve the exact observed prompt evidence before release.

Rejected launch directions:

- direct `xdg-open chrome-extension://...` is physically rejected by the
  ChromeOS Crostini URL handoff;
- an `ok200.app`-only bridge makes routine launch depend on Internet access;
- persistent extension polling wastes resources and conflicts with the
  Manifest V3 lifecycle; and
- proxying every controller operation through a long-lived external-message
  page could avoid host permission, but would keep the bridge tab alive and
  add a second RPC layer. It is not the recommended first implementation.

## Controller discovery and claim contract

The implemented slice uses deterministic control port `20080`, not broad port
scanning. `/health` returns the exact product identifier, protocol version,
instance identifier, component version, and claim state; an unrelated process
on that port is a collision, not a controller.

Any prototype must preserve this security boundary:

- bind the control API only to Crostini/ChromeOS-local interfaces needed by
  the accepted bridge;
- return CORS access only for the exact production extension origin, never a
  wildcard, while treating CORS as browser isolation rather than
  authentication;
- require an unguessable token after the initial claim;
- restrict the unclaimed window to fresh install/reset and deliver its
  one-time claim code only through the controller page's external message to
  the exact production extension ID;
- keep the control port separate from the served-content port and never tell
  users to add the control port to ChromeOS LAN forwarding; and
- provide an explicit local reset path rather than an undocumented backdoor.

The physical source-build pass accepted this boundary. Chrome displayed the
exact optional host-permission dialog, the controller's fixed-origin preflight
allowed the JSON claim, the extension persisted the returned bearer token in
its own origin, and authenticated status/start/stop succeeded. Earlier health
evidence showed that Chrome may omit `Origin` on a host-permission-authorized
extension request, so the controller deliberately does not mistake a request
header for identity: the exact external-message destination protects the
one-time claim code and the bearer token protects every later mutation. Reset
rotates the instance ID, clears the token, stops the service, and permits one
fresh claim.

## Production controller-service boundary

The production controller service is a headless Rust control plane around
`ok200-core`, not the extension UI and not a second general-purpose web server.
It owns:

- one process lock and one fixed local control endpoint;
- persisted controller identity, claim/token state, settings, and migrations;
- explicit content-server start/stop and truthful stopped/running/error state;
- validated root selection and a local directory browser limited to approved
  Linux and ChromeOS-shared paths;
- content port, loopback/LAN bind, directory listing, CORS, and SPA settings;
- version, update eligibility, logs/diagnostics, and machine-readable health;
  and
- the static offline `/launch-chromeos` handoff page.

The implemented first API slice provides public `GET /health` and
`GET /launch-chromeos`, one-time `POST /api/claim`, authenticated
`GET /api/status`, `PUT /api/settings`, and explicit
`POST /api/server/start`/`stop`. Rust integration tests exercise private config,
locking, claim/auth rejection, settings, a real `ok200-core` listener, exact
content, and stop. Token rotation beyond reset, a rooted directory browser,
logs/diagnostics, and update check/apply remain. The control endpoint never
becomes a ChromeOS-forwarded LAN port; only the separate content listener may
be forwarded after explicit user action.

## ChromeOS-specific control UI

The extension should use one responsive ChromeOS application in two window
modes rather than squeeze setup into the current toolbar-action popup:

- first install, permission, claim, recovery, and long-form help use a normal
  extension tab; and
- routine connected operation uses a persistent dedicated browser window from
  `chrome.windows.create({type: "popup"})`, initially 460×750 pixels. This is
  deliberately close to the desktop application's 410×700 portrait window,
  while leaving room for Chrome's frame and the folder dialog.

This dedicated browser window is not the toolbar-action popup that disappears
when focus changes. The service worker should locate the existing extension
document with `runtime.getContexts()`, focus its `windowId`, and create only one
surface. If popup creation fails, a normal extension tab is the required
fallback. Chrome's windows API does not require a broad `tabs` grant merely to
create or focus a window; URL/title access on returned tabs is the permissioned
part. The current context-based implementation direction therefore remains the
warning-minimizing choice.

The implemented React surface follows this tab/popup split and reuses neither
the desktop Tauri shell nor Android Compose. Its first slice exposes a validated
root text field, content port, localhost/LAN bind, directory listing, CORS, SPA,
start/stop buttons, manual status refresh, version/update state, a local URL,
permission copy, reset guidance, and an offline setup/recovery summary. This is
a functional protocol surface, not the accepted finished UX.

The finished surface follows the desktop and Android information hierarchy:
canonical branding and icons, a status card with an accessible server switch,
a controller-backed folder picker, automatic visible-session status sync,
open/copy URL actions, predictable stopped-state setting commits, a visible
server-lifetime choice, responsive popup/tab layouts, dark mode, and contextual
ChromeOS help. A generic **Refresh**, raw path entry, and separate ambiguous
**Save settings** action are not normal-operation affordances. Uncommon updater,
diagnostic, reset, rollback, and uninstall actions remain reachable under an
appropriate advanced/help surface.

Minimum controls:

- connection/install status and recovery;
- selected root with Linux-files and **Share with Linux** guidance;
- start/stop and truthful single-instance status;
- content port, localhost/LAN bind, directory listing, CORS, and SPA options;
- local URL and copy/open action;
- Chromebook IPv4 plus Linux port-forwarding guidance for LAN mode;
- automatic-update preference, manual update/rollback, version,
  logs/diagnostics, reset, and uninstall instructions.

The controller must implement the local filesystem browser rooted in approved
Linux/shared locations. It exposes friendly root IDs plus relative entries,
canonicalizes list/create/select/start operations, and installs only an
accepted directory into server settings. Linux home and `/mnt/chromeos` are
browse sentinels but are not selectable server roots. The picker automatically
re-lists a waiting shared-folder view when its window regains focus and at a
bounded interval while visible. A browser directory picker in the extension
cannot by itself grant the Linux daemon a stable filesystem path.

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

The original Rust replacement was built and exercised on the same physical
M150, Debian 12 x86_64 environment. Its optimized, unstripped binary was 963,960
bytes and `ldd` reported only libc, libgcc, the ELF loader, and the kernel
VDSO. It talks to X11 through pure Rust and draws its own small bitmap surface,
so the test did not depend on the installed `xmessage` binary or GUI toolkit
packages.

The first visual run exposed ChromeOS's 230-DPI X11 surface: unscaled X core
fonts produced a tiny, poorly rendered window. The implementation derives its
scale from the X screen's pixel and physical dimensions. The current normal
surface is a compact 320×96 logical-pixel **Launching…** card and rasterizes an
installed ChromeOS Noto Sans font through pure Rust, with embedded glyphs only
as a fallback. Actionable failures expand to the existing detail and retry
surface. With the controller unit deliberately
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

### On-demand service and control-window validation

A focused M150 follow-up used two disposable fixtures to validate the newly
accepted lifecycle and UI decisions:

- A systemd user service with `Restart=always` and no `[Install]` section
  reported `static` and `inactive` after Linux started. It became active only
  after explicit `systemctl --user start --no-block`, remained active after the
  Terminal window closed, and returned to `static`/`inactive` after a complete
  VM stop and later Terminal-started container session. Explicit
  `systemctl --user stop` left it inactive instead of triggering restart.
- The test account already reported `Linger=yes`, inherited from the installed
  JSTorrent fixture. The static 200 OK service still remained inactive. This
  proves on-demand behavior does not require taking ownership of the shared
  linger setting and reinforces that neither install nor uninstall should
  change it.
- A manifest-v3 extension declaring no permissions created a 700×750
  `chrome.windows` popup containing its extension page. ChromeOS exposed it as
  a distinct persistent window, and `runtime.getContexts({contextTypes:
  ["TAB"]})` returned that page with its usable `windowId`. This validates the
  existing context-based single-surface/focus direction without adding the
  warning-bearing `tabs` permission.

The fixtures, extension state, shared files, and user unit were removed after
the check. This does not yet prove bounds persistence, responsive behavior on
small displays, popup fallback, the finished control UI, or full reboot/login
with the production controller.

### Production vertical-slice validation

The same physical M150 and Debian 12 x86_64 container then exercised the
checked-in controller, installer transaction, extension UI, and service rather
than disposable controller/popup fixtures:

- Linux compilation passed all 15 target-specific Crostini tests and strict
  Clippy before producing the optimized combined binary.
- `ok200-crostini install` installed the current verified binary below the
  per-user version directory, rendered the real icon/desktop/static-service
  files, started the controller for setup, and left the unit `static` while the
  pre-existing account setting remained `Linger=yes`. The controller config
  was mode `0600`; rerunning install succeeded idempotently.
- The ChromeOS Launcher indexed **200 OK Linux** with the real icon. First
  launch opened a normal extension setup tab and closed the local bridge. The
  exact **Read and change your data on penguin.linux.test** optional-permission
  prompt appeared; after approval, the extension completed the one-time claim
  and showed authenticated controls.
- The first browser pass exposed and fixed a real Chrome-only defect: an
  extracted `fetch` function required its `Window` receiver. The retained
  client binds the default browser fetch, has a regression test, and passed the
  repeated physical claim.
- **Start server** saved the default
  `~/Downloads/200 OK` root and started `ok200-core` only on that click. Chrome
  fetched the directory listing at `http://localhost:8080/`. **Stop server**
  removed the listener immediately.
- A later Launcher click replaced the setup tab with one 700×750 dedicated
  popup; another click focused that same window instead of creating a second.
- After closing the popup and fully stopping `termina`, the cached Launcher app
  woke Linux, started the static controller, and reopened the single claimed
  popup without Terminal. The content port remained closed, proving controller
  wake did not resume serving.
- `reset-controller` stopped the service, rotated the instance identity,
  cleared pairing, and the next Launcher click reclaimed through a normal tab.
- Normal uninstall removed the application/unit/icon/binary and preserved both
  settings and served root without changing linger. Reinstall retained the
  claimed identity. `uninstall --purge` then removed settings/pairing while
  again preserving the served root, and ChromeOS removed the app from search.

A 2026-08-03 follow-up classified the narrower post-cleanup shelf state. App
Service marked both **200 OK Linux** and the older **200 OK Cold Start Probe**
as `UninstalledByUser`; installed desktop files, binaries, and processes were
absent. Both shelf menus offered **Pin** and **Open**, not **Unpin** or **Close**,
so these were neither installed Launcher registrations nor user pins. They were
orphaned Crostini launch placeholders left after test actions attempted to open
removed application identities. Restarting Chrome alone did not clear Ash's
shelf state. Re-registering each exact desktop identity and letting one matching
X11 window map and close completed the pending lifecycle; both placeholders
then disappeared, after which the test-only registration was removed again.
The real product and production-ID extension were reinstalled and left
connected for maintainer review. Tactical 014 retains a clean
install/uninstall/reinstall matrix because this diagnosis does not prove every
concurrent-launch or full-reboot edge.

After the original source-fixture pass, all installed files, extension state,
transferred source/build trees, and the empty test serve root were removed; the
VM was stopped and the testbed returned 8/8 healthy. That was source-built
evidence before a public artifact existed; the exact-release evidence below
supersedes its delivery gaps. The later diagnostic follow-up described above
intentionally left the current source-built review fixture installed.

### Pre-release plumbing validation

The 2026-08-02 follow-up exercised the newly implemented delivery transaction
before the first completed production release:

- pinned `cargo-zigbuild` 0.23.0 with Zig 0.15.2 produced stripped,
  statically linked musl development binaries for both `x86_64` (3,007,152
  bytes) and `aarch64` (2,828,720 bytes); the ARM64 ELF identity was inspected
  but could not be executed on the available x86_64 Chromebook;
- that exact static x86_64 development binary ran on the Debian 12 Crostini
  testbed, installed the real launcher/controller transaction, answered the
  versioned health endpoint, and uninstalled with purge;
- all 24 Linux-target Crostini tests, strict Clippy, the OpenSSL/Minisign
  bootstrap integrity fixtures, and the release build passed inside the same
  container;
- an ownership-manifest tamper made uninstall fail closed without removing the
  application; restoring the exact manifest allowed normal removal;
- installing development versions `0.1.0-dev.1` then `0.1.0-dev.2` atomically
  retained `previous`, restarted the active controller into the new version,
  and local rollback restarted it into the old version with the same persisted
  controller identity;
- a direct attempt to reinstall the older development binary then failed
  before changing `current`; the explicit local rollback path remained usable;
- normal uninstall preserved configuration and an explicit served-root
  sentinel, reinstall reused the identity, purge removed configuration, and
  neither path changed the pre-existing account linger value; and
- all temporary application/source fixtures were removed, Crostini was
  stopped, and the ChromeOS testbed returned 8/8 healthy.

This stage proved the static build shape and source-level transaction on one
current x86_64 Crostini environment. The exact public release closed its
signing/download/deployment/ARM-execution gaps as recorded next; oldest-
baseline and real next-version transitions remain open.

### Exact public release evidence

Public
[`crostini-v0.1.1`](https://github.com/kzahel/web-server-chrome/releases/tag/crostini-v0.1.1)
was published on 2026-08-02 after tag workflow `30756468260` built, signed,
verified, and released the exact five-asset set. Independent download and
validation established:

- x86_64 static ELF: 3,052,784 bytes, SHA-256
  `7ba3f73f830593bb71310c1eac14c84eab4ea3eb7edae73e41fcee8ab2749332`;
- ARM64 static ELF: 2,910,432 bytes, SHA-256
  `2cdd6274d01580ca50463a13b317910c8e23e33c5b1dccb554988d0419e81451`;
- signed canonical manifest: 662 bytes, SHA-256
  `a0f64dd5c6adb8b580fc355e4776135d127f552706034870bdce4f5239409ff7`;
- manifest source commit `849fdcb568afb2f91e0af5351572654ef5c2cd6f`, controller protocol 1,
  extension protocol range 1–1, and static-musl runtime identity; and
- all published checksums, manifest signature, per-architecture identity,
  executable version, ELF architecture, and static linkage passed.

The byte-identical public bootstrap installed the x86_64 hash on the Debian 12
M150 Crostini environment. Exact claim, start/ChromeOS `localhost` fetch/stop,
current-feed display, repeated graphical launch, clean preserve/reinstall, and
purge passed. The exact ARM64 artifact verified, executed, installed, and
purged on the ARM64 Ubuntu 24.04 VM; this is not a native ARM Chromebook
claim. The deployed update service returns the exact signed envelope for an
older x86_64 client and `204` for a current ARM64 client, while the existing
desktop route remains unchanged. Public `extension-v0.1.5` exact-package and
permission/fallback evidence is owned by the parent extension topic.

## LAN behavior

Crostini guest addresses are implementation details and must not be presented
as the user-facing LAN address. The accepted flow is:

1. explicitly enable LAN binding in 200 OK;
2. listen inside Crostini on the selected content port;
3. instruct the user to add that same TCP port under **Settings -> About
   ChromeOS -> Developers -> Linux development environment -> Port
   forwarding**; and
4. detect the Chromebook host's IPv4 in the extension control page and show it
   with the forwarded content port. If detection is unavailable, point to the
   address ChromeOS already prints above the Port forwarding controls rather
   than duplicating it in an editable field.

The control port remains local and is never forwarded. Automatic UPnP is a
separate future concern owned by
[`internet-exposure-and-port-mapping.md`](internet-exposure-and-port-mapping.md)
and does not replace ChromeOS's explicit Crostini port-forwarding gate.

The first 2026-08-03 JSTorrent comparison described its address source too
loosely. JSTorrent's Manifest V3 client does not enumerate ChromeOS adapters.
Its `DaemonEngineManager` fetches `/network/interfaces` and `/network/gateway`
from its connected I/O daemon. On ChromeOS that is normally the Android
companion at `100.115.92.2`; the companion enumerates its own interfaces with
Java `NetworkInterface` and reads `/proc/net/route`. UPnP is a separate router
mapping path whose external-address result is the router's WAN address, not the
Chromebook's private Wi-Fi address.

The Crostini process still cannot derive the ChromeOS host address through its
own ordinary routing data. On the physical M150 fixture it had
`100.115.92.206/28`; TTL-limited probes returned `100.115.92.193`, then the
ChromeOS VM-side `100.115.92.25`, then router `192.168.1.1`. Those hops identify
routers, not the translated caller address `192.168.1.106`. SSDP discovery from
the guest returned no router, and unprivileged raw ICMP was unavailable.

The Manifest V3 extension page itself provides the supported answer without a
private Chrome API. A local-only `RTCPeerConnection` with an empty ICE-server
list exposed host candidates `100.115.92.25`, `192.168.1.106`, and a global
IPv6 address on the same fixture. 200 OK now discards loopback, link-local, and
`100.115.*` candidates, prefers a private IPv4, and composes the LAN URL from
the result. There is no manual-address field or persisted override. If WebRTC
exposure changes, a VPN creates ambiguity, or detection is otherwise
unavailable, the UI directs the user to ChromeOS's displayed address next to
the required forwarding setup. It must never display a guest address.

## Update, uninstall, and recovery contract

### Installer and file ownership

The JSTorrent Crostini installer is the behavioral starting point—one command,
architecture selection, verified immutable release assets, per-user systemd,
version pinning, idempotent rerun, and uninstall—but 200 OK should tighten its
transaction and ownership model:

The combined binary now implements the full post-verification transaction:
`install-release` independently verifies the signed manifest and running
executable, takes a per-user installer lock, copies into an immutable version
directory, atomically switches stable links, retains one `previous` version,
writes an exact ownership manifest, renders the desktop/static-service files
and icon, refreshes caches when available, and starts but never enables the
controller. `rollback` works from retained local state without Internet.
`uninstall` and `uninstall --purge` enforce the owned-path and preserve/purge
boundaries. The bootstrap script selects `x86_64` or `aarch64`, downloads into
a private temporary directory, verifies the signed canonical manifest, exact
size and SHA-256, and binary version, and performs no install mutation before
those checks pass. This source implementation still needs exact-release and
physical acceptance evidence.

- the separate `crostini-v<version>` workflow contains one combined
  `ok200-crostini` binary for `x86_64` and `aarch64`, a signed release manifest,
  SHA-256 values, and release notes;
- the installer takes an installation lock, rejects unknown/missing arguments,
  downloads to a private temporary directory, and performs no mutation until verification and
  a downloaded-binary self-test pass;
- it installs versioned immutable files below
  `~/.local/lib/ok200-crostini/versions/<version>/`, then atomically switches a
  stable `current` link or shim used by the `.desktop` entry and systemd unit;
- it retains one known-good `previous` version and installs offline-capable local
  rollback and uninstall helpers under `~/.local/bin`;
- it writes an ownership manifest for the binary versions, stable shims, rendered
  desktop entry, icons, and static service unit; and
- it preserves configuration and claim state across idempotent installer reruns
  unless a documented migration fails closed.

The installer may start the static controller service once so the already-open
setup tab can connect. It never enables the unit, edits default targets, or
calls `loginctl enable-linger`. Optional application/icon cache refreshes must
be guarded because minimal Crostini containers may not provide those commands.

### Update policy and delivery

Chrome Web Store delivery updates the extension independently. The Crostini
controller checks its own signed release channel when it starts and at most
once per 24 hours while it is already running, with backoff after failures. It
never wakes the Linux VM merely to check.

Automatic checking is the default. The extension always offers **Update now**
and presents a recommended but explicit **Automatically install Linux component
updates** setting. An automatic install runs only while the content server is
stopped; otherwise it remains pending until the user stops serving or chooses
an acknowledged restart. Updates never resume a stopped content server.

Each update must:

1. fetch a signed, schema-versioned manifest over HTTPS;
2. reject rollback, incompatible controller/extension protocol ranges,
   unsupported architecture, unknown key, signature failure, or SHA mismatch;
3. download and self-test the new binary in a new version directory;
4. atomically retain `previous` and switch `current`;
5. exit only after returning an accepted/pending response, allowing the static
   `Restart=always` service to launch the new binary;
6. make the extension reconnect and verify the expected version/health; and
7. leave a local rollback command that does not require a functioning new
   controller or Internet access.

The live `updates.ok200.app` service and current desktop `0.1.5` Tauri route
were rechecked successfully on 2026-08-02. The shared update-server source now
has a distinct artifact-manifest product type and `/crostini/manifest` route.
It fetches the exact manifest and signature assets from the newest matching
`crostini-v` release and returns their exact bytes in a schema-versioned
envelope. This repository's
[`update-server/web-server.json`](../../update-server/web-server.json) adds the
separate `/crostini` product without overloading the desktop Tauri route. Both
the Rust client and shell bootstrap verify the signature and the signed
repository/tag, compatibility, architecture, asset name, size, and hash
locally, so routing-service compromise or misconfiguration alone cannot
authorize arbitrary code.

The update-server source/config change was committed and deployed together
through the Remy runbook after `crostini-v0.1.1` existed. Public health and
both architecture routes pass, current requests return `204`, an older client
receives the exact signed release assets, and the desktop Tauri route is
unchanged.

### Uninstall and recovery

The primary uninstall path is the version-matched local
`ok200-crostini uninstall` command installed on first setup, not another
mandatory network pipe. A remote `install-crostini.sh --uninstall` remains a
recovery convenience.

Normal uninstall explicitly stops the service, removes only paths in the
ownership manifest, reloads the user service manager, refreshes application
caches when available, and preserves controller settings with a clear path and
reinstall instruction. `--purge` may additionally remove controller settings,
tokens, and update metadata after an explicit warning. Neither mode changes
the account linger setting, deletes a served root, unshares ChromeOS folders,
removes the Linux environment, or silently edits ChromeOS content-port
forwarding entries.

Uninstall now fails closed if the controller cannot be stopped, except for the
idempotent already-absent-unit case. Bundled guidance tells users to close the
control and transient launcher windows, wait for ChromeOS's asynchronous
Launcher removal, and not reopen a loading shelf placeholder during that
transaction. Linux has no supported API for deleting Ash's runtime shelf
objects; the product must prevent the known race and retain explicit restart
recovery rather than mislabeling an orphaned launch spinner as an installed app
or user pin.

Port collision, unsupported architecture, missing Linux integration,
permission denial, corrupt configuration, update failure, and broken current
version produce actionable offline messages. `status`, `reset-controller`,
`rotate-token`, `rollback`, and uninstall remain available from Terminal when
the extension or controller cannot connect.

## Remaining acceptance gates

The fallback is public; these gates bound follow-up hardening and claims that
must remain explicit:

- [x] Build the first production-shaped Rust controller around `ok200-core`
      with private persisted settings/identity, explicit content lifecycle,
      readiness, process locking, one-time claim, bearer authentication,
      status/settings/start/stop, and reset; pass local and physical x86_64
      tests.
- [ ] Add token rotation independent of reset, rooted directory browsing,
      diagnostics/logs, and migrations. Signed CLI and controller-driven
      update/rollback plus a strict controller/extension protocol compatibility
      policy are implemented in source but still need production
      artifact/reconnect proof.
- [x] Implement the pure-Rust, DPI-aware transient graphical launcher and
      `.desktop` template without GTK, Tauri, `xmessage`, or Xlib runtime
      dependencies; prove failure/retry, warm reuse, and two consecutive
      stopped-VM extension handoffs on physical x86_64 ChromeOS.
- [ ] Publish verified x86_64 and ARM64 binaries compatible with the oldest
      claimed Crostini baseline. Both `crostini-v0.1.1` static artifacts are
      public; exact x86_64 passed Debian 12 Crostini and exact ARM64 passed the
      Ubuntu 24.04 ARM testbed, but a native ARM Chromebook and an older
      claimed baseline remain open.
- [x] Test the source-controlled signed installer and uninstall path with the
      exact public x86_64 artifact in default Crostini, including ownership
      removal, settings/identity preservation across reinstall, explicit
      purge, and served-root preservation; run exact ARM64 install/purge in the
      strongest available ARM64 Linux testbed.
- [x] Physically prove the post-verification self-install transaction on the
      existing x86_64 Debian 12 testbed: versioned atomic install, static unit,
      no linger mutation, idempotent rerun, normal preserve, reinstall, purge,
      served-root preservation, cache removal, and exact cleanup.
- [x] Add the separate signed `crostini-v` artifact-manifest source contract to
      the shared update service and CI, including exact asset selection,
      canonical manifest generation, local signature/hash/version verification,
      and current-version responses.
- [x] Implement bounded, persisted controller update checks, authenticated
      check/install APIs, explicit stopped-content automatic installation,
      detached updater execution, extension progress/reconnect, offline errors,
      and local rollback guidance with deterministic source tests.
- [ ] Deploy that update-service route and prove the exact signed release's
      current, available, incompatible, corrupt, interrupted, rollback, and
      offline recovery cases. Deployment and exact current/`204` responses
      pass; a real later release is required for available/install/rollback.
- [x] Install the checked-in `.desktop` launcher, helper, controller, icon, and
      static unit through the self-install transaction; repeat warm and fully
      stopped-VM handoff with the production controller and one extension
      surface.
- [x] Prove the installed app and one-controller behavior after a full ChromeOS
      reboot/login rather than only a manual VM stop/start.
- [x] Prove that a static `Restart=always` user unit remains inactive across a
      VM restart until explicitly started, survives Terminal close after start,
      respects explicit stop, and remains on-demand even when account lingering
      is already enabled by another product.
- [x] Prototype the exact `externally_connectable` launch, optional host
      permission, extension health request, dormant-worker wake, Local Network
      Access behavior, and single-surface focus on the physical Chromebook.
- [x] Add and physically prove one-time exact-extension claim, extension token
      persistence, authenticated mutation, process locking, controller reset,
      identity rotation, and reclaim. CORS is fixed to the production origin;
      authentication does not depend on Chrome supplying `Origin`.
- [ ] Prove control/content port-collision recovery and independent token
      rotation. Fresh-install optional-permission denial/re-request passes on
      M150 with recovery copy retained after denial.
- [x] Pack `extension-v0.1.5` and prove the local external-message allowlist
      adds no install-time warning; record the exact contextual optional-host
      **Deny/Allow** prompt and absence of a separate Local Network Access
      prompt on M150. A true Chrome Web Store update warning remains observable
      only after store delivery.
- [x] Prove a permission-free 700×750 Chrome popup control window on M150 and
      confirm `runtime.getContexts()` returns it as a `TAB` context with a
      focusable `windowId`.
- [x] Implement and physically validate first claim in a normal setup tab,
      routine launch in one focused 700×750 popup, responsive controls, and
      conversion of the earlier setup tab into the routine popup.
- [x] Force and prove popup creation failure falls back to a normal 1600×900
      tab with the production-ID `0.1.5` candidate. Smaller display settings
      remain open.
- [ ] Test Linux `~/Downloads`, one explicitly shared ChromeOS folder, and
      clear rejection of an unshared path.
- [x] Physically test explicit start/localhost fetch/stop, controller-only VM
      wake with content still stopped, reset/reclaim, idempotent reinstall,
      preserve uninstall, and purge without linger or served-root mutation.
- [ ] Test full logout/reboot, suspend/resume, control/content port conflicts,
      interrupted update/rollback, and offline failure recovery without an
      unintended listener.
- [ ] Validate keyboard and screen-reader behavior for the transient launcher;
      its current custom-drawn body is not exposed through ChromeOS's
      automation accessibility tree.
- [x] Validate Chromebook-host IPv4 presentation and explicit content-port
      forwarding from a second LAN device; never forward the control API. The
      physical MV3 page detected `192.168.1.106`; the external Mac fetched the
      same content bytes as Crostini through port `8080`.
- [ ] Validate the bundled setup/recovery instructions offline, including
      unsupported, policy-blocked, and ChromeOS Flex wording. The exact ZIP's
      install/Launcher/Linux-files/LAN/update/uninstall guide passes on the
      physical candidate; unavailable-policy and Flex fixtures remain open.

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
- [Chrome windows API](https://developer.chrome.com/docs/extensions/reference/api/windows)
- [Chrome platform-app system.network API](https://developer.chrome.com/docs/apps/reference/system/network)
- [Chromium extension API feature restrictions](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/extensions/common/api/_api_features.json)

## Release boundary

The maintainer explicitly authorized implementation, release tagging,
publication plumbing, and deployment for this closeout, while retaining
ownership of Chrome Web Store upload. The submitted Android and extension
releases remain valid without Crostini; extension `0.1.5` is a separately
versioned follow-up rather than a silent replacement.
