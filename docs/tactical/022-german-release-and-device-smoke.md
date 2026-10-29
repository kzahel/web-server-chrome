# German release and physical/device smoke

Topic: localization

Status: active, 2026-10-29. Maintainer explicitly authorized physical Pixel
validation, basic desktop validation on one platform through Machine Control,
then German releases. Remaining-language overnight supervision follows this
release slice; it does not itself authorize publishing unqualified languages.

## Sequence

1. Enroll the attached authorized Pixel in the existing internal track and
   install the actual Play-delivered 0.2.4/code 9. Verify installer, version,
   German selection/persistence, folder authorization, real HTTP serving,
   notification/lifecycle controls, and start/stop. Preserve unrelated apps and
   data, use a dedicated fixture folder, and record cleanup and claim limits.
2. Prepare desktop 0.1.12, run source gates and smoke the real localized app
   on one macOS target through Machine Control. Check German controls/native
   menus, folder selection, real HTTP serving, language persistence and quit.
   Preserve other target sessions. This bounded smoke does not claim complete
   three-OS production acceptance.
3. Submit the already staged extension 0.1.9 source for Google review; promote
   the identical internal Android bundle to a small production staged rollout.
   Retain production review and report-only advancement. Google review and
   public availability are independently observed, never inferred from CI.
4. Publish desktop 0.1.12 only after pre-release smoke/source gates, then
   verify signed public artifacts and repeat the one-platform installed smoke.
   Check updater metadata for older/current/future clients and preserve the
   previous compatible public baseline.
5. Record exact versions, sources, hashes, workflow/store states, bounded
   acceptance and remaining gaps in the owning topics. Commit/push evidence.

## Compatibility

Localization does not alter package/signing identities, native messaging,
controller/HTTP protocols, folder grants or existing server settings. Android,
extension, desktop and Crostini updates remain independent; no ordered or
atomic rollout is required. Android production promotion reuses the exact
internal AAB. The extension tag points to its browser-qualified staged source.
Desktop preserves updater identity, signed metadata and supported older-client
routes. iOS distribution and a separate Crostini binary release remain outside
this bounded release.

## Evidence

### Android physical Play delivery

The attached physical Pixel 7a installed **0.2.4/code 9 from
`com.android.vending`**, after enrollment in internal testing. The preexisting
old developer-signed app could not be updated by Play; its APK and app-owned
data were backed up privately before replacement. No unrelated applications or
served data were modified. A stale Play cache initially offered production
0.2.1; that was rejected as evidence. Clearing only Play cache exposed the
internal update; installer and code 9 were verified again.

German selection, a dedicated SAF folder grant, external same-Wi-Fi HTTP GET
with an exact marker, reliable background service/notification permission,
German ongoing notification, English/German switching while the listener kept
serving, forced process restart with language/folder retention, a second real
serve and explicit stop all passed. Stopped HTTP refused connections. The test
file was removed; the store app remains installed, German and stopped, with an
empty dedicated fixture folder. Boot/Doze/long-duration battery acceptance is
not inferred from this bounded smoke. Raw device/account/network evidence and
the developer-build backup remain ignored/private.

Production promotion [40870766578](https://github.com/kzahel/web-server-chrome/actions/runs/40870766578)
passed, using the identical internal AAB (no upload), SHA-256
`1b4d799e329a6a4537bda320a7e92b0e17b2f7c536306ce0fd7bed8ef0726bfe`.
The receipt records `inProgress`, **1%**, previous production code 6, deployment
7411766925. API acceptance is not evidence of Google approval/public delivery.
The scheduled advancer remains report-only; further increases are separate.

### Extension submission

Tag `extension-v0.1.9` points to the exact staged source
`ad3692b6bb8239e0a2d217e5b1817dc1046084c0`.
[40870810213](https://github.com/kzahel/web-server-chrome/actions/runs/40870810213)
passed build, real-browser smoke and Web Store submission. An independent
read-only store query reports **0.1.9 PENDING_REVIEW**, public **0.1.8**, no
warning/takedown. Store review and installability remain independent gates.

### Desktop pre-release

Version 0.1.12 was prepared at `c649d92`; `scripts/release-check.sh desktop`
passed. The ordinary optimized app bundle (unsigned, updater artifacts disabled
only for this local preflight) was driven through Machine Control on an
isolated macOS ARM64 VM. German controls/native menus, the native folder picker,
localized out-of-home sharing confirmation, real HTTP GET, and English/German
switching with continued serving passed. This is pre-release evidence, not a
claim about signatures or the exact distributed artifact. Signed publication
and the bounded installed-artifact rerun follow below.

Quit/relaunch retained German and the selected folder, and restarted stopped.
A second confirmed start served the same marker. Native menu copy and the
settings panel fit the default portrait window. Explicit stop refused HTTP;
the app was quit and the VM was suspended after use and its claim released. The common shutdown
command returned a testbed adapter error; this was recorded in the private
Machine Control usage journal.
