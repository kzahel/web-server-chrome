# 006: Windows Desktop Validation

Status: **executed and remediated on native Windows; unsigned runtime and
per-user NSIS validation pass, while signed-release, tray, MSI-install, and
browser-extension proof remain pending.**

Topics:

- `desktop-native-core`
- `desktop-release-readiness`

Parent:
[`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md)

Planning baseline: clean macOS `main` at `f6c506e` on 2026-07-28. The Windows
agent must record the exact tested `origin/main` revision after this tactical
is pushed.

## Objective

Build and exercise the current Rust-core desktop application directly on a
native Windows development machine, record reproducible Windows-specific
defects, and establish whether the source tree is ready for a signed release
candidate.

This is source/runtime and unsigned-installer validation. It does not publish
a release, create a tag, modify the update server, or claim that local
artifacts are signed.

## Execution host

Preferred host: the native Windows 11 side of `REX`, user `sox`. The documented
environment includes PowerShell 7, full Git for Windows, Node through `fnm`,
Corepack/pnpm, Python, Rustup/Cargo, ripgrep, GitHub CLI, and VS Code.

Use native PowerShell 7 (`pwsh`), not WSL, so filesystem, WebView2, tray,
installer, registry, and native-dialog behavior are genuinely Windows-native.

## Agent authority and stopping rules

The Windows agent may:

- clone or fast-forward the repository;
- install repository dependencies from the frozen lockfile;
- build and run the application and unsigned local installers;
- create a small temporary serving fixture under the current user's temp
  directory;
- drive the app, browser, tray, and folder chooser;
- inspect user-level registry entries, processes, ports, logs, and installer
  metadata;
- install and uninstall the locally built test application; and
- update this tactical with evidence and commit it on a dedicated branch.

The agent must not:

- create or push a release tag;
- publish or edit a GitHub release;
- modify Remy, DNS, Caddy, or the update service;
- claim unsigned local installers prove Authenticode signing;
- expose secret values;
- make implementation fixes merely because validation found a defect; or
- delete broad directories or unrelated installed applications.

If a product or build defect is reproducible, record the exact failure,
minimal reproduction, relevant paths/logs, and recommended fix, then continue
with independent checks where safe. Stop at a review checkpoint if a fix is
required to proceed.

## Preflight

Run from a short native path such as
`C:\Users\sox\code\web-server-chrome` to reduce Windows path-length noise.

```powershell
$ErrorActionPreference = 'Stop'
git status --short --branch
git fetch origin
git switch main
git pull --ff-only
git rev-parse HEAD

$PSVersionTable.PSVersion
git --version
node --version
corepack --version
pnpm --version
rustc --version
cargo --version
rustup show active-toolchain
rg --version
```

Record:

- tested commit;
- Windows edition, version, and build;
- architecture;
- WebView2 runtime version;
- tool versions above; and
- pre-existing worktree changes, installed 200 OK applications, and listening
  server processes.

Do not overwrite an unrelated dirty checkout. Use a fresh clone or dedicated
worktree if necessary.

## Source validation

From the repository root:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test

Push-Location desktop
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
Pop-Location

pnpm --filter @ok200/desktop build
pnpm --filter @ok200/desktop tauri build --no-sign --bundles nsis,msi
```

Record pass/fail, elapsed time, warnings, and the exact NSIS/MSI paths and
SHA-256 hashes.

The current WebdriverIO configuration is not a prerequisite for this
tactical. It assumes Unix binary names and PATH separators and has not been
made Windows-ready. Do not spend this validation slice repairing that harness.
The agent-driven UI smoke plus external PowerShell requests are the acceptance
path here.

## Unsigned installer checks

For each locally built installer:

1. Run `Get-AuthenticodeSignature` and record that unsigned is expected.
2. Install through the normal user-visible flow.
3. Record install location, application version, Start Menu entry, uninstaller,
   and bundle identifier/product name.
4. Confirm only one expected 200 OK installation is visible.
5. Uninstall before testing the other installer format.
6. Confirm the application process and installed program entry are removed.

Unsigned/SmartScreen warnings are expected for this local slice. Do not weaken
machine-wide Windows security settings to suppress them.

## Product smoke

Create a fixture beneath a unique current-user temp directory containing:

- `hello.txt` with known text;
- an `index.html`;
- a subdirectory with a file; and
- a directory without an index for listing behavior.

Then drive the installed app and record evidence for:

- [ ] launches at the compact portrait default with correct 200 OK branding;
- [ ] follows Windows light/dark preference;
- [ ] native folder picker selects the fixture without typed path entry;
- [ ] empty folder state cannot start;
- [ ] port `0` selects an actual available port;
- [ ] Start transitions once through Starting to Running;
- [ ] repeated Start interaction cannot create another listener;
- [ ] displayed URL opens in the default browser;
- [ ] Copy places the exact URL on the Windows clipboard;
- [ ] `Invoke-WebRequest` fetches `hello.txt` with the expected body and MIME
      type outside the webview;
- [ ] index files, missing paths, directory listings, icons, metadata, and
      parent navigation behave correctly;
- [ ] CORS, SPA mode, directory-listing toggle, and LAN access behave as
      configured;
- [ ] settings are locked while running with the local explanation;
- [ ] Stop transitions once to Stopped and the old URL becomes unreachable;
- [ ] configuration survives a full quit and relaunch;
- [ ] closing the window honors Run in Background;
- [ ] tray Show App, settings checkmarks, and Quit work;
- [ ] Start at Login changes only the expected current-user startup state;
- [ ] “Check for Updates” focuses the existing window, reaches the deployed
      service with reason `manual`, and shows an in-app result; and
- [ ] a launch check occurs at most once within the 24-hour successful-check
      window.

Use PowerShell rather than an in-webview fetch for the external server proof.
Capture the URL, response status, headers, body, and post-Stop connection
failure.

## Native messaging and extension

After installer smoke:

- [ ] inspect the current-user Chrome/Chromium native-messaging registry
      entries created by the installer;
- [ ] verify the referenced manifest and native host executable exist;
- [ ] run the native host's safe diagnostic/update-check mode if available;
- [ ] if a compatible development extension is already installed, launch or
      reveal 200 OK through it and verify the correct app instance responds;
      and
- [ ] otherwise record extension launch as blocked by missing browser test
      setup rather than silently passing it.

Do not install or publish a store extension as part of this tactical.

## Release-boundary checks

The Windows agent should inspect the source workflow and report whether its
observed artifact names match the fail-closed release validator. It must keep
these conclusions separate:

- local NSIS/MSI build and product smoke;
- local unsigned installer behavior;
- CI-produced Windows artifact availability; and
- actual Azure Trusted Signing evidence.

`Get-AuthenticodeSignature` must report `Valid` on the eventual CI/release
EXE and MSI before the release-readiness topic can mark Windows signing
complete. That signed-artifact test is follow-up if no signed candidate is
available during this run.

## Evidence update

The Windows agent must append:

- execution date and machine;
- tested commit and tool/OS versions;
- command result table;
- installer filenames, hashes, and signature status;
- completed product-smoke checklist;
- native messaging results;
- defects with minimal reproductions;
- items blocked by unavailable signed artifacts or extension setup; and
- the exact recommended next action.

Commit documentation-only evidence on a dedicated branch with:

```text
Record Windows desktop validation

Topic: desktop-release-readiness
```

Push the branch and stop for maintainer review. Do not merge it, tag a release,
or fix discovered product defects without further direction.

## Windows execution evidence: 2026-07-28

### Scope and host

Validation ran on native Windows in the short-path worktree
`C:\Users\sox\code\web-server-chrome-win-validation`, branch
`validation/windows-desktop-20260728`. The original clean checkout at
`C:\Users\sox\Documents\code\web-server-chrome` was preserved. The worktree
started from `origin/main` commit
`bc9f6c1421a1aa7361f6bd97b49a4bb6f19789f3`.

- Machine: `REX`
- User: `rex\sox`, a local Administrators member running this PowerShell and
  the tested app with a medium, non-elevated token
- OS: Microsoft Windows 11 Home 25H2, version `10.0.26200`, build
  `26200.8875`, 64-bit AMD64
- Windows app and system theme during the smoke: dark
- WebView2 runtime: `150.0.4078.105`
- PowerShell: `7.6.4`
- Git: `2.54.0.windows.1`
- Node: `v24.18.0`
- Corepack: `0.35.0`
- pnpm: `9.1.0`
- rustc: `1.96.0 (ac68faa20 2026-05-25)`
- Cargo: `1.96.0 (30a34c682 2026-05-25)`
- Rust toolchain: `stable-x86_64-pc-windows-msvc (default)`
- ripgrep: `15.1.0`

There was no pre-existing installed 200 OK application, 200 OK process,
native-messaging registration, or startup entry. Unrelated Node listeners
were present on loopback ports 3400 and 3402 and were left untouched.

### Source and build results

All commands ran in PowerShell 7 unless a different working directory is
shown. Elapsed times are wall-clock observations from this host.

| Command | Result | Elapsed time and evidence |
| --- | --- | --- |
| `corepack enable` | Pass | 0.096 s |
| `pnpm install --frozen-lockfile` | Pass | 10.369 s; 553 packages; Node emitted the `DEP0169` `url.parse()` deprecation warning |
| `pnpm typecheck` | Pass | 5.466 s |
| `pnpm test` | **Fail** | 1.694 s on the final reproduction; engine summary: 1 failed, 75 passed, 2 skipped. `packages/engine/src/server/web-server.test.ts:395` attempts to create the illegal Windows filename `hash#q?.txt`. |
| `Push-Location desktop; cargo fmt --all -- --check; Pop-Location` | Pass | 0.477 s |
| `Push-Location desktop; cargo clippy --workspace --all-targets -- -D warnings; Pop-Location` | **Fail** | 41.527 s; `desktop/host/src/main.rs:142:9`, `clippy::needless_return` on Rust 1.96.0 |
| `Push-Location desktop; cargo test --workspace; Pop-Location` before building | **Fail** | 29.851 s because Tauri required `tauri-app\src-tauri\binaries\ok200-host-x86_64-pc-windows-msvc.exe`, which did not yet exist |
| `pnpm --filter @ok200/desktop build` | Pass | 2.746 s; Vite built 51 modules, 220.60 kB JavaScript and 23.34 kB CSS |
| Literal documented `pnpm --filter @ok200/desktop tauri build --no-sign --bundles nsis,msi` | **Fail** | PowerShell split the comma expression and passed invalid bundle arguments |
| Quoted `--bundles 'nsis,msi'` with the original `PATH` | **Fail** | 4.044 s; `prepare-sidecar` selected `C:\Windows\System32\bash.exe` and entered WSL, where `rustc` was unavailable |
| `$env:PATH='C:\Program Files\Git\bin;'+$env:PATH; pnpm --filter @ok200/desktop tauri build --no-sign --bundles 'nsis,msi'` | Pass | 111.410 s; native Git-for-Windows Bash prepared the sidecar and Tauri built both unsigned installers |
| `Push-Location desktop; cargo test --workspace; Pop-Location` after sidecar preparation | **Fail** | 24.7 s; 7 real-socket core integration tests passed, but `desktop/core/tests/http_server.rs:144` also attempted to create `hash#q?.txt` and failed with Windows error 123 |
| `cargo test -p ok200-common -p ok200-host` | Pass | 3.733 s; 2 common, 12 host, and 1 native-messaging integration test passed |
| Core library and socket tests excluding the invalid-filename case | Pass | 9.874 s; 4 library and 7 integration tests passed |
| `pnpm --filter @ok200/desktop test` | Pass | 0.355 s of test runtime; all 6 update-check scheduling tests passed |
| `node --test .github/scripts/validate-desktop-release.test.mjs` | **Fail** | 5 passed, 1 failed. The Windows checksum test constructs `C:\C:\Users\sox\...write-release-checksums.mjs`. |

The successful Tauri build emitted five Rust warnings: two Windows-only unused
imports (`HashMap` and `MenuItemKind`), an unused `checked` variable, an
unnecessary mutable submenu builder, and a dead
`write_manifest_for_browser` function.

### Unsigned installer artifacts

`Get-AuthenticodeSignature` returned `NotSigned` for both local artifacts, as
expected for this tactical. These results do not establish Azure Trusted
Signing readiness.

| Format | Exact artifact | Bytes | SHA-256 | Signature |
| --- | --- | ---: | --- | --- |
| NSIS | `C:\Users\sox\code\web-server-chrome-win-validation\desktop\target\release\bundle\nsis\200 OK_0.1.3_x64-setup.exe` | 6,320,286 | `4587150E760510F4E8605C9C9DE60BD2873D449C9CCEC5A6409BFCD102293719` | `NotSigned` |
| MSI | `C:\Users\sox\code\web-server-chrome-win-validation\desktop\target\release\bundle\msi\200 OK_0.1.3_x64_en-US.msi` | 9,015,296 | `0F56153CA461A3F73A86F42BD693E4626D05B95EDCFE88CE3FE781021695D2B1` | `NotSigned` |

The MSI database identifies product `200 OK`, version `0.1.3`, manufacturer
`ok200`, product code `{858892DE-4215-41DE-B65F-31B8BDCF74D5}`, and upgrade
code `{8506B722-C919-5E33-889D-76937A21A125}`.

### Installer results

#### NSIS

The installer was launched through native Explorer and completed through its
normal visible flow. It created one current-user installed-program entry and:

- install directory: `C:\Users\sox\AppData\Local\200 OK`
- product/version: `200 OK` `0.1.3`, publisher `ok200`
- Start Menu entry:
  `C:\Users\sox\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\200 OK.lnk`
- desktop shortcut: `C:\Users\sox\Desktop\200 OK.lnk`
- uninstaller: `C:\Users\sox\AppData\Local\200 OK\uninstall.exe`

Installed executable evidence:

| File | Bytes | SHA-256 | Signature |
| --- | ---: | --- | --- |
| `ok200-desktop.exe` | 17,275,904 | `E6E5F27187EAE4BF0B878A434CEC4C7F6EDFA48CEE1D9F15AE098212AA564381` | `NotSigned` |
| `ok200-host.exe` | 2,378,752 | `81A5AEC349615ABEA8851639DFEA505C38809A51000AB919A1CFE748D30EF642` | `NotSigned` |
| `uninstall.exe` | 79,115 | `D74CEE6EE6636EF7FD00C339D08BCDA66A721EBE3FBBBCA7AFA588A978F0DBD5` | `NotSigned` |

After the smoke, running
`C:\Users\sox\AppData\Local\200 OK\uninstall.exe /S` returned exit code 0 in
1.588 s. The install directory, application process, both shortcuts, and the
installed-program entry were removed.

Windows Firewall retained two enabled private/public TCP and UDP query-user
allow rules for the removed executable path
`C:\users\sox\appdata\local\200 ok\ok200-desktop.exe`. They were recorded and
not removed because this run did not capture a preflight firewall-rule
baseline and should not delete possibly pre-existing security configuration.

#### MSI

The normal visible MSI wizard reached Welcome, the destination page, and
Ready to Install. It displayed the default destination as
`C:\Users\sox\AppData\Local\200 OK\`. Clicking the shielded Install button
raised the UAC secure desktop. Two attempts were allowed to wait for roughly
two minutes each; both elevation prompts timed out or were denied, and Windows
Installer then reported:

```text
200 OK setup was interrupted. Your system has not been modified.
```

After both attempts, neither the current-user nor machine uninstall registry
contained 200 OK, no install directory existed under Local AppData or Program
Files, and no 200 OK process remained. MSI install, launch, product smoke, and
uninstall are therefore **blocked by unavailable secure-desktop approval**,
not passed or treated as a product failure.

### Product smoke through the NSIS installation

The fixture was
`C:\Users\sox\AppData\Local\Temp\ok200-windows-validation-20260728-1511`.
It contained `hello.txt`, `index.html`, `subdir\nested.txt`,
`listing\alpha.txt`, `listing\space name.txt`, and an empty directory.
`hello.txt` was 34 bytes with SHA-256
`D393D23D0F494F22BEB919912DCEB034F7D3508B4A68CD45FAD5B77C6A45D184`.

| Check | Result | Evidence |
| --- | --- | --- |
| Compact launch and 200 OK branding | Pass | Portrait window measured approximately 410 by 700 content pixels and used the canonical yellow 200 OK mark and `200 OK Web Server` title. |
| Windows theme | Pass for the active preference | The app followed the host's dark app/system preference. The machine preference was not changed merely to force a second theme. |
| Empty state | Pass | With no folder selected the Start switch was disabled and displayed `Choose a folder...`. |
| Native folder picker | Pass | The Windows folder picker navigated to and selected the fixture without typing a path. |
| Automatic port | Pass | Port 0 produced ports 62063, 54015, 54020, and 58787 in separate runs. |
| Starting/Running and repeated Start | Partial | The first state capture 130 ms after activation already showed Running, so the transient Starting frame was not captured. The switch became Stop and each run had exactly one listener owned by the single desktop PID. |
| Browser and clipboard | Pass | The URL control opened Google Chrome at `http://127.0.0.1:62063`; Chrome rendered the fixture index. Copy placed that exact URL on the Windows clipboard. |
| External HTTP | Pass | PowerShell requests outside the webview returned the expected status, MIME type, headers, and exact bodies. |
| Directory listing | Pass | `/listing/` returned branded responsive HTML with file icons, byte sizes, modification times, parent navigation, and `/listing/space%20name.txt`. |
| Directory-listing toggle | Pass | With listing disabled, `/listing/` returned 404 and `Not Found`. |
| CORS | Pass | With CORS enabled, both successful and 404 responses included `Access-Control-Allow-Origin: *`. |
| SPA mode | Pass | `/client/route/that/does/not/exist` returned status 200, `text/html; charset=utf-8`, and the exact fixture `index.html`. |
| LAN access | Pass | The app displayed its share confirmation, bound `0.0.0.0:58787`, and served `hello.txt` through both `172.26.240.1` and Ethernet address `192.168.1.107`. |
| Locked settings | Pass | While running, folder, port, and option controls were disabled with `Stop the server to change this setting`; the Serving options card showed `LOCKED`. |
| Stop and old URL | Pass | Stop removed the listener. A request to the old port timed out, and the listener count was zero. |
| Persistence | Pass | A full process exit and relaunch restored the fixture path, port 0, LAN on, directory listing off, CORS on, and SPA on from `%APPDATA%\app.ok200.desktop\server.json`. |
| Run in Background | Pass | Closing the window hid it while the same PID remained alive. Launching 200 OK again showed the existing single instance rather than starting a second process. |
| Tray Show App, checkmarks, and Quit | **Blocked** | The Windows tray menu is not exposed as a targetable app window, and the approved UI automation layer forbids Windows-key/system-tray shortcuts. Manual tray assistance was requested but was not available during the run. |
| Start at Login | **Blocked** | Baseline HKCU Run and Startup-folder state were empty. The only product control is in the inaccessible tray menu, so the toggle and registry delta were not exercised. |
| Manual in-app update check | **Blocked in UI; service path passed** | The tray command could not be invoked. A direct request to the configured endpoint with `X-Check-Reason: manual` returned 204, and installed `ok200-desktop.exe --check-update` returned exit 0 with `%APPDATA%\ok200-native\update-check-result.json` containing `{"available": false}`. |
| Launch update cadence | Pass | The successful launch check stored `1785246680205` (`2026-07-28T15:51:20.205+02:00`) under `ok200.desktop.last-successful-update-check`. A full relaunch inside 24 hours left that value unchanged. All six schedule unit tests also passed. |

Representative baseline external HTTP results at
`http://127.0.0.1:62063`:

| Path | Status | Content type | Body/result |
| --- | ---: | --- | --- |
| `/` | 200 | `text/html; charset=utf-8` | exact 179-byte `index.html` |
| `/hello.txt` | 200 | `text/plain; charset=utf-8` | `200 OK Windows validation fixture` plus newline |
| `/subdir/nested.txt` | 200 | `text/plain; charset=utf-8` | exact fixture body |
| `/missing.txt` | 404 | `text/plain; charset=utf-8` | `Not Found` |
| `/listing/` | 200 | `text/html; charset=utf-8` | 4,985-byte branded listing |
| `/listing/space%20name.txt` | 200 | `text/plain; charset=utf-8` | `space` plus newline |

Enabling LAN access caused Windows Security to create the firewall rules above
and left a `PickerHost.exe` dialog intercepting the app after the HTTP proof.
The exact prompt process was dismissed without changing firewall policy so the
remaining app checks could continue.

### Native messaging and extension

The installed application did not create any of these expected current-user
keys:

- `HKCU\Software\Google\Chrome\NativeMessagingHosts\app.ok200.native`
- `HKCU\Software\Chromium\NativeMessagingHosts\app.ok200.native`
- `HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.ok200.native`
- `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\app.ok200.native`

`C:\Users\sox\AppData\Local\app.ok200.desktop\app.ok200.native.json` was also
absent. The installed app stores `ok200-host.exe` in the install root, while
runtime sidecar resolution searches `binaries\ok200-host[-<triple>].exe`.
The NSIS postinstall hook also did not produce its expected manifest or keys.

A direct framed-stdio diagnostic against the installed host passed handshake,
ping, unknown-action error handling, and clean exit after stdin close:

```json
[
  {"action":"handshake","name":"ok200-host","version":"0.1.3"},
  {"action":"pong"},
  {"action":"launch","ok":false,"error":"could not find 200 OK.exe"},
  {"error":"unknown action: bogus"}
]
```

The launch action searches beside the host for `200 OK.exe`, but both
installers package the desktop binary as `ok200-desktop.exe`. Extension launch
is **blocked** because none of the inspected Chrome, Edge, Brave, or Chromium
profiles contains compatible extension ID
`lpkjdhnmgkhaabhimpdinmdgejoaejic`. No extension was installed for this
tactical.

### Release boundary

The local build produced filenames with a space:

```text
200 OK_0.1.3_x64-setup.exe
200 OK_0.1.3_x64_en-US.msi
```

The fail-closed validator requires:

```text
200.OK_0.1.3_x64-setup.exe
200.OK_0.1.3_x64_en-US.msi
```

That contract mismatch would reject unrenamed local/Tauri Windows output.

The current-main workflow run
[`30360772050`](https://github.com/kzahel/web-server-chrome/actions/runs/30360772050)
at the tested commit completed its `build-tauri (windows-latest)` job
successfully, but the overall workflow failed at `test-desktop` / `Lint native
Rust crates`, `finalize-release` was skipped, and the run exposes zero
downloadable artifacts. The published
[`desktop-v0.1.3`](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.3)
release has macOS and Linux assets but no Windows EXE or MSI. No CI/release
Windows candidate was therefore available for an independent
`Get-AuthenticodeSignature` check.

### Reproducible defects

1. **JavaScript and Rust listing tests use an illegal Windows filename.**
   Minimal reproductions:

   ```powershell
   pnpm --filter @ok200/engine exec vitest run src/server/web-server.test.ts -t 'directory listing escapes and encodes special filenames in links'
   Push-Location desktop
   cargo test -p ok200-core --test http_server lists_directories_with_safe_links_and_can_disable_listings
   Pop-Location
   ```

   Both attempt `hash#q?.txt`; `?` is illegal in a Windows filename.
   Recommended fix: make filesystem fixture names platform-valid while
   retaining URL escaping coverage, and test `?` as a request/query character
   rather than an on-disk Windows name.

2. **Rust 1.96 clippy fails the workspace.** Minimal reproduction:

   ```powershell
   Push-Location desktop
   cargo clippy -p ok200-host --all-targets -- -D warnings
   Pop-Location
   ```

   `desktop/host/src/main.rs:142:9` reports `clippy::needless_return`.
   Recommended fix: make the host source warning-clean on the current stable
   toolchain or pin the accepted toolchain consistently.

3. **The documented Windows build command and sidecar preparation are not
   PowerShell-native as written.** The comma must be quoted, and unqualified
   `bash` selects the Windows WSL launcher before Git Bash on this host.
   Recommended fix: quote `'nsis,msi'` in the PowerShell runbook and make
   `prepare-sidecar` select a known native Windows shell or provide a
   PowerShell implementation.

4. **`cargo test --workspace` depends on a prepared Tauri sidecar.** Running
   source tests in the documented order fails before tests because the
   target-triple sidecar does not exist. Recommended fix: make tests
   independent of packaging preparation or prepare the sidecar before the
   workspace test step.

5. **The release-validator checksum test constructs an invalid doubled drive
   path on Windows.** Minimal reproduction:

   ```powershell
   node --test --test-name-pattern "writes stable checksums only for assets retained in the release" .github/scripts/validate-desktop-release.test.mjs
   ```

   Node tries to load
   `C:\C:\Users\sox\code\web-server-chrome-win-validation\.github\scripts\write-release-checksums.mjs`.
   Recommended fix: use URL/path APIs that preserve an already-absolute
   Windows path.

6. **Installed native messaging is not registered, and host launch targets the
   wrong executable name.** Minimal reproduction: install the NSIS bundle,
   launch once, inspect the four HKCU keys and manifest path above, then send
   `{"action":"launch"}` through the installed host's native-messaging frame.
   Recommended fix: align sidecar lookup, installer layout/hooks, manifest
   generation, process-kill names, and host launch with the packaged
   `ok200-desktop.exe`, then add Windows installer integration coverage.

7. **Local Windows artifact names do not match the fail-closed release
   contract.** Minimal reproduction: build the quoted NSIS/MSI bundle command
   and compare the two output basenames with
   `.github/scripts/validate-desktop-release.mjs`. Recommended fix: choose one
   canonical naming contract and enforce it in both the bundler/upload flow
   and validator.

8. **NSIS uninstall leaves Windows Firewall allow rules for the removed
   executable.** Minimal reproduction: accept the LAN firewall prompt, stop
   and uninstall 200 OK, then inspect firewall application filters containing
   `ok200-desktop.exe`. Recommended next step: decide whether installer
   cleanup owns these OS-created query-user rules and document or implement
   that policy.

### Blocked checks and review checkpoint

- MSI install/launch/uninstall smoke is blocked by unavailable UAC
  secure-desktop approval after two cleanly rolled-back normal-flow attempts.
- Tray Show App, settings checkmarks, tray Quit, Start at Login, and the
  manual in-app updater result are blocked by the automation layer's inability
  to target the Windows tray menu. The non-tray lifecycle, startup baseline,
  updater endpoint, headless updater, and launch cadence were still checked.
- Browser-extension launch is blocked by missing compatible extension setup.
- Authenticode validation is blocked by the absence of a CI/release Windows
  artifact. The local artifacts are intentionally unsigned.
- The transient Starting visual state was not captured before the server
  reached Running; listener idempotence and the final state passed.

The exact recommended next action is to review this evidence, then fix the
Windows-portable test fixtures and clippy failure first so current-main CI can
finish; align installer/native-host paths and release artifact names next;
and rerun this tactical with one attended UAC/tray session. Only after those
checks pass should a signed Windows candidate be produced and independently
verified as `Valid`.

## Authorized remediation and post-fix rerun

After the initial evidence checkpoint, the maintainer authorized implementation
directly on `main`, selected Tauri's standard per-user NSIS installer as the
recommended Windows package, retained MSI as a secondary system-wide package,
and requested a Tauri upgrade plus another end-to-end Windows run. No release,
tag, signing infrastructure, updater service, or production update metadata was
changed.

The implementation commits are:

| Commit | Change |
| --- | --- |
| `93f9a43` | Made the JavaScript/Rust test fixtures and release-script paths portable on Windows, removed current Rust warnings, and replaced the Bash-only sidecar preparation script with Node. |
| `1d12ef7` | Upgraded the Tauri JavaScript and Rust stack. |
| `349fc39` | Selected explicit current-user NSIS installation, repaired supported NSIS hooks and installed-sidecar lookup/launch, and aligned CI Windows release asset naming. |

The follow-up ran from
`C:\Users\sox\Documents\code\web-server-chrome` in PowerShell `7.6.4` with Git
`2.54.0.windows.1`, Node `24.18.0`, pnpm `9.1.0`, rustc/cargo `1.96.0`, and
Tauri CLI `2.11.4`. The upgraded resolved Tauri packages include JavaScript API
`2.11.1`, Rust `tauri` `2.11.5`, runtime `2.11.3`, runtime-wry `2.11.4`,
updater `2.10.1`, build `2.6.3`, opener `2.5.4`, and single-instance `2.4.3`.
WebView2 was `150.0.4078.105`.

### Post-fix source and build results

These native PowerShell commands passed:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @ok200/desktop prepare-sidecar
pnpm typecheck
pnpm test
pnpm lint
node --test .github/scripts/*.test.mjs

Push-Location desktop
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
Pop-Location

pnpm --filter @ok200/desktop tauri build --no-bundle --no-sign
pnpm --filter @ok200/desktop tauri build --no-sign --bundles 'nsis,msi'
```

The release validator's six tests passed. The no-bundle build and both
unsigned installer bundles completed without the five original Windows Rust
warnings.

| Format | Exact local artifact | Bytes | SHA-256 | Signature |
| --- | --- | ---: | --- | --- |
| NSIS | `C:\Users\sox\Documents\code\web-server-chrome\desktop\target\release\bundle\nsis\200 OK_0.1.3_x64-setup.exe` | 6,349,113 | `219C52CC7EE49CF0F34581EB90AE7B3DD8D7181028C61754572D1A91BDCB5951` | `NotSigned` |
| MSI | `C:\Users\sox\Documents\code\web-server-chrome\desktop\target\release\bundle\msi\200 OK_0.1.3_x64_en-US.msi` | 9,060,352 | `7C6E3A063BD74390136044414A9237934720EA61EF0DC9AB6C632E4B53EF5075` | `NotSigned` |

Local bundle names remain Tauri's product-name-derived outputs. The Windows CI
upload now uses Tauri Action's `releaseAssetNamePattern` to publish canonical
`200.OK_[version]_[arch][setup][ext]` names. The validator and generated
release table therefore expect
`200.OK_0.1.3_x64-setup.exe` and `200.OK_0.1.3_x64.msi`. A tagged CI run is
still required to prove that normalization with real uploaded assets.

The generated NSIS script records `INSTALLMODE "currentUser"` and installs
under `%LOCALAPPDATA%\200 OK` without requiring an administrator token. The
standard WiX MSI remains a system-wide/elevated package and was built but not
installed during the post-fix run.

### Installed per-user application

Silent installation of the unsigned NSIS artifact returned exit code 0 and
installed:

| File | Bytes | SHA-256 | Signature |
| --- | ---: | --- | --- |
| `ok200-desktop.exe` | 17,508,864 | `C02E829AAC33648139B5FB6827C0DBCA7A0B2A26D19595B65867149A8C88D93C` | `NotSigned` |
| `ok200-host.exe` | 2,378,752 | `71A34E7D0DC92DE7A3691FDE421316DCA36773C5104DD1662947A5D3CD8E70E0` | `NotSigned` |
| `uninstall.exe` | 79,216 | `9C9AE76B880BE6A256980222E8552F2DC8D562DA4FC4C1AE72459F194ECCC5AF` | `NotSigned` |

The installed app launched at the compact portrait size with canonical 200 OK
branding and the active Windows dark preference. The native Windows folder
picker selected
`C:\Users\sox\AppData\Local\Temp\ok200-windows-validation-20260728-fixes`
without typing a path. Port `0` allocated `57083` and `62747` in two runs, each
with exactly one listener owned by the single installed desktop process.

The first run used CORS and SPA mode with directory listing disabled:

| Path | Status | Content type/result |
| --- | ---: | --- |
| `/` | 200 | exact fixture `index.html` |
| `/hello.txt` | 200 | `text/plain; charset=utf-8`, exact fixture body |
| `/subdir/nested.txt` | 200 | exact nested fixture body |
| `/missing.txt` | 200 | exact SPA fallback `index.html` |
| `/listing/` | 200 | exact SPA fallback `index.html` |
| `/listing/space%20name.txt` | 200 | exact file body |

Every response included `Access-Control-Allow-Origin: *`. Copy URL placed the
exact `http://127.0.0.1:57083` value on the Windows clipboard. While running,
the folder, port, and serving options were disabled and showed the locked
explanation. Stop removed the listener and the old URL immediately refused the
connection.

The complementary run persisted SPA off and directory listing on.
`/listing/` returned the branded listing, both `alpha.txt` and the encoded
`space%20name.txt` returned 200 with correct plain-text MIME types, and
`/missing.txt` returned 404 `Not Found`. A full process exit followed by native
host launch created one new desktop process and restored the same root, port
0, CORS on, directory listing on, and SPA off. Closing the window hid it while
the original process remained alive; a native-host launch showed the existing
single instance.

The installed headless updater path exited after writing
`%APPDATA%\ok200-native\update-check-result.json` with
`{"available": false}`. The tray-only manual updater command remained
inaccessible, so this proves the installed service path rather than the tray
UI.

### Native messaging result

The repaired installer created valid HKCU registration for Google Chrome,
Chromium, Brave, and Edge. Each default value pointed to:

```text
C:\Users\sox\AppData\Local\app.ok200.desktop\app.ok200.native.json
```

The manifest named `app.ok200.native`, allowed extension
`lpkjdhnmgkhaabhimpdinmdgejoaejic`, and pointed to the installed flat
`C:\Users\sox\AppData\Local\200 OK\ok200-host.exe`. Runtime registration
self-healed the same manifest after application launch. Direct framed stdio
returned:

```json
[
  {"action":"handshake","name":"ok200-host","version":"0.1.3"},
  {"action":"pong"},
  {"action":"launch","ok":true}
]
```

The host exited 0, launched/focused `ok200-desktop.exe`, and did not create a
second desktop instance. This closes the original installer registration,
flat-sidecar lookup, and wrong executable-name defects. End-to-end invocation
from the Chrome extension remains blocked because the compatible extension is
not installed.

### Uninstall and remaining observations

Running `%LOCALAPPDATA%\200 OK\uninstall.exe /S` while the stopped application
was resident in the background returned exit code 0. It removed the install
directory, desktop process, Start Menu and desktop shortcuts, all four browser
registry keys, and the native-messaging manifest.

Two per-user state directories remained:

- `%APPDATA%\app.ok200.desktop\server.json`
- `%LOCALAPPDATA%\app.ok200.desktop\EBWebView\...`

Tauri's generated NSIS script requests recursive removal of both paths, but
the WebView/process shutdown path left them behind in this run. Minimal
reproduction: install the NSIS package, launch and close the app so it remains
in the background, run `uninstall.exe /S`, then inspect those two exact paths.
This is a cleanup/privacy defect, not a server, launch, update, or registration
failure. It was recorded without adding more custom installer behavior.

The previously recorded Windows Firewall query-user rules were not changed.
The product-created native-messaging state was removed; unrelated or
OS-created security configuration was not deleted.

### Remaining blocked release checks

- The MSI install/launch/uninstall flow remains blocked by secure-desktop
  approval and is intentionally secondary to the now-passing per-user NSIS
  path.
- Tray Show App, checkmarks, Quit, Start at Login, and the tray-triggered
  updater UI remain blocked because the approved automation surface cannot
  target the Windows tray menu.
- Chrome-extension-to-host invocation remains blocked by the missing compatible
  extension, although installed host framing, registration, and launch pass.
- Released EXE/MSI Authenticode checks remain blocked until a signed CI
  candidate exists. These local artifacts are intentionally `NotSigned`.
- CI asset renaming and the complete fail-closed gate still require a tagged
  draft run; no release or tag was created here.

## Exit criteria

This tactical is complete when:

1. native Windows source checks and both installer builds have explicit
   results;
2. the installed Rust-core application has served a real external request and
   stopped cleanly;
3. lifecycle, persistence, tray, updater, and native messaging have explicit
   pass/fail/blocked results;
4. local unsigned evidence is clearly separated from signed-release evidence;
5. every failure has a reproducible record; and
6. the evidence branch is pushed for review.
