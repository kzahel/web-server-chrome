# Production Release Simulator smoke

From the repository root on a Mac with Xcode, an available iOS
Simulator runtime, XcodeGen, Python 3 and ripgrep:

```bash
source ~/.profile
ios/scripts/release-simulator-smoke.sh
```

iOS CI runs this after the standard source/archive checks, supplying their
already-built generic Simulator Release app. It removes the source-check
Simulator first, then retains the result bundle, inspection and logs as the
`ios-release-smoke` artifact.

The runner creates a fresh iPhone Simulator using the newest installed iOS
runtime. By default it builds an unsigned generic **Release** app for the host
architecture, checks production artifact
hygiene, seeds a website in that Simulator's OS Files provider, and installs a
separate XCTest UI runner. The app is driven only through normal controls and
the real Files picker. There are no DEBUG arguments or app preference/bookmark
injections. The main app project and existing localization qualification
harness do not acquire another test target.

Coverage includes first-run restrictions; choosing a Files folder; automatic
port selection; CORS; start and read-only HTTP responses (200, range 206, 404,
405); in-app preview; stop/disconnection; folder and settings persistence after
relaunch; and foreground serving followed by background shutdown. Exact
fixture responses establish that the chosen grant serves the intended folder,
even when a Files provider supplies a generic display name.

Logs, source commit/diff, executable hash and inspection, screenshots and the
XCTest result bundle remain in the printed ignored `ios/build/release-smoke.*`
directory. The script terminates the app, shuts down and deletes only the
Simulator it created, including on failure. Test failures remain nonzero;
inspect `test.log` and `Smoke.xcresult` before retrying.
Each test has a five-minute execution limit, in addition to individual bounded
UI/network waits. Phase messages identify boot, build, fixture and test work.

Generic builds and CI's prebuilt-product handoff avoid repeating device-specific
asset thinning. The initial hosted attempt stalled in that redundant asset
compiler before any Release smoke test began; its logs remain in Tactical 024.

An already-built **Simulator Release** app can be supplied with
`IOS_RELEASE_SMOKE_APP=/absolute/path/OK200.app`. Its actual identity/hash are
recorded, but its source provenance must be established separately. The default
build selects only the host architecture. Simulator artifact checks verify the
platform, identity, minimum OS, encryption declaration, matching privacy manifest
and absent DEBUG hooks/frameworks. Simulator-compiled icon alpha and simulator
architectures differ from device exports; the distribution inspector remains
a separate required check on the exact device IPA.

This gate proves source-equivalent Release behavior in a Simulator. It does
not install the signed device IPA or a TestFlight-delivered build, establish
physical Wi-Fi reachability or Local Network permission behavior, or replace
minimum-supported-iOS and third-party Files-provider coverage. Physical testing
remains in `ios/scripts/device-smoke.sh`; publication exceptions must record
the maintainer's accepted evidence and those limits in the owning topic.
