# Android Runtime

Topic: android-native-kotlin

Status: **Android source uses one native Kotlin HTTP server, one
application-scoped controller, and a Compose control surface. GitHub release
`android-v0.2.1` publishes the signed APK and AAB containing the physically
accepted ChromeOS LAN-address correction. The maintainer reports that exact
candidate submitted to Play; delivery and store-served validation remain
open.**

Last reconciled: **2026-08-03**.

The accepted plan, implementation sequence, and detailed emulator evidence are
recorded in
[Tactical 010](../tactical/010-native-kotlin-android-server.md). This topic owns
continuing Android runtime truth after that bounded tactical. ChromeOS
extension detection, Android fallback, and platform-choice behavior are owned
by [`chromeos-extension-launcher.md`](chromeos-extension-launcher.md), with
active implementation sequencing in
[Tactical 011](../tactical/011-extension-launcher-and-chromeos-network-readiness.md).
The separate Play-free Linux controller path is owned by
[`chromeos-crostini-launcher.md`](chromeos-crostini-launcher.md).
Future UPnP/public-listening work is owned separately by
[`internet-exposure-and-port-mapping.md`](internet-exposure-and-port-mapping.md).

## Product decision

Android is ordinary native Android software:

```text
Compose UI / debug RPC / boot / notification
                    |
                    v
       AndroidServerController
          |                 |
          v                 v
  KotlinHttpServer     service, wake locks,
          |            battery and process policy
          v
 ReadOnlyFileTree
   +-- SAF document tree
   +-- authorized filesystem tree
```

The desktop and Android servers deliberately have separate implementations.
Desktop owns its HTTP runtime in Rust; Android owns its runtime in Kotlin. The
former Node/TypeScript CLI and engine have been retired. Android's former
QuickJS/JNI/native-I/O path is fully deleted and is historical evidence only,
not a dormant implementation or extension point.

Broad compatibility comes from an explicit behavior contract, socket-level
tests, and black-box product checks. When a cross-platform server feature is
added or changed, update each applicable implementation and its tests, or
record why the behavior is intentionally platform-specific.

## Accepted lifecycle settings contract

**Accepted and implemented 2026-08-01.** Android exposes one **Server
lifetime** choice with three mutually exclusive modes:

| Mode | Contract |
|---|---|
| **While app is open** | Stop when 200 OK leaves the foreground. |
| **Continue in background** | Keep the application-owned server alive without a notification while Android permits it; Android may suspend or reclaim it at any time. |
| **Reliable background** | Run through a foreground service with a visible ongoing notification; recommend this for long transfers and unattended serving. |

Reliable background requires app notification permission and an enabled server
notification channel. The choice is committed only after that prerequisite is
met. If notifications are later disabled, a reliable run stops with a clear
reason; it must never silently degrade into the best-effort mode. There is no
separate notification-status wall of text in Advanced—the prerequisite and its
action belong directly to the Reliable background choice.

The remainder of Advanced uses explicit peer sections rather than accidental
indentation:

- **Screen-off availability** owns Off, Wi-Fi-only, and CPU+Wi-Fi wake policy.
  Wake locks are available only with Reliable background so a hidden
  best-effort process cannot consume persistent CPU or Wi-Fi power. It defaults
  to Off; keeping the radio or CPU awake is always an explicit opt-in.
- **Automation & safety** owns start on boot, low-battery shutdown, and its
  threshold. Start on boot requires Reliable background; low-battery protection
  remains useful for any running server.
- **Power diagnostics** remains a separate read-only section.

Selecting Reliable background requests notification permission when needed and
otherwise leaves the previous lifetime mode selected. Selecting start on boot
may drive the same permission flow, but boot start is not enabled until Reliable
background is valid. All service, boot, debug, and UI entry points enforce the
same rules rather than relying on Compose alone.

## Current implementation

- `KotlinHttpServer` owns bounded JVM sockets, request parsing, response
  serialization, streaming, connection limits, keep-alive, and deterministic
  shutdown.
- `ReadOnlyFileTree` separates protocol behavior from Android storage.
  `SafFileTree` serves a persisted Storage Access Framework grant;
  `FilesystemFileTree` serves a canonical, containment-checked path only while
  Android's real all-files permission is present.
- `Ok200Application` owns one `AndroidServerController`. The activity/view
  model, foreground service, boot receiver, notification Stop action,
  low-battery monitor, and debug RPC all command that same controller.
- **While app is open** stops when the application process is backgrounded,
  but not during activity recreation. **Continue in background** leaves the
  application-owned server running without an Android service or wake lock and
  makes no survival guarantee. **Reliable background** uses one foreground
  service with a visible ongoing notification for the complete run.
- Reliable mode is unavailable while app notifications or the server channel
  are disabled. Every UI, service, boot, and debug entry point enforces that
  requirement. Notification loss stops a reliable run within the service check
  interval, releases its wake locks, disables boot start, and records a clear
  next-launch explanation; it never silently becomes best effort.
- Advanced presents peer **Server lifetime**, **Screen-off availability**,
  **Automation & safety**, and **Power diagnostics** sections. It retains
  no-lock, Wi-Fi-lock, and CPU+Wi-Fi-lock policies; start on boot; low-battery
  shutdown and threshold; storage actions; and battery, charging, screen,
  Doze, power-save, and optimization diagnostics. Wake locks and boot start are
  available only with valid Reliable background.
- The Compose screen exposes SAF selection, optional all-files selection,
  a prominent desktop-consistent start/stop switch, localhost/LAN binding,
  port `0`, directory listing, CORS, SPA fallback, authoritative plain-HTTP
  URLs, and the collapsed Android-only Advanced section. Folder, network, and
  serving-behavior settings form a visible **Server settings** group. While
  running, its lock explanation is visible and tapping any disabled control
  offers a direct **Stop server** action. The header uses the actual 200 OK
  artwork rather than a text approximation. CORS defaults to Off, and
  user-facing folder copy avoids Android implementation acronyms such as SAF.
- Android-owned user-facing copy lives in `res/values/strings.xml`, including
  Compose text and accessibility descriptions, notification/channel text,
  lifecycle messages, storage errors, and the direct-filesystem picker. The
  unqualified locale is `en-US`; Gradle generates the app locale configuration
  from resource folders, and debug builds include `en-XA`/`ar-XB` pseudo-locales
  for expansion and right-to-left checks. A source-level unit guard rejects the
  common hard-coded-copy patterns on these surfaces.
- The application compiles against and targets Android 16 (API level 36). It
  already uses edge-to-edge Compose layout and has no legacy back interception,
  so the target-SDK behavior changes require no compatibility opt-outs. Apps
  targeting 36 retain implicit LAN access through `INTERNET`, including when
  running on Android 17; do not add or request `ACCESS_LOCAL_NETWORK` until the
  eventual target-37 migration implements its runtime permission flow.

## HTTP and storage contract

The Android server is a single-root, single-listener, read-only server. Its
tested contract includes:

- `GET`, `HEAD`, and CORS preflight `OPTIONS`; clear rejection of unsupported
  methods;
- index precedence, bounded directory listings, MIME types, ETags,
  Last-Modified validation, ranges, and SPA fallback;
- strict decoding and path containment, including symlink escape rejection for
  filesystem roots;
- bounded request lines/headers, client concurrency, keep-alive, streaming, and
  port `0`; and
- SAF grant validation and real all-files permission checks before serving.

The listener serves plain HTTP. Every Android open/copy surface preserves the
full `http://` URL and labels LAN addresses as **HTTP only**; HTTPS/TLS is not
implemented. Clients must use the displayed scheme exactly.

Android-specific storage and lifecycle policy is intentional. SAF remains
available without broad storage access. `MANAGE_EXTERNAL_STORAGE` remains an
optional explicit path because serving arbitrary user-selected shared-storage
folders is a core product capability; Play policy eligibility must be reviewed
at release time. The Android OS root `/` is never a valid serving root.

## Compatibility boundary

Core concepts shared with desktop are one root, port/assigned port, bind scope,
directory listing, CORS, SPA fallback, primary lifecycle control, visible URLs,
and clear errors. Android additionally owns SAF, runtime permissions,
foreground-service/notification rules, wake policy, battery policy, boot, and
Doze diagnostics. Desktop additionally owns tray/autostart, updater, native
messaging, and desktop packaging.

Uploads, TLS termination, authentication, multi-server management, and a
general JavaScript plugin/runtime layer are not part of the Android server.
They require explicit product decisions rather than accidental parity work.

## Evidence

- JVM socket tests cover files (including percent-encoded UTF-8 paths),
  bodyless missing-file `HEAD`, directories, caching, ranges, CORS, SPA,
  malformed/traversal requests, oversized headers, keep-alive, concurrency,
  idempotent stop, and symlink containment.
- The Kotlin adapter passes all 28 cases in shared HTTP contract `1.0.0`. The
  first common run closed three cross-runtime drifts: encoded separators are
  rejected rather than reinterpreted as path boundaries, SPA fallback does
  not mask a missing asset with a dotted final component, and
  `If-Modified-Since` now returns `304` at whole-second HTTP-date precision.
- Android CI now runs the native instrumentation suite at both the declared
  minimum API 26 and target API 36. Tag builds compare the exact signed APK/AAB
  against checked-in package, SDK, permission, deep-link, native-library, and
  upload-certificate expectations; Bundletool validates the AAB, the APK/AAB
  and mapping receive one checksum manifest, and the exact Release APK must
  install, launch, expose its primary server switch, and handle
  `ok200://launch` on an API-36 emulator before GitHub publication. The first
  hosted execution remains pending: the SDK-boundary matrix runs on the next
  Android change, while the artifact and Release-smoke gates run on the next
  Android tag.
- `jstorrent-dev` passed filesystem and SAF HTTP checks, persisted-grant update
  checks, all-files revocation, foreground/background transitions, all wake
  modes, notification Stop, low-battery shutdown, valid and revoked-grant boot,
  rotation, and deep-link reuse.
- `jstorrent-tablet` passed the three Compose instrumentation tests plus a
  filesystem start/serve/stop smoke at 2560x1600. Visual review covers the core
  and expanded Advanced layouts with a real 720dp content cap; forced deep idle
  also produced truthful screen/Doze diagnostics.
- Post-removal Gradle builds only `:app`; compile, JVM tests, lint, and Compose
  instrumentation pass. The clean debug APK contains no bundled JavaScript,
  QuickJS/JNI, or C++ runtime.
- On the attached Pixel 9, the top switch completed a stop/start cycle, the
  listener bound `0.0.0.0:8080`, and a separate Mac on the same Wi-Fi fetched
  `http://192.168.1.101:8080/` with `200 OK`. The corresponding HTTPS address
  is intentionally unsupported.
- The Android 14 `jstorrent-dev` AVD passes five Compose/metadata/settings tests
  after the three-mode revision, including persistence of every lifetime mode
  and direct locked-settings interception coverage. After clearing app data,
  the debug settings probe reports CORS disabled and screen-off availability
  Off, confirming both fresh defaults at the persistence boundary.
- The localization-readiness pass passes Kotlin compilation, the JVM suite and
  its hard-coded-copy source guard, Android lint, and all five targeted AVD
  instrumentation tests. Visual checks under expanded `en-XA` and mirrored
  `ar-XB` pseudo-locales show resource-backed copy, adequate expansion room,
  correct RTL layout, and bidi-isolated `200 OK` brand order; the AVD was
  restored to `en-US` afterward.
- On the attached Pixel 9, Continue in background served successfully over LAN
  after Home with no `WebServerService`; While app is open stopped on Home.
  With notifications denied, reliable lifetime, wake-lock, and boot-start debug
  entry points all refused configuration. Granting permission allowed Reliable
  background to create foreground notification ID 1 and the selected Wi-Fi
  lock; revoking permission stopped the listener and service, released the
  reliable run, disabled boot start, and persisted the next-launch notice.
- With compile and target SDK 36, Kotlin compilation, the JVM suite, Android
  lint, the minified release APK, and the release AAB all build successfully.
  All five instrumentation tests pass on both the Android 14 phone AVD and the
  attached Pixel 9 running Android 17. AndroidX JUnit 1.3.0 and Espresso 3.7.0
  replace the older test stack whose reflective `InputManager` access is not
  compatible with API 37. The target-36 debug build also bound
  `0.0.0.0:8080` on the Pixel and served a test file to the Mac over Wi-Fi;
  afterward the temporary root was removed and the app was restored to fresh
  conservative settings.
- GitHub Actions run `30708830098` passed the debug build, JVM tests, lint,
  API-30 instrumentation, upload-key release build, and GitHub Release jobs for
  `android-v0.2.0`. The public release contains a 2,155,127-byte APK, a
  4,146,396-byte AAB, and the compressed R8 mapping. The APK reports version
  `0.2.0`, version code 5, and target SDK 36; its verified signing-certificate
  SHA-256 digest matches `v0.1.2`.
- GitHub Actions run `30734434763` passed the guarded tag/version/changelog
  check, debug build, JVM tests, lint, API-30 emulator instrumentation, signed
  release build, artifact uploads, and GitHub Release publication for
  `android-v0.2.1`. Bundletool validates the 4,157,113-byte AAB; its manifest
  and the 2,158,203-byte APK report package `app.ok200.android`, version
  `0.2.1`, version code 6, minimum SDK 26, and target SDK 36. The APK verifies
  with the same upload-certificate SHA-256 digest as `v0.2.0`,
  `ccb5af8e44d626e9aefb1f0fbd8496dbf23ad27da9347248e71fb3ce70044915`.
  APK and AAB content scans find no QuickJS, old JNI/C++ server payload,
  bundled engine, or debug-RPC provider. Artifact SHA-256 values are
  `a96bf8fdf2eb66e82c192f4fb976603388662274bddc14881d3f4b4fee44b0e6`
  (AAB),
  `4b01d1212c02a7432896a19ef2187659cca3e00e63ce5984e94fc70f37d257c9`
  (APK), and
  `b1e123a51eabe5c95128f79159d82c71a03abf0893c4fa8bfaec920926968c87`
  (2,214,059-byte compressed R8 mapping).
- A temporary sparse 3 GiB file in the Pixel's SAF root reported the full
  64-bit content length, and a range beginning at byte 3,221,225,450 returned
  the correct `206`, `Content-Range`, and marker bytes. The file was removed
  after the probe. File bodies remain fixed-buffer streams; multipart ranges
  remain intentionally unsupported.
- On physical ChromeOS 150, the public `v0.2.0` app bound `0.0.0.0:8080` and an
  external Mac fetched the exact file through the Chromebook's physical LAN
  IPv4 and port. The app incorrectly displayed ARC's private
  `100.115.92.2:8080`, which was not reachable from that client. A repeatable
  debug probe confirmed that ChromeOS auto-DNATs inbound TCP/UDP to Android's
  active ARC Wi-Fi address, while Android sees neither the Chromebook host's
  physical IPv4 nor a route-derived substitute for it. The Android global IPv6
  was directly reachable from the external client.
- The follow-up source correction replaces interface enumeration with the
  active Android `Network` and `LinkProperties`, returns structured IPv4/IPv6
  records, refreshes through a default-network callback, and withholds
  cellular/VPN addresses from LAN presentation. On ChromeOS it suppresses all
  Android-owned IPv4 addresses, retains a same-port Chromebook IPv4
  instruction, adds the directly reachable bracketed IPv6 URL, and retains
  loopback. On the same physical Chromebook, the UI exposed no ARC address and
  an external Mac fetched the exact fixture over both the Chromebook IPv4 and
  Android IPv6. LAN-off allowed loopback and refused both external families.
  All five Compose/metadata/lifecycle instrumentation tests also passed on the
  Chromebook. Tactical 011 owns delivery of this accepted source fix.

## Known gaps and next direction

- Play upload, review, declarations, and rollout are maintainer-owned. Upload
  the exact `android-v0.2.1` AAB; store-delivered validation remains separate
  from source, sideload, CI, and GitHub Release proof.
- Before targeting Android 17/API 37, add and test the
  `ACCESS_LOCAL_NETWORK` runtime-permission flow. Target-36 apps must not
  request that permission and retain implicit LAN access through `INTERNET`.
- The first-interface ChromeOS defect is fixed, physically accepted, and
  included in the inspected `android-v0.2.1` signed release candidate. Do not
  claim Play delivery until the maintainer advances that AAB and verifies the
  store-served build. mDNS is deferred; the accepted behavior is the honest
  manual Chromebook IPv4 instruction plus each directly reachable IPv6 URL.
  UPnP WAN mapping is not part of this fix.
- A user-facing IPv6 listener toggle is a possible future feature. It is not
  part of the immediate ChromeOS address correction; until its listener and
  lifecycle semantics are designed, URL discovery must report actual reachable
  IPv4 and IPv6 addresses without treating either family as a substitute for
  the other.
- Treat preservation of existing preferences and SAF grants as best effort.
  There is no migration-release or recovery requirement; invalid access asks
  the user to select a folder again.
- English remains the only authored locale. Adding a translation now means
  adding reviewed `values-<locale>` resources; the locale manifest is generated
  automatically, but there is not yet a translation vendor/community pipeline.
- Keep Android and desktop feature work synchronized through their contract and
  black-box tests, not shared runtime source.
