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

Pending. Keep device identifiers, account data, endpoint addresses, credentials,
raw UI dumps and screenshots under ignored local evidence/private inventory.
Sanitized product results and public artifact hashes belong here.
