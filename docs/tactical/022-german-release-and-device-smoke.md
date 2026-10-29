# German release and physical/device smoke

Topic: localization

Status: complete within the bounded release scope, 2026-10-29. Maintainer explicitly authorized physical Pixel
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
passed build, real-browser smoke and Web Store submission. Its exact
browser-tested submission ZIP SHA-256 is
`9f3ca1ade9e39c5ab5eed107e39c608f2c936a2743983659bd8bb6eb50d02a9a`.
An independent
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
the app was quit, the VM suspended and its claim released. The common shutdown
command returned a testbed adapter error, recorded in the private Machine
Control journal. A later resume was blocked by the locked host; only this
campaign's already-quit VM was cold-booted through common recovery. Its normal
resident became ready without changing host lock/power settings or grants.


### Desktop signed publication and installed smoke

[`desktop-v0.1.12`](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.12)
was published from `dec3015a7cd89050b47449e61004e92e43c892db` by
[40871442482](https://github.com/kzahel/web-server-chrome/actions/runs/40871442482).
Source checks, Linux product E2E, all five package/signing legs and the
fail-closed finalizer passed. Every one of the fifteen final public assets was
independently downloaded and verified against SHA256SUMS. Package/updater identities
and the existing signing keys remain unchanged.

On a macOS ARM64 VM through Machine Control, the recommended signed/notarized
`200_OK_0.1.12_aarch64.pkg` installed successfully into `/Applications`.
The installed bundle's version, signature and Gatekeeper assessment passed;
the running executable was independently confirmed in the installed bundle.
The PKG SHA-256 is
`f35fc25ef734d76a2c4cb58a9d437b3a93db65170242b6ce04d2a18381931925`.
Its companion signed app archive SHA-256 is
`871ae5dd68467a68c265f4c8bd8b120c1a8c0ab5260e7f0d00cb23bf4016497c`.
The independently downloaded public files exactly match the candidate bytes
used for installation/signature checks.

The installed public app retained German and the selected folder, showed
localized native menu and settings copy with an unclipped default portrait
layout, confirmed out-of-home sharing in German, and served the exact fixture
marker through a separate HTTP client. Explicit stop refused HTTP. Quit and
relaunch retained German/folder and remained stopped. The app was quit (independent process check), the owned fixture file and old
unsigned test bundle removed, and the VM gracefully shut down through Machine
Control's supported guest administration escape. Power-off and claim release
were independently confirmed. Host lock/power settings and the original other
VM snapshot were preserved. This is a basic one-platform installed smoke, **not** full
three-OS installed/update or exact store-extension/native-host acceptance.
No Windows/Linux installed-product claim, signed update installation, iOS
store release or separate Crostini binary release is inferred.

The production website deployment
[40874649593](https://github.com/kzahel/web-server-chrome/actions/runs/40874649593)
passed. A bundled-browser check of the real download page verified all ten
artifact links, the recommended ARM64 PKG, no page errors and the JavaScript-off
fallback at 0.1.12. The Linux install script fallback also points to this tag.
After the ordinary five-minute feed cache expired, **twenty live Tauri routes**
passed: all five platform/CPU pairs with clients 0.1.5 and 0.1.11 returned exact
0.1.12 URLs/signatures matching the public latest.json, while 0.1.12 and future
99.0.0 received HTTP 204. Health remained successful throughout.

### Rollout observation and remaining external gates

Read-only report run
[40873784083](https://github.com/kzahel/web-server-chrome/actions/runs/40873784083)
confirmed code 9 at 1%, pinned standard-7d, and waiting until
2026-10-30 12:08:50 UTC for the first dwell interval. It made no Play change.
The report-count fallback was explicitly identified because rate data had fewer
than 200 rollout user-days; no absence-of-crash or exposure-rate claim is made.
A later read-only Web Store query still reported 0.1.9 pending review and 0.1.8
public. Store approval/availability and future Android fraction increases
remain external/follow-up gates; the automated extension path publishes after
Google approval. Android scheduled advancement remains report-only.

Remaining-language supervisor setup is complete in
[Tactical 023](023-remaining-language-supervisor.md) and its maintained runbook.
No new-language model workers or overnight scheduler were launched by setup.

Source/setup CI [40874649652](https://github.com/kzahel/web-server-chrome/actions/runs/40874649652)
and the website deployment passed; final evidence updates are documentation only.
