# Android Runtime

Topic: android-native-kotlin

Status: **Android source uses one native Kotlin HTTP server, one
application-scoped controller, and a Compose control surface. The phone AVD
cutover and post-deletion instrumentation gates pass. No Play Store release was
made by this refactor; the currently published `v0.1.2` artifact remains the
pre-refactor build until a separate release is approved.**

Last reconciled: **2026-08-01**.

The accepted plan, implementation sequence, and detailed emulator evidence are
recorded in
[Tactical 010](../tactical/010-native-kotlin-android-server.md). This topic owns
continuing Android runtime truth after that bounded tactical.

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
CLI continues to use the TypeScript engine with Node adapters. The deleted
QuickJS/JNI/native-I/O experiment is not an extension point.

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

- **Screen-off availability** owns None, Wi-Fi-only, and CPU+Wi-Fi wake policy.
  Wake locks are available only with Reliable background so a hidden
  best-effort process cannot consume persistent CPU or Wi-Fi power.
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
  artwork rather than a text approximation.

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

- JVM socket tests cover files, directories, caching, ranges, CORS, SPA,
  malformed/traversal requests, oversized headers, keep-alive, concurrency,
  idempotent stop, and symlink containment.
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
  and direct locked-settings interception coverage.
- On the attached Pixel 9, Continue in background served successfully over LAN
  after Home with no `WebServerService`; While app is open stopped on Home.
  With notifications denied, reliable lifetime, wake-lock, and boot-start debug
  entry points all refused configuration. Granting permission allowed Reliable
  background to create foreground notification ID 1 and the selected Wi-Fi
  lock; revoking permission stopped the listener and service, released the
  reliable run, disabled boot start, and persisted the next-launch notice.
- A temporary sparse 3 GiB file in the Pixel's SAF root reported the full
  64-bit content length, and a range beginning at byte 3,221,225,450 returned
  the correct `206`, `Content-Range`, and marker bytes. The file was removed
  after the probe. File bodies remain fixed-buffer streams; multipart ranges
  remain intentionally unsupported.

## Known gaps and next direction

- Before a Play release, repeat the storage/settings and notification paths on
  the Play-enabled AVD and at least one physical device; review current all-files
  and foreground-service policy.
- Treat preservation of existing preferences and SAF grants as best effort.
  There is no migration-release or recovery requirement; invalid access asks
  the user to select a folder again.
- Keep Android and desktop feature work synchronized through their contract and
  black-box tests, not shared runtime source.
