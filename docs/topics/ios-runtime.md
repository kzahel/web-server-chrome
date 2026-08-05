# iOS Runtime

Topic: ios-native-swift

Status: **native MVP implemented and accepted on the attached physical phone;
repository store-readiness work is active, but App Store identity, signed
packaging, TestFlight, and publication have not started.**

Last reconciled: **2026-08-05**.

The bounded first implementation and device campaign are owned by
[Tactical 016](../tactical/016-native-swift-ios-app.md). This topic owns the
continuing iOS product and runtime decisions after that tactical.

## Product decision

200 OK has a small, ordinary native iOS application analogous to the
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

The system application name is **200 OK Web Server**, with compact
**200 OK** and **Web Server** treatment inside the app. The intended bundle
identifier is `app.ok200.ios`; its App Store Connect reservation remains a
store-readiness gate.

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
- one native On/Off server switch, with stopped, starting, stopping, running,
  and error states from one runtime owner;
- reachable HTTP URLs with Copy and Share actions;
- an in-app preview path that does not require backgrounding 200 OK; and
- stable Privacy, Feedback & support, and Source code · MIT links below the
  primary controls.

The native SwiftUI layout follows the current Android/desktop hierarchy and
200 OK yellow/black visual identity: compact branded header, prominent server
status with a native On/Off switch, running URLs immediately beneath it,
folder card, network section, and serving-behavior section. When LAN is enabled
and a Wi-Fi address is available, that address precedes the phone-local URL.
It is not a copy of another App Store application's layout, typography,
settings order, or marketing screenshots.

Settings are locked while the listener is running. Point-of-use copy explains
why, while the server switch remains available to turn it Off. Fresh defaults
follow the safe product contract: port `8080`, LAN access Off, directory
listing On, CORS Off, and SPA mode Off.

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
and cached-runner checks. The campaign below then used that controller without
changing it.

The product build then passes its explicit signed `.app` path to
`bin/ios-device install` and runs multi-step work through
`bin/ios-device session -- COMMAND`. Do not invoke its underlying automation
provider directly, select an arbitrary first device, or record a device UDID,
Apple account, team identifier, certificate, provisioning profile, or private
session output in this repository.

Physical acceptance requires at least:

1. First launch, folder selection, switching On, status, URL, preview,
   switching Off, and restart through accessible controls.
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

## Implemented state and evidence

The 2026-08-05 compatibility slice added frozen oldest, current, additive-
future, and invalid settings fixtures. `ServerConfiguration` now supplies
defaults for fields absent from an older stored form, continues to ignore
unknown future fields, and recovers an invalid form through the existing safe
store default. The complete canonical iOS check passed afterward: simulator
tests, simulator Release, unsigned device Release, fixture rejection, and
signing hygiene.
`scripts/release-check.sh ios` is the non-publishing release-confidence entry
point. It runs that same canonical check and prints the physical-device handoff;
archive, TestFlight, and App Store evidence remain explicitly owned by
Tactical 017.

The repository now contains a generated Xcode project and its xcodegen source
under `ios/`, with application, Swift Testing, and XCTest UI targets. The app
is native SwiftUI/Swift and links no Android, Rust, React, Tauri, or third-party
HTTP runtime. Its application-scoped `IOSServerController` owns persisted
configuration, security-scoped root leases, one `SwiftHTTPServer`, observable
status, current Wi-Fi URLs, and the SwiftUI scene transition.

The first store-readiness source slice adds a bundled privacy manifest for the
app's UserDefaults and user-selected file metadata access, declares that the
app does not use non-exempt encryption, removes the opaque icon's unused alpha
channel, and presents stable privacy, feedback, and source links in the app.
The source privacy page explains local settings, selected-folder access, plain
HTTP and LAN exposure, foreground-only iOS serving, support intake, and the
separate website-hosting data path. These source changes do not constitute App
Store Connect privacy answers or a published policy until the website deploys.
The complete canonical iOS gate passed with these declarations present in both
unsigned Release products. A physical layout/LAN rerun remains pending because
the testbed readiness probe reported its selected phone disconnected.

The App Store archive runbook and scripts now define the `0.1.0 (1)` candidate,
positive monotonically increasing build-number policy, unsigned archive
rehearsal, explicit manual signing/export inputs, ignored evidence outputs, and
exact `.app`/`.xcarchive`/`.ipa` inspection. The inspector passed the unsigned
device Release app, an unsigned archive, and an IPA-shaped extraction harness.
No team, profile, or credential is committed, and no signed archive, Apple
validation, or upload has run.

The local iOS release helper now checks or creates an exact version/build tag
without pushing. A separate workflow can build-only, validate, or explicitly
upload from that tag; pushing the tag cannot trigger it. Ephemeral CI signing
proves certificate/profile/team/bundle agreement and cleans all decoded
material even on failure. The upload job reinspects the downloaded IPA and is
separated behind an upload confirmation and named GitHub environment. It has
no path to testers, App Review submission, availability, or publication.

The native HTTP implementation now provides:

- bounded HTTP/1.0 and HTTP/1.1 request heads, clients, and request/response
  timeouts;
- `GET`, `HEAD`, optional CORS `OPTIONS`, explicit `405`, and connection close;
- streamed files, `index.html`, bounded escaped listings, MIME types, ETag,
  Last-Modified, conditional requests, and single byte ranges;
- optional CORS and extensionless SPA fallback; and
- strict single decoding, encoded-separator rejection, traversal rejection,
  symlink containment, and read-only coordinated access.

`ios/scripts/check.sh` is the repeatable host gate. On 2026-08-05 it passed 27
declared unit/UI tests (including all 28 cases in shared HTTP contract `1.0.0`),
a Debug simulator build/test run, unsigned Release simulator and generic-device
builds, the check that DEBUG fixtures and launch hooks are absent from the
Release binary, and the check that no development team is committed in the
generated project. `.github/workflows/ios-ci.yml` now runs that same gate on a
pinned hosted macOS image and rejects generated-project drift without importing
signing or device state. Hosted
[iOS CI run `30983441249`](https://github.com/kzahel/web-server-chrome/actions/runs/30983441249)
passes that complete gate on macOS 26. `ios/scripts/device-smoke.sh` owns the repeatable signed
build/install/semantic-switch/external-fetch/background-stop path through the
shared device testbed without scrolling to discover the displayed LAN URL.

Physical acceptance on 2026-08-04 used the attached iPhone SE (3rd generation)
running iOS 26.6 and an external Mac peer on the same Wi-Fi network. It proved:

1. The signed app installed and launched through accessible controls. The
   initial Network.framework spike served a fixed fixture on port 8080 before
   the complete implementation replaced it.
2. With LAN disabled, the Mac could not connect to the phone's Wi-Fi IPv4
   address. With LAN enabled, the same Mac fetched the displayed Wi-Fi URL.
   This proves a real loopback/all-interface bind difference rather than a
   hidden-URL convention.
3. The complete DEBUG fixture passed external requests for `/`, an ordinary
   file, a missing file, `HEAD`, ETag/`304`, a single byte range/`206`, CORS
   disabled and enabled, preflight `OPTIONS`, SPA fallback, and traversal
   rejection. Automatic-port restarts assigned successive reachable ports in
   the 54713–54716 range during the campaign.
4. The in-app `SFSafariViewController` preview rendered the localhost fixture
   while the app remained active. Copy and Share were present as accessible
   URL actions.
5. Pressing Home made the external listener unreachable. Returning showed
   Stopped plus the background explanation; it never auto-resumed. A new
   explicit start served successfully and received a new automatic port.
6. The system directory picker selected a real local Files directory. Its
   bookmark survived process termination and relaunch, then resolved and
   served successfully. A DEBUG-only corrupt-bookmark case showed the concise
   error and enabled Change-folder recovery path on the physical phone.
7. The available small phone rendered the complete scrollable surface in
   light and dark appearance, including an accessibility-sized text launch.
   Semantic snapshots exposed a named server On/Off switch plus folder, port,
   option, preview, copy, and share controls; settings became disabled while
   Running. A
   phone-discovered number-pad trap was repaired with an accessible Done
   control before final validation.
8. No local-network permission alert appeared for this incoming-TCP-only app
   on the tested device/OS. The testbed session exited cleanly after each
   campaign, and no signing team, profile, certificate, account, or device
   identifier was added to source.

On 2026-08-05 a UI-consistency follow-up replaced the prominent start/stop
button with the native server switch used by the other product surfaces. The
running URL card moved directly below server status and prioritizes the Wi-Fi
URL. On the attached phone, turning the switch On revealed both URLs in the
initial unscrolled viewport, the external Mac fetched the fixture through the
displayed Wi-Fi URL, and backgrounding still closed the listener. The updated
simulator UI suite also exercised On, Off, disabled, error, and background
state reconciliation.

Implementation was committed in logical slices: `87d9882` (accepted plan),
`bff0594` (physical listener foundation), `322e1a0` (HTTP/storage core),
`85d8ff9` (native control surface), and `c6a5f94` (repeatable validation gates).

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

The accepted evidence is deliberately bounded to one iPhone SE on iOS 26.6,
one host Mac, the local Files provider, and the tested fixture sizes. Runtime
execution on iOS 17, iCloud Drive and third-party/cloud provider latency,
provider revocation outside the simulated corrupt bookmark, very large files,
load/stress behavior, additional phone/iPad sizes, and actual VoiceOver speech
remain unproven. The local provider returned a generic underlying directory
name during one selection, so provider-specific display naming also merits
broader review.

There is no App Store Connect record for this bundle, distribution profile,
completed signed archive/export or Apple validation, completed App Store
Connect privacy response, store copy, screenshot set, TestFlight build, review
result, or store-delivered artifact proof. The privacy policy and manifest
exist only in source until the website and app are distributed. Tactical 017
owns those separate store-readiness gates. Store submission or publication is
not implied by the completed native MVP.
