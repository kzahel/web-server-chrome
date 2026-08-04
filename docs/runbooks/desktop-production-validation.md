# Desktop Production Validation

Use this runbook after a desktop candidate and its coordinated production
surfaces have been released. There is currently no staging environment that
faithfully represents the complete delivery path, so final product acceptance
uses immutable public artifacts, the production website and updater, and the
extension actually served by the Chrome Web Store.

This is a destructive-to-test-state, post-publication acceptance run. Publishing
still requires explicit maintainer authorization. Passing artifact, signature,
or CI checks does **not** imply that the published product has passed this
runbook.

The active defect and completion ledger is
[Tactical 015](../tactical/015-desktop-production-validation.md). The durable
artifact/signing rules remain in
[`desktop-release-readiness.md`](../topics/desktop-release-readiness.md).

## Scope and ownership

This runbook covers:

- the public macOS, Windows, and Linux desktop release;
- the recommended installer on each platform;
- the production download page and Tauri update routes;
- the Chrome Web Store extension-to-native-host path; and
- the cross-platform server, settings, lifecycle, recovery, and uninstall
  behavior visible to a user.

It does not turn VM evidence into Android, physical ChromeOS, or hardware claims.
Those surfaces retain their own store/device gates in Tactical 011 and Tactical
014. Secondary MSI, DEB, and RPM packages retain the claim rules in the desktop
release-readiness topic unless the current release explicitly promotes them.

Product assertions and this procedure belong here. Private machine inventory,
VM controller commands, credentials, attended login details, and unsanitized
evidence belong outside this repository. Testbed-controller defects must be
recorded in the applicable testbed repository, even if they are first noticed
during this run.

## Acceptance rule

A desktop version is production-published when its public artifacts exist. It
is production-accepted only when all required rows below pass against those
exact public artifacts on all three operating systems.

The tray or menu-bar surface is always optional. Every persistent option and
every action needed to recover, update, manage, or quit the application must be
available from the main window. A tray-only success cannot compensate for a
broken or missing in-app path.

The production extension gate requires the Chrome Web Store package. An
unpacked development extension, direct native-host invocation, manifest
inspection, or evidence from an older release is useful diagnostics but is not
a pass.

## Run ledger

Create a sanitized ledger before changing any guest. Record one row per test
environment:

| Field | Required value |
|---|---|
| Campaign | Date and operator |
| Release | Desktop version, tag, full commit, and previous public version |
| Public assets | Artifact filename and SHA-256 used on that environment |
| Extension | Store-listed name, exact installed version, and ID |
| Environment | OS version, architecture, browser/version, and whether the desktop artifact runs natively or through emulation |
| Initial state | Clean install, prior-public update, or retained production install; running processes and app-created state |
| Result | Pass, product failure, environment gap, or testbed failure |
| Evidence | Sanitized commands, screenshots/logs, and issue/tactical links |

The production extension ID is
`lpkjdhnmgkhaabhimpdinmdgejoaejic`. Treat any other ID as a failure even if its
UI looks correct.

## Preconditions

1. Obtain explicit authorization for every publication or production
   configuration change. This runbook does not grant it.
2. Verify that the tagged workflow and release finalizer passed and that the
   public release contains the complete required artifact set, checksums,
   signatures, and `latest.json`.
3. Confirm that the download page points to the intended public release and
   that the update service is healthy.
4. Confirm the intended extension version is actually installable from the
   Chrome Web Store. Submission, approval, or a console screenshot alone is
   insufficient because store rollout can lag.
5. Ensure a supported production browser is installed before the desktop app
   registers its native-messaging manifest. If the browser is added later,
   relaunch or reinstall the app and prove registration again.
6. Record the environment's starting lifecycle and user-data state. Preserve
   unrelated user data, and decide explicitly whether the production browser
   and extension are durable testbed baseline or campaign-created state.
7. Start the environment through its authoritative controller and run that
   controller's doctor. Do not reinterpret a transport/controller failure as a
   product failure.

## Production campaign order

Because there is no equivalent staging environment, coordinate production in
this order and record the version/hash at every boundary:

1. freeze the accepted source revision and the desktop/extension versions that
   make up the campaign;
2. publish the complete signed desktop GitHub release through its fail-closed
   finalizer;
3. submit or roll out the extension when the campaign changes it, then wait
   until that exact version is served by the Chrome Web Store;
4. point the production download page and update service only at immutable,
   checksum-verified release assets;
5. verify public website, updater, release, and store identity independently;
6. run the three-OS clean-install, update, behavior, and store-extension matrix
   below; and
7. leave the candidate public but unaccepted and unpromoted if any row fails,
   record the defect, and publish a new repair version after it is fixed.

Do not rewrite an already-published artifact in place to repair a failure. A
new binary or extension package requires a new version and a fresh ledger.

## Verify the public surfaces

Use a fresh temporary directory and exact tag. Never test a locally built
installer as production evidence.

```bash
OK200_TAG=desktop-vX.Y.Z
OK200_RUN_DIR="$(mktemp -d)"
gh release download "$OK200_TAG" \
  --repo kzahel/web-server-chrome \
  --dir "$OK200_RUN_DIR"
(cd "$OK200_RUN_DIR" && shasum -a 256 -c SHA256SUMS)
curl -fIL https://ok200.app/download
curl -fsS https://updates.ok200.app/health
```

Inspect `latest.json` and prove that its version, architecture entries, URLs,
and non-empty signatures describe the same immutable release. Query the live
Tauri route for every supported production target/architecture pair using the
previous, current, and deliberately future version:

```text
https://updates.ok200.app/tauri/{target}/{arch}/{current_version}
```

The previous version must receive the intended signed update. The current and
future versions must not receive a downgrade. Record status codes, returned
version, URL, signature presence, and downloaded checksum rather than relying
on the UI alone.

Also open the production download page in a browser and follow the recommended
download for that OS. The linked filename and checksum must agree with the
release ledger.

## Platform artifact gates

### macOS

- Verify the app and nested executables with deep/strict code signing,
  Gatekeeper assessment, notarization, and stapling checks.
- Verify the recommended PKG or DMG with its matching installer signature and
  notarization checks.
- Perform the recommended clean install. If installation needs administrator
  authentication, treat it as an attended step; cryptographic inspection of an
  uninstalled package is not equivalent.
- Record whether the artifact and host architecture match or use translation.

### Windows

- Use the public recommended current-user NSIS installer.
- Require Authenticode status `Valid` and the expected publisher before
  execution.
- Record native versus emulated execution. Emulation cannot be reported as
  native-hardware coverage.
- Complete the normal uninstaller after the behavioral pass and verify that no
  product process, native-host registration, or campaign-created integration is
  stranded.

### Linux

- Use the public AppImage through the documented verified installer or an
  equivalently checksum-verified direct path.
- Record OS, desktop session, architecture, FUSE mode, executable location, and
  native-versus-emulated execution.
- Verify stable desktop identity and native-host registration after any move
  to a stable application path.
- Capture loader, GLib/GVFS, portal, webview, and tray warnings. A warning is an
  investigation item even when the immediate server flow passes.

## Two required installation passes

Run both passes on each operating system unless the tactical explicitly records
an approved limitation.

1. **Clean production install:** begin without 200 OK application state, install
   the current public artifact, and complete the behavioral matrix.
2. **Production update:** install the previous public version, create a fixture
   and non-default persisted settings, discover the current version through the
   production updater, choose **Install & Restart**, and repeat the behavioral
   matrix. Version, executable hash, settings, root, native-host registration,
   and product identity must survive as designed.

A reinstall from a freshly downloaded current installer does not satisfy the
update pass.

## Behavioral matrix

Use a fixture containing at least an index file, a plain text file, and a nested
directory. Drive visible controls for user behavior and use external requests
and OS process inspection as independent evidence.

| Surface | Required observations |
|---|---|
| Main-window controls | Before relying on a tray, open the in-app settings and confirm Start at Login, Run in Background, icon visibility, manual update, and Quit are all visible and operable without clipping or inaccessible scrolling. |
| Server | Select the fixture root, choose the test port, start, and request the index, exact file, directory listing, parent navigation, missing path, and representative `HEAD`. Verify status, body, content type, `Server: ok200`, and 404 behavior. Controls that cannot safely change while serving are locked. Stop releases the old port. |
| Persistence | Quit and relaunch. Root, port, and persistent settings have the documented values; transient running state does not become corrupt. |
| Current-version update | Manual Check for Updates gives a visible current-version result without installing or restarting. |
| Prior-version update | The production updater discovers only the intended newer public version, verifies its signature, installs on explicit action, restarts, and produces the exact release version/hash while preserving supported state. |
| Start at Login | Enabling creates the expected OS integration and disabling removes it. Include an attended logout/login or reboot when that is required to prove actual launch. |
| Icon visibility | With the icon visible, its entries mirror working in-app actions. Hide the icon from the main window, prove the main window still contains every action, relaunch to one visible window/process, then re-enable it from the main window. Absence of a Linux tray implementation must not remove app functionality. |
| Background enabled | Closing the last window keeps exactly one intended process and any running server alive. Launching from the OS and from the extension restores/focuses one main window without adding a second process. |
| Background disabled | Closing the last window stops the server and exits the process. This must also pass with the icon hidden. Launching again creates exactly one fresh, visible process/window. |
| Quit | In-app Quit exits even when the icon is hidden, stops the server, releases the port, and leaves no resident product process. Tray Quit, when available, behaves the same. |

## Production extension gate

Perform this section on macOS, Windows, and Linux using a supported production
browser. A platform without a browser capable of installing the production
Chrome Web Store package has an environment gap and cannot close this gate.

1. Install the extension from its actual Chrome Web Store listing in the test
   browser profile. Record the store-served version and verify the exact ID
   `lpkjdhnmgkhaabhimpdinmdgejoaejic` from the browser's extension details.
2. Verify the installed native-host manifest names only the expected production
   origin and points to the current installed launcher/host.
3. Stop the desktop app completely. Invoke **Open desktop app** from the store
   extension and require one process and one visible/focused window.
4. Invoke it again and require the same single instance to be focused, not a
   second process or window.
5. Repeat after hiding the tray/menu-bar icon. The extension must restore the
   main window and the in-app settings/quit paths must remain complete.
6. With Run in Background enabled, close the window and invoke the extension;
   it must restore the existing instance. With it disabled, close must exit and
   the extension must start one fresh instance.
7. Quit, uninstall, or remove native-host registration as appropriate and
   confirm the browser no longer appears to succeed through a stale process or
   stale registration.

Direct length-prefixed native-host messages are diagnostic evidence only; they
do not replace these browser-driven steps.

## Cleanup and lifecycle restoration

- Stop the server and ensure the test port is free.
- Disable campaign-created login integration and remove campaign-created app
  state, install artifacts, and registrations according to the platform's
  documented uninstall behavior.
- Do not remove a pre-existing production browser, extension, or user-owned
  data. Apply the baseline decision recorded at the start.
- Run the testbed doctor again, then return the guest to its exact initial
  running, suspended, or stopped lifecycle state.
- Record cleanup failures in the ledger; cleanup is part of acceptance.

## Failure handling

Any of these is a release-acceptance failure: wrong/missing signature or hash;
broken public link or updater route; clipped or missing main-window option;
server contract failure; state loss; unexpected resident or duplicate process;
unrecoverable hidden-tray state; stale integration after uninstall; or a failed
real production-extension launch.

Do not mark a manual workaround as a pass. Capture the exact artifact/hash,
platform/architecture, reproduction steps, process state, relevant logs, and a
sanitized screenshot. Update Tactical 015 and the appropriate living topic.
If the cause is the VM controller or test transport, record it in that testbed's
problem ledger and keep the product row as blocked/environmental until it is
rerun.

## Completion report

The final report must state separately:

- artifact/signing verdict;
- production website/updater verdict;
- clean-install verdict by OS;
- prior-public update verdict by OS;
- production-extension verdict and store version by OS;
- native versus emulated architecture coverage;
- product failures, environment gaps, and testbed failures;
- cleanup/lifecycle-restoration result; and
- overall **production-accepted** or **production-rejected** verdict.

Only **production-accepted** permits documentation or migration copy to call
the desktop version fully accepted. A repaired release starts a new ledger; it
does not erase the failed evidence from an earlier tag.
