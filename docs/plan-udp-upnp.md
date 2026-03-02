# Plan: Add UDP + Port Mapping (UPnP / NAT-PMP / PCP)

## Goal
Port UDP socket infrastructure from JSTorrent and implement automatic port mapping supporting all three standard protocols — UPnP IGD, NAT-PMP, and PCP — on desktop (Tauri) and Android (QuickJS).

## Background

Three protocols exist for automatic NAT port mapping:

| Protocol | Spec | Transport | Complexity | Used by |
|----------|------|-----------|------------|---------|
| **UPnP IGD** | UPnP Forum, 2001+ | UDP multicast (SSDP) + HTTP/SOAP | High | Most consumer routers |
| **NAT-PMP** | RFC 6886, 2005 | UDP to gateway:5351 | Low | Apple AirPort (discontinued 2018), miniupnpd |
| **PCP** | RFC 6887, 2013 | UDP to gateway:5351 | Medium | Successor to NAT-PMP. miniupnpd, OpenWrt, newer routers |

NAT-PMP and PCP are simple UDP request/response protocols — no multicast discovery, no HTTP, no SOAP, no XML. Once we have UDP sockets (the hard part), adding them is cheap.

See: [GitHub issue #293](https://github.com/kzahel/web-server-chrome/issues/293)

## Architecture Summary
Three adapter layers implementing the same `ISocketFactory` + `IUdpSocket` interfaces:
- **Node.js** — CLI, uses `dgram`
- **Native/QuickJS** — Android, uses `__ok200_*` globals backed by Kotlin
- **Tauri** — Desktop, uses `invoke()`/`listen()` backed by Rust

## Step 1: Engine interfaces — Add UDP to `ISocketFactory`

**File: `packages/engine/src/interfaces/socket.ts`**
- Add `IUdpSocket` interface (from JSTorrent): `send()`, `onMessage()`, `close()`, `joinMulticast()`, `leaveMulticast()`
- Add `UdpSocketOptions` type: `{ bindAddr, bindPort }`
- Add `createUdpSocket(options?: UdpSocketOptions): Promise<IUdpSocket>` to `ISocketFactory`
- Add `NetworkInterface` type: `{ name, address, prefixLength }`
- Export new types from `packages/engine/src/index.ts`

## Step 2: Port mapping engine — UPnP + NAT-PMP + PCP

Directory: `packages/engine/src/port-mapping/`

### UPnP IGD (port from JSTorrent)

Copy and adapt from `~/code/jstorrent/packages/engine/src/upnp/`:
- `ssdp-client.ts` — SSDP M-SEARCH discovery (nearly identical, just fix imports)
- `gateway-device.ts` — UPnP SOAP control (needs MinimalHttpClient)

**Port dependency:**
- `packages/engine/src/utils/minimal-http-client.ts` — TCP-based HTTP client used by gateway-device for SOAP. Adapt: `toString()` → `decodeToString()`, change User-Agent, add `SocketPurpose` type if needed.

### NAT-PMP (new)

- `nat-pmp-client.ts` — Simple UDP client (~100 lines)
  - Send mapping request to default gateway on port 5351
  - Binary protocol: 12-byte request, 16-byte response
  - Operations: get external IP, create/destroy port mapping
  - Handles retry with exponential backoff per RFC 6886 §3.1 (initial 250ms, doubling, max 9 attempts)

### PCP (new)

- `pcp-client.ts` — Extends NAT-PMP concepts (~150 lines)
  - Same gateway:5351 endpoint
  - Binary protocol: 24-byte header + variable opcodes
  - Operations: MAP (port mapping), PEER (outbound mapping), ANNOUNCE
  - Supports IPv6 and third-party mappings
  - Backward compatible: PCP server on a NAT-PMP-only device returns version mismatch, allowing fallback

### Unified manager

- `port-mapping-manager.ts` — Replaces the old "upnp-manager" concept
  - Auto-detects which protocol the router supports
  - Try order: PCP → NAT-PMP → UPnP IGD (modern first, heaviest last)
  - PCP/NAT-PMP: send to default gateway:5351, fast fail (~2s timeout)
  - UPnP: SSDP multicast discovery, slower but broadest compatibility
  - Common interface: `addMapping()`, `removeMapping()`, `getExternalAddress()`, `refresh()`
  - Periodic renewal (NAT-PMP/PCP mappings have server-assigned lifetimes)
  - Cleanup on shutdown (best-effort removal of mappings)
  - Description string: "200 OK Web Server"

### Default gateway detection

- `gateway.ts` — Get default gateway IP for NAT-PMP/PCP
  - Node.js: parse `ip route` (Linux), `netstat -rn` (macOS/Windows), or use `default-gateway` npm package
  - Android: available via `__ok200_get_default_gateway` native binding
  - Tauri: `invoke("get_default_gateway")` backed by Rust

## Step 3: Node.js adapter — `NodeUdpSocket`

**File: `packages/engine/src/adapters/node/node-socket.ts`**
- Add `NodeUdpSocket` class implementing `IUdpSocket` using Node's `dgram` module
- Add `createUdpSocket()` to `NodeSocketFactory`

**File: `packages/engine/src/adapters/node/node-network.ts`** (new)
- `getNetworkInterfaces()` using `os.networkInterfaces()` → `NetworkInterface[]`
- `getDefaultGateway()` — parse OS routing table or use `default-gateway` package

## Step 4: Android adapter — QuickJS native bindings + Kotlin

### TypeScript side:
**File: `packages/engine/src/adapters/native/native-udp-socket.ts`** (new)
- Port from JSTorrent's `native-udp-socket.ts`
- Uses `__ok200_udp_*` global functions

**File: `packages/engine/src/adapters/native/bindings.d.ts`**
- Add `__ok200_udp_bind`, `__ok200_udp_send`, `__ok200_udp_close`, `__ok200_udp_join_multicast`, `__ok200_udp_leave_multicast`
- Add `__ok200_udp_on_bound`, `__ok200_udp_on_message`
- Add `__ok200_get_network_interfaces`
- Add `__ok200_get_default_gateway`

**File: `packages/engine/src/adapters/native/native-socket-factory.ts`**
- Add `createUdpSocket()` method

### Kotlin side:
**`android/io-core/src/main/kotlin/app/ok200/io/socket/UdpSocketManager.kt`** (new)
- Port interface + callback from JSTorrent

**`android/io-core/src/main/kotlin/app/ok200/io/socket/UdpSocketService.kt`** (new)
- Port `UdpSocketManagerImpl` + `UdpConnection` from JSTorrent
- Include Android `MulticastLock` handling

**`android/quickjs-engine/src/main/kotlin/app/ok200/quickjs/bindings/UdpBindings.kt`** (new)
- Port from JSTorrent, register `__ok200_udp_*` functions on QuickJS context

**`android/quickjs-engine/src/main/kotlin/app/ok200/quickjs/bindings/NativeBindings.kt`**
- Add UDP service creation, binding registration, event dispatching
- Add UDP dispatchers (JS glue code like existing TCP dispatchers)
- Add `__ok200_get_default_gateway` binding (Android `ConnectivityManager` → `LinkProperties.routes`)

## Step 5: Tauri desktop adapter — Rust commands + TS adapter

### TypeScript side:
**`packages/engine/src/adapters/tauri/tauri-udp-socket.ts`** (new)
- `TauriUdpSocket` implementing `IUdpSocket`
- `send()` → `invoke("udp_send", ...)`
- `onMessage()` → `listen("udp-recv", ...)`
- `close()` → `invoke("udp_close", ...)`
- `joinMulticast()` → `invoke("udp_join_multicast", ...)`

**`packages/engine/src/adapters/tauri/tauri-socket-factory.ts`** (new)
- `TauriSocketFactory` implementing `ISocketFactory`
- `createUdpSocket()` → `invoke("udp_bind", ...)`, returns `TauriUdpSocket`
- TCP methods: `invoke("tcp_*")` (stub or implement alongside — needed for MinimalHttpClient/UPnP SOAP)

**`packages/engine/src/adapters/tauri/tauri-network.ts`** (new)
- `getNetworkInterfaces()` → `invoke("get_network_interfaces")`
- `getDefaultGateway()` → `invoke("get_default_gateway")`

### Rust side:
**`desktop/tauri-app/src-tauri/Cargo.toml`**
- Add: `tokio` (with net, rt), `socket2` (SO_REUSEADDR), `if-addrs` (network interfaces)
- Add: `netstat2` or equivalent for default gateway detection

**`desktop/tauri-app/src-tauri/src/udp.rs`** (new)
- UDP socket manager: bind, send, recv loop, multicast join/leave
- Tauri commands: `udp_bind`, `udp_send`, `udp_close`, `udp_join_multicast`, `udp_leave_multicast`
- Recv loop emits `udp-recv` events via `app.emit()`

**`desktop/tauri-app/src-tauri/src/network.rs`** (new)
- `get_network_interfaces` command using `if-addrs` crate
- `get_default_gateway` command (parse OS routing table)

**`desktop/tauri-app/src-tauri/src/lib.rs`**
- Register new commands in `.invoke_handler()`

## Step 6: Tests

- Unit tests for `SSDPClient` response parsing (mock UDP socket)
- Unit tests for `GatewayDevice` XML parsing
- Unit tests for NAT-PMP request/response encoding/decoding
- Unit tests for PCP request/response encoding/decoding
- Unit tests for `PortMappingManager` protocol fallback logic (mock all three)
- Unit test for `NodeUdpSocket` bind/send/recv
- Rust tests for UDP socket manager

## Not in scope (for now)
- Full TCP adapter for Tauri (only what UPnP needs — MinimalHttpClient can use Node.js TCP on CLI, Tauri TCP commands on desktop)
- Filesystem adapter for Tauri
- Extension lifecycle simplification
- IPv6-specific PCP features (PEER opcode, third-party mappings)
