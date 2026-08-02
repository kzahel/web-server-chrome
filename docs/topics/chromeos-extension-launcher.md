# ChromeOS Extension Launcher

Topic: chromeos-extension-launcher

Status: **the extension uses a best-effort Android intent with an always-visible
HTTPS options route and does not claim to detect Android or Google Play
availability. The owned page is live and the exact `extension-v0.1.4` release
ZIP passes local and CI inspection. The maintainer reports that Android
`0.2.1` and extension `0.1.4` have been submitted to their stores;
store-delivered proof remains open.**

Last reconciled: **2026-08-02**.

Implementation and release sequencing live in
[Tactical 011](../tactical/011-extension-launcher-and-chromeos-network-readiness.md).
The bounded implementation path for the Play-free Linux fallback lives in
[Tactical 012](../tactical/012-chromeos-crostini-fallback.md).
Android's runtime and address presentation are owned by
[`android-runtime.md`](android-runtime.md). This topic owns the continuing
ChromeOS extension-launcher contract, including unsupported-device messaging
and any future Crostini route.

## Product role

The Chrome extension is a launcher and install-discovery surface. It does not
run the HTTP server.

On ChromeOS, the currently supported server application is the Android app.
The extension should preserve the familiar browser entry point while remaining
truthful for these materially different Chromebook states:

| Chromebook state | Accepted launcher behavior |
|---|---|
| Android supported, Google Play enabled, 200 OK installed | Best-effort `ok200://launch` intent offers 200 OK in ChromeOS's **Open with** confirmation, then opens or focuses the Android app |
| Android supported, Google Play enabled, app absent | User selects the owned ChromeOS-options route, which exposes the exact Play listing |
| Android supported but Google Play disabled by the user | Options route remains reachable; explain that Play actions may reopen Play setup and let users skip Android entirely |
| Android or Play unavailable on the model | Options page offers honest supported-device alternatives |
| Work/school/admin policy blocks Play or Android apps | Options page explains that policy may make the Android route unavailable |
| User declines Google Play | The launcher remains useful as an explanation and alternatives surface; it must not loop or report success |
| Crostini enabled | Physical feasibility is proved, but keep the public path labeled future until the verified installer, launcher/controller, ARM64 artifact, shared-folder UX, and lifecycle gates pass |

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
6. Make **Install or other ChromeOS options** a separate prominent HTTPS action
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

Crostini is the recommended future path for users whose Chromebook cannot or
will not run Google Play, but it is not a current launcher promise.

The 2026-08-02 physical investigation substantially narrowed the design:

- the existing Tauri-independent Rust `ok200-core` built and served correctly
  inside the testbed's x86_64 Debian 12 container;
- the release build was 2,404,648 bytes and reachable from ChromeOS at both
  `localhost` and `penguin.linux.test`;
- a non-terminal Linux `.desktop` launcher could start the server and open its
  browser page in one click;
- Linux `~/Downloads` is available under **Linux files**, while ChromeOS-owned
  folders need an explicit **Share with Linux** workflow; and
- other LAN devices could not connect until the same TCP port was added under
  ChromeOS's Linux **Port forwarding** settings, after which an external fetch
  returned HTTP 200.

The product should therefore use verified x86_64/ARM64 mini-Rust binaries, a
checksum-verifying per-user installer, a non-terminal Launcher entry, and an
owned browser controller. The first extension integration should link to HTTPS
instructions rather than add local-network permissions or claim automatic
detection. The Node/npm CLI and full AppImage are not the recommended fallback.

[Tactical 012](../tactical/012-chromeos-crostini-fallback.md) owns the remaining
installer, controller, folder, lifecycle, architecture, and release gates.
Until they pass, public copy remains **Future option** and another supported
desktop or Android device remains the dependable alternative.

## Store and website copy contract

Chrome Web Store listing:

- Name: **200 OK Web Server**
- Short description: **Launch 200 OK Web Server on desktop or ChromeOS. The
  successor to Web Server for Chrome.**
- Overview: state first that the extension launches an installed desktop or
  Android application and does not contain the server.
- ChromeOS paragraph: Android app support and Google Play availability vary by
  Chromebook and account; provide the exact Play and ChromeOS-options links.
- Desktop paragraph: link to the signed macOS, Windows, and Linux downloads;
  AppImage remains the recommended Linux package.
- Screenshots: show desktop detected, desktop missing/download, ChromeOS launch
  with its two install links, and the ChromeOS options page. Do not show legacy
  in-extension server controls.

The website must not say that the store listing “will be updated once ready”
after it is already published, that the extension itself has the legacy app's
features, or that every legacy option is already available.

## Validation matrix

| Gate | Required evidence |
|---|---|
| Pure routing | ChromeOS, macOS, Windows, Linux, and unsupported platform tests |
| Popup ChromeOS | No native message on init; permanent options/Play links; retry remains Android |
| Popup desktop | Installed native host launches; missing host opens `/download` |
| Package | Exact allowlisted files, minimal permission, no key/local origin/maps, manifest/tag version match, SHA-256 |
| Android installed | Physical Stable ChromeOS offers 200 OK in the system chooser and opens/focuses one 200 OK task after confirmation |
| Android absent, Play present | Physical Stable ChromeOS opens the owned options page; exact Play link is usable |
| Play disabled | Passed on the explicitly authorized physical testbed: options route works; intent is blank; Play link opens Play setup/Terms |
| Play unsupported or policy-blocked | Compatible physical/managed fixture or documented user report; options page remains independently reachable regardless |
| Crostini feasibility | Passed on physical x86_64 for native build, localhost, explicit LAN forwarding, Linux files, Launcher indexing, and one-click browser open |
| Crostini release | Exact verified x86_64/ARM64 installer, lifecycle, shared-folder, stopped-VM, and extension-link proof remain open |
| Store delivery | Existing controlled profile receives the reviewed version and repeats installed/absent routing checks |

## Current evidence and gaps

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
