# Legacy Chrome App Migration

How we migrate ~200k users from the legacy "Web Server for Chrome" Chrome App to the new Chrome Extension.

> **Cross-reference:** JSTorrent has a parallel migration effort with the same architecture.
> See `~/code/jstorrent/docs/project/legacy-migration.md`. Changes here should be reflected there and vice versa.

## IDs

| Component | ID |
|---|---|
| Legacy Chrome App | `ofhbbkphhbklhfoeikjpcbhemlocgigb` |
| New Chrome Extension | `lpkjdhnmgkhaabhimpdinmdgejoaejic` |

## Chrome 144 Impact (Jan 2026)

Chrome 144 completely blocks Chrome App launches at the OS level on ChromeOS.

**What still works:**
- `chrome.runtime.onStartup` — fires on every browser boot. Background page loads, all code executes. **Primary migration channel.**
- `chrome.runtime.onInstalled` — fires on CWS update push
- `chrome.alarms` — repeating alarms still fire
- Event page script load — executes on any event that wakes the background page
- `chrome.runtime.onMessageExternal` — websites and extensions can still message the legacy app, which wakes it
- `chrome.browser.openTab` — can force-open browser tabs (has `browser` permission)
- `chrome.management.uninstallSelf` — shows confirmation dialog, lets app remove itself
- `chrome.notifications` — notifications still display
- `chrome.app.window.create` — still works when triggered via non-launch events (startup, alarm, etc.)
- Uninstall URL redirect — catches users who manually remove the app

**What's broken:**
- `chrome.app.runtime.onLaunched` — **never fires**. Launcher blocked at OS level. User clicks icon → one-time dialog: "Chrome apps stopped running on ChromeOS devices in July 2025." Subsequent clicks silently do nothing.

## Migration Nag System

### Configuration (`legacy/background.js`)

All nag triggers call `showMigrationNags()` which does two things: shows a notification AND opens the migrate window.

```javascript
MIGRATE_ON_SCRIPT_LOAD = true   // nag every time the event page loads (any event)
MIGRATE_ON_STARTUP = true       // nag on chrome.runtime.onStartup (browser boot)
MIGRATE_ON_INSTALLED = true     // nag on chrome.runtime.onInstalled (install/update)
MIGRATE_ON_LAUNCHED = true      // nag on chrome.app.runtime.onLaunched (daily throttle) — dead after Chrome 144
MIGRATE_USE_ALARM = true        // repeating alarm every 10 minutes
MIGRATE_ALARM_MINUTES = 10      // alarm interval
MIGRATE_SET_UNINSTALL_URL = true // set uninstall URL to ok200.app/uninstall
```

Currently experimenting with maximum aggressiveness to see what's effective. Not yet finalized.

### Trigger Flow

1. **Script load** — Event page loads for any reason → `showMigrationNags('scriptLoad')`
2. **onStartup** — Browser boots → `showMigrationNags('onStartup')`
3. **onInstalled** — App installed/updated from CWS → sets uninstall URL, creates repeating alarm, `showMigrationNags('onInstalled')`
4. **onLaunched** — User opens app (daily throttle, ChromeOS only) → `showMigrationNags('onLaunched')` — **dead on Chrome 144+**
5. **Alarm** — Every 10 minutes → `showMigrationNags('alarm')`

### `showMigrationNags()` Flow

1. **Notification** (`showDeprecationNotification`):
   - Title: "Web Server for Chrome has moved!"
   - Message: "A new version is available as a Chrome Extension. Click here to upgrade."
   - `priority: 2`, `requireInteraction: true`
   - Click → opens migrate window
   - Stores `deprecationLastNotified` timestamp

2. **Migrate window** (`legacy/migrate.html`):
   - 400x420 Chrome App window
   - Pings new extension via `chrome.runtime.sendMessage(NEW_EXTENSION_ID, {type: 'ping'})`
   - If extension not installed: "Get the new extension" → links to `ok200.app/migrate?ref=legacy-app`
   - If extension installed: "You're all set! You can remove this old app" + "Remove old app" button (`chrome.management.uninstallSelf`)
   - "Remind me later" / "Keep for now" dismiss buttons

## External Messaging (`externally_connectable`)

Bidirectional messaging between legacy app, new extension, and ok200.app website.

### Legacy App Manifest (`legacy/manifest.json`)

```json
"externally_connectable": {
    "ids": ["lpkjdhnmgkhaabhimpdinmdgejoaejic"],
    "matches": ["https://ok200.app/*"]
}
```

Accepts messages from: new extension + ok200.app website.

### New Extension Manifest (`extension/public/manifest.json`)

```json
"externally_connectable": {
    "ids": ["ofhbbkphhbklhfoeikjpcbhemlocgigb"],
    "matches": ["https://ok200.app/*", "http://local.ok200.app/*"]
}
```

Accepts messages from: legacy app + ok200.app website (+ local dev).

### `onMessageExternal` Handlers

**Legacy app** (`legacy/background.js`):
- `ping` → responds `{ installed: true, version }` (detection by website/extension)
- `launch` → opens the main app window, responds `{ launched: true }`

**New extension** (`extension/src/sw.ts`):
- Guards: only responds to legacy app ID or `https://ok200.app/` origin
- `ping` → responds `{ installed: true, version }` (detection by website/legacy app)

### Detection Pattern

Used by `migrate.html`, `ok200.app/migrate`, and `ok200.app/uninstall`:

```javascript
chrome.runtime.sendMessage(targetId, { type: 'ping' }, function(response) {
    if (chrome.runtime.lastError || !response?.installed) {
        // not installed
    } else {
        // installed, version = response.version
    }
})
// 2-3 second timeout fallback
```

## Website Pages

### `/migrate` (`website/src/pages/migrate.astro`)

- Detects both legacy app and new extension via ping
- Shows status cards: "Legacy Chrome App" / "New Extension" with install state
- "Launch Web Server" button if legacy app detected (sends `{type: 'launch'}`)
- "Install extension" CWS link if extension not detected

### `/uninstall` (`website/src/pages/uninstall.astro`)

- Set as uninstall URL: `https://ok200.app/uninstall?ref=legacy-app`
- Detects new extension via ping
- States: "You're all set!" (extension installed) / "Thanks for using..." + CWS link (not installed) / platform message (not Chrome)

## Deploy & Test Scripts

| Script | Purpose |
|---|---|
| `scripts/deploy-legacy-chromebook.sh` | rsync `legacy/` to Chromebook via SSH for unpacked testing |
| `scripts/deploy-extension-chromebook.sh` | Build extension, rsync `dist/` to Chromebook, reload via CDP |
| `scripts/package-legacy.sh` | ZIP `legacy/` for CWS upload |

### Testing on Chromebook

```bash
# Deploy legacy app
./scripts/deploy-legacy-chromebook.sh
# Load as unpacked at chrome://extensions (Developer mode)

# Deploy extension
./scripts/deploy-extension-chromebook.sh
# Load as unpacked at chrome://extensions

# Both can be loaded simultaneously for testing the migration flow
```

## Migration Channels (ranked by reach)

1. **CWS update push** — `onStartup` fires on every boot. Reaches all installed users. Package with `scripts/package-legacy.sh` and upload to CWS.
2. **ok200.app/migrate** — Landing page for users arriving from nag notifications/windows. Detects both apps, guides through install.
3. **ok200.app/uninstall** — Catches users who manually remove the legacy app. Redirects to extension if not installed.
4. **CWS listing update** — Update description to say app has been replaced. Users who can't launch will visit the listing page.

## Open Questions

- Can we still push updates to the legacy Chrome App on CWS?
- Are Chrome App CWS updates still being delivered to existing installs on ChromeOS?
- Should we force-open a browser tab on every startup (`chrome.browser.openTab`)? Currently showing notification + window.
- What's the right aggressiveness level? Currently testing maximum.

## Files

| File | Purpose |
|---|---|
| `legacy/background.js` | Migration nag system, all triggers and config |
| `legacy/manifest.json` | Legacy app manifest with `externally_connectable` |
| `legacy/migrate.html` | In-app migration window UI |
| `extension/src/sw.ts` | New extension service worker, `onMessageExternal` handler |
| `extension/public/manifest.json` | New extension manifest with `externally_connectable` |
| `website/src/pages/migrate.astro` | ok200.app/migrate page |
| `website/src/pages/uninstall.astro` | ok200.app/uninstall page |
| `scripts/deploy-legacy-chromebook.sh` | Deploy legacy app to Chromebook |
| `scripts/deploy-extension-chromebook.sh` | Deploy extension to Chromebook |
| `scripts/package-legacy.sh` | Package legacy app for CWS upload |
