# Extension Launcher and ChromeOS Network Readiness

Status: **active; the ChromeOS URL fix passes physical validation, the owned
options page is live, and exact signed Android `0.2.1` and extension `0.1.4`
GitHub release artifacts pass inspection. The maintainer reports both store
submissions complete; review, rollout, and store-delivered proof remain open.**

Last updated: **2026-08-02**.

Related continuing concerns:

- [Android runtime](../topics/android-runtime.md)
- [ChromeOS extension launcher](../topics/chromeos-extension-launcher.md)
- [Legacy Chrome App migration](../topics/legacy-app-migration.md)
- [Desktop release readiness](../topics/desktop-release-readiness.md)
- [Release confidence closeout](009-release-confidence-closeout.md)

## Objective

Ship the new Chrome extension as an honest launcher and discoverability surface
for the real desktop and Android applications. Close the remaining extension
release defects, make Android's displayed URLs truthful on ChromeOS, and leave a
repeatable evidence record for what has and has not passed.

This tactical does not turn the extension into an HTTP server. It also does not
authorize automatic public-Internet exposure of Android's unauthenticated,
plain-HTTP file server.

## Current release decision

**The exact extension and Android artifacts were submitted by the maintainer.
Do not claim store delivery until the reviewed versions arrive through
controlled store installs.**

The desktop destination is ready: signed desktop `v0.1.5` and its production
extension/native-host paths passed on the recommended macOS, Windows NSIS, and
Linux AppImage installs. The ChromeOS launcher concept also works when the app
is installed. The remaining blockers are narrower but user-visible:

| Area | Current result | Release consequence |
|---|---|---|
| Desktop native launch | Pass on accepted `v0.1.5` packages | Keep this route |
| ChromeOS launch with Android installed | Exact source candidate offers the system **Open with** confirmation, then opens one app task | Keep the intent route and explain the confirmation |
| ChromeOS without Android installed | Previous intent fallback reached generic Play or a blank intent tab; source now separates **Open installed Android app** from a prominent owned HTTPS options route | Production route is live; preserve the separate choices |
| ChromeOS server reachability over IPv4 | Pass at the Chromebook's physical LAN IPv4 and selected port | Preserve ChromeOS automatic forwarding |
| Android URL shown on ChromeOS | Fix passes: no ARC URL, honest Chromebook IPv4 instructions, reachable bracketed IPv6, and loopback | Included in submitted signed `android-v0.2.1`; prove store delivery |
| Extension artifact hygiene | Exact submitted `extension-v0.1.4` ZIP passes local and CI inspection with recorded digest | Preserve the exact artifact identity through store delivery |
| Store delivery | Extension `0.1.4` and Android `0.2.1` reportedly submitted; neither is proved store-delivered | Required before broad ChromeOS migration messaging |

## Accepted product boundaries

1. The extension is a launcher, status, and install-discovery surface. The
   desktop or Android app owns the server.
2. ChromeOS uses the Android app. Native messaging remains a desktop-only path.
   The extension cannot use private ChromeOS APIs to detect Play availability
   or Android installation state; it must present uncertainty honestly.
3. A numeric address is presented as a LAN address only when another device on
   that LAN can use it.
4. A reachable IPv6 URL supplements the IPv4 URL or instruction; it never
   replaces IPv4 presentation merely because IPv6 is available.
5. UPnP's external/WAN address and the Chromebook's local/LAN address are
   different identities. UPnP is not an address-selection fix.
6. Automatic router port mapping remains out of scope until authentication,
   exposure warnings, TLS expectations, opt-in policy, lease cleanup, and real
   inbound verification receive an explicit product decision.

## ChromeOS network investigation

### Previous Android selection was order-dependent

Before this fix, `ServerViewModel.findLocalIp()` enumerated every Java
`NetworkInterface`, kept the first non-loopback IPv4 address, and fell back to
loopback. It did not ask Android which network was active, associate an address
with a default route, or classify ARC-only interfaces.

On the physical Chromebook, interface enumeration returned:

1. `eth0` — `100.115.92.2/30`, the ARC control-side address; and
2. `eth5` — `100.115.92.22/30`, Android's active Wi-Fi network, with default
   route through `100.115.92.21`.

The first-address algorithm therefore displayed `100.115.92.2`. Moving to
Android's active `Network` and `LinkProperties` correctly selects `eth5` for
ordinary Android networking, but still returns the ARC-private
`100.115.92.22`, not the Chromebook host's physical IPv4; the implemented
ChromeOS policy suppresses that IPv4 from peer-facing presentation.

Relevant Android APIs:

- [`ConnectivityManager.getLinkProperties`](https://developer.android.com/reference/android/net/ConnectivityManager#getLinkProperties(android.net.Network))
- [`LinkProperties.getLinkAddresses`](https://developer.android.com/reference/android/net/LinkProperties#getLinkAddresses())
- [`NetworkInterface`](https://developer.android.com/reference/java/net/NetworkInterface)

### Observed ARCVM topology and reachability

The 2026-08-01 physical test used ChromeOS 150, the public Android `v0.2.0` APK
for product behavior, and a same-source debug APK for repeatable controls. A
known file was served on port `18080` for the detailed probe.

| Layer | Observed address | Meaning | External IPv4 client result |
|---|---|---|---|
| Android `eth0` | `100.115.92.2/30` | ARC control network and first enumerated IPv4 | Timed out |
| Android `eth5` | `100.115.92.22/30` | Active Android Wi-Fi view and ChromeOS DNAT target | Timed out |
| ChromeOS `arc_wlan0` | `100.115.92.21/30` | Host side of Android's active link | Not a client URL |
| ChromeOS `wlan0` | `192.168.1.106/24` | Chromebook's physical LAN IPv4 | `200 OK`, exact body hash |
| Android `eth5` global IPv6 | `2a02:…:b22f/64` | NDP-proxied Android IPv6 on the physical LAN | `200 OK`, directly to the Android IPv6 |

With **Available on local network** enabled, the server bound `0.0.0.0` and an
external Mac fetched the known file through the Chromebook's `192.168.1.106`
address. The same client could not route either `100.115.92.x` address. With
LAN access disabled, the server bound `127.0.0.1`; Android loopback still
returned `200`, while the host ARC addresses and Chromebook LAN IPv4 refused
the connection. This proves that ChromeOS forwarding preserves the app's bind
scope rather than bypassing it.

The public `v0.2.0` product smoke showed the same defect on port `8080`: the app
displayed `http://100.115.92.2:8080`, while the usable external URL was the
Chromebook LAN IPv4 with port `8080`.

### ChromeOS supplies the IPv4 forwarding

The device's `apply_auto_dnat_to_arc` NAT chain preserved an existing
ChromeOS-host socket first, then destination-NATed new inbound TCP and UDP
connections arriving on `wlan0` to `100.115.92.22`. This behavior is not a
router mapping created by 200 OK.

ChromiumOS Patchpanel documents inbound firewall DNAT for ARC, and its source
implements the same ordering observed on the device: accept an existing host
socket, then DNAT new TCP and UDP traffic to the active ARC address.

- [Patchpanel overview](https://chromium.googlesource.com/chromiumos/platform2/+/HEAD/patchpanel/README.md)
- [`Datapath::AddInboundIPv4DNAT`](https://chromium.googlesource.com/chromiumos/platform2/+/HEAD/patchpanel/datapath.cc)

Consequences:

- a ChromeOS Android app does not need UPnP for same-LAN IPv4 access;
- the externally useful IPv4 is owned by ChromeOS and is not present in
  Android's interface list;
- changing only the Android interface-selection heuristic cannot discover that
  host IPv4; and
- the same port is correct on both sides unless a ChromeOS host socket already
  owns it.

### JSTorrent comparison

The current JSTorrent Android source separates local interface discovery from
UPnP:

- `NetworkBindings.kt` enumerates non-loopback IPv4 interfaces in the same way
  as 200 OK and parses `/proc/net/route` for a default gateway;
- `PortMappingManager` discovers Internet Gateway Devices through SSDP, reads
  `GetExternalIPAddress`, tries to find an Android interface on the router's
  subnet, and otherwise falls back to the first Android interface; and
- `GatewayDevice` passes that selected interface as UPnP
  `NewInternalClient`.

The physical JSTorrent probe produced a useful negative result:

1. ChromeOS forwarded SSDP, so JSTorrent found the physical router at
   `192.168.1.1` and read its public WAN address.
2. JSTorrent saw only `100.115.92.2/30` and `100.115.92.22/30`; its
   `/proc/net/route` gateway parser returned `null` under ARC.
3. No Android interface matched the router's subnet, so JSTorrent logged the
   mismatch and fell back to `100.115.92.2`.
4. The router rejected `AddPortMapping` with HTTP 500 and UPnP error 606,
   `Action not authorized`.
5. JSTorrent nevertheless reported both mappings as successful because
   `MinimalHttpClient` returns non-2xx responses and `GatewayDevice.soapAction`
   does not check `statusCode`. A subsequent mapping query found no entry.

Source comparison:

- [JSTorrent Android network bindings](https://github.com/kzahel/jstorrent/blob/main/android/quickjs-engine/src/main/kotlin/com/jstorrent/quickjs/bindings/NetworkBindings.kt)
- [JSTorrent port-mapping manager](https://github.com/kzahel/jstorrent/blob/main/packages/engine/src/port-mapping/port-mapping-manager.ts)
- [JSTorrent UPnP gateway](https://github.com/kzahel/jstorrent/blob/main/packages/engine/src/port-mapping/gateway-device.ts)
- [JSTorrent minimal HTTP client](https://github.com/kzahel/jstorrent/blob/main/packages/engine/src/utils/minimal-http-client.ts)

Therefore JSTorrent currently demonstrates that SSDP and the WAN-IP query can
traverse ARC. It does **not** demonstrate discovery of the Chromebook's LAN
IPv4, a valid router mapping, or a verified external listening address. The
UPnP `GetExternalIPAddress` result is the router's public address, not any
`192.168.1.x` address.

This distinction also follows the protocols. UPnP `AddPortMapping` requires an
explicit internal client; PCP detects an unexpected NAT between the client and
the controlled router and requires each NAT layer to be handled. ARC is such an
inner NAT boundary.

- [UPnP WANIPConnection:1 service](https://upnp.org/specs/gw/UPnP-gw-WANIPConnection-v1-Service.pdf)
- [RFC 6887, Port Control Protocol](https://www.rfc-editor.org/rfc/rfc6887.html)

### Address-presentation paths

#### 1. Active-network addresses

Source now replaces arbitrary interface order with
`ConnectivityManager.activeNetwork` and `LinkProperties`, classifies active
IPv4 and IPv6 records, and refreshes through a default-network callback. It
presents Wi-Fi/Ethernet addresses for both families, withholds cellular/VPN
addresses from LAN presentation, and exposes the directly reachable global
IPv6 seen on ChromeOS. Finding IPv6 does not suppress the IPv4 URL or
instructions.

This alone cannot discover ChromeOS's numeric host IPv4; the accepted manual
instruction below covers that limitation for the basic release.

#### 2. Deferred: mDNS service advertisement

This is not part of the basic corrective release. A future convenience feature
may prototype a stable local hostname/service for the running server. Patchpanel
explicitly proxies mDNS between ARC and physical networks and rewrites mDNS A
records that point to an Android guest IPv4 so they point to the ChromeOS
physical LAN IPv4. That is the platform behavior needed here.

- [Patchpanel mDNS/SSDP forwarding](https://chromium.googlesource.com/chromiumos/platform2/+/HEAD/patchpanel/README.md)
- [mDNS guest-to-LAN A-record rewriting](https://chromium.googlesource.com/chromiumos/platform2/+/HEAD/patchpanel/multicast_forwarder.h)

The prototype must prove that a normal external client can resolve the emitted
name and fetch the file over IPv4, not merely that Android registered a
service. It must also cover collision handling, network changes, start/stop,
port `0`, and ordinary Android devices.

#### 3. Chrome extension host-address lookup

Do not plan around `chrome.system.network`. Chromium exposes that permission to
ordinary extensions only on the Dev channel; Stable permits only platform apps
and a small extension allowlist. The store extension cannot rely on it.

- [Chromium `system.network` permission availability](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/api/_permission_features.json)

ChromeOS application availability has the same public/private boundary. The
store extension can identify `cros` through `runtime.getPlatformInfo`, but the
internal `chromeosInfoPrivate.playStoreStatus` API is allowlisted. The accepted
intent, fallback, unsupported-device, and future Crostini behavior now lives in
[`chromeos-extension-launcher.md`](../topics/chromeos-extension-launcher.md).

#### 4. Accepted manual IPv4 behavior

The implemented ChromeOS UI hides Android-owned IPv4 addresses and says that
other devices should use the Chromebook's IPv4 address with the displayed
port, including the ChromeOS Settings path for finding it. Loopback remains the
on-device URL. This is less convenient than automatic discovery but true.

## Work ledger

### E1 — make the extension a complete launcher

- [x] Send the desktop missing-app action directly to `/download` instead of
      the general platform section.
- [x] Keep ChromeOS out of native messaging and retain the packaged
      `ok200://launch` intent.
- [x] Make the ChromeOS retry/error action retry the Android route, not the
      desktop native-message handler.
- [x] Replace the ambiguous no-app fallback promise with distinct actions:
      **Open installed Android app** is best effort, while the prominent
      `ok200.app/chromeos` HTTPS route owns installation, explicit Play,
      unsupported-device alternatives, and honest Crostini status.
- [x] Preserve explicit secondary ChromeOS-options and Google Play links.
- [x] Add tests for installed-app intent construction, no-app options,
      ChromeOS retry, desktop launch, and unsupported platform behavior.

### E2 — make the extension artifact publishable

- [x] Assign the next extension version; `0.1.4` is the expected next value
      unless a store-side version already consumed it.
- [x] Expand `extension/CHANGELOG.md` to cover ChromeOS intent launch, the
      explicit options route, launcher copy, desktop destination, and packaging
      fixes.
- [x] Make `scripts/package-extension.sh` use the store-safe build mode,
      recreate the ZIP from an empty destination, and reject development keys,
      localhost origins, and source maps.
- [x] Run extension routing tests in the extension-specific CI workflow.
- [x] Inspect the produced ZIP in CI: version, minimal permissions, expected
      files, no development key/origin/maps, and tag-to-manifest version match.
- [x] Retain the tag workflow's `SKIP_INJECT_KEY=1` behavior.

### E3 — align public copy and install surfaces

- [ ] Update the Chrome Web Store name, short description, overview, and
      screenshots to describe a launcher, not an in-extension server.
- [x] Remove website copy saying the new listing “will be updated once ready”
      and replace it with the current launcher/platform split.
- [x] Replace any claim that “all features” live in the extension with the
      extension-plus-native-app platform split.
- [x] Confirm all desktop links resolve to accepted `v0.1.5` installers and the
      Linux default remains AppImage.
- [ ] Confirm the Play listing reflects the accepted branding and delivered
      Android version before claiming it does.

### A1 — replace Android's first-interface URL heuristic

- [x] Introduce a testable network-address resolver based on the active Android
      network and `LinkProperties`.
- [x] Return address records with interface, prefix, family, scope, and a clear
      “usable from another device” classification instead of one string.
- [x] Format IPv6 URLs with brackets and preserve the exact `http://` scheme.
- [x] Refresh on network callbacks rather than only activity resume.
- [x] Unit-test ordinary Wi-Fi, cellular/VPN withholding, multiple interfaces,
      IPv6-only, dual-stack, link-local-only, and the observed ARC topology.

### A2 — make ChromeOS URL presentation truthful

- [x] Detect ARC through `org.chromium.arc` or
      `org.chromium.arc.device_management` system features.
- [x] Never label an Android-owned IPv4 address on ChromeOS as the address for
      other LAN devices.
- [x] Continue showing loopback as the on-device URL.
- [x] Always provide honest Chromebook-address instructions for IPv4 clients,
      including on dual-stack networks.
- [x] Additionally show directly reachable global/ULA IPv6 addresses when
      present and prove them from a separate client.
- [x] Keep copy explicit that HTTPS is not implemented.
- [x] Defer a user-facing IPv6 enable/disable control until listener binding,
      persistence, and lifecycle behavior receive a separate product decision.

### A3 — mDNS convenience layer deferred

- [x] Keep mDNS out of the basic corrective release; the accepted manual IPv4
      behavior passed on physical ChromeOS.
- [ ] Register a bounded `_http._tcp` service only while the server is running.
- [ ] Determine whether Android NSD can provide a stable, user-typeable
      hostname; use a small owned responder only if system NSD cannot meet the
      URL contract.
- [ ] From an external IPv4-only client, verify the advertised A record resolves
      to the Chromebook's physical LAN IPv4 and fetches the exact file.
- [ ] Verify phone/tablet behavior, name collision handling, Wi-Fi changes,
      sleep/reliable-background policy, port `0`, stop, and process restart.
- [ ] If this gate fails, remove the prototype and retain the honest manual
      fallback rather than shipping a sometimes-dead URL.

### A4 — keep WAN mapping separate

- [x] Do not copy JSTorrent's UPnP implementation into 200 OK as part of LAN
      address cleanup.
- [x] Record the accepted future roadmap, security decisions, native ownership,
      UPnP/NAT-PMP/PCP double-NAT behavior, error handling, renewal, cleanup,
      and inbound verification requirements in
      [`internet-exposure-and-port-mapping.md`](../topics/internet-exposure-and-port-mapping.md).
- [ ] Keep any implementation in a future bounded tactical after the current
      Android LAN-address and extension publication work closes.

### Release ownership

- Engineering work in this tactical covers source fixes, automated tests,
  candidate artifacts, digests, and physical-device validation.
- Release tags are created only after the maintainer explicitly requests them;
  that authorization was given for `extension-v0.1.4` and `android-v0.2.1`.
- The maintainer owns Chrome Web Store and Google Play uploads, submissions,
  review responses, rollout, and release management.
- Investigation, a passing candidate, or a requested fix never implies
  authorization to tag, upload, or publish.

### P1 — publish and prove the launcher destination

- [x] Engineering: inspect an exact source-candidate ZIP and record its digest.
- [x] Engineering: install that ZIP unpacked on physical ChromeOS and repeat
      installed-app, one-task, no-app options, and Play-link checks. Server
      reachability remains covered by the Android validation above.
- [x] Engineering: deploy and verify the production
      `https://ok200.app/chromeos` options route.
- [x] Engineering: after authorized versioning, inspect the exact `0.1.4`
      release ZIP and record its digest.
- [x] Maintainer: upload and submit the exact ZIP to the Chrome Web Store;
      completion reported 2026-08-02.
- [x] Maintainer: upload and submit the exact Android `0.2.1` AAB to Google
      Play; completion reported 2026-08-02.
- [ ] Maintainer/device proof: verify the updated extension arrives through
      store delivery on an existing controlled profile.
- [ ] Maintainer/device proof: install/update Android through the chosen Play
      track and repeat folder, configuration, launch, displayed-URL, and
      external-fetch checks.
- [ ] Record the store-served extension and Android versions separately from
      source or sideload evidence.

## Validation matrix

| Gate | Environment | Required evidence |
|---|---|---|
| Extension logic | Unit tests | Desktop, ChromeOS installed, ChromeOS missing, retry, explicit installer link |
| Extension package | CI and local inspection | Exact version, permissions, destinations, no dev key/origin/maps, clean ZIP |
| Android address resolver | JVM tests | Active-network selection, address scope, IPv6 formatting, ARC fixtures |
| Android ordinary LAN | Phone or tablet plus second client | Displayed IPv4/IPv6 fetches exact file; LAN-off refuses |
| ChromeOS IPv4 | Physical Chromebook plus second IPv4 client | No ARC URL shown; advertised/manual Chromebook URL remains present and fetches the exact file even when IPv6 is available |
| ChromeOS IPv6 | Physical Chromebook plus second IPv6 client | Additional bracketed Android IPv6 URL fetches exact file when available |
| ChromeOS mDNS | Deferred future convenience | Not a gate for the basic address correction |
| Launcher with app | Store extension plus Play app | Intent offers 200 OK in ChromeOS's system confirmation, then opens/focuses one Android task |
| Launcher without app | Store extension, app absent | Prominent HTTPS options route opens independently of the intent and exposes the exact Play listing |
| Store delivery | Existing controlled installs | Served versions and artifacts match the accepted candidates |

## Evidence recorded on 2026-08-01

- ChromeOS testbed doctor passed all eight checks before device work.
- Exact public Android `v0.2.0` intent and server behavior were exercised;
  detailed controls used a same-source debug APK.
- External IPv4 fetch through the Chromebook address returned the exact body;
  both ARC-private IPv4 addresses timed out from that client.
- LAN-off bound loopback and refused host/physical ingress.
- Android's global IPv6 returned the exact file directly from the external
  client.
- The corrected debug candidate reported ChromeOS through the ARC system
  feature, classified active `eth5` IPv4 as `chromeos_guest`, and exposed only
  the global IPv6 as a concrete another-device URL. The visible Compose UI
  contained the bracketed IPv6, Chromebook IPv4 instructions with port
  `18080`, and loopback; accessibility inspection found no ARC address.
- From the external Mac, both `http://192.168.1.106:18080/probe.md` and the
  displayed bracketed Android IPv6 returned the exact README fixture with
  SHA-256 `01f53618e0c8fd94ee9cd4864104f0b3dd7ab85ca51d9e6dea3a34a17b5817dd`.
  The ARC address timed out. With LAN disabled, Android loopback returned the
  same hash while Chromebook IPv4 and Android IPv6 both refused ingress.
- Android JVM address-policy tests, compile, lint, and all five physical
  ChromeOS instrumentation tests passed. The temporary application/test APKs,
  fixture, forwarded port, and server were removed; no 200 OK package existed
  on the Chromebook before or after this validation.
- The minified release APK builds as package `app.ok200.android`, version
  `0.2.0`/code 5, and contains no QuickJS, bundled engine, or debug-RPC
  artifacts. Repository typecheck, JavaScript tests, and lint pass. This local
  build is source validation, not an authorized release tag or upload.
- Patchpanel's live NAT rules matched its documented auto-DNAT source.
- A coexisting, temporary JSTorrent audit build proved SSDP router discovery,
  the two ARC addresses, no default gateway from its parser, router mapping
  rejection, and JSTorrent's false-positive status handling.
- The pre-existing JSTorrent `1.0.23` app and data were not replaced. Temporary
  audit apps, APKs, roots, and the running 200 OK server were removed; the
  original JSTorrent package remained at its original install/update times.

## Source evidence recorded on 2026-08-02

- Public extension APIs expose the `cros` platform class but not Android app or
  Play availability. Chromium's `chromeosInfoPrivate.playStoreStatus` exists
  only behind an allowlisted private permission, so the product contract now
  explicitly forbids pretending to detect it.
- The earlier missing-app physical test uninstalled 200 OK but did not disable
  Google Play. A later explicitly authorized testbed run removed Play and
  Android apps and now supplies the separate disabled-state evidence recorded
  below. Play-unsupported and managed-policy fixtures remain open.
- An exact store-safe source package reproduced a second missing-app behavior:
  ChromeOS left the extension-created `intent:` tab blank and ignored its
  encoded HTTPS fallback. A timed tab replacement was rejected because it can
  replace the tab while the user is still responding to ChromeOS's **Open
  with** prompt. Source instead makes the installed-app and guaranteed HTTPS
  options paths separate explicit choices and leaves the system prompt alone.
- Exact source-candidate ZIP `0.1.3`, SHA-256
  `0000c1194ed65f576c7fc56ecbf3412393c64635c053c332ddac7e447e04fd46`,
  passed the package inspector and was installed unpacked on Stable ChromeOS.
  With 200 OK installed, the package displayed ChromeOS's **Open with** chooser
  naming 200 OK; confirming **Open** launched exactly
  `app.ok200.android/.MainActivity`, and the intent tab closed.
- After removing only the sideloaded 200 OK app, while preserving
  `com.android.vending`, the same package's prominent options action opened
  exactly `https://ok200.app/chromeos` and its Play action opened the exact
  `app.ok200.android` listing. The source-built page passed physical visual
  review; the release evidence below records its later production deployment.
- Popup-level tests now cover permanent ChromeOS options/Play links, absence of
  native messaging, Android-route retry, direct desktop download, and an
  unsupported platform. Pure route/intent tests cover all supported desktop
  values and the exact owned options route.
- The generated ChromeOS options page explains model/account limitations,
  another-device alternatives, and Crostini as unproven future work. The stale
  website “once ready” and universal-feature claims are removed in source.
- Local store packaging builds in fresh temporary staging, emits no key,
  localhost origin, source map, or source file, and passes an allowlisted-file,
  permission, origin, and manifest inspector for both directory and ZIP. The
  extension workflow runs the same package path and enforces tag/version match.

## Release evidence recorded on 2026-08-02

- GitHub Pages run `30734359055` deployed `https://ok200.app/chromeos` and
  production returned `200` with the exact Android intent/package, Play link,
  honest Play-unavailable alternatives, and future-Crostini copy.
- `extension-v0.1.4` points to commit `9a49a4c`. GitHub Actions run
  `30734453353` passed all thirteen routing/popup tests, strict package
  inspection, tag/version matching, and release publication. The final
  132,936-byte ZIP contains nine allowlisted files and has SHA-256
  `bd7947c7aff9f5162455f97e0dddd6f36e111ddd9e3ecaf793eff7a0680482f7`.
- `android-v0.2.1` points to commit `3a80442`. GitHub Actions run
  `30734434763` passed debug build, JVM tests, lint, API-30 emulator
  instrumentation, guarded version/changelog checks, signed APK/AAB builds,
  and release publication.
- Bundletool validates the final 4,157,113-byte AAB. Its manifest and the
  2,158,203-byte APK report `app.ok200.android`, version `0.2.1`, code 6,
  minimum SDK 26, and target SDK 36. The signing certificate matches the prior
  release, and APK/AAB scans find no QuickJS, old JNI/C++ server payload,
  bundled engine, or debug-RPC provider. SHA-256 values are
  `a96bf8fdf2eb66e82c192f4fb976603388662274bddc14881d3f4b4fee44b0e6`
  (AAB),
  `4b01d1212c02a7432896a19ef2187659cca3e00e63ce5984e94fc70f37d257c9`
  (APK), and
  `b1e123a51eabe5c95128f79159d82c71a03abf0893c4fa8bfaec920926968c87`
  (2,214,059-byte compressed mapping).
- The GitHub releases are engineering handoffs, not store delivery. The
  maintainer reported submitting the exact AAB and ZIP on 2026-08-02 and still
  owns review, rollout, and controlled store-served validation.

## Follow-up physical evidence recorded on 2026-08-02

- On the explicitly authorized ChromeOS testbed, removing Google Play and
  Android apps left the exact extension `0.1.4` popup unchanged. Its Android
  action still produced a blank `intent:` tab, while its separate HTTPS
  options action opened the live `https://ok200.app/chromeos` route.
- From that options page, **View on Google Play** opened the ChromeOS Play
  setup and current Terms dialog rather than a passive web listing. The
  Settings Play entry remained available as a setup action. Future website
  copy must warn users who deliberately decline Play to skip Android actions;
  an ordinary extension still cannot detect this state.
- The same device proved a focused Crostini fallback is feasible. Current
  `ok200-core` built as a 2,404,648-byte x86_64 release binary, served Linux and
  shared ChromeOS folders at `localhost` and `penguin.linux.test`, and launched
  from a non-terminal ChromeOS Launcher entry into Chrome.
- External LAN access was blocked until TCP port `18080` was added to
  ChromeOS's Linux **Port forwarding** settings, then returned HTTP 200 at the
  Chromebook host IPv4; removing the port blocked it again.
- Temporary Crostini binaries, launcher entries, services, build files, and
  the ChromeOS LAN port-forwarding entry for `18080` were removed, and the
  Linux VM was stopped. Play remains disabled because restoring it would
  require accepting Google Play terms and choices.
- [Tactical 012](012-chromeos-crostini-fallback.md) owns the resulting mini-Rust
  installer, controller, files, lifecycle, architecture, and public-launch
  work. Crostini is not part of the submitted release claim.

## Completion criteria

Close this tactical only when:

- the exact extension artifact is launcher-honest, store-safe, versioned, and
  covered by routing/package tests;
- ChromeOS never presents an ARC-private IPv4 as another-device LAN URL;
- the accepted mDNS or manual IPv4 contract and direct IPv6 contract pass on a
  physical Chromebook from separate clients;
- installed-app and missing-app launcher paths pass from the store-delivered
  extension;
- the Play-delivered Android candidate passes configuration, folder, URL, and
  external-fetch checks; and
- the Android runtime and legacy migration topics contain the accepted final
  behavior and evidence.
