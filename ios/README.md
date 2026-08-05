# iOS Development

The iOS app is a native SwiftUI/Swift implementation. Generate the checked-in
Xcode project from `project.yml` with:

```bash
ios/scripts/generate-project.sh
```

Build a development-signed physical-device app using the ignored signing team
selection in `../ios-device-testbed/config.local`:

```bash
ios/scripts/build-device.sh
```

The build script prints `build/DerivedData/Build/Products/Debug-iphoneos/OK200.app`.
Install and automate
that product through `~/code/ios-device-testbed`; the testbed never builds this
project and this project never reimplements testbed device selection or lease
management.

The app is a foreground-only, read-only server for one folder selected through
Files. Port, local-network access, directory listings, CORS, and SPA fallback
are configured in the native SwiftUI screen. A native On/Off switch controls
the listener. While it is running, connection URLs appear immediately below
server status, with the Wi-Fi URL first when available. Moving the app to the
background stops the listener by design.

Simulator UI tests use a fixture installed only in DEBUG builds through the
`-use-ok200-ui-test-fixture` launch argument. The fixture and reset launch hooks
are compiled out of Release builds.

Run the complete simulator test suite plus the Release fixture/signing checks:

```bash
ios/scripts/check.sh
```

Run the attached-phone preflight, signed build, install, semantic launch, and
LAN fixture start through the shared controller:

```bash
ios/scripts/device-smoke.sh
```

The smoke reads the displayed Wi-Fi URL from the semantic snapshot, checks the
fixture externally from the Mac, backgrounds the app, and verifies that the
listener closes. It does not guess a device address or weaken the testbed's
explicit device-selection and session rules.
