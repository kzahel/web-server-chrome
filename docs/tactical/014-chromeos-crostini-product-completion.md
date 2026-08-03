# ChromeOS Crostini Product Completion

Status: **active parent sequencing tactical. Current `main` has reached the
first physically reviewed product-UI checkpoint: controller-backed folder
browsing, automatic shared-folder discovery, default stop-on-close lifetime, a
server switch, a polished portrait control surface, automatic Chromebook-host
address discovery, and local/LAN URL actions are implemented. The primary
server control is now compact and sticky, and locked settings explain their
stop-to-edit requirement when activated. This is source-fixture evidence, not
a signed release candidate or full matrix closeout. The testbed now has a
wake/retry capture implementation and the old shelf residue is classified, but
sleeping-display proof, the clean uninstall matrix, broader
lifecycle/accessibility coverage, and exact release artifacts remain open.**

Last updated: **2026-08-03**.

Topic: `chromeos-crostini-launcher`

Related records:

- [ChromeOS Crostini launcher/controller](../topics/chromeos-crostini-launcher.md)
- [ChromeOS Crostini fallback](012-chromeos-crostini-fallback.md)
- [Extension launcher and ChromeOS network readiness](011-extension-launcher-and-chromeos-network-readiness.md)
- [Desktop control-surface precedent](003-native-desktop-control-surface.md)
- [Desktop portrait polish precedent](004-portrait-desktop-polish-and-directory-listing.md)
- [Android runtime](../topics/android-runtime.md)

## Role of this tactical

Tactical 012 proved and released the signed Linux component, installer,
authenticated controller boundary, Launcher handoff, and first extension
control surface. It remains the release and historical evidence record. This
tactical starts from that baseline and owns the unfinished product experience.

This is a parent sequencing tactical because the work crosses the extension,
Rust controller, installer/uninstaller, and the separate ChromeOS testbed. Each
implementation phase below should remain a reviewable slice. If a phase grows
beyond that boundary, create a numbered sibling tactical and link it here;
keep this document as the acceptance index and completion ledger.

## Objective

Make **200 OK Linux** feel like the same product as the desktop and Android
applications while respecting ChromeOS and Crostini's actual boundary:

```text
200 OK extension control window
        |
        | authenticated, machine-local control capability
        v
Crostini controller
        |-- validates/browses allowed directories
        |-- owns settings and UI-session lifetime
        `-- starts/stops ok200-core
```

A normal user should be able to choose a folder, turn the server on, open or
copy the useful URL, and understand whether it will keep serving after the
window closes without typing a Linux path or pressing a generic **Refresh** or
**Save settings** button.

## Why this work is required

The 2026-08-03 physical routine-window capture exposed several gaps that were
easy to overlook during protocol and release validation:

- **Folder to serve** is a raw path field. Routine UI gives only a short
  `/mnt/chromeos/...` hint; the detailed **Share with Linux** instructions live
  mainly in setup/recovery content.
- Sharing a folder in Files and then returning to 200 OK requires a manual
  refresh/check flow even though the application can watch for a newly visible
  mount while its picker is open.
- Server lifecycle is presented as **Start server**/**Stop server** buttons,
  unlike the switch used by the desktop and Android applications.
- Closing the control window can leave the controller and content server
  running without a product-level lifetime choice. The accepted default is now
  the safer inverse: closing the final control surface stops serving.
- The surface uses plain inline styles, text-heavy actions, native checkboxes,
  a global **Refresh**, and a separate **Save settings** action. It lacks the
  hierarchy, status card, icons, URL actions, responsive states, and polish of
  the desktop and Android applications.
- Refreshing status or checking for updates can replace the local settings
  draft with controller state. No unrelated action may silently discard an
  edit.
- The running URL is only a text link. It lacks explicit open/copy affordances
  and copied feedback, and LAN mode does not produce a complete, copyable
  Chromebook URL.
- A post-capture purge removed the installed Linux files but a **200 OK Linux**
  shelf item remained. Follow-up inspection classified it as an orphaned
  Crostini launch placeholder rather than a user pin, Garcon registration, or
  still-installed application.
- The physical testbed's EGL capture failed while the display was asleep with
  `No active CRTC found on any DRM device`. Native keyboard screenshot capture
  succeeded because the keyboard path woke the display. Routine capture should
  handle that state automatically and retain diagnostics for real failures.

These are product gaps, not reasons to weaken the authenticated controller or
to turn the extension into a filesystem/server process.

## Accepted product decisions

These decisions are settled for implementation. Later work may refine wording,
timings, and layout without reopening the behavior.

1. **Server state is an on/off switch.** The primary control is the same
   accessible switch pattern used on desktop and Android, with explicit
   Stopped, Starting, Running, Stopping, and Error feedback. It is not a button
   labeled **Start server**.
2. **Closing the UI stops serving by default.** A user-selectable **Keep
   serving when controls close** option allows background serving. It defaults
   off for new and migrated installations. The running surface makes the
   selected lifetime visible.
3. **The default is enforced by the controller.** `beforeunload` or a best-
   effort extension message is insufficient. An authenticated UI-session
   lease or equivalent controller-owned mechanism must stop the content server
   after the final control surface disappears, including Chrome/extension
   crashes, while tolerating a bounded reconnect during navigation or update.
4. **Folder choice uses an app-owned picker.** The extension presents friendly
   **Linux files** and **Shared Chromebook folders** roots. Directory listing,
   creation, selection, canonicalization, and authorization are controller
   capabilities; the extension does not receive broad filesystem access.
5. **Manual path entry is not the primary flow.** A raw canonical path may
   remain in diagnostics or an explicitly labeled advanced/recovery affordance,
   but first run and routine folder changes use the picker.
6. **Share with Linux guidance is in context.** When a ChromeOS-owned folder is
   not visible, the picker explains Files -> right-click folder -> **Share with
   Linux**, waits for it to appear, and refreshes automatically on window focus
   and at a bounded interval while the waiting state is visible. **Check
   again** is a fallback, not the normal next step.
7. **The ChromeOS UI follows the desktop/Android product language.** Reuse the
   product's iconography, yellow accent, status hierarchy, cards, locked-
   settings explanation, local/dark color schemes, and open/copy interaction
   patterns where they fit the extension. Platform-specific code can remain
   separate; parity does not require importing Tauri or Compose.
8. **Settings commit predictably.** Valid changes made while stopped are saved
   directly, or through one clearly dirty/apply transaction if a field needs a
   draft. Refresh, reconnect, and update actions never discard unsaved input.
   Running-only locks say **Stop the server to change this setting**.
9. **Useful URLs have explicit actions.** While running, local and available
   LAN URL rows have open and copy icons, keyboard labels, and temporary
   **Copied** feedback. No Crostini guest address is presented as a peer-facing
   LAN address.
10. **Uninstall must not strand an unexplained dead Launcher item.** The fix
    must distinguish Launcher search registration from a user-pinned shelf
    item and work with ChromeOS/Garcon cache behavior rather than deleting more
    user data. If ChromeOS intentionally retains a pin, uninstall must provide
    an explicit, proved removal/recovery experience before the executable is
    gone.
11. **The ChromeOS testbed owns reliable wake-before-capture behavior.** A
    sleeping display is an expected fixture state, not a reason for a long or
    flaky screenshot run. The testbed change lands in its own repository and
    is linked as evidence here.

## Security and platform invariants

Product polish must preserve these existing boundaries:

- The controller API remains authenticated and machine-local. The control port
  is never added to ChromeOS LAN forwarding.
- Only the content listener may bind for LAN use, and only after explicit user
  action.
- The controller canonicalizes every browsed and selected directory and
  revalidates the selection before start. It accepts only directories strictly
  beneath the Linux home directory or `/mnt/chromeos`; those two confinement
  roots remain browsable but are not themselves selectable.
- Symlinks, renamed directories, stale picker entries, traversal components,
  and create/select races cannot escape the approved roots.
- The extension cannot grant ChromeOS Files access. ChromeOS-owned folders must
  still be shared by the user through Files before Linux can see them.
- The extension cannot wake Crostini through a public API. The installed Linux
  Launcher remains the routine wake mechanism.
- ChromeOS port forwarding and the Chromebook's host IPv4 are distinct from
  Crostini's bind address. Never display a guest `100.115.*` or container
  address as the LAN URL.
- Closing the UI may stop the content listener, but it does not disable or
  uninstall the headless controller. Reopening from the Launcher must remain
  fast and truthful.
- No phase deletes a served folder, unshares a ChromeOS folder, removes the
  Linux environment, changes account linger, or removes a user pin without a
  specific user-authorized ChromeOS mechanism.

## Phase A - lock the control and lifetime contracts

- [x] Add protocol types and migrations for the lifetime preference. New and
      existing configurations default to **stop when controls close** unless a
      prior explicit background preference exists.
- [x] Define authenticated acquire/renew/release semantics for a visible
      control session. Associate a run with the session/lifetime decision that
      started it instead of treating any controller process as permission to
      serve forever.
- [x] Stop the content listener after the final non-background session expires.
      Support multiple/replaced UI contexts without stopping while one valid
      control surface remains.
- [x] Use a bounded grace period for popup-to-tab conversion, extension reload,
      navigation, and controller update reconnect. Record the chosen timing and
      why it is long enough for real ChromeOS without hiding a closed UI for
      minutes.
- [x] Ensure an explicit switch-off always stops immediately, independent of
      lifetime mode or lease state.
- [ ] Keep **Keep serving when controls close** conspicuous while running and
      explain that Linux must remain running. Changing it to off while no
      durable UI session exists stops safely.
- [ ] Exercise Chrome close, popup close, normal-tab close, extension reload,
      browser crash/termination, controller restart, suspend/resume, and stale
      lease recovery. Do not rely only on synthetic `beforeunload` tests.
- [ ] Add controller and extension tests for default migration, final-session
      expiry, multiple sessions, explicit release, missed heartbeat, reconnect
      grace, background opt-in, explicit stop, and process restart.

Completion gate: with the default setting, closing the final 200 OK control
surface makes the content port unreachable within the documented grace period.
With background serving explicitly enabled, the same close leaves exact
content reachable until the user stops it or Linux stops.

## Phase B - controller-backed folder picker

### Controller capability

- [x] Add authenticated filesystem roots, directory listing, folder creation,
      and selection endpoints. Use stable root identifiers such as
      `linux-files` and `shared-chromeos`, plus relative entry identifiers;
      do not make the UI concatenate trusted absolute paths.
- [ ] Return display name, kind, selectable state, and a non-sensitive display
      breadcrumb. Return only the metadata needed by the picker.
- [x] Make home and `/mnt/chromeos` navigation sentinels non-selectable while
      allowing their children. Explain empty and missing shared roots without
      exposing an internal error dump.
- [ ] Canonicalize on list, create, select, settings commit, and server start.
      Reject traversal, root selection, non-directories, broken links, links or
      races that escape confinement, permission denial, and paths that vanish
      after selection.
- [x] Preserve existing canonical-path settings through migration. The
      controller remains the authority that translates an accepted picker
      selection into persisted server configuration.
- [ ] Rate-limit or bound enumeration and return deterministic ordering. Large,
      unreadable, or rapidly changing folders must not freeze the control UI.

### Picker experience

- [x] Replace the raw path field with a folder card and **Choose…**/**Change…**
      affordance. Show a friendly folder name first and the canonical path only
      as secondary detail or diagnostics.
- [ ] Provide breadcrumbs, parent navigation, folder rows with icons, empty,
      loading, error, and permission-denied states, keyboard navigation, and a
      **New folder** action consistent with Android/desktop capability.
- [x] When no ChromeOS share is visible, show concise steps:
      open Files, right-click the desired folder, choose **Share with Linux**,
      then return to 200 OK. If ChromeOS exposes a safe supported way to open
      Files, offer it; otherwise do not fake that capability.
- [x] Re-list when the control window regains focus and poll only while the
      explicit waiting state is visible. Stop polling when the picker closes.
      Preserve the current browse position and announce a newly visible share.
- [x] Keep **Check again** as recovery for delayed Garcon/mount propagation.
      Do not require a round trip through the setup wizard.
- [x] Lock the picker while the content server is running and provide the same
      actionable stop-to-edit explanation as other settings.
- [ ] Add UI tests for both roots, nested navigation, create/select/cancel,
      automatic share appearance, lost share, empty/error/loading states,
      disabled root selection, and server-running lock.

Completion gate: a user can create/select a Linux folder and select a folder
newly shared from ChromeOS Files without typing `/mnt/chromeos`, manually
refreshing in the ordinary case, or escaping controller confinement.

## Phase C - polished application control surface

- [x] Establish a small extension design system using the canonical 200 OK
      icon/wordmark, product yellow, semantic status colors, spacing, type,
      buttons, icon buttons, switches, cards, focus rings, and light/dark
      tokens. Avoid one-off inline style objects for the finished surface.
- [x] Rebuild the routine window around a compact product header, server status
      card, folder card, URL card, basic settings, collapsed Advanced section,
      and secondary Help/About/Update actions.
- [x] Replace **Start server**/**Stop server** with the accessible switch.
      Preserve the established async state machine and disable duplicate input
      during transitions.
- [x] Match desktop/Android control order and terminology where the feature is
      shared. Keep ChromeOS-only sharing and port-forwarding guidance adjacent
      to the controls it explains.
- [x] Use clear icons for folder, server/power, open, copy, network, settings,
      refresh/retry, update, help, and errors. Decorative icons are hidden from
      accessibility APIs; icon-only buttons have names and tooltips.
- [x] Remove the global manual **Refresh** from normal operation. Synchronize
      status automatically while the control surface is visible, using bounded
      polling or controller events that do not create persistent Manifest V3
      background work.
- [x] Remove the ambiguous global **Save settings** workflow. Commit valid
      stopped-state changes predictably, preserve per-field drafts while the
      user is typing, and show inline validation or a saved/error state.
- [x] Move updater internals and uncommon server behavior under Advanced or
      About without hiding an available security/update action.
- [x] Keep full setup, Share with Linux, recovery, reset, rollback, and
      uninstall guidance reachable from the connected UI.
- [x] Keep the primary server state and switch in reach with a compact sticky
      control while longer LAN and advanced content scrolls. A locked setting
      remains focusable and reports the stop-to-edit reason when activated
      instead of silently ignoring touch or keyboard input.
- [ ] Support the 460×750 popup, smaller ChromeOS display settings, and normal-
      tab fallback without clipped controls, horizontal scrolling, or tiny
      targets. Preserve one focused routine surface.
- [ ] Add visual regression screenshots for the principal stopped, running,
      picker, LAN-help, update, and error states in light and dark schemes.
- [ ] Compare final physical screenshots beside the current desktop and Android
      surfaces. Exact pixels may differ; hierarchy, terminology, affordances,
      and perceived product quality may not.

Completion gate: a first-time observer can identify the folder, server state,
primary switch, and useful URL without reading setup documentation, and the
surface is recognizably the same 200 OK product as desktop and Android.

## Phase D - local and LAN URL completion

- [x] Show the local running URL in a dedicated row with **Open** and **Copy**
      actions, tooltip/accessibility names, and visible **Copied** feedback.
- [x] Keep URL state live across start, stop, port changes, reconnect, and
      update. Never leave an actionable URL visible after the listener stops.
- [x] Present **Available on local network** as an explicit setting, not a
      guarantee that ChromeOS port forwarding is already configured.
- [x] When LAN is enabled, guide the user through adding the exact content port
      under **Settings -> About ChromeOS -> Developers -> Linux development
      environment -> Port forwarding**. Make the warning against forwarding
      controller port `20080` clear but secondary.
- [x] Perform one bounded implementation spike for a supported Chromebook host
      IPv4 source. The MV3 page now gathers local WebRTC host candidates without
      STUN, rejects loopback/link-local/`100.115.*`, prefers private IPv4, and
      composes the copyable `http://<chromebook-ip>:<port>/` URL. Do not keep a
      duplicate manual-address field: when detection is unavailable, direct the
      user to the address ChromeOS already prints above its Port forwarding
      controls.
- [ ] Distinguish **listening in Linux**, **ChromeOS port added**, and **tested
      from another device**. Do not claim reachability merely because the Rust
      listener bound successfully.
- [ ] Handle port changes while a stale ChromeOS forwarding rule exists. State
      which old rule the user may remove and which new port must be added.
- [ ] Test clipboard denial, browser-open failure, invalid/IPv6 input, hidden
      URL while stopped, LAN disabled, and forwarding guidance offline.

Completion gate: local open/copy works directly. With LAN enabled and the
documented ChromeOS step completed, another physical device fetches the exact
fixture from the copyable Chromebook URL. The UI never offers a guest address
as that URL.

## Phase E - setup, re-entry, diagnostics, and recovery polish

- [ ] Make the toolbar extension entry and Launcher handoff land on the right
      state: setup when uninstalled/unclaimed, recovery when disconnected, and
      polished controls when connected. Avoid repeatedly sending an installed
      user through the one-time Linux guide.
- [ ] Keep offline setup content, but turn it into a stepwise experience with
      status, copy-install-command, retry, and clear recovery actions rather
      than a wall of text.
- [ ] Explain that the ChromeOS Launcher wakes Linux and that the extension
      alone cannot. Retain the Terminal-once recovery path until full reboot
      evidence closes it.
- [ ] Add controller diagnostics/log retrieval with bounded, redacted output,
      version/protocol state, copy/export action, and clear permission,
      collision, pairing, update, and folder errors.
- [ ] Add independent token rotation and preserve the existing reset,
      reinstall, rollback, normal uninstall, and purge recovery paths.
- [ ] Keep automatic update checks automatic while the controller is already
      active. A generic status **Refresh** is not a substitute for state
      synchronization.
- [ ] Verify setup, routine controls, and help use the same terminology for
      Linux files, shared Chromebook folders, server lifetime, LAN access, and
      uninstall.

## Phase F - uninstall and stale Launcher cleanup

- [ ] Reproduce the 2026-08-03 result from a clean public install and record
      separately: Launcher search result, app list/registry state, pinned shelf
      item, desktop-file presence, Garcon cache, and click behavior before and
      after normal uninstall and `--purge`.
- [x] Determine whether the remaining icon is a preserved user pin, delayed
      Garcon propagation, an installer-owned duplicate entry, or a cache bug.
      Do not call all of these states a stale Launcher entry.
- [ ] Audit installer/uninstaller ordering: stop service, remove desktop entry
      and icons, update desktop/icon databases where present, notify/reload the
      user service manager, allow ChromeOS registration to settle, and remove
      versioned binaries without a broken intermediate launcher.
- [ ] Prove a true user-pinned shelf item separately from the now-classified
      orphaned launch placeholder. If ChromeOS provides no supported way for
      Linux uninstall to remove a user pin, design and physically prove an
      explicit in-product preparation flow or clear unpin step while the helper
      still exists. Do not leave a silently dead icon and call it success.
- [ ] Test normal uninstall, purge, reinstall over preserved settings, repeated
      uninstall, container stopped/restarted, full ChromeOS reboot/login, and
      both pinned and unpinned states.
- [ ] Continue to preserve served content, sharing, port-forwarding entries,
      account linger, and unrelated Linux applications.

Completion gate: after the documented uninstall transaction and bounded
ChromeOS propagation period, no searchable 200 OK Linux application remains.
A pinned shelf state is either removed through a supported, user-authorized
path or handled by explicit pre-removal guidance; clicking an unexplained dead
200 OK item is not an accepted final state.

## Phase G - reliable ChromeOS testbed capture

This phase changes the separate ChromeOS testbed repository under
`~/code/chromeos-testbed`; this repository records the dependency and evidence.

- [ ] Reproduce awake and display-asleep captures with the standard testbed
      command and retain the exact `No active CRTC` diagnostic as a fixture.
- [x] Add a bounded capture preflight that detects an inactive display and
      wakes it with a non-destructive keyboard action before retrying EGL, or
      automatically selects the already-proved native keyboard capture path.
- [x] Wait only as long as display activation needs, then verify a non-empty,
      current frame. Do not hide permissions, SSH, Chrome, encoder, or unrelated
      DRM failures behind an unconditional fallback.
- [x] Make the chosen method and fallback visible in command output so a slow
      capture can be diagnosed immediately.
- [x] Add regression coverage or a deterministic fake for no-active-CRTC,
      retry success, retry failure, and already-awake behavior.
- [x] Update the testbed skill/runbook so future screenshot tasks use the fixed
      path without rediscovering the wake requirement.
- [ ] Link the testbed commit and an awake/asleep timing comparison in this
      tactical's evidence ledger.

Completion gate: from a healthy but sleeping physical Chromebook, one routine
screenshot command wakes/captures without manual intervention and without a
long SSH/debug detour. Awake capture is not regressed.

## Phase H - accessibility, resilience, and physical matrix

- [ ] Give every control a visible keyboard focus state and logical order.
      Validate switch, picker, breadcrumbs, dialogs, icon buttons, Advanced,
      error recovery, and copied/status announcements without a pointer.
- [ ] Use `role="switch"`, accurate `aria-checked`, dialog naming/focus trap,
      `aria-live` for async status, and reduced-motion/contrast-safe styles.
- [ ] Validate ChromeVox at normal and enlarged display settings. Include the
      transient Rust launcher, whose custom-drawn body is not yet represented
      in ChromeOS's automation accessibility tree.
- [ ] Validate controller disconnect/reconnect, Linux VM stop, offline launch,
      folder disappearance, port collision, extension update, controller
      update, suspend/resume, and full reboot without an unintended listener.
- [ ] Run source/unit/type/lint/Rust gates, build the exact packed extension and
      signed Crostini candidate, then repeat critical flows with those artifacts
      rather than a dev-only build.

## Physical acceptance matrix

| Journey | Required result |
|---|---|
| First launch | Setup reaches one polished control surface; the server remains off until the user turns on the switch |
| Default folder | `~/Downloads/200 OK` is shown as a friendly selected Linux folder and can be changed without typing a path |
| Linux folder | Picker navigates, creates, selects, persists, starts, and serves an exact fixture beneath Linux home |
| Shared ChromeOS folder | User shares in Files; returning/focusing the waiting picker detects it automatically; selection serves the exact fixture |
| Confinement | Home root, `/mnt/chromeos`, traversal, escaping symlink, stale entry, file, and unshared path all fail clearly and remain unserved |
| Server switch | On/off switch exposes busy/error state, prevents duplicates, and stops immediately when switched off |
| Default lifetime | Closing the final control UI stops the content listener within the documented grace period |
| Background opt-in | Explicit **Keep serving when controls close** leaves the listener reachable; reopening reports the truthful running state |
| Local URL | Local row opens, copies, confirms copy, and disappears or disables when stopped |
| LAN URL | UI gives the exact content-port steps and a copyable Chromebook-host URL; a second device fetches the exact fixture |
| Draft safety | Status sync, reconnect, picker refresh, update check, and validation errors never discard an unrelated settings draft |
| Window modes | 460×750 popup, small display, and normal-tab fallback remain usable and focus one routine surface |
| Uninstall | Search/app registration clears; pinned behavior is explicitly resolved; served folder, sharing, forwarding, and linger are untouched |
| Reboot/recovery | Full logout/reboot, stopped-VM Launcher wake, offline help, and Terminal-once recovery behave as documented |
| Screenshot | Standard testbed capture succeeds from both awake and asleep display states with diagnostic method output |
| Accessibility | Keyboard and ChromeVox can operate switch, picker, URLs, settings, errors, and launcher recovery |

## Implementation sequence

Do not begin with a cosmetic-only rewrite that hard-codes today's incomplete
protocol. Use this order:

1. **Contracts and tests:** lifetime migration/lease, filesystem capability,
   status synchronization, and client types.
2. **Folder slice:** controller browser endpoints and a minimally styled but
   complete picker, including automatic shared-folder detection.
3. **Lifecycle slice:** default close-to-stop behavior and explicit background
   opt-in through real popup/tab/extension lifecycle tests.
4. **Product shell:** design tokens, status switch, settings hierarchy,
   automatic synchronization, icons, drafts, help, and responsive/dark states.
5. **URL/LAN slice:** local open/copy and the accepted Chromebook-host address
   flow with physical second-device evidence.
6. **Recovery slice:** diagnostics/token rotation, setup/re-entry, uninstall
   registration/pin behavior, and full reboot recovery.
7. **Testbed slice:** land wake-aware capture in the separate repository before
   collecting the final screenshot/accessibility matrix.
8. **Exact-artifact closeout:** packed extension plus signed Crostini candidate,
   complete physical matrix, topic reconciliation, and release decision.

Each slice must leave controller and content ports distinguishable, preserve
settings migrations, and keep the server stopped after failure. Cross-slice UI
screenshots are evidence, not a substitute for protocol and port probes.

## Evidence ledger

Add dated entries with exact commits/artifact hashes, ChromeOS milestone,
container architecture/version, testbed health result, UI capture links, and
port/content probes as phases close.

- **2026-08-03 baseline:** physical M150 routine controls captured from the
  current extension/controller. EGL screenshot failed while the display was
  asleep with no active CRTC; native keyboard capture succeeded. Post-test
  purge removed installed files, while a 200 OK shelf item remained visible.
  The item was not yet classified as a pin, search registration, or Garcon
  cache entry, so this is a reproduction lead rather than a root-cause claim.
- **2026-08-03 source-fixture UI checkpoint:** commits `08ed3a8`, `2d5097a`,
  `d4e9e64`, and `01aa236` implement the protocol-2 UI-session lease,
  confined folder capabilities, polished control surface, and physical-review
  corrections. The extension passed typecheck, build, Biome, and 45 tests; the
  Crostini package passed formatting, strict Clippy, and 20 tests. Testbed
  doctor passed 8/8. The controller was built from the exact committed source
  inside x86_64 Debian 12 Crostini and paired with the matching unpacked
  extension on M150 ChromeOS. The 700×750 popup physically showed the stopped
  switch, default-off lifetime option, running `http://localhost:8080` URL,
  and the two-root picker. Review removed Linux dot directories and ChromeOS's
  internal `fonts` mount, renamed `MyFiles` to **My files**, and disabled
  invalid root actions. A physical title-bar touch closed the final control
  window and a container-side port probe immediately reported port 8080
  unreachable. An accessibility `doDefault` action had earlier claimed to
  close the window without doing so; that was a testbed input false positive,
  not a session-close product failure. Keyboard capture was used explicitly;
  wake-aware standard capture remains Phase G. No signed/public artifact claim
  is made from this fixture.
- **2026-08-03 portrait-window correction:** commit `5b98706` changes the
  routine popup from the original 700×750 protocol fixture to 460×750, close
  to the desktop application's 410×700 portrait window. The exact unpacked
  extension passed typecheck, build, Biome, and 46 tests. On the M150 fixture,
  ChromeOS reported the requested 460×750 outer window, the compact control
  layout remained legible, and the stacked two-root folder dialog fit without
  horizontal scrolling. Setup, claim, and popup-failure recovery still use a
  normal tab. Follow-up `dc3bb5e` replaced the location selector's implicit
  two-row grid with one flex-aligned icon/copy group; both the selected Linux
  and selected Chromebook states were physically checked at the portrait
  width.
- **2026-08-03 shelf/testbed closeout slice:** testbed commits `945b37d` and
  `2692d19` implement exact no-active-CRTC wake/retry, method reporting, and
  four deterministic tests; the deployed awake path produced a nonempty
  3840×2160 EGL frame and doctor passed 8/8. The post-fix sleeping physical
  timing remains open because no safe deterministic display-off hook was used.
  Product commit `8be44e5` makes controller stop mandatory during uninstall
  except for an already-absent unit and adds bundled asynchronous Launcher
  guidance. Linux strict Clippy, 30 Crostini tests, and the release build passed
  in Debian 12; extension typecheck, build, Biome, and all 46 tests passed. App
  Service and shelf menus classified the residue as unpinned orphaned launch
  placeholders; a matching X11 lifecycle cleared both the real and old probe
  placeholders. The test-only registration and diagnostics were removed,
  while exact source-built 200 OK Linux 0.1.1 and the matching production-ID
  unpacked extension 0.1.6 were left installed, claimed, connected, stopped,
  and ready for maintainer review. No physical uninstall was rerun after
  `8be44e5`.
- **2026-08-03 compact-control and LAN follow-up:** commit `de022ca` reduces
  routine surface and row spacing, keeps the server card sticky in the
  460×750 control window, and turns inert native-disabled settings into
  mutation-safe `aria-disabled` controls with a visible stop-to-edit notice.
  Typecheck, production build, Biome, and all 47 extension tests passed. The
  exact unpacked build was deployed on the M150 fixture; physical running-LAN
  review confirmed the switch remains reachable at maximum scroll, the entered
  Chromebook IPv4 stays adjacent to the **Other devices** copy/open URL, and
  activating the locked folder control displays the explanatory notice.
  Crostini exposed only `100.115.92.206/28` and gateway `100.115.92.193`.
  The initial comparison incorrectly implied that JSTorrent's MV3 extension
  enumerated ChromeOS interfaces itself; the follow-up below corrects that
  conclusion.
- **2026-08-03 automatic LAN-address correction:** commit `f67ee55` uses a
  local-only WebRTC ICE probe in the MV3 control page, filters ChromeOS guest
  candidates, and adds a compact re-detect action. JSTorrent source inspection
  established that its MV3 client instead
  asks the Android/native I/O daemon for that daemon's interfaces and gateway;
  UPnP remains a separate WAN mapping mechanism. Physical TTL probes from
  Crostini returned `100.115.92.193`, `100.115.92.25`, and router
  `192.168.1.1`, confirming that hop inspection does not return the translated
  host address. The deployed production-ID extension gathered both
  `100.115.92.25` and `192.168.1.106`, selected the latter, and displayed the
  detected state. The external Mac and
  Crostini loopback fetches returned identical SHA-256
  `f46c16dc543df8be799fbf1e66ef4aa5ba99ed9df80bc5933048dba2de0cbc75`.
  Workspace typecheck, production build, Biome, and all 52 extension tests
  passed. Deployment also exposed that the repository helper still targeted a
  dead Crostini SSH path and an inactive unpacked directory. Commit `1473fca`
  delegates to the authoritative ChromeOS testbed, targets the active
  `200-ok-extension` directory, and passed an end-to-end build, transfer, and
  production-ID reload. The controller was reopened and left running with the
  automatically detected address. The follow-up removes the manual-address UI
  entirely and clears legacy saved overrides.

## Completion definition

This tactical is complete only when:

- every accepted product decision is implemented or explicitly superseded in
  the living topic;
- every row in the physical matrix has exact-artifact evidence or a named,
  user-visible limitation accepted by the maintainer;
- the public setup/recovery copy matches the implemented picker, lifetime, LAN,
  and uninstall behavior;
- the testbed capture fix is linked and used for final screenshots; and
- [`chromeos-crostini-launcher.md`](../topics/chromeos-crostini-launcher.md)
  is reconciled from this execution record into current truth.
