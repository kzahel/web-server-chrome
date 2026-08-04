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

The first implementation slice intentionally serves one fixed DEBUG response
on port 8080. It exists only to prove the actual phone listener and LAN path
before the complete selected-folder server is built.
