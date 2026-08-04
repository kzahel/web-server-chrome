# iOS Runtime

Topic: ios-native-swift

Status: **accepted native direction; implementation has not started. The host
build tools and physical-device install, automation, and LAN-validation path
are ready.**

Last reconciled: **2026-08-04**.

The bounded first implementation and device campaign are owned by
[Tactical 016](../tactical/016-native-swift-ios-app.md). This topic owns the
continuing iOS product and runtime decisions after that tactical.

## Product decision

200 OK will have a small, ordinary native iOS application analogous to the
Android and desktop apps. It performs the same core job—select a folder, start
a read-only HTTP server, and show reachable URLs—but follows iOS storage and
application-lifecycle rules.

The app is independent Swift code:

```text
SwiftUI control surface
         |
         v
application-scoped IOSServerController
         |
         +-- Swift HTTP server over Network.framework
         +-- security-scoped, read-only directory access
         +-- foreground scene lifecycle and persisted configuration
```

There is no shared runtime or UI implementation with Android or desktop. The
iOS target does not link the Kotlin app, Rust core, Tauri application, React
controls, or a generated cross-platform layer. It may reuse the canonical 200
OK icons and artwork. Product terminology, information order, and externally
observable HTTP behavior are contracts to align, not source code to share.

The planned system application name is **200 OK Web Server**, with compact
**200 OK** and **Web Server** treatment inside the app. The intended bundle
identifier is `app.ok200.ios`, subject to the normal signing and App Store
reservation check when the Xcode project is created.

The initial deployment target is iOS 17.0. The implementation uses APIs
available at that target even though the attached validation phone runs a newer
OS; simulator coverage at the minimum target remains separate from physical
proof on the available phone.

## First-release product contract

The first iOS release is one root and one server. Its everyday surface owns:

- directory selection through the system Files picker;
- port `0` or `1...65535`, with the assigned port shown when automatic;
- explicit localhost/LAN binding;
- directory listing, CORS, and SPA fallback switches;
- start, stop, starting, stopping, running, and error states from one runtime
  owner;
- reachable HTTP URLs with Copy and Share actions; and
- an in-app preview path that does not require backgrounding 200 OK.

The native SwiftUI layout follows the current Android/desktop hierarchy and
200 OK yellow/black visual identity: compact branded header, prominent server
status and start/stop control, folder card, network section, serving-behavior
section, and running URLs. It is not a copy of another App Store application's
layout, typography, settings order, or marketing screenshots.

Settings are locked while the listener is running. Point-of-use copy explains
why, and offers a direct Stop action where practical. Fresh defaults follow the
safe product contract: port `8080`, LAN access Off, directory listing On, CORS
Off, and SPA mode Off.

## Explicit lifecycle boundary

iOS does not offer a general-purpose mode for keeping a local HTTP server alive
indefinitely after the app leaves the foreground. Apple documents that apps
are normally suspended in the background and restricts background services to
their intended special-purpose categories. 200 OK does not claim one of those
categories and must not use audio, location, VoIP, or another background mode
as a workaround.

The first release therefore has one honest lifetime:

- the server runs while the application scene is active;
- entering the SwiftUI `background` scene phase stops the listener, closes
  active connections, and releases security-scoped file access;
- entering `inactive` alone does not imply a stop, because system sheets and
  interruptions can make a foreground scene temporarily inactive;
- returning to the app shows Stopped and a concise explanation when a running
  server was stopped by backgrounding; and
- configuration persists, but running intent does not auto-resume after
  foregrounding, relaunch, reboot, or termination.

There is no background-serving switch, boot start, notification service,
wake-lock equivalent, battery/Doze panel, or background entitlement. An
in-app preview should use a presentation such as `SFSafariViewController` so a
user can inspect localhost content without moving the server app itself into
the background. This behavior must be proven on the physical phone rather than
assumed from simulator behavior.

## Native networking decision

The first implementation uses Apple's Network framework, initially the mature
`NWListener` API, with a small iOS-owned HTTP protocol layer. This keeps the
app native and avoids adopting a server framework before the product needs
one. A third-party server dependency such as SwiftNIO is not part of the first
slice; add one only after evidence shows that it reduces risk or complexity
without broadening the product.

The server remains bounded and read-only. Before the first device-accepted
candidate, iOS-owned tests cover:

- HTTP/1.0 and HTTP/1.1 request-head bounds and timeouts;
- `GET`, `HEAD`, and CORS preflight `OPTIONS`, with `405` for unsupported
  methods;
- streaming files, `index.html`, bounded escaped directory listings, MIME
  types, ETag, Last-Modified, and single byte ranges;
- CORS and SPA behavior only when enabled;
- single decoding, malformed-path rejection, and containment beneath the
  authorized root; and
- bounded clients, deterministic stop, and listener/connection cleanup.

The first network spike must prove that LAN Off really binds only loopback and
LAN On really accepts a peer connection. Merely hiding a LAN URL while the
listener remains reachable is not acceptable. The UI observes interface
changes and must not display stale or cellular-looking addresses as reachable
LAN endpoints.

The app includes a clear `NSLocalNetworkUsageDescription`. Apple's local
network privacy rules distinguish incoming TCP acceptance from outgoing and
Bonjour operations, and the simulator does not model the permission behavior.
The physical campaign records the actual first-run, allowed, and denied states
rather than assuming a prompt. Bonjour advertisement and a `.local` address
are useful follow-ups, not first-release requirements; if added, declare the
exact service type in `NSBonjourServices` and test it on device.

The listener serves plain HTTP. UI, preview, copy, and share surfaces preserve
the `http://` scheme and never imply TLS.

## Native storage decision

Folder selection uses `UIDocumentPickerViewController` for directories. The
returned security-scoped URL grants recursive access to the selected folder.
The app persists a security-scoped bookmark, resolves it on later launches,
and asks the user to select again when the bookmark is stale, revoked, missing,
or unsupported by its Files provider.

The controller begins security-scoped access only for validation and an active
server lifetime, balances every successful start with a stop, and releases the
scope on background, server stop, or failure. Reads from Files providers use
Foundation's coordinated file-access APIs where needed. Slow, unavailable, or
cloud-backed items fail visibly and within bounds; they must not leave a
connection or file scope hanging indefinitely.

The first release is read-only. It does not upload, create, replace, rename, or
delete selected content. App Store examples that expose write/delete behavior
do not define this product's scope.

## Compatibility and non-goals

The iOS analogue aligns with desktop and Android on the core concepts of one
root, port, bind scope, directory listing, CORS, SPA fallback, start/stop,
status, visible URLs, and safe read-only HTTP behavior. Pixel parity and
identical implementation details are not goals.

The first release does not include:

- background or unattended serving;
- boot or foreground auto-start;
- uploads, deletion, authentication, or TLS;
- multiple simultaneous servers;
- remote management, native messaging, or Chrome-extension launching;
- Bonjour discovery, QR codes, or live reload; or
- shared Rust, Kotlin, React, Tauri, or generated UI/runtime code.

## Physical-device QA boundary

The project-neutral controller at `~/code/ios-device-testbed` owns explicit
phone selection, signing-runner readiness, installation of an already-built
`.app`, UI automation, screenshots, logs, and exclusive sessions. This
repository owns the Xcode project, build invocation, fixtures, product
assertions, and external HTTP checks. Private signing selection is injected
from ignored local configuration or environment; no team identifier, account,
certificate, profile, or device identifier belongs in tracked source.

The validated testbed currently provides a connected physical iPhone, full
Xcode, valid development signing, Developer Mode, installation, semantic UI
inspection, input, screenshots, Home navigation, and session cleanup. Before
each physical campaign, run its read-only gates:

```bash
cd ~/code/ios-device-testbed
bin/ios-device probe
bin/ios-device doctor
```

On 2026-08-04, those read-only commands reported the selected phone connected,
unlocked, in Developer Mode, and `doctor: ready`, with valid Xcode, signing,
and cached-runner checks. This proves controller readiness only; no 200 OK iOS
application has been built or tested yet.

The product build then passes its explicit signed `.app` path to
`bin/ios-device install` and runs multi-step work through
`bin/ios-device session -- COMMAND`. Do not invoke its underlying automation
provider directly, select an arbitrary first device, or record a device UDID,
Apple account, team identifier, certificate, provisioning profile, or private
session output in this repository.

Physical acceptance requires at least:

1. First launch, folder selection, start, status, URL, preview, stop, and
   restart through accessible controls.
2. A known fixture served from the foreground phone to a separate Mac on the
   same Wi-Fi network, with real `curl` checks for representative files and
   HTTP behavior.
3. Proof that LAN Off is not reachable from the Mac and LAN On is reachable at
   the displayed address.
4. Home/background transition proof: the listener becomes unreachable,
   resumed UI is truthful, and the selected root can be used again on a new
   explicit start.
5. Bookmark persistence across relaunch plus a clear re-selection path for an
   invalid root.
6. Physical review of local-network privacy behavior. Any system permission or
   security surface the testbed cannot yet automate remains a named human gate.
7. Small-phone visual and accessibility review, including Dynamic Type,
   VoiceOver labels, dark appearance, and settings locked while running.

The simulator remains useful for unit/UI coverage and layout variants, but it
cannot close the real local-network privacy, Files-provider, signing, or
Mac-to-phone LAN gates.

## Research basis

- Apple [NWListener documentation](https://developer.apple.com/documentation/network/nwlistener)
  defines the native incoming-connection primitive used for the first spike.
- Apple [Providing access to directories](https://developer.apple.com/documentation/uikit/providing-access-to-directories)
  defines directory picking, recursive security-scoped access, and bookmark
  persistence.
- Apple [NSFileCoordinator documentation](https://developer.apple.com/documentation/foundation/nsfilecoordinator)
  defines coordinated access needed when selected content is managed by a
  Files provider.
- Apple [TN3179: Understanding local network privacy](https://developer.apple.com/documentation/Technotes/tn3179-understanding-local-network-privacy)
  defines listener/privacy behavior and requires real-device testing.
- Apple [ScenePhase.background](https://developer.apple.com/documentation/swiftui/scenephase/background)
  recommends closing files and network connections and treating background as
  potentially preceding termination.
- Apple [background execution documentation](https://developer.apple.com/documentation/xcode/configuring-background-execution-modes)
  and [App Review Guideline 2.5.4](https://developer.apple.com/app-store/review/guidelines/#software-requirements)
  establish why this app does not claim an unrelated background mode.

## Known gaps and next direction

No iOS source, Xcode project, tests, signed app, App Store record, release
workflow, or product evidence exists yet. Tactical 016 starts with the smallest
physical vertical slice and does not treat documentation or simulator success
as proof that the app serves over a real network.

After the device-accepted MVP, make App Store packaging, privacy metadata,
screenshots, TestFlight, review notes, and release automation a separate
bounded closeout. Store submission is not implied by completion of the first
implementation tactical.
