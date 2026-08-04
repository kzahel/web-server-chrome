# Tactical 016: Native Swift iOS App

**Status:** complete; native MVP and physical-device acceptance passed on 2026-08-04
**Topic:** `ios-native-swift`  
**Baseline:** `01388d0`  
**Scope:** native iOS application and its project-owned build/tests, plus
physical-device product validation through `~/code/ios-device-testbed`

## Objective

Build the first native **200 OK Web Server** iOS application: select a Files
folder, start one read-only foreground HTTP server, configure the common
serving options, preview or share its URL, and prove real LAN service from the
attached iPhone to a separate Mac.

The result should feel like the iOS member of the existing product family, not
a port of Android, desktop, or a competing App Store interface. Native SwiftUI
and Swift own the complete application.

The continuing product and runtime contract lives in
[`../topics/ios-runtime.md`](../topics/ios-runtime.md). If implementation
evidence changes a durable decision, update that topic as part of the same
slice.

## Scope controls

This tactical includes:

- a checked-in Xcode project under `ios/` with app, unit-test, and UI-test
  targets;
- SwiftUI presentation, one application-scoped controller, native Swift HTTP
  and storage code, and iOS-owned persistence;
- canonical 200 OK icon/artwork reuse and platform-appropriate accessible UI;
- simulator and host-side automated tests where applicable;
- a development-signed device build; and
- exact physical UI, lifecycle, Files, and same-Wi-Fi LAN proof through the
  existing testbed.

It excludes:

- shared Kotlin, Rust, React, Tauri, or generated runtime/UI code;
- Android lifecycle options or any attempt at indefinite background service;
- uploads, deletion, authentication, TLS, multiple servers, Bonjour, QR codes,
  live reload, and remote management;
- modifying `ios-device-testbed` unless a separately reviewed controller defect
  blocks product validation; and
- TestFlight, App Store submission, public marketing assets, or a production
  release workflow.

## Target architecture

```text
SwiftUI ServerScreen
  folder / port / options / start-stop / status / URLs / preview
                         |
                         v
        @MainActor IOSServerController
          serialized configuration and lifecycle
                    /                 \
                   v                   v
        SwiftHTTPServer          SecurityScopedRoot
        NWListener + tasks       bookmark + coordinated reads
```

Ownership rules:

- one controller is authoritative for configuration and server state;
- UI actions and scene transitions command that controller rather than owning
  listener tasks directly;
- start resolves and validates the bookmark before advertising Running;
- stop cancels the listener first, closes/drains connections within a short
  bound, releases file access, and then publishes Stopped;
- entering SwiftUI background executes that same stop path and never persists
  an automatic-running intent; and
- errors are typed and translated into concise user-facing messages without
  exposing paths or request data in release logs.

## Product acceptance matrix

| Capability | iOS MVP |
|---|---|
| Serving root | One user-selected directory from Files |
| Port | `0` or `1...65535`; show assigned port |
| Bind scope | Localhost or LAN, physically verified |
| Lifecycle | Explicit foreground start/stop; deterministic stop on background |
| Running URLs | Current HTTP addresses with Copy and Share |
| Preview | In-app preview while the server scene remains active |
| Directory behavior | `index.html` precedence or bounded directory listing |
| Options | LAN, directory listing, CORS, SPA fallback |
| Methods | `GET`, `HEAD`, CORS preflight `OPTIONS` |
| HTTP metadata | MIME, length, ETag, Last-Modified, single ranges |
| Safety | Bounded parsing/connections, one decode, path containment, read-only root |
| Persistence | Configuration and root bookmark; never automatic running intent |
| Visual identity | Native SwiftUI using current 200 OK branding and information order |

## Implementation sequence

### Phase 1: Scaffold and prove the physical listener

1. Create `ios/` with a minimal iOS 17 SwiftUI app, unit/UI test targets,
   stable development bundle identity, and no unrelated capabilities. Keep the
   development team and all signing identities in ignored local configuration
   or environment, not the Xcode project.
2. Add the canonical icon/artwork to an iOS asset catalog; do not link another
   platform's source tree at build time.
3. Implement one `NWListener` vertical slice serving a fixed DEBUG-only fixture
   from the app container.
4. Build a signed `iphoneos` `.app`, install it through the testbed, start it
   through accessible controls, and fetch the fixture from the Mac over the
   same Wi-Fi network.
5. Prove loopback-only and LAN binding separately. Record the actual interface,
   first-run local-network behavior, assigned port, request result, and cleanup
   without recording private device or signing identifiers.

Do not build the complete UI before this gate passes. If Network.framework
cannot make the bind-scope contract truthful, revise the networking decision
in the topic before continuing.

### Phase 2: Build the iOS-owned HTTP and storage core

1. Separate request parsing/serialization from the selected-root adapter so
   protocol tests use in-memory or temporary fixtures.
2. Add bounded `GET`, `HEAD`, and `OPTIONS`, streaming responses, directory
   behavior, MIME types, validators, ranges, CORS, SPA fallback, and clear
   method/error handling.
3. Add strict URL decoding and containment tests, including malformed escapes,
   traversal attempts, encoded separators, directory indexes, and range edges.
4. Add directory selection, security-scoped bookmark persistence, balanced
   access, coordinated reads where required, and explicit invalid/stale-root
   handling.
5. Keep the implementation read-only and dependency-light. A server framework
   requires a documented review rather than being added for convenience.

### Phase 3: Build the native 200 OK control surface

1. Use a compact SwiftUI header with the canonical artwork, **200 OK**, and
   **Web Server** descriptor.
2. Present the same everyday information order as Android/desktop: server
   status/action, serving folder, network/port, serving behavior, then URLs.
3. Use native cards, fields, switches, buttons, sheets, and accessibility
   semantics rather than reproducing the competitor screenshot.
4. Lock mutable server settings while running and provide clear stop-first
   feedback.
5. Add Copy, Share, and an in-app preview. Do not rely on switching to Safari
   for localhost preview because backgrounding stops the server.
6. Make Stopped-after-background explicit without presenting background
   settings that iOS cannot honor.

### Phase 4: Close automated validation

Automated gates should include:

- `xcodebuild` build for simulator and generic physical iOS destinations;
- Swift unit tests for parser, responses, settings validation, URL generation,
  containment, controller transitions, and cleanup;
- UI tests for first-run/selected-folder states, start/stop, locked controls,
  errors, URL actions, and background-resume truth where simulator behavior is
  representative;
- accessibility identifiers and labels sufficient for semantic physical
  automation; and
- a release-configuration build with DEBUG fixture/test hooks absent.

Add project-owned scripts for repeatable build/test/device-smoke entry points.
They may call the testbed wrapper but must not duplicate its device selection,
lease, daemon, signing-runner, or recovery logic.

### Phase 5: Run the physical-device campaign

Preflight from the controller repository:

```bash
cd ~/code/ios-device-testbed
bin/ios-device probe
bin/ios-device doctor
```

Build the development-signed app in this repository, then pass the explicit
absolute `.app` path to:

```bash
~/code/ios-device-testbed/bin/ios-device install /absolute/path/to/200OK.app
```

Run multi-step work inside one exclusive testbed session. The final product
smoke must cover:

1. Semantic launch/snapshot and first-run layout on the physical phone.
2. A product-owned known fixture, Start, Running, assigned/displayed URL, and
   in-app preview.
3. Mac-to-phone same-Wi-Fi `curl` requests for `/`, an ordinary file, missing
   content, `HEAD`, conditional validation, a byte range, CORS Off/On, and a
   traversal rejection.
4. Stop/restart and port-`0` reassignment without stale URLs or connections.
5. LAN Off rejecting the external Mac while LAN On accepts it.
6. A real Files-selected folder, persisted bookmark after relaunch, and a
   visible recovery path after invalidation or revocation.
7. Home/background while running, external-unreachable proof, resume reporting
   Stopped, and a successful new explicit start.
8. Local-network privacy state on a clean install. Permission alerts or system
   security confirmations not yet supported by automation are completed as
   explicit human gates.
9. Dark appearance, larger text, VoiceOver/accessibility labels, and screenshot
   review on the available small physical phone; use simulators for additional
   screen sizes.
10. Session exit proving runner/daemon cleanup; retain only reviewed,
    non-private evidence.

The external `curl` leg is mandatory. A simulator request, phone-local preview,
listener log, or UI Running label cannot substitute for a response observed by
another machine on the real LAN.

### Phase 6: Reconcile current truth and hand off release work

1. Record exact implementation, test, and physical evidence in the iOS topic.
2. Update README, vision, architecture, and branding claims from “planned” to
   “implemented” only after their corresponding gates pass.
3. Record remaining Files-provider, OS-version, device-size, and performance
   gaps without generalizing one phone's result.
4. Create a separate store-readiness tactical for App Store Connect identity,
   privacy metadata, screenshots, TestFlight, review notes, signing/release
   automation, and exact store-delivered validation.

## Completion record

All six phases completed on 2026-08-04. The execution series is:

- `87d9882` — accepted iOS runtime/topic and Tactical 016 plan;
- `bff0594` — native iOS 17 scaffold and signed physical `NWListener` proof;
- `322e1a0` — bounded read-only HTTP implementation, security-scoped bookmark
  storage, and protocol/storage tests;
- `85d8ff9` — SwiftUI control surface, application controller, system folder
  picker, in-app Safari preview, persistence, lifecycle, and UI tests; and
- `c6a5f94` — repeatable simulator/Release/device gates plus phone-discovered
  accessibility and keyboard repairs.

`ios/scripts/check.sh` passed all 26 declared unit/UI tests and the Release
fixture/signing checks. `ios/scripts/device-smoke.sh` then built and installed a
signed app through `~/code/ios-device-testbed`, parsed the Wi-Fi URL displayed
by the UI, fetched the fixture from the external Mac, exercised representative
file/range/missing behavior, pressed Home, and verified that the same URL was
unreachable.

The broader one-time physical campaign also proved LAN Off rejection versus
LAN On reachability, port-`0` reassignment, the complete external HTTP matrix,
CORS and SPA options, localhost in-app preview, stop/restart, truthful
background resume, a real Files-selected bookmark across relaunch, simulated
invalid-bookmark recovery, small-phone light/dark and accessibility-sized text,
and settings locked while Running. Exact details and remaining provider/device
gaps live in [`../topics/ios-runtime.md`](../topics/ios-runtime.md).

No testbed source change, third-party runtime, background entitlement, shared
platform code, write access, signing identifier, or store mutation was needed.
The separate distribution lane is now bounded by
[`017-ios-store-readiness.md`](017-ios-store-readiness.md).

## Exit criteria

Tactical 016 completes only when:

- native Swift source, Xcode build, tests, and accessible SwiftUI controls are
  checked in under `ios/`;
- no Android, Rust, React, Tauri, or generated cross-platform implementation is
  linked into the iOS application;
- the selected-folder read-only HTTP contract passes automated tests;
- an exact signed development app completes the physical UI and same-Wi-Fi
  external HTTP matrix;
- backgrounding deterministically stops service and the resumed UI is truthful;
- release configuration contains no DEBUG fixture or automation bypass;
- the living iOS topic contains the accepted evidence and remaining gaps; and
- App Store publication is still described as a separate, uncompleted gate.

## Review gate

During implementation, pause for plan review rather than silently broadening
scope if any of these become necessary:

- a third-party HTTP runtime;
- Bonjour or multicast entitlements;
- write/delete access;
- an iOS background mode;
- shared code from another 200 OK runtime; or
- a testbed change outside project-owned assertions and scripts.
