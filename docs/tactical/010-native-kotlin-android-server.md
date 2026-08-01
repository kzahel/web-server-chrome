# Tactical 010: Native Kotlin Android Server

**Status:** complete 2026-08-01; maintainer review accepted 2026-08-01
**Topic:** `android-native-kotlin`  
**Baseline:** `830fcd4`  
**Scope:** Android application only, plus shared-repository cleanup made necessary by
removing the Android JavaScript runtime

## Objective

Replace the Android app's TypeScript-in-QuickJS execution path with a small,
read-only Kotlin HTTP server, bring its everyday server controls broadly into
line with the stable desktop app, and prove the result on the repository's local
Android virtual devices.

The end state is intentionally ordinary Android software: one Compose app
module, one application-scoped controller, one coherent foreground-service and
power lifecycle, Kotlin/JVM sockets, and Android storage adapters. The CLI may
continue to use `packages/engine`; sharing an HTTP implementation across every
runtime is no longer a product goal.

The maintainer accepted this tactical on 2026-08-01 and authorized end-to-end
implementation with reviewable commits at good-sized slices.

## Accepted direction

The following decisions come from the maintainer discussion and are treated as
settled unless this review changes them:

- Android uses a native Kotlin implementation rather than Rust/JNI or an
  embedded JavaScript runtime.
- Desktop and Android may have separate implementations. A written behavior
  contract and black-box tests, rather than shared source, keep them broadly
  compatible.
- Storage Access Framework (SAF) roots remain supported.
- `MANAGE_EXTERNAL_STORAGE` and filesystem roots remain supported because
  hosting arbitrary user-selected folders is core to this app. Store-policy
  eligibility remains a release concern, not a reason to remove the capability
  in this refactor.
- There is no migration release, legacy Chrome App work, Play submission, or
  desktop release work in this tactical.
- Existing settings do not require a schema migration. Reusing the application
  ID, preference file, root URI keys, and persisted SAF permission means an
  in-place install should normally retain a usable SAF selection. If a stored
  value or grant is invalid, the app asks the user to select the root again.
- Android-specific background, wake-lock, boot, low-battery, and power-state
  observability remain supported. They move under an Advanced section and are
  rewired to the new controller rather than being removed with QuickJS.
- The product remains a single-root, single-server, read-only web server. Upload,
  authentication, TLS termination, and multi-server management are not part of
  this cutover.

## Why this cut is worthwhile

The current Android request path crosses Kotlin, JNI, QuickJS, a bundled
TypeScript engine, and Kotlin I/O/socket bindings. It also builds a native
library for three ABIs and vendors the QuickJS-ng source tree. The proof of
concept demonstrated that the Transistor-style runtime could work, but the
result makes a small Android web server harder to build, debug, test, and own.

The current Android app also has several runtime owners: the view model starts
state collectors, the application owns the engine, the activity lifecycle
decides whether a service should exist, the boot receiver can start the engine
through another route, and a notification receiver can stop it. A single
service-owned lifecycle removes those divergent paths along with the embedded
runtime.

## Product contract

"Broadly compatible" means that a user moving between desktop and Android sees
the same core concepts and the same HTTP behavior where the platforms overlap.
It does not mean pixel parity or identical internal code.

### Target feature matrix

| Capability | Desktop baseline | Current Android | Kotlin Android target |
|---|---|---|---|
| One serving root | Native folder | SAF or all-files path | SAF or all-files path |
| Port | `0` or `1..65535` | `1..65535` | `0` or `1..65535`, showing assigned port |
| Bind scope | Localhost or LAN | LAN only | Localhost or LAN |
| Start/stop and status | Yes | Yes | Yes, from one authoritative state flow |
| Open/copy URL | Yes | Copy LAN URL | Open and copy reachable URLs |
| Directory listing | Configurable | Always on | Configurable |
| CORS | Configurable | Always on | Configurable |
| SPA fallback | Configurable | No | Configurable |
| `GET`, `HEAD`, `OPTIONS` | Yes | Yes | Yes |
| Index files | `index.html` | `index.html` | `index.html` |
| MIME types | Yes | Yes | Yes |
| ETag / `If-None-Match` | Yes | Yes | Yes |
| Last-Modified | Yes | Yes | Yes |
| Single byte ranges | Yes | Yes | Yes, including open and suffix forms |
| Safe path handling | Yes | Yes, different rules | Yes, with backend-specific containment |
| Background serving | Desktop process | Configurable foreground service | Configurable foreground service |
| Start on boot | Platform launch option | Yes | Yes, when a valid root is still available |
| Wake policy | Platform-managed | None, Wi-Fi, or CPU + Wi-Fi | Retain all three modes |
| Low-battery stop | No | Configurable threshold | Retained under Advanced |
| Power/Doze diagnostics | No | Logcat observability | Retained and simplified |
| Arbitrary filesystem root | Desktop-native | All-files permission | Retained behind explicit Android access UI |

Intentional differences remain visible rather than being disguised as parity:

- Android has SAF, runtime storage permissions, a foreground-service
  notification, wake behavior, and boot start; desktop does not.
- Android shows device/LAN addresses useful from another device; desktop's
  safety defaults can still be more conservative.
- Neither app gains upload, TLS, authentication, a log viewer, QR sharing, or
  multiple servers through this tactical.

### HTTP behavior contract

The Kotlin server must satisfy the following before the old engine is removed:

- Parse only HTTP/1.0 and HTTP/1.1 with an 8 KiB request-head limit and a
  five-second read timeout.
- Support `GET`, `HEAD`, and `OPTIONS`; return a correct `405` for other methods.
- Stream files rather than loading whole files into memory.
- Return `index.html` for a directory when present. Otherwise return a bounded,
  HTML-escaped, URL-encoded, folder-first listing when listing is enabled, or
  `404` when it is disabled.
- Provide MIME type, content length, ETag, Last-Modified, and byte-range headers
  consistently with the desktop server. Honor `If-None-Match` and return `416`
  for unsatisfiable or unsupported multiple ranges.
- Apply the configured wildcard CORS headers and answer preflight requests only
  when CORS is enabled.
- Apply SPA fallback only to eligible route misses and only when the selected
  root has an `index.html`; never turn malformed or traversal paths into the SPA.
- Percent-decode once. Reject NUL, backslash, absolute/drive-prefixed paths,
  empty-invalid encodings, and `.` or `..` segments. For filesystem roots,
  canonicalize and enforce containment, including across symlinks. For SAF,
  walk validated logical segments beneath the selected document tree.
- Reject the Android OS root as a serving root and require an explicit warning
  acknowledgement for a whole shared-storage volume. All-files access is a core
  capability, not permission to make accidental broad LAN exposure silent.
- Bound directory work and response size. The initial limit is 10,000 entries;
  reaching it produces an explicit truncated result rather than unbounded work.
- Support sequential keep-alive requests per connection, concurrent clients on
  bounded I/O workers, deterministic shutdown, and idempotent start/stop.
- Log request summaries and actionable failures to Logcat without exposing file
  contents or dumping request headers containing future secrets.

The desktop server is the semantic reference, but Android differences caused by
`DocumentFile` metadata or provider behavior should be tested and documented
rather than hidden behind fragile emulation.

## Proposed architecture

```text
Compose UI / debug RPC / boot / notification
                 |
                 v
   application-scoped AndroidServerController
       StateFlow<ServerState> + serialized commands
          /                         \
         v                           v
 KotlinHttpServer             Android runtime policy
 ServerSocket + I/O           service / process lifecycle
         |                    wake locks / battery / Doze
         v
 ReadOnlyFileTree
   /             \
 filesystem       SAF
```

### Ownership rules

- `Ok200Application` constructs one `AndroidServerController` and exposes it to
  the service, view model, and debug RPC provider.
- The controller is the runtime owner. UI, debug RPC, boot, notification, and
  process-lifecycle events issue serialized commands to it rather than managing
  their own engine state or collectors.
- With `Run in background` enabled, starting the server also starts
  `WebServerService` immediately and keeps one foreground service for the whole
  running lifetime. With it disabled, the server runs while the app process is
  foreground and stops when `ProcessLifecycleOwner` reports that the app has
  genuinely backgrounded; individual activity recreation does not count.
- Background service state persists a small desired-running flag, enters
  foreground before asynchronous initialization, and uses deterministic
  sticky-restart behavior. User/notification stop clears the flag;
  initialization failure also clears it rather than producing a restart loop.
- Start on boot requires background mode. Enabling boot start enables background
  mode (with a clear explanation); disabling background mode disables boot start
  rather than leaving a configuration that cannot be honored.
- `ServerViewModel` observes the controller for its lifetime. It does not start a
  new collector on every button press and does not infer server state locally.
- Notification Stop and boot both reach the controller through their Android
  entry-point adapters after validating the saved configuration. All entry
  points therefore exercise the same cleanup and state path.
- Socket accept, connection work, and controller mutations use explicit owned
  coroutine scopes. No global scope and no reflection-based cross-thread access
  are permitted.
- Stop closes the listener first, cancels or drains connection jobs within a
  short bound, stops power monitoring, releases CPU/Wi-Fi locks, updates state,
  removes any notification, and stops the service in that order.

### Module and dependency decision

The recommended target is a single Gradle module, `:app`.

- Move the useful storage concepts out of `:io-core` while reshaping them as a
  small `ReadOnlyFileTree` interface plus filesystem and SAF adapters.
- Put the protocol/server code in an Android-independent Kotlin package inside
  `:app`, with fake/in-memory backends for JVM unit tests.
- Use `ServerSocket`, streams/channels, and the existing coroutine dependency.
  Do not add Ktor, Netty, NanoHTTPD, JNI, the NDK, or another embedded runtime
  unless implementation evidence forces a plan review.
- Delete both `:quickjs-engine` and `:io-core` after the replacement passes its
  cutover gates.

This keeps storage access close to the Android APIs that implement it while
still leaving the HTTP protocol logic testable without an emulator.

## UI and settings simplification

The target remains a native Compose screen, not a port of the desktop web UI.
It should use the desktop app's information order: root, network, serving
behavior, primary start/stop action, live status/URLs, then Android-only options.

### Keep and align

- SAF folder selection, persisted read permission, and a clear indication when
  the stored grant is no longer usable.
- All-files access and the filesystem picker. Read actual permission state from
  `Environment.isExternalStorageManager()` rather than trusting a preference.
- Port, adding port `0` support and the assigned runtime port.
- Localhost/LAN, directory listing, CORS, and SPA fallback switches with the same
  defaults and explanations as desktop unless Android safety needs a stricter
  default.
- Run in background; none, Wi-Fi-only, and CPU + Wi-Fi wake modes; start on boot;
  and low-battery shutdown with its threshold. Put these in an Advanced section
  and make their dependencies and battery costs explicit.
- Power-state observability for screen, charging, battery, Doze, and battery
  optimization. Keep it lightweight and scoped to serving/diagnostics rather
  than registering unrelated activity callbacks for the lifetime of the app.
- Source/feedback links, app version, and the `ok200://launch` deep link.
- A responsive, centered phone/tablet layout with accessible labels and useful
  stopped, starting, running, stopping, and error states.

### Simplify without dropping capability

- Move background, wake, boot, low-battery, and power diagnostics into a collapsed
  Advanced section so the primary serving flow stays calm without erasing
  useful device/server controls.
- Replace the notification-permission switch with truthful status and an action
  to grant/open system settings. Android permission state is not a preference
  that the app can toggle off. A foreground-service notification is created only
  when background serving or boot start requires the service.
- Replace `DozeMonitor`'s app-wide activity bookkeeping with a focused
  `PowerStateMonitor` (or equivalent) that supplies battery/charging/Doze state
  to the controller and optional diagnostics. `ProcessLifecycleOwner` separately
  owns foreground/background policy.
- Keep all three wake modes. Acquire and release them from the controller's one
  running lifecycle, update them safely at runtime, and clearly explain that
  stronger locks cost battery and do not constitute a general Android Doze
  exemption.
- Keep low-battery shutdown and its threshold, but make the monitor active only
  while the server is running and the feature is enabled. Stop through the same
  controller path as UI and notification actions.
- Remove obsolete standalone-web-UI choices from emulator scripts and any
  Android UI code that remains from the runtime experiment.

### Best-effort retained data

Keep the existing application ID and preference file. Continue reading the
existing port, root URI, root display name, background, wake, start-on-boot,
low-battery, and threshold keys. Add new desktop-parity switches with safe
defaults. The persisted SAF permission belongs to the unchanged application
identity and should survive an in-place update; it must still be checked before
use. There is no promise to recover invalid paths, revoked permissions, or data
after uninstall/clear-data.

## Implementation sequence

Each phase should leave the tree buildable. The old engine remains available
until the Kotlin route has passed the emulator cutover gate.

### Phase 1: Freeze the contract in tests

- Add pure JVM fixtures for files, nested directories, Unicode/reserved names,
  empty and large files, symlinks, and an SPA root.
- Add socket-level tests covering methods, headers, ranges, caching, listing,
  CORS, SPA behavior, malformed requests, traversal, timeouts, keep-alive,
  concurrent clients, stop during I/O, and port `0`.
- Make feature defaults explicit in one Kotlin configuration type.
- Record Android-vs-desktop intentional differences in a living Android runtime
  topic after this tactical is accepted.

### Phase 2: Build the Kotlin storage and HTTP core

- Introduce `ReadOnlyFileTree`, `FilesystemFileTree`, and `SafFileTree` without
  changing the current production engine route.
- Implement bounded parsing, routing, metadata, directory rendering, file/range
  streaming, and response serialization over JVM sockets.
- Separate protocol behavior from Android storage objects so most correctness
  tests run under `testDebugUnitTest`; test SAF integration on-device.
- Add cancellation, resource ownership, and leak tests before service wiring.

### Phase 3: Unify Android lifecycle ownership

- Add the application-scoped controller and a sealed, complete server state.
- Convert service, notification, boot, view model, and debug RPC entry points to
  the one action/controller path.
- Implement background-enabled and foreground-only modes through process
  lifecycle rather than individual activity callbacks. Keep the foreground
  service alive for the whole running lifetime only in background-enabled mode.
- Make start/stop/reconfigure idempotent across activity recreation, process
  callbacks, service restart, boot, and notification actions.
- Centralize wake-lock and power-monitor acquisition/release, retaining current
  modes and low-battery behavior while removing activity-dependent service races.

### Phase 4: Align and simplify the Compose UI

- Implement the target control set and responsive phone/tablet layout.
- Preserve usable existing SAF roots and settings; surface revoked/missing access
  as a recoverable root-selection state.
- Make all-files permission state truthful and test selection, revocation, and
  fallback behavior.
- Move background, wake, boot, low-battery, and Doze/power diagnostics into a
  collapsed Advanced section with truthful state and dependency handling.
- Update debug RPC methods so the emulator suite can set every server option,
  select a test filesystem root, use port `0`, and inspect authoritative state.

### Phase 5: Prove the Kotlin route on local AVDs

- Run the full black-box and UI/service matrix below on `jstorrent-dev`.
- Repeat responsive UI and core start/serve/stop checks on
  `jstorrent-tablet`.
- Use `jstorrent-playstore` for the all-files settings intent and permission-state
  path if the Google APIs image behaves differently.
- Capture commands, relevant log excerpts, and phone/tablet screenshots in this
  tactical's execution record.

### Phase 6: Delete the experiment

Only after Phase 5 passes:

- Remove `android/quickjs-engine`, including the QuickJS-ng submodule, JNI C,
  CMake, NDK/ABI configuration, Kotlin bindings, and bundled JavaScript asset.
- Remove `android/io-core` after its needed storage behavior has moved into the
  app.
- Remove both modules from Gradle settings and app dependencies.
- Remove the Android `bundle:native` build/copy step and native-entry/adapters
  from `packages/engine` when repository search proves they have no other
  consumer. Keep the TypeScript engine used by the CLI.
- Simplify `emu-install.sh`, log filters, ProGuard rules, package scripts,
  workspace ignores, and documentation that describe a current Android
  QuickJS/standalone UI path.
- Preserve historical architecture/tactical records as history; mark outdated
  proposals historical rather than rewriting their evidence.
- Require repository search to find no live Android dependency on `QuickJS`,
  `quickjs-engine`, `engine.bundle.js`, `bundle:native`, native file/TCP adapters,
  or Transistor runtime terminology outside explicitly historical material.

### Phase 7: Close documentation and validation

- Update `README.md`, `CLAUDE.md`, architecture/vision material, and the new
  Android runtime topic to describe the Kotlin implementation and two-runtime
  compatibility rule.
- Re-run JVM, Android lint/build, connected instrumentation, and repository-wide
  TypeScript checks after deletion rather than relying on pre-deletion results.
- Compare APK/AAB size and native-library contents before and after; the final APK
  must contain no QuickJS or bundled C++ runtime artifacts.
- Record accepted deviations and remaining product work here. Do not publish a
  store or migration release as part of closing this tactical.

## Local AVD validation matrix

The workstation currently has all three repository AVDs:
`jstorrent-dev`, `jstorrent-tablet`, and `jstorrent-playstore`. The checked-in
scripts are the source of truth for starting and installing; Phase 6 removes
their engine-bundle and obsolete UI-mode assumptions.

### Automated gates

- `source ~/.profile`
- `cd android && ./gradlew :app:compileDebugKotlin testDebugUnitTest lint`
- Start the selected AVD with `android/scripts/emu-start.sh` (set `AVD_NAME` for
  tablet or Play Store), then install with `android/scripts/emu-install.sh`.
- `cd android && ./gradlew connectedDebugAndroidTest`
- From the repository root: `pnpm typecheck`, `pnpm test`, and `pnpm check`.
- `git diff --check` and a clean submodule/configuration inspection after the
  QuickJS-ng removal.

The convenience `emu` shell function uses aliases internally and is not reliable
in a non-interactive shell, so the execution record should invoke the scripts or
`adb -s <emulator>` directly rather than treating `emu status` as evidence.

### HTTP black-box checks

Seed a known tree under emulator storage, configure it through debug RPC, use an
ephemeral port, and forward that assigned port with ADB. From the host, verify:

- Exact file body/hash, empty and large streaming files, Unicode and encoded
  filenames, MIME, `HEAD`, ETag `304`, Last-Modified, open/suffix/invalid ranges,
  and keep-alive reuse.
- Listing enabled/disabled, index precedence, HTML escaping, URL encoding,
  sorting, bounded large directories, CORS enabled/disabled plus preflight, and
  SPA enabled/disabled.
- Traversal and malformed path/request corpus, oversized headers, slow/incomplete
  headers, unsupported methods/ranges, concurrent clients, and start/stop loops.
- Localhost mode is unreachable through the emulator LAN interface while LAN
  mode is reachable, using device-side loopback/interface probes rather than
  assuming the host can route directly into the AVD; displayed/copied URLs
  contain the assigned port.

Run the protocol suite against a filesystem root and repeat the storage-sensitive
subset against an SAF tree selected through the system picker.

### Storage and lifecycle checks

- Select an SAF folder in the system picker, serve it, force-stop/relaunch, and
  confirm the persisted grant and selected root still work.
- Update the APK with `adb install -r` and repeat without clearing data.
- Grant all-files access in Android settings, select a filesystem root, serve it,
  revoke access, and confirm the UI/controller reports lost access without a
  crash or stale "enabled" switch.
- Recreate/rotate the activity repeatedly while serving; status and assigned port
  remain authoritative and only one listener exists.
- Background and foreground the app, turn the display off, and verify continued
  service plus a single notification when background mode is enabled.
- Disable background mode and verify minimizing the app stops the server, while
  rotation/activity recreation does not. Re-enable it while serving and verify a
  single service starts without opening a second listener.
- Exercise all three wake modes and confirm only the selected locks are held,
  changed cleanly at runtime, and always released on every stop/error path.
- Enable low-battery shutdown, drive the AVD battery below the configured
  threshold while not charging, and confirm the controller performs a complete
  stop. Confirm charging and disabled-mode cases do not stop it.
- Drive device-idle/power states available on the AVD and confirm diagnostics
  update without creating duplicate receivers or changing serving policy.
- Stop from the notification and confirm the listener, notification, connection
  jobs, and both wake locks are gone.
- Enable start on boot, reboot the AVD, and verify one foreground service and one
  listener start from saved valid settings. Repeat with a revoked SAF grant and
  verify a safe stopped/error state.
- Launch `ok200://launch` from ADB while stopped and running; verify one activity
  and no duplicate server.
- Exercise notification denial/allowance on the applicable API image and confirm
  foreground-service behavior is explained and deterministic.

### Visual review

Capture phone and tablet screenshots for:

- No root / permission recovery.
- Stopped with a selected SAF root.
- Running with reachable URLs and assigned ephemeral port.
- All-files permission explanation and filesystem picker.
- Android-only advanced settings and an actionable server error.

## Completion gates

This tactical is complete only when all of the following are true:

- The maintainer has accepted this tactical's product and simplification choices.
- Android serves through Kotlin only; no request or lifecycle path evaluates
  bundled JavaScript.
- JVM protocol tests and the local AVD phone matrix pass, with the stated tablet
  and storage/lifecycle evidence recorded.
- Core feature switches and HTTP semantics match the contract above or an
  explicit accepted deviation is recorded.
- SAF and all-files roots both work; a usable persisted SAF selection survives an
  in-place update, and invalid/revoked access fails clearly.
- One authoritative controller and one foreground-service lifecycle serve every
  UI, process lifecycle, boot, notification, and debug RPC entry point.
- Background mode, all three wake policies, start on boot, low-battery shutdown,
  and power/Doze observability work through that controller and pass their AVD
  lifecycle checks.
- `:quickjs-engine`, `:io-core`, QuickJS-ng/JNI/CMake/NDK integration, the Android
  native bundle, and their build/script references are gone.
- Android builds without the NDK, final packaged artifacts contain no QuickJS or
  bundled C++ runtime, and repository-wide validation passes after deletion.
- Current documentation describes Kotlin Android plus Rust desktop, while
  historical records remain intelligible.
- No legacy migration or store release has been smuggled into the scope.

## Execution record

### 2026-08-01: Kotlin core introduced before cutover

- Added a protocol-only `KotlinHttpServer` using bounded JVM sockets and
  `Dispatchers.IO`, with ephemeral ports, deterministic close, capped concurrent
  clients, keep-alive, streaming bodies, and request summaries.
- Added containment-checked filesystem and SAF `ReadOnlyFileTree` adapters in the
  app module. The existing QuickJS production route remains untouched for this
  intermediate buildable boundary.
- Added socket-level JVM coverage for file/HEAD/cache/range behavior,
  index/listing/CORS/SPA configuration, method rejection, malformed/traversal and
  oversized requests, keep-alive, concurrency, idempotent stop, and symlink
  escape containment.
- Evidence: `./gradlew :app:compileDebugKotlin` and
  `./gradlew :app:testDebugUnitTest` pass. Gradle still reports the pre-existing
  stale `sdk.dir` warning and still builds the old native bundle at this phase.

### 2026-08-01: Android runtime cut over to one controller

- `Ok200Application` now owns one `AndroidServerController`; the view model
  observes its state directly and no longer creates a collector per start.
- Foreground service, boot, notification Stop, process backgrounding, debug RPC,
  wake locks, and low-battery shutdown now issue commands through that
  controller. Foreground-only mode uses `ProcessLifecycleOwner`, so activity
  recreation cannot masquerade as the app being backgrounded.
- The service owns one notification for the complete background run and has a
  guarded sticky restart using the persisted desired-running flag. Boot start
  uses the same service/controller route.
- Simplified the old app-wide `DozeMonitor` activity bookkeeping into focused
  battery, charging, screen, power-save, Doze, and optimization observation.
- Debug RPC now accepts port `0` and exposes every new server behavior setting.
- Evidence: `./gradlew :app:compileDebugKotlin :app:testDebugUnitTest` passes on
  the Kotlin production route. QuickJS remains compiled but unused until the AVD
  cutover gate.

### 2026-08-01: Compose control surface aligned and Advanced retained

- Reorganized the native screen around serving folder, network, serving
  behavior, one primary lifecycle control, reachable URLs, and a collapsed
  Advanced section.
- Added localhost/LAN, directory listing, CORS, SPA, and port `0` controls backed
  by persisted Kotlin configuration. Runtime settings are locked while serving
  so displayed state cannot diverge from the active listener.
- Retained SAF selection at all times and added a separate filesystem picker
  action when real all-files permission is present. The UI rejects `/`, warns
  before selecting a whole shared-storage volume, and reports system-owned
  permission state truthfully.
- Retained background mode, all wake modes, boot start, low-battery threshold,
  and battery/charging/Doze/optimization diagnostics under Advanced. Start on
  boot and background mode enforce a coherent dependency.
- Adopted the product yellow/black color identity instead of device-dependent
  dynamic primary colors and constrained content width for phone/tablet use.
- Evidence: compile, JVM tests, and `:app:lintDebug` pass. Lint has no errors;
  remaining warnings are reviewed platform/version/icon/debug-tooling warnings.

### 2026-08-01: Phone AVD cutover gate passed

- Installed the Kotlin production route on the local `jstorrent-dev` Android 14
  AVD and seeded known filesystem and SAF trees. Filesystem black-box checks
  passed for GET/HEAD/OPTIONS, MIME, ETag/Last-Modified validation, byte ranges,
  listing/index behavior, CORS, SPA fallback, traversal rejection, method
  rejection, and ephemeral port reporting. Device-side probes proved localhost
  binding accepted loopback traffic and refused the emulator's WLAN address.
- Selected an SAF tree with the Android system picker, served it, force-stopped
  and relaunched the app, and updated the APK with `adb install -r`; the selected
  root and persisted read grant continued to work. A valid SAF root also started
  once at boot and served its known file. Releasing the persisted grant produced
  a stable `Folder access was revoked` failure, including at boot, with no
  remaining foreground service.
- Verified foreground-only mode stops on process backgrounding. Background mode
  retained one listener, one foreground service, and one notification after
  minimizing. Notification Stop removed all three. Runtime changes through none,
  Wi-Fi-only, and CPU+Wi-Fi wake policies acquired only the selected locks and
  released them at stop.
- Drove the emulator below a configured low-battery threshold while unplugged;
  the controller stopped the listener and released its resources. Rotation kept
  the assigned port and listener, while repeated `ok200://launch` intents now
  reuse one `singleTask` activity whether stopped or running.
- Emulator startup exposed and fixed four lifecycle/access defects: debug
  provider initialization before `Application.onCreate`, an unexported boot
  receiver that could not receive the system broadcast, reliance on a usable
  content URI after its persisted grant was revoked, and duplicate activities
  from deep links.
- Added a Compose instrumentation smoke test for the core screen and retained
  Advanced controls. Evidence: `./gradlew connectedDebugAndroidTest` passes all
  three app tests on `jstorrent-dev`; the pre-deletion `io-core` and
  `quickjs-engine` instrumentation suites also passed in that run. The phone UI
  was visually reviewed at 1080x2400 with the selected-root, status, and
  responsive control layout rendering correctly.

### 2026-08-01: Embedded JavaScript experiment removed

- Deleted the `:quickjs-engine` and `:io-core` modules, the QuickJS-ng
  submodule, JNI/CMake sources, bundled JavaScript asset path, Kotlin bindings,
  and the app's Gradle dependencies on both modules. The Android Gradle build
  now contains only `:app` and executes no NDK or CMake task.
- Deleted the TypeScript engine's Android-only native preset, entry point,
  adapter declarations/implementations, native export, bundle script, and its
  now-unused esbuild dependency. The Node/CLI TypeScript engine remains intact.
- Simplified emulator/real-device install, test, and log scripts around one
  native Compose application and Kotlin server. Removed bundle copying,
  standalone UI modes, JavaScript log filters, and the deleted modules' obsolete
  instrumentation/seeder paths.
- A clean debug APK fell from 24,691,812 bytes before removal to 18,190,682
  bytes after removal (6,501,130 bytes, 26.3%). Inspection finds no
  `libquickjs-jni.so`, `libc++_shared.so`, `engine.bundle.js`, or other QuickJS
  entry; its remaining native entries are AndroidX path-rendering libraries.
- Evidence after deletion: Gradle reports only project `:app`; clean
  `:app:assembleDebug`, JVM tests, lint, and all three `connectedDebugAndroidTest`
  app tests pass. Repository `pnpm typecheck`, `pnpm test` (96 passing and 11
  intentionally skipped across current suites), and `pnpm check` pass.

### 2026-08-01: Tablet AVD and responsive closeout passed

- Built and installed the post-removal APK through the simplified
  `emu-install.sh` on `jstorrent-tablet` (Android 14, 2560x1600 at 320 dpi).
  The first visual pass exposed that `fillMaxWidth` preceded `widthIn`, which
  defeated the intended 720dp cap. Reversing those modifiers produced the
  centered, bounded tablet layout while retaining phone fill behavior.
- Visually reviewed the no-root core screen and expanded Advanced content;
  folder/network/behavior controls, background and notification state, all
  three wake choices, boot, low-battery, power diagnostics, and project actions
  render without clipping or excessive line length.
- Granted filesystem access, selected a seeded tablet root through debug RPC,
  started on port `0`, served its known body through ADB forwarding, observed
  one foreground service/listener, and stopped cleanly with no remaining
  service. Forced deep idle changed the reported screen/Doze state to
  `CHARGING_BUT_DOZING` without duplicating observers or services. All three
  Compose instrumentation tests pass on the tablet AVD.
- Screenshots retained for review in this work session: [tablet core
  screen](/tmp/ok200-tablet.png) and [tablet Advanced
  screen](/tmp/ok200-tablet-advanced.png).

### 2026-08-01: Final validation and living documentation closed

- Added [`../topics/android-runtime.md`](../topics/android-runtime.md) as the
  continuing owner for Kotlin implementation shape, Android lifecycle/storage
  policy, the cross-runtime compatibility rule, evidence, release gaps, and
  recommended next work. Updated current architecture, developer, UI, research,
  and public website copy; explicitly historical plans remain labeled as such.
- A from-clean Android gate passes debug compile/JVM tests/lint/APK, minified
  release APK, and release AAB. The release APK is 2,043,027 bytes and the AAB
  is 4,034,299 bytes. Inspection of debug APK, release APK, and AAB finds no
  QuickJS, bundled engine, or C++ runtime entry.
- Final repository gates pass: `pnpm typecheck`, `pnpm test`, `pnpm check`,
  website static build, shell syntax checks, `git diff --check`, single-project
  Gradle inspection, empty submodule inspection, and absence of both deleted
  module trees.
- No Android/Play, desktop, or legacy migration release was created. Play-enabled
  AVD, physical-device, and current store-policy checks remain explicit
  prerequisites for a future Android release rather than gaps in this source
  cutover.
- Android CI now runs `lintDebug` alongside the debug build and JVM tests. Its
  emulator gate remains on the Android 11/API 30 baseline, while obsolete
  Node/pnpm setup and `packages/engine` path coupling have been removed from all
  Android jobs.

### 2026-08-01: Android launcher search and physical debug install

- Changed Android application/launcher metadata to **200 OK Web Server**, so
  launcher search can match `web server`, while the Compose header remains the
  compact **200 OK** plus **Web Server** descriptor. Split metadata and Compose
  instrumentation so the resolved installed label has a direct regression
  assertion independent of UI input injection.
- With explicit approval, uninstalled the release-signed app from the attached
  Pixel 9, clearing its settings and SAF grants, then installed and launched the
  new debug build. Both metadata tests pass on that Android 17 device.
- The full three-test connected suite passes on the local Android 14 phone AVD.
  Compose/Espresso 3.6.1 cannot inject input on the Android 17 device because
  that preview OS has removed the `InputManager.getInstance()` method it uses;
  this is a test-harness compatibility gap, not an observed app failure.
- Fixed `emu-start.sh` to resolve and address the emulator serial explicitly for
  boot checks and port forwarding. An attached, already-booted physical phone
  can no longer be mistaken for the AVD.

### 2026-08-01: Primary control and physical LAN follow-up

- Replaced the Android header's synthetic `200` badge with the actual 200 OK
  artwork. Moved the Web server status/control directly below that header and
  changed Start/Stop from a button below all options to the same switch model
  used by desktop. Live URLs now follow the primary switch before configuration.
- Labeled the reachable address **LAN address · HTTP only**, made the exact
  `http://` URL directly openable/copyable, and explicitly states that HTTPS is
  unsupported. The server remains intentionally plain HTTP; no TLS feature was
  added by implication.
- Physical Pixel 9 evidence: the switch stopped and restarted the listener,
  state reported `0.0.0.0:8080`, Android reported `*:8080`, and a Mac on the
  same `192.168.1.0/24` Wi-Fi received `200 OK` plus the selected SAF directory
  body from `http://192.168.1.101:8080/`. The reported failure used `https://`.
- Added a JVM contract test for wildcard LAN binding and an instrumentation
  regression for actual logo presence, switch prominence above folder/options,
  and retained Advanced controls.

### 2026-08-01: Settings lock and serving lifetime clarified

- Grouped folder, network, and serving-behavior controls under a visible
  **Server settings** heading. While serving, the heading explains why the
  group is locked; tapping anywhere in the disabled group shows a concise
  explanation with a direct **Stop server** action.
- Replaced the ambiguous background toggle with exactly two lifetime choices:
  **While app is open** and **Keep serving in background**. The latter maps to
  the existing foreground service; no best-effort or momentary background mode
  was added.
- Separated lifetime from **Availability & battery**, retaining all three wake
  policies, boot start, low-battery shutdown, and power/Doze diagnostics.
- On Android 13 and newer, Advanced now distinguishes notification permission
  from service state: denied permission is described as hiding the drawer
  notification while the foreground service remains visible under Active apps.
- Evidence: debug Kotlin compilation, JVM tests, Android lint, and all four
  `connectedDebugAndroidTest` tests pass on the Android 14 `jstorrent-dev` AVD.
  The debug APK was also installed on the attached Pixel 9. With notification
  app-op denied, Android reported the server service as foreground and the UI
  displayed the hidden-notice explanation; both lifetime choices persisted,
  and the locked-settings snackbar action stopped the running server and
  foreground service.

## Intended change boundaries

If implementation is approved, keep the history reviewable at approximately
these boundaries (commits remain subject to the maintainer's implementation
authorization):

1. Contract tests and Android runtime documentation.
2. Kotlin storage abstraction and HTTP server.
3. Application controller, service, boot, notification, and RPC lifecycle.
4. Compose UI/settings alignment and simplification.
5. AVD parity fixes and evidence.
6. QuickJS, `io-core`, native adapter, and build-script deletion.
7. Final validation and documentation closeout.

## Review gate

Before implementation, confirm or edit these proposed choices:

- Use one `:app` module rather than retaining a separate Android server library.
- Retain background mode, all three wake modes, start on boot, low-battery
  shutdown/threshold, and Doze/power observability under Advanced.
- Use one foreground service for the whole running lifetime when background mode
  is enabled; use process lifecycle to stop a foreground-only server cleanly.
- Replace only `DozeMonitor`'s activity bookkeeping, not its useful power-state
  observations.
- Match desktop controls for localhost/LAN, directory listing, CORS, SPA, and
  port `0`.
- Preserve existing root/settings only on a best-effort basis, with no migration
  release or recovery machinery.
- Retain `MANAGE_EXTERNAL_STORAGE` and its filesystem picker.
- Do not publish Android or legacy migration releases in this tactical.

Once accepted, the agent can drive Phases 1-7 end to end, pausing only if the
implementation invalidates a reviewed product decision, needs a materially new
dependency, or cannot pass a completion gate without maintainer/device action.

**Review outcome (2026-08-01):** accepted after revising the initial
simplification proposal to retain background mode, all three wake modes, boot
start, low-battery shutdown, and power/Doze observability under Advanced.
