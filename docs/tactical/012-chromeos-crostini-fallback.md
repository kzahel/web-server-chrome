# ChromeOS Crostini Fallback

Status: **active release closeout; physical x86_64 feasibility now includes the complete
disposable offline handoff from a cached non-terminal Launcher app through a
stopped Crostini VM and local external-message page into a dormant extension
worker. The extension launch/optional-permission slice and a checked-in
pure-Rust graphical launcher/desktop template are implemented and physically
validated. The first production-shaped vertical slice now adds the combined
Rust controller, authenticated control/content lifecycle, static unit,
post-verification self-install/uninstall transaction, and responsive extension
setup/control UI. That exact source-built x86_64 slice passed claim,
start/localhost/stop, one routine popup, stopped-VM wake without content
autostart, reset/reclaim, idempotent reinstall, preserve uninstall, and purge
on M150. Signed static-artifact CI, the canonical manifest, verified bootstrap
installer, ownership/previous/rollback transaction, CLI updater, and shared
update-service route and the bounded controller/extension update experience
are now implemented in source. No signed public tag,
deployed update route, physically exercised ARM64 artifact, packed extension
candidate, or supported public route ships yet.**

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
- install the controller as a static on-demand systemd user unit with
  `Restart=always`, but no enable target or linger mutation; the ChromeOS
  Launcher starts it explicitly;
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

Use a normal extension tab for first install, permission, claim, and recovery;
use one dedicated Chrome popup browser window for routine connected controls,
with a normal tab as fallback. Automatic update checks run only while the
controller is already active. Manual update is always available, and
automatic installation is an explicit recommended preference that applies only
while the content server is stopped.

The extension should eventually own a full-page ChromeOS setup and control UI,
while the Crostini binary runs as a small authenticated headless controller.
Essential install, start, recovery, update, and uninstall guidance must be
bundled in the extension so it remains readable offline; the website mirrors
that content but is not its only copy. Request any optional local-host
permission only after the user chooses **Use the Linux version**, and do not
expose the public route until the now-proved hostname, preflight, permission,
one-time claim, and token behavior is paired with signed release artifacts and
the remaining acceptance gates.

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

### On-demand service and popup control surface

A disposable static user unit on the physical M150 reported inactive after
Linux startup, started only on explicit request, stayed active after Terminal
closed, and returned inactive after the VM stopped and later restarted. Its
`Restart=always` policy did not override explicit `systemctl stop`. The test
account already had `Linger=yes` from JSTorrent; the static unit still remained
on-demand, proving 200 OK must neither enable nor disable that shared setting.

A separate permission-free Manifest V3 fixture created a persistent 700×750
Chrome popup window on the same device. The page was returned by
`runtime.getContexts({contextTypes: ["TAB"]})` with its `windowId`, validating
the warning-minimizing create/find/focus mechanism.

The later production vertical slice then passed on the same x86_64 testbed:

- Linux tests/Clippy and a release build of the combined launcher/controller;
- versioned atomic per-user self-install, static active-on-request unit,
  `0600` controller config, no enable or linger mutation, and idempotent rerun;
- normal-tab first claim through the exact optional host-permission prompt,
  fixed-origin preflight, one-time external-message code, persisted bearer
  token, and authenticated status/settings/start/stop;
- explicit `ok200-core` start at `localhost:8080`, exact browser fetch, truthful
  stop, and stopped content after a controller-only VM wake;
- one 700×750 routine popup, repeated focus without duplication, and a fully
  stopped-VM Launcher wake with no Terminal;
- reset/identity rotation/reclaim and preserve/reinstall/purge uninstall
  behavior without deleting the served root or changing pre-existing linger;
  and
- removal of the Launcher item and all test fixtures after uninstall.

The first browser claim also found and repaired a ChromeOS-only illegal
invocation from an unbound `fetch`; the retained client binds its browser
receiver and has a regression test. Popup-failure fallback, bounds persistence,
the exact packed manifest, full ChromeOS reboot/login, ARM64, fresh permission
denial, signed download/update, and public setup copy remain unproved.

## Active end-to-end release closeout

The maintainer authorized proceeding through implementation, tagging,
publication plumbing, deployment, and exact-artifact validation. Work remains
split into reviewable commits; a completed source slice is not promoted to a
supported user path until the later exact-release gates pass.

### R1 — release contract and source plumbing

- [x] Implement and commit the signed manifest, static-musl two-architecture
      workflow, verified bootstrap, exact ownership transaction, retained
      previous version, downgrade refusal, update/rollback CLI, bundled offline
      commands, and `/crostini` update-service source/config.
- [x] Cross-build both development architectures, execute the static x86_64
      artifact on the Chromebook, and physically prove ownership tamper
      refusal, version-change restart, downgrade refusal, rollback,
      preserve/purge boundaries, linger preservation, and cleanup.
- [x] Commit the shared update-server protocol independently so deployment can
      be coordinated without coupling its history to the product repository.

### R2 — finish the production controller update experience

- [x] Persist bounded update-check state and check only after the controller is
      already active, at most once per 24 hours with failure backoff. Never
      wake Crostini merely to check.
- [x] Expose authenticated update status plus an explicit update action to the
      extension. Run replacement outside the controller service cgroup, return
      an accepted/pending response before restart, and never resume stopped
      content after replacement.
- [x] Add the recommended but explicit automatic-install preference. Install
      automatically only while content is stopped; otherwise leave the signed
      release pending until an explicit stop/restart decision.
- [x] Show current/available version, check/update progress, offline failure,
      and local rollback guidance in the extension control surface; cover the
      client/controller protocol with deterministic tests.

### R3 — create the exact signed release

- [ ] Reconcile both repositories with their remotes, push the shared
      update-server commit and product source commits, and preserve the
      pre-existing untracked update-server `CLAUDE.md` without publishing it.
- [ ] Run `scripts/release-crostini.sh 0.1.0 --check`, then the mutating release
      command; inspect the version commit and local `crostini-v0.1.0` tag before
      atomically pushing `main` plus the tag.
- [ ] Monitor tag CI through static x86_64/ARM64 construction, manifest signing,
      independent verification, exact asset-set enforcement, checksums, and
      GitHub Release creation. A partial or failed job is not a release.
- [ ] Download the public assets independently, verify the manifest signature,
      signed identity/protocols, hashes, sizes, executable versions, ELF
      architecture/static linkage, release notes, and checksums.

### R4 — deploy and validate public delivery

- [ ] Deploy the compatible update-server commit and this repository's
      `/crostini` product config through the existing Remy runbook. Confirm the
      desktop Tauri route is unchanged and `/crostini/manifest` returns the
      exact signed release or `204` for a current client.
- [ ] Confirm the deployed website serves the source-controlled bootstrap, and
      compare its bytes with the tagged source before executing it.
- [ ] In a clean x86_64 Crostini installation, run the public one-command
      bootstrap, verify the installed exact public hash/version and static
      unit/ownership state, claim through the extension, serve/fetch/stop, run
      current/offline checks, and exercise uninstall preserve plus purge.
- [ ] Execute the exact ARM64 artifact in the strongest available ARM64 Linux
      testbed. Keep ChromeOS-specific claims separate if no ARM Chromebook is
      available.

### R5 — close ChromeOS/store-facing gates

- [ ] Pack the exact extension candidate and compare install/update warning
      text, optional-host denial/re-request, Local Network Access behavior, and
      forced popup-to-tab fallback. Do not change the already submitted store
      artifact silently; prepare a separately versioned follow-up if code must
      ship.
- [ ] With the maintainer available to sign back in, perform a full ChromeOS
      reboot/login and prove the cached **200 OK Linux** Launcher item wakes the
      VM, starts one controller, opens one extension surface, and leaves content
      stopped. Retain the Terminal-once recovery copy until this passes.
- [ ] Record any first-release-only limitation honestly. In particular, an
      exact public signed upgrade/rollback transition may require the next
      `crostini-v` release even though source/dev two-version rollback passes.
- [ ] Update the topic, extension topic, vision, and this ledger with exact
      release URLs/hashes/evidence. Only then decide whether to change the
      website/extension label from **Future option** to supported.

## Implementation ledger

### C1 - productionize the native binary

- [x] Give the Crostini binary the independent `ok200-crostini` product name,
      `crostini-v` tag namespace, package version, changelog, and release script
      without silently replacing the feature-richer npm CLI.
- [x] Implement one `ok200-crostini` binary containing the launcher, controller,
      status, reset, self-install, and uninstall subcommands so installed
      launcher/service versions cannot drift; its independent release identity
      is now defined above.
- [x] Add version output, private persisted identity/settings, process locking,
      clear bind failures, machine-readable readiness/status, one-time claim,
      bearer-authenticated settings/start/stop, and reset/identity rotation.
- [ ] Add independent token rotation, rooted browse, logs/diagnostics, and
      migrations. Signed `check-update`/`update` plus offline `rollback` are
      implemented in source and await exact-release physical proof.
- [x] Preserve localhost-only as the content default and make LAN binding
      explicit; the controller is separately authenticated and must never be
      forwarded.
- [ ] Build and test x86_64 and ARM64 assets against the oldest claimed
      Crostini runtime. Pinned static-musl cross-builds now pass for both
      architectures; the exact x86_64 development artifact ran on Debian 12,
      while ARM64 and the oldest baseline remain runtime gaps.
- [x] Generate canonical SHA-256/size metadata and reject unsigned, tampered,
      incompatible, wrong-architecture, or wrong-version downloads before
      installation mutation.
- [x] Implement a separately signed `crostini-v` artifact manifest with
      architecture and controller/extension protocol compatibility ranges.
      Publication and exact-artifact proof remain open.

### C2 - create install, update, and uninstall paths

- [x] Add a source-controlled installer modeled on JSTorrent's Crostini
      installer: architecture selection, immutable release URL, checksum and
      signature verification, per-user install, and version selection.
- [x] Implement the small pure-Rust transient graphical helper and the
      non-terminal `app.ok200.crostini.desktop.in` template. The helper is
      DPI-aware, has failure/retry controls, and does not require GTK, Tauri,
      `xmessage`, or Xlib at runtime.
- [x] Have the real installer install that helper, desktop entry, branded icon,
      combined controller, local rollback/uninstall commands, and static
      non-enabled controller unit idempotently without changing linger.
- [x] Implement and physically prove the post-verification subset: the combined
      binary self-installs its versioned executable, stable links, real
      launcher/icon, and static unit; rerun is idempotent and never changes
      enablement or linger. Public verification/rollback remains open.
- [x] Install immutable version directories behind an atomic stable link, take
      an installer lock, preserve one previous version, and make repeated
      installation an idempotent update.
- [x] Record exact owned paths. Normal uninstall preserves settings; explicit
      `--purge` removes controller settings/tokens. Neither mode removes served
      content, ChromeOS sharing/forwarding state, or the Crostini environment.
- [x] Physically prove current exact-path preserve and purge behavior on x86_64,
      including served-root and linger preservation, formal ownership-manifest
      fail-closed behavior, two-version restart/rollback, and Launcher-cache
      removal.
- [x] Extend the shared update-service source with a separate `/crostini`
      product and generic signed artifact-manifest response carrying the exact
      signed manifest/signature bytes. Production deployment remains open.
- [x] Check automatically only after on-demand controller start and at a
      bounded daily cadence while active; offer manual update plus explicit
      automatic-install preference, defer install while content is served, and
      physically prove restart, reconnect, rollback, corruption, interruption,
      and offline recovery.

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
- [x] Replace the `xmessage` scaffold with the checked-in Rust launcher and
      physically prove its readable 230-DPI working/error surfaces,
      failure-to-retry recovery, warm single-service reuse, and two consecutive
      stopped-VM extension handoffs. Final host launch count advanced 16 → 17 →
      18 and no launcher process remained after either handoff.
- [x] Prove a static `Restart=always` controller fixture stays inactive across
      Linux/VM restart until explicitly started, survives Terminal close after
      start, respects explicit stop, and remains static even with pre-existing
      account lingering.
- [x] Repeat warm and fully stopped-VM tests with the production Rust controller;
      its local page woke the extension worker and focused one popup without
      Terminal. Full ChromeOS reboot/login remains open.
- [x] Provide and physically exercise start, stop, validated root, port,
      localhost/LAN, directory-listing, CORS, and SPA settings at the existing
      native-core capability level. Exact LAN ingress through this UI remains
      open.
- [ ] Start with Linux `~/Downloads`; document **Linux files** and **Share with
      Linux**, then add a tested shared-folder selection flow.
- [ ] Present the Chromebook host IPv4 instructions and exact ChromeOS
      port-forwarding path when LAN is enabled.
- [ ] Explain that the installed Launcher item wakes Linux, retain a
      Terminal-once recovery path, and prove behavior after a full ChromeOS
      reboot before finalizing systemd policy.
- [ ] Make the transient launcher's failure recovery keyboard- and
      screen-reader-accessible. ChromeOS exposed the raw X11 window and standard
      close control, but not its custom-drawn body, in the automation tree.
- [ ] Do not silently keep serving a folder after the user believes the app has
      stopped.
- [x] Prove a permission-free 700×750 Chrome popup and context-based discovery
      with a usable `windowId` on physical M150 ChromeOS.
- [x] Route incomplete setup/permission/claim to a normal extension tab and
      routine connected launch to one focused 700×750 popup; physically prove
      setup-to-popup conversion, responsive controls, and repeated focus.
- [ ] Force normal-tab fallback, validate bounds/small displays, and repeat with
      the exact packed extension candidate.

### C4 - integrate the website and extension

- [ ] Bundle a full-page Crostini setup/recovery guide in the extension with
      supported-device caveats, Linux setup, one verified install command,
      Launcher instructions, Linux-files guidance, and LAN forwarding. The
      hidden source UI now bundles the exact command plus launcher recovery,
      update, rollback, preserve-uninstall, and purge guidance; file sharing
      and LAN guidance still need the finished setup flow.
- [ ] Mirror the bundled guide on an owned Crostini website page without making
      the extension depend on that page at runtime.
- [ ] Update `/chromeos` from **Future option** only after the exact installer
      and both architecture assets pass.
- [ ] Add the **Use the Linux version** route and ChromeOS-specific control UI;
      do not claim direct launch or automatic controller detection until its
      physical protocol gates pass.
- [x] Implement the ChromeOS control UI and physically prove the installed
      controller handoff; keep the public popup route hidden until the signed
      installer and release gates pass.
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
| Install | The source-built and static-musl development x86_64 transactions pass versioned per-user install without npm/sudo/enable/linger mutation, manifest-tamper refusal, two-version restart/rollback, preserve/reinstall/purge, served-root preservation, and app removal. Exact signed-release x86_64 plus ARM64 physical proof remains |
| Launcher | Windowless user launchers became stale after one host launch, and direct `chrome-extension://` handoff failed. The checked-in pure-Rust helper plus production controller passed warm reuse and stopped-VM launch through the installed static unit into one popup without Terminal. Full ChromeOS reboot/login remains |
| Files | Linux `~/Downloads` and one ChromeOS folder explicitly shared with Linux serve exact fixtures; unshared paths fail clearly |
| Local browser | `localhost` or the accepted stable Crostini hostname reaches the server without a ChromeOS LAN port entry |
| LAN off | A second device cannot reach the server through the Chromebook LAN address |
| LAN on | After the documented ChromeOS port entry, a second device fetches the exact fixture at the shown Chromebook IPv4 and port |
| Lifecycle | Static semantics plus production explicit start/fetch/stop, controller-only VM wake with content stopped, reset/reclaim, reinstall, and both uninstall modes pass. Signed CLI update/rollback exists in source; full reboot/logout, suspend/resume, collision, and exact-release update/reconnect/rollback proof remain |
| Extension | Source build passes deterministic health, exact-extension one-time claim, bearer token, optional host prompt, normal setup tab, one focused popup, and offline local handoff. Packed warning proof, fresh denial, forced tab fallback, and final offline install copy remain |
| Unsupported | Managed/child/secondary/old-device copy directs users to another supported device without a dead loop |

## Release boundary

The maintainer explicitly authorized the active closeout above to implement,
tag, deploy publication plumbing, and validate exact release artifacts. The
maintainer still owns Chrome Web Store uploads. The current submitted Android
and extension releases remain valid without Crostini; any changed extension is
a separately versioned follow-up candidate rather than a silent replacement.
Crostini becomes a public supported option only after the acceptance matrix
passes on exact release artifacts.
