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
are configured in the native SwiftUI screen. Moving the app to the background
stops the listener by design.

Simulator UI tests use a fixture installed only in DEBUG builds through the
`-use-ok200-ui-test-fixture` launch argument. The fixture and reset launch hooks
are compiled out of Release builds.
