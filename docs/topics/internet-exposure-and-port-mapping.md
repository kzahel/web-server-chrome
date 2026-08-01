# Internet Exposure and Port Mapping

Topic: internet-exposure-and-port-mapping

Status: **automatic router port mapping is an accepted future roadmap
capability. It is deferred and is not implemented or advertised by the current
desktop, Android, or launcher releases.**

Last reconciled: **2026-08-01**.

The obsolete pre-native QuickJS/Tauri-adapter implementation sketch has been
removed; repository history retains it if historical archaeology is needed.
Current desktop work must use the Rust runtime described in
[`desktop-runtime.md`](desktop-runtime.md), and current Android work must use
the Kotlin runtime described in
[`android-runtime.md`](android-runtime.md). The ChromeOS LAN-address correction
is separately sequenced in
[Tactical 011](../tactical/011-extension-launcher-and-chromeos-network-readiness.md).

## Product decision

200 OK Web Server should eventually regain an explicit **Also on internet**
capability. UPnP IGD is part of that capability. NAT-PMP and PCP remain useful
companion protocols, but their inclusion and delivery order are not yet
accepted release scope.

The feature creates and manages a router mapping from a public/WAN port to the
running native server. It is not:

- a way to discover a device's ordinary LAN address;
- a substitute for binding the server to the local network;
- a responsibility of the Chrome extension launcher; or
- proof that the mapped server is reachable from the public Internet.

Port mapping must remain off by default and require an explicit user action.
The UI must distinguish LAN URLs, a router-reported public address, and an
independently verified public endpoint.

## Immediate sequencing

The ChromeOS release gap is not waiting for this roadmap feature. Android
source now stops presenting an ARC-private address as a usable LAN URL; that
correction still needs a follow-up candidate and Play-delivered build. The
extension's ChromeOS destination is not promotion-ready until the fixed
Play-delivered app passes a second-device fetch.

UPnP work starts later as its own bounded tactical. It must not be folded into
the LAN-address correction or used to delay that release.

## Address and exposure model

| Identity | Example owner | What it means |
|---|---|---|
| Loopback | app/device | Available only on the same device |
| LAN address | phone, computer, or Chromebook host | Reachable by peers on the local network when binding and firewalls allow it |
| ARC guest address | Android VM/container on ChromeOS | Internal ChromeOS transport address; not a peer-facing LAN URL |
| Router external address | Internet gateway | WAN address returned by UPnP or another mapping protocol; may itself be private or behind CGNAT |
| Verified public endpoint | external probe result | Public address and port actually shown to accept the intended server connection |

Discovery, mapping, and verification are separate operations. A successful
`GetExternalIPAddress` call does not create a mapping. A successful
`AddPortMapping` response does not prove that upstream NAT, carrier policy,
firewalls, or the server permit an inbound connection.

## Legacy product baseline

The Chrome App implemented an opt-in `optDoPortMapping` setting labelled
**Also on internet**. When LAN binding was enabled, it:

1. used SSDP to discover UPnP Internet Gateway Devices;
2. read the gateway's external address;
3. chose a local `/24` address that appeared to match the gateway;
4. enumerated existing mappings;
5. requested a same-port TCP mapping with lease duration `0`; and
6. displayed the external HTTP URL after a successful SOAP response.

Disabling the setting requested mapping removal. The implementation is valuable
product-history evidence, not code to transplant. Its assumptions include a
`/24` LAN, one suitable gateway, same internal/external port, an indefinite
lease, no independently verified inbound connection, and no clear stop/crash
cleanup. Its own source notes unresolved port collisions and network-interface
changes.

Relevant historical sources:

- [`legacy/upnp.js`](../../legacy/upnp.js)
- [`legacy/webapp.js`](../../legacy/webapp.js)
- [`legacy/react-ui/nojsx/options.js`](../../legacy/react-ui/nojsx/options.js)

## Current evidence

The 2026-08-01 ChromeOS/JSTorrent comparison established these constraints:

- SSDP and UPnP SOAP traffic can traverse ARC and reach the physical router.
- `GetExternalIPAddress` returns the router's WAN identity, not the
  Chromebook's physical LAN IPv4.
- Android inside ARC sees guest addresses such as `100.115.92.x`, while an
  UPnP `NewInternalClient` mapping needs an address meaningful to the router.
- The tested router rejected JSTorrent's mapping request with HTTP 500 and UPnP
  error 606, but JSTorrent reported success because its SOAP layer did not
  reject non-2xx responses. No mapping existed afterward.
- ChromeOS already auto-DNATs inbound traffic addressed to the Chromebook's LAN
  IPv4 and server port into the Android guest. Same-LAN access therefore works
  without router port mapping.

Do not port JSTorrent's manager without repairing response validation and
proving the selected internal client. The evidence and source comparison are
recorded in Tactical 011.

The protocol distinction is also explicit in the standards:

- [UPnP WANIPConnection:1](https://upnp.org/specs/gw/UPnP-gw-WANIPConnection-v1-Service.pdf)
  requires an internal client as part of `AddPortMapping`.
- [RFC 6886](https://www.rfc-editor.org/rfc/rfc6886.html) defines NAT-PMP.
- [RFC 6887](https://www.rfc-editor.org/rfc/rfc6887.html) defines PCP,
  including detection of an unexpected NAT between client and server.

## Target product contract

An eventual release should provide:

- a per-server, default-off **Also on internet** control;
- a plain-language exposure warning before the first mapping;
- the requested internal port and a configurable or conflict-resolved external
  port;
- status that distinguishes unsupported, discovering, mapping, mapped but
  unverified, verified, renewing, failed, and removal failed;
- the router-reported external address and actual assigned external port;
- bounded leases with renewal while the server is running;
- best-effort removal on disable, server stop, configuration change, network
  change, and graceful app shutdown;
- stale-mapping reconciliation after a crash or restart;
- exact SOAP/protocol error reporting rather than optimistic success;
- collision handling that never deletes a mapping not owned by this app; and
- an external verification path before the UI calls an endpoint publicly
  reachable.

The description/ownership token should identify 200 OK and the particular
server instance without exposing private user information.

## Security gate

The current server can expose an arbitrary selected folder over unauthenticated
plain HTTP. Extending that listener to the public Internet materially changes
the risk even though the underlying files are already intentionally served on
the LAN.

Before publication, an accepted product decision must specify:

- whether authentication is required for mapped listeners;
- whether HTTP is allowed with an explicit warning or HTTPS is required;
- certificate and reverse-proxy expectations if HTTPS is offered;
- whether write/upload features, if present, are prohibited by default;
- how the UI explains public exposure, address sharing, and shutdown cleanup;
- whether mapping state persists across application restarts; and
- whether telemetry or an external verification service is used, including
  its privacy contract.

Authentication and TLS should be treated as the default release prerequisite.
Shipping unauthenticated public exposure would require a separately recorded,
explicit exception rather than inheriting the legacy behavior accidentally.

## Runtime ownership

Do not revive the old generic TypeScript native-I/O adapter plan.

- **Desktop:** discovery, SOAP/protocol handling, leases, and cleanup belong in
  native Rust alongside the Rust server/controller boundary.
- **Android:** they belong in native Kotlin alongside
  `AndroidServerController`, using Android network APIs and lifecycle policy.
- **Chrome extension:** it may launch the installed app or point to installers;
  it does not discover gateways, own mappings, or keep them alive.
- **Cross-platform:** share behavior specifications, protocol fixtures, state
  names, and black-box tests where practical; do not force both native runtimes
  through a deleted JavaScript socket abstraction.

UPnP discovery requires UDP multicast and an HTTP/SOAP client. Android must
manage multicast permissions/locks and network binding explicitly. Desktop
firewall behavior and Android background execution must be included in the
lifecycle design rather than treated as packaging details.

## ChromeOS and multi-NAT handling

ChromeOS is a special mapping topology:

```text
Internet
   |
router public mapping
   |
Chromebook physical LAN address
   |
ChromeOS automatic ARC DNAT
   |
Android server
```

An ARC-private address must never be sent blindly as UPnP's
`NewInternalClient`. A ChromeOS implementation needs a proved way to make the
router target the Chromebook's physical LAN address while retaining ChromeOS's
automatic forwarding to Android.

The future spike must test, rather than assume:

- whether the mDNS work used for LAN presentation can also help establish the
  host address needed by a controller;
- whether NAT-PMP's source-address behavior survives ARC SNAT usefully;
- whether PCP reports an address mismatch across ARC, as the protocol is
  designed to do;
- whether any UPnP router safely accepts a mapping to a host address not visible
  in Android's interface list; and
- whether independently verified inbound traffic reaches the Android server.

If no reliable and safe mapping exists, ChromeOS should report the feature as
unsupported rather than claim success. Ordinary Android phones/tablets and
desktop platforms can still ship port mapping independently.

## Protocol and failure requirements

- Treat transport errors, non-2xx HTTP, malformed XML, SOAP faults, protocol
  result codes, timeouts, and verification failures as distinct outcomes.
- Validate service type, control URL resolution, response size, and XML parsing
  defensively; router responses are untrusted network input.
- Never infer a `/24` subnet. Use actual prefix lengths and routes.
- Support multiple interfaces and gateways without mapping through a VPN,
  cellular network, or unrelated adapter accidentally.
- Detect private, documentation, loopback, link-local, and CGNAT external
  addresses and avoid calling them publicly reachable.
- Do not depend on NAT hairpinning for verification; probe from outside the
  mapped network.
- IPv6 exposure and firewall pinholes are a separate design surface and must
  not be described as IPv4 NAT port mapping.

## Validation matrix

| Gate | Required evidence |
|---|---|
| Protocol parsing | Unit fixtures for success, faults, malformed XML, non-2xx responses, timeouts, and oversized input |
| Mapping lifecycle | Add, renew, change, disable, stop, crash/restart reconciliation, and ownership-safe removal |
| Router compatibility | Accepting and rejecting UPnP IGDs, no-UPnP router, collision, multiple gateways, and assigned-port variation |
| Network topology | Direct public IP, ordinary NAT, double NAT, CGNAT, VPN, network change, and offline recovery |
| Desktop | Physical macOS, Windows, and Linux server plus external-network fetch |
| Android | Physical phone/tablet lifecycle and external-network fetch |
| ChromeOS | Correct internal target through ARC or an explicit unsupported result; never ARC-address success |
| Security | Default off, warning/consent, authentication/TLS decision, no unintended write exposure, cleanup disclosure |
| Public verification | A nonce-bearing resource fetched from a genuinely external client; same-LAN hairpin is insufficient |

## Recommended activation sequence

1. Close the current Android LAN-address and extension publication tacticals.
2. Decide authentication, HTTP/HTTPS, verification, and persistence policy.
3. Run read-only platform probes for gateway discovery and topology; do not
   create mappings during discovery tests.
4. Open a bounded native implementation tactical, with UPnP required and
   NAT-PMP/PCP scope decided explicitly.
5. Implement mapping, renewal, cleanup, and truthful state before public URL
   presentation.
6. Pass physical-router and genuinely external inbound validation before any
   store copy claims **Also on internet**.

## Known open decisions

- UPnP-only first delivery versus a unified UPnP/NAT-PMP/PCP manager.
- Same external port by default versus automatic conflict-resolved assignment.
- Authentication and HTTPS minimums.
- External verification mechanism and privacy model.
- Mapping persistence across app/server restarts.
- Whether ChromeOS is supported in the first port-mapping release.
- Whether IPv6 firewall/pinhole management belongs in this topic or a sibling
  concern.
