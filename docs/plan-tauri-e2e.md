# Plan: Tauri WebDriver E2E Tests

Status: **historical implementation plan.** The initial Tauri E2E harness was
added in February 2026 under `desktop/tauri-app/e2e/`. Preserve useful
black-box cases, but the Rust-core migration and current E2E acceptance are
owned by
[Tactical 000](tactical/000-desktop-native-core-and-release-readiness.md).

## Current note

The E2E cases now configure the Rust-owned desktop server commands, use the
visible Start/Stop controls, and fetch from the external test process. The
standalone TypeScript project passes `tsc --noEmit`.

The original harness below invokes `tauri-driver` directly. That remains usable
on Windows/Linux but cannot be executed directly on macOS. A follow-up should
migrate it to Tauri's current cross-platform WebdriverIO service and test-only
plugins; until then, Tactical 003 records macOS E2E execution as pending.

## Historical context

The TypeScript engine was originally wired as the HTTP server in the Tauri
desktop app, but there were no E2E tests verifying it end-to-end. The CLI had
comprehensive E2E tests (`packages/cli/src/e2e/cli.test.ts`) covering file
serving, directory listing, 404s, path traversal, CORS, and related behavior.

**Approach**: WebdriverIO + `tauri-driver` on Linux. WebdriverIO drives the app UI (type directory, click Start), then Node.js `fetch()` from the test process verifies the HTTP server responds correctly. Local testing first, CI later.

## Prerequisites (manual, before running tests)

```bash
cargo install tauri-driver --locked
sudo apt install webkit2gtk-driver xvfb   # Linux only
```

## Files to Create/Modify

### 1. Add `data-testid` attributes to `desktop/tauri-app/src/App.tsx`

Add test IDs to all interactive elements for stable selectors:
- `data-testid="dir-input"` on directory input
- `data-testid="port-input"` on port input
- `data-testid="start-btn"` / `data-testid="stop-btn"` on buttons
- `data-testid="server-url"` on the URL link
- `data-testid="error-msg"` on the error paragraph

### 2. Create `desktop/tauri-app/e2e/` (standalone, NOT a workspace member)

Keeps WebdriverIO deps isolated from the main project. Uses `npm install` independently.

**`package.json`** — WebdriverIO v8 (v9 has known issues with `tauri-driver`, per [tauri#10670](https://github.com/tauri-apps/tauri/issues/10670)):
- `@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter` (all `^8.38.2`)
- `ts-node`, `typescript`

**`wdio.conf.ts`** — Configuration:
- Binary path: `../../target/debug/ok200-desktop` (relative from e2e dir)
- `onPrepare`: Build app via `pnpm tauri build --debug --no-bundle` (skip with `SKIP_BUILD=1`)
- `beforeSession`: Spawn `tauri-driver` on port 4444, poll `/status` until ready
- `afterSession`: Kill `tauri-driver`
- `maxInstances: 1`, Mocha framework, 60s timeout

**`helpers/fixtures.ts`** — Mirrors CLI E2E fixture setup:
- Creates temp dir with `index.html`, `hello.txt`, `sub/nested.txt`
- Creates second dir without index.html (for directory listing test)
- Cleanup function for `afterAll`

**`helpers/app.ts`** — Page object helpers:
- `setDirectory(dir)`, `setPort(port)`, `clickStart()`, `clickStop()`
- `waitForServerUrl(timeout)` — waits for `[data-testid="server-url"]` to appear, returns URL text
- `getError()` — reads error message if present

**`specs/server.e2e.ts`** — Test cases (mirroring CLI E2E):

| Test | What it does |
|------|-------------|
| Prevents start when no directory | Clear the root through the native command, assert Start is disabled |
| Starts server and displays URL | Enter dir + port 0, click Start, assert URL appears |
| Serves file with correct content-type | `fetch(url/hello.txt)` → 200, text/plain, correct body |
| Serves index.html for directory | `fetch(url/)` → 200, contains `<h1>Home</h1>` |
| Returns 404 for missing file | `fetch(url/nonexistent)` → 404 |
| Blocks path traversal | `fetch(url/../../etc/passwd)` → no sensitive data leaked |
| Shows directory listing | Start server on no-index dir, `fetch(url/)` → lists filenames |
| CORS headers present | Enable CORS, then `fetch(url/)` → `access-control-allow-origin: *` |
| Stop makes server unavailable | Click Stop, assert URL disappears, fetch rejects |

**Not testing** (not exposed in current UI): SPA mode, upload mode, SIGTERM shutdown.

## Execution

```bash
# Local (Linux with display)
cd desktop/tauri-app/e2e && npm install && npm test

# Headless Linux
cd desktop/tauri-app/e2e && npm install && xvfb-run npm test

# Skip rebuild when iterating on tests
SKIP_BUILD=1 npm test
```

## Verification

1. All 9 test cases pass locally on Linux
2. `pnpm typecheck` still clean (e2e dir is standalone, won't affect workspace typecheck)
3. `pnpm lint` still clean
