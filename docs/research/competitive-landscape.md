# Competitive Landscape & Positioning

Status: dated positioning research. Current platform/runtime truth lives in
[`../topics/desktop-runtime.md`](../topics/desktop-runtime.md) and
[`../topics/android-runtime.md`](../topics/android-runtime.md).

## Direct Competitors

### Simple Web Server (the fork)
- Electron app, ~100MB+ install
- Windows/macOS/Linux, no mobile
- Free, open source (MIT)
- Polished docs site, 18 languages
- Feature-rich, maybe over-engineered (plugin system, .swshtaccess)
- Explicitly does NOT support ChromeOS

### Other GUI Web Servers
- **MAMP / MAMP PRO** - Apache/Nginx/MySQL bundle, heavy, $$$
- **XAMPP** - Apache/MySQL/PHP bundle, even heavier
- **Fenix Web Server** - Node-based, hasn't been updated in years
- **Caddy** - CLI-first, auto-HTTPS, not really GUI-oriented
- **Live Server (VS Code)** - Extension only, tied to VS Code

### CLI Tools People Actually Use
- `python -m http.server` - zero config, zero features
- `npx serve` - good for quick serving, no GUI
- `npx http-server` - similar
- `miniserve` (Rust) - fast, some features, CLI only
- `simple-http-server` (Rust) - CLI only

## Our Positioning: 200 OK Web Server

### Target differentiators

1. **Lightweight** - Tauri (Rust + webview) vs Electron bloat. ~5-15MB vs ~100MB+
2. **Native desktop performance** - target Rust core HTTP server, not a
   webview-hosted server
3. **ChromeOS + Android** - Nobody else does this well
4. **No nonsense** - No ads or upsells; any operational telemetry should stay
   minimal and explicitly documented
5. **Existing user base** - ~2k emails from Chrome extension migration

### Platform Strategy
| Platform | Tech | Priority |
|---|---|---|
| Windows | Tauri | P0 |
| macOS | Tauri | P0 |
| Linux | Tauri | P1 |
| Android | Compose + native Kotlin HTTP/storage core | Source complete; Play release is separate |
| ChromeOS | Android app launched by extension | Validate with the next Android release |
| iOS | Native (Swift?) or skip | P2 |

### Size Advantage
Tauri apps are dramatically smaller than Electron:
- Electron: 80-150MB installer
- Tauri: 3-15MB installer
- This matters for the "lightweight" positioning

## Distribution Channels

### Where Simple Web Server distributes
- Mac App Store
- Direct download (DMG, ZIP, EXE, DEB, RPM)
- GitHub releases

### Where we should distribute
- Mac App Store
- Microsoft Store
- Google Play Store (Android/ChromeOS)
- Direct download
- GitHub releases
- Homebrew / winget / apt (if CLI component exists)
- Possibly F-Droid for the privacy crowd

## Branding Notes

"200 OK" is memorable and self-explanatory to the target audience (developers).
The HTTP status code reference immediately communicates "web server" to anyone
who would want this tool.

Name options:
- **200 OK Web Server** - clear, descriptive
- **200ok** - short, domain-friendly
- **TwoHundred** - clean but less obvious
- Stick with whatever works for the app store name + CLI name
