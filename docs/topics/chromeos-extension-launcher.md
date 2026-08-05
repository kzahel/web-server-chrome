# ChromeOS Extension Launcher

Topic: chromeos-extension-launcher

Status: **the extension uses a best-effort Android intent with an always-visible
HTTPS options route and does not claim to detect Android or Google Play
availability. Public `extension-v0.1.8` is the protocol-2 release for the
polished ChromeOS Linux setup/control surface and the Android/Linux peer
chooser. Its exact 153,762-byte, 14-file GitHub ZIP passes CI and independent
store-package inspection with SHA-256
`19c1a15ffad8c10bab2f6b1c42cf3a2c75c9739dcf4bdde9a1b304bbcb07925e`.
The release was submitted for maintainer-owned Chrome Web Store publication;
store delivery remains open. The matching protocol-2 bootstrap is already
deployed at the maintainer's direction, accepting a temporary compatibility
gap until store `0.1.8` is live. Earlier physical evidence still owns the
Android intent, contextual permission,
claim, popup fallback, ChromeOS Linux control, LAN, and lifecycle claims until
the exact store-delivered `0.1.8` package is exercised.**

Last reconciled: **2026-08-05**.

### Automated packaged-browser and compatibility gate

As of 2026-08-05, `extension/scripts/browser-check.sh` builds the same
store-safe ZIP used for release, revalidates its 14-file allowlist and strict
default extension-page CSP, extracts it, and loads it in a fresh real Chrome
profile. The smoke opens the actual packaged popup at the supported 340×500
viewport and asserts manifest identity, the missing-native-host recovery link,
visibility and viewport containment of the primary action, and absence of
private development origins. It retains a screenshot, structured DOM result,
and browser log. The local installed-Chrome run and hosted
[Extension CI run `30983441286`](https://github.com/kzahel/web-server-chrome/actions/runs/30983441286)
both pass.

The versioned corpus at `tests/compatibility/corpus-v1.json` now drives the
popup/controller tests for missing desktop hosts, additive native-host fields,
current protocol 2, unknown additive health fields, the historical protocol-1
gap, a future protocol, and wrong controller identity. Protocol mismatch now
names both reported and required protocols and keeps Linux setup/rollback
recovery visible instead of collapsing to a generic listener error.
`scripts/release-check.sh extension` runs both source/package inspection and
the real-browser smoke. Tagged publication now waits for both lanes and writes
the workflow URL, commit, corpus version, and exact ZIP checksum reference into
the GitHub release while leaving production-browser testbeds advisory.

Implementation and release sequencing live in
[Tactical 011](../tactical/011-extension-launcher-and-chromeos-network-readiness.md).
The bounded implementation path for the Play-free Linux fallback lives in
[Tactical 012](../tactical/012-chromeos-crostini-fallback.md).
Its continuing launcher/controller, install, and control-UI decisions live in
[`chromeos-crostini-launcher.md`](chromeos-crostini-launcher.md).
Android's runtime and address presentation are owned by
[`android-runtime.md`](android-runtime.md). This topic owns the continuing
ChromeOS extension-launcher contract, including unsupported-device messaging
and the choice between Android, Linux, and honest unsupported alternatives.

## Product role

The Chrome extension is a launcher and install-discovery surface. It does not
run the HTTP server.

On ChromeOS, Android and the lightweight Linux component are peer choices.
Android is the quickest setup when Google Play is available; Linux works
without Play and gives the extension full setup, configuration, lifecycle, and
update controls.
The extension should preserve the familiar browser entry point while remaining
truthful for these materially different Chromebook states:

| Chromebook state | Accepted launcher behavior |
|---|---|
| Android supported, Google Play enabled, 200 OK installed | Best-effort `ok200://launch` intent offers 200 OK in ChromeOS's **Open with** confirmation, then opens or focuses the Android app |
| Android supported, Google Play enabled, app absent | User selects the owned ChromeOS-options route, which exposes the exact Play listing |
| Android supported but Google Play disabled by the user | Options route remains reachable; explain that Play actions may reopen Play setup and let users skip Android entirely |
| Android or Play unavailable on the model | Offer the Linux setup route when the profile supports it; otherwise offer another supported device |
| Work/school/admin policy blocks Play or Android apps | Options page explains that policy may make the Android route unavailable |
| User declines Google Play | The launcher remains useful as an explanation and alternatives surface; it must not loop or report success |
| Crostini enabled | **Use ChromeOS Linux** opens the bundled setup guide; the installed Linux Launcher later opens or focuses the authenticated controller surface |

## Detection boundary

An ordinary Chrome Web Store extension can call
[`chrome.runtime.getPlatformInfo()`](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getPlatformInfo)
and learn that Chrome is running on `cros`. That public result does not report:

- whether the Chromebook model supports Android apps;
- whether Google Play is available, enabled, disabled, or administrator-blocked;
- whether `app.ok200.android` is installed; or
- whether an Android intent opened the app, opened a browser fallback, or failed
  later in another ChromeOS surface.

Chromium internally defines `chromeosInfoPrivate.playStoreStatus` with
`not available`, `available`, and `enabled` values, but
[`chromeosInfoPrivate`](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/extensions/api/chromeos_info_private.json)
is a private API. Its
[`_permission_features.json`](https://chromium.googlesource.com/chromium/src/+/main/chrome/common/extensions/api/_permission_features.json)
entry restricts it to an allowlist. The 200 OK store extension must not request,
depend on, or plan around that API.

Google's own Chromebook guidance says Play is available only on some models,
may be unavailable on managed work or school devices, and is absent from
Settings on Chromebooks that do not support Android apps:
[Install and use Android apps on a Chromebook](https://support.google.com/chromebook/answer/7021273).

Therefore the accepted product rule is **do not infer Play or installation
state**. UI and tests should model the uncertainty rather than replacing it
with a fragile heuristic.

## Accepted routing contract

1. Detect only the public platform class: ChromeOS, supported desktop, or
   unsupported.
2. Never initialize or retry desktop native messaging on ChromeOS.
3. Label the intent action **Open installed Android app**. It is a best-effort
   route to package `app.ok200.android` and scheme `ok200://launch`, not an
   installation detector.
4. Explain that ChromeOS can display an **Open with** confirmation. Do not
   remove or redirect the intent tab on a timer: a user may still be reading or
   acting on that system prompt.
5. Keep `https://ok200.app/chromeos` encoded as defensive browser-fallback
   metadata, but do not depend on ChromeOS honoring it from an extension page.
6. Make **Compare ChromeOS options** a separate prominent HTTPS action
   so the user chooses the reliable path when the app is absent or Android/Play
   is unavailable.
7. Treat a tab-creation callback only as evidence that Chrome accepted the
   request; the popup says **Opening**, not that the app is known to have
   launched.
8. Permanently expose ordinary HTTPS links to both the ChromeOS options page
   and exact Google Play listing. These remain available even if intent
   handling changes.
9. The options page states that Android apps and Google Play are not available
   on every Chromebook and offers a non-Android alternative.
10. Do not describe the Play link as passive when Play is disabled. ChromeOS
    may open its Play setup and Terms dialog; users who do not want Play must be
    told to skip the Android actions.
11. If the intent call itself errors, **Try Again** retries the Android intent.
12. Missing desktop installations go directly to `https://ok200.app/download`.
13. Unknown non-ChromeOS platforms do not attempt native messaging and instead
   open the supported-platform overview.

## Crostini direction

Crostini is the first-class extension-controlled choice for users who prefer
Linux or whose Chromebook cannot or will not run Google Play. Android remains
the quicker Google Play choice when available; neither route is universally
preferred.

The 2026-08-02 physical investigation substantially narrowed the design:

- the existing Tauri-independent Rust `ok200-core` built and served correctly
  inside the testbed's x86_64 Debian 12 container;
- the release build was 2,404,648 bytes and reachable from ChromeOS at both
  `localhost` and `penguin.linux.test`;
- a non-terminal Linux `.desktop` launcher could start the server and open its
  browser page in one click, and a later cold-path test proved the cached app
  could wake a fully stopped VM/container without opening Terminal;
- Linux `~/Downloads` is available under **Linux files**, while ChromeOS-owned
  folders need an explicit **Share with Linux** workflow; and
- other LAN devices could not connect until the same TCP port was added under
  ChromeOS's Linux **Port forwarding** settings, after which an external fetch
  returned HTTP 200.

The accepted product shape is now an extension-bundled, offline-capable setup
and control UI paired with a small authenticated Rust controller inside
Crostini, plus a non-terminal Linux Launcher entry for waking the VM after
installation. The launcher opens a controller-served
`penguin.linux.test` page, which wakes the dormant extension worker through a
narrow external message; routine launch does not require the website or
background polling. The extension requests controller host access only as an
optional runtime permission after the user chooses Linux. The website mirrors
the setup guide but is not its only copy. The retired Node/npm CLI proof and
full AppImage are not the recommended fallback.

[`chromeos-crostini-launcher.md`](chromeos-crostini-launcher.md) owns the
install/everyday user flows, offline-content requirement,
controller security boundary, physical Launcher evidence, and continuing
decisions. [Tactical 012](../tactical/012-chromeos-crostini-fallback.md) owns
implementation and exact release evidence. Another supported desktop or
Android device remains the fallback when the current account cannot use either
Google Play or ChromeOS Linux.

## Store and website copy contract

Extension package `0.1.6` contains this manifest description:

> Launch 200 OK on desktop or ChromeOS; set up and control its ChromeOS Linux
> server. Successor to Web Server for Chrome.

It lives in `extension/public/manifest.json` under `description`, with the same
value enforced by `scripts/validate-extension-package.mjs`. This is packaged
manifest metadata, not a second editable store-listing description field. It
does not belong in `extension/package.json`. ChromeOS copy presents Android and
Linux as peer implementation choices: Android is the quick Google Play route;
Linux avoids Play and provides extension-based setup, configuration,
start/stop, and updates. ChromeOS Flex claims say **compatible** devices because
the Linux development environment is model-dependent and Flex is x86_64-only.

Chrome Web Store listing:

- The Web Store has one description field. Paste this platform-scoped plain
  text with Web Store-safe Unicode bullets into that field:
  [`../chrome-web-store-listing.txt`](../chrome-web-store-listing.txt)
- Name: **200 OK Web Server**
- Screenshots: show the ChromeOS Linux/Android chooser, bundled Linux setup,
  connected Linux controller, desktop detected, and desktop missing/download.
  Do not show legacy in-extension server controls.

The website must not say that the store listing “will be updated once ready”
after it is already published, that the extension itself has the legacy app's
features, or that every legacy option is already available.

## Validation matrix

| Gate | Required evidence |
|---|---|
| Pure routing | ChromeOS, macOS, Windows, Linux, and unsupported platform tests |
| Popup ChromeOS | No native message on init; peer Linux/Android choices; permanent options/Play links; retry remains on the action that failed |
| Popup desktop | Installed native host launches; missing host opens `/download` |
| Package | Exact allowlisted files, minimal permission, no key/local origin/maps, manifest/tag version match, SHA-256 |
| Android installed | Physical Stable ChromeOS offers 200 OK in the system chooser and opens/focuses one 200 OK task after confirmation |
| Android absent, Play present | Physical Stable ChromeOS opens the owned options page; exact Play link is usable |
| Play disabled | Passed on the explicitly authorized physical testbed: options route works; intent is blank; Play link opens Play setup/Terms |
| Play unsupported or policy-blocked | Compatible physical/managed fixture or documented user report; options page remains independently reachable regardless |
| Crostini feasibility | Passed on physical x86_64 for native build, localhost, explicit LAN forwarding, Linux files, Launcher indexing, one-click browser open, and wake from a fully stopped VM/container |
| Crostini release | Signed `crostini-v0.1.1`, public bootstrap/feed, exact x86_64 ChromeOS transaction, exact ARM64 Linux transaction, controller UI/handoff, current-feed check, and preserve/purge pass. Full reboot, native ARM ChromeOS, packed-warning/fresh-denial proof, rooted folder picker, and a real later-release update/rollback remain open |
| Store delivery | Existing controlled profile receives the reviewed version and repeats installed/absent routing checks |

## Current evidence and gaps

- Public
  [`extension-v0.1.6`](https://github.com/kzahel/web-server-chrome/releases/tag/extension-v0.1.6)
  contains a 142,629-byte CI ZIP with SHA-256
  `044ef38015abdf71a1adbb076adc8f845eaefd7ef39936e7d6a6b964d6947938`.
  Independent checksum and 13-file store-package validation pass. Extension CI
  run
  [`30759152520`](https://github.com/kzahel/web-server-chrome/actions/runs/30759152520)
  passed build, typecheck, all 42 extension tests, package inspection, and
  release publication. The ZIP has the new 119-character manifest description,
  peer Linux and Android chooser, action-preserving retry, and unchanged optional
  `penguin.linux.test` permission model. The popup copy/order change has
  deterministic UI coverage; warning/claim/physical integration evidence
  remains inherited from exact `0.1.5` below rather than silently attributed to
  the new ZIP.
- Public
  [`extension-v0.1.5`](https://github.com/kzahel/web-server-chrome/releases/tag/extension-v0.1.5)
  contains a 142,557-byte CI ZIP with SHA-256
  `15dece6ba750b8a659acf79eb0f55a347bd0a6376c0db708aa795d2764c66b83`.
  Independent checksum and 13-file store-package validation pass. The exact
  downloaded ZIP loaded on M150 without an install-time permission prompt and
  rendered its bundled Linux guide. A production-ID build of the same
  candidate passed contextual deny/re-request/claim and forced normal-tab
  fallback; its development-only manifest key is absent from the store ZIP.
- Exact source package `0.1.3` with SHA-256
  `0000c1194ed65f576c7fc56ecbf3412393c64635c053c332ddac7e447e04fd46`
  passed the store-package inspector and physical Stable ChromeOS validation.
  With 200 OK installed, ChromeOS presented **Open with → 200 OK Web Server**;
  confirming **Open** launched one `app.ok200.android/.MainActivity` task and
  removed the intent tab.
- With 200 OK uninstalled but Google Play still present, one intent attempt
  opened Play but left visible UI on the generic Play home surface. Other
  attempts left a blank intent tab. This is why the owned options page is a
  separate, reliable user-selected route rather than a promised intent
  fallback.
- A store-safe source candidate then proved that ChromeOS can leave an
  extension-created `intent:` tab blank without honoring
  `browser_fallback_url`. A timed replacement also proved undesirable because
  it can replace the tab while the user is still responding to ChromeOS's
  **Open with** prompt. The final UI therefore asks users to choose **Open
  installed Android app** or the guaranteed HTTPS options route and does not
  impose a timer on the system prompt.
- With only the sideloaded 200 OK test app removed and Google Play preserved,
  the same package exposed the prominent options link at the exact
  `https://ok200.app/chromeos` destination and the exact
  `app.ok200.android` Play listing. The source-built options page passed a
  physical Chromium visual check. GitHub Pages run `30734359055` deployed that
  route; production now returns `200` with the exact Android intent, Play link,
  Play-unavailable alternatives, and future-Crostini copy.
- On 2026-08-02, the exact `0.1.4` ZIP was loaded unpacked on the explicitly
  authorized physical testbed and Google Play plus Android apps were removed
  through Settings. The popup remained unchanged. **Open installed Android
  app** left a blank intent tab, while **Install or other ChromeOS options**
  opened the production HTTPS route. The options page's **View on Google
  Play** action opened ChromeOS's Play setup and current Terms dialog. The
  Settings entry remained visible as a **Turn on**/setup route, proving that
  its presence does not imply Play is enabled.
- The same testbed proved the Crostini runtime, file, browser, Launcher, and
  explicit LAN port-forwarding facts summarized above. Temporary binaries,
  launchers, services, build files, and the ChromeOS LAN port-forwarding entry
  for `18080` were removed; the Linux VM was stopped. Play remains disabled
  because re-enabling it requires accepting Google Play terms and choices
  outside the engineering test.
- A second disposable Launcher fixture then proved the missing cold-start
  mechanism: after closing Terminal/browser surfaces, stopping `termina`, and
  confirming the controller URL was unreachable, the cached non-terminal
  Linux app remained in the ChromeOS Launcher. Clicking it woke the
  VM/container, started one user service, and opened the exact local page in
  Chrome with no Terminal window. At that point the production handoff was
  untested; the later vertical-slice pass below closes it. A full ChromeOS
  reboot/login remains untested. The fixture was removed and the VM returned
  to its stopped state.
- A follow-up `xdg-open chrome-extension://...` check from `penguin` failed
  through ChromeOS Garcon with `Failure in OpenUrl`, and no extension page
  opened. The accepted design therefore opens a controller-served local HTTP
  page that externally messages the extension. The direct-test Terminal
  surface was closed and the VM was stopped afterward; the later vertical
  slice physically proves the replacement bridge and prompt.
- The source-built production-shaped x86_64 slice subsequently passed the
  fixed-port controller health, exact external handoff, optional host prompt,
  one-time claim, bearer-authenticated settings/start/stop, `localhost`
  content, one focused routine popup, controller-only stopped-VM wake, reset
  and reclaim, idempotent install, preserve/reinstall/purge, and exact cleanup.
  The control surface stays hidden from the public toolbar popup until signed
  installer/artifact, packed-warning, ARM64, full-reboot, file, LAN, and update
  gates pass.
- Thirteen source tests cover the no-detection contract, Android retry,
  permanent links, direct desktop download, and unsupported platforms.
- GitHub Actions run `30734453353` passed all thirteen tests, the strict
  package inspector, tag/version matching, and release publication for
  `extension-v0.1.4`. The final 132,936-byte, nine-file ZIP contains no key,
  development origin, source map, or source file and has SHA-256
  `bd7947c7aff9f5162455f97e0dddd6f36e111ddd9e3ecaf793eff7a0680482f7`.
- The maintainer reported submitting the exact extension `0.1.4` and Android
  `0.2.1` store candidates on 2026-08-02. The last observed production Chrome
  Web Store version was still `0.1.3`; submission and review do not establish
  controlled store delivery.

## Release ownership

Engineering owns source changes, automated tests, exact candidate ZIPs,
digests, and safe physical-device checks. The maintainer owns version approval,
tag authorization, Chrome Web Store and Play uploads, listing edits, review,
rollout, and store-delivered verification.
