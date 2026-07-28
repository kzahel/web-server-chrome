# 006: Windows Desktop Validation

Status: **ready for execution on native Windows.**

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
