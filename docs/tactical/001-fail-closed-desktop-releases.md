# 001: Fail-Closed Desktop Releases

Status: **complete; `desktop-v0.1.4` passed the tagged fail-closed release
gate.**

Topic: `desktop-release-readiness`

Parent: [`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md)

## Objective

Make a tagged desktop build safe to fail: all platform jobs stage assets in one
draft GitHub release, one finalizer validates the complete release, and only
that finalizer can publish it.

This tactical changes release mechanics, not the desktop runtime.

## Baseline

The `desktop-v0.1.3` tagged workflow published a partial release before all
matrix jobs were known to be successful. It has macOS and Linux assets but no
Windows installers. The existing finalizer:

- is skipped if a matrix leg fails;
- removes updater signatures before validating `latest.json`;
- publishes from each matrix job rather than at one final gate;
- searches the wrong Cargo target path for the macOS app bundle; and
- generates links whose filenames do not match Tauri's actual assets.

An untagged rerun later passed all build legs, so the immediate problem is
publication integrity rather than proof that Windows can never build.

## Implementation

- [x] Require updater signing for every tagged matrix leg.
- [x] Require macOS signing and notarization secrets for tagged macOS legs.
- [x] Require Windows signing secrets for the tagged Windows leg.
- [x] Make Tauri create/update a draft release.
- [x] Use the workspace Cargo target path for PKG creation.
- [x] Treat a missing app bundle or PKG as a build failure.
- [x] Notarize, staple, and validate each PKG before uploading it.
- [x] Run finalization with `always()` after test and build jobs.
- [x] Leave the release draft and fail if either upstream job failed.
- [x] Validate the exact installer set, updater targets, URLs, signatures,
  duplicate asset names, and GitHub SHA-256 digests.
- [x] Generate `SHA256SUMS` from GitHub's uploaded-asset digests.
- [x] Generate a release body containing exact asset filenames.
- [x] Remove detached updater signature assets only after validation.
- [x] Publish the draft as the final action.

## Local validation

```bash
node --test .github/scripts/validate-desktop-release.test.mjs
actionlint .github/workflows/tauri-app-ci.yml
```

The validator's fixtures cover a complete release plus failures for premature
publication, a missing installer, missing updater target coverage, and an
off-release updater URL. A checksum fixture verifies deterministic output and
excludes detached signatures that finalization removes.

Local validation completed 2026-07-28:

- six Node tests passed;
- Actionlint `v1.7.12` passed; and
- existing `ok200-common` and `ok200-host` Rust tests passed.

The shared signing runbook's 200 OK tag pattern and unsigned-release wording
were corrected in the dotfiles repository in commit `aac91d7`.

## 2026-07-28 CI signing audit

Commit `2dcd4db` repaired the Rust `1.97` Clippy failure and strengthened the
build workflow:

- updater signing is enabled only when both private-key inputs are present;
- signing secrets are written to the job environment without shell expansion;
- macOS CI verifies the app with `codesign` and `spctl`, validates the stapled
  notarization ticket, and verifies the DMG signature;
- Windows CI requires `Get-AuthenticodeSignature` status `Valid` and publisher
  `CN=Kyle Graehl` for exactly one NSIS EXE and one MSI;
- the tagged PKG path now also requires `pkgutil` and `spctl` acceptance;
- unsigned fork builds explicitly disable macOS and updater signing; and
- the Tauri Action `v0` input was corrected from the ignored
  `releaseAssetNamePattern` to `assetNamePattern`, with
  `updaterJsonPreferNsis: true`.

[Tauri App CI run 30379994625](https://github.com/kzahel/web-server-chrome/actions/runs/30379994625)
then completed every job successfully. Apple accepted and notarized both macOS
builds, and the Windows EXE and MSI both reported valid Kyle Graehl
Authenticode signatures.
[General CI run 30379994627](https://github.com/kzahel/web-server-chrome/actions/runs/30379994627)
also passed.

This proves that the current 200 OK Apple, Azure Trusted Signing, and updater
credentials work in CI. The Apple/Azure configuration agrees with the
known-good JSTorrent workflow. Yep Anywhere was not treated as authoritative;
its key state was uncertain. The updater key is correctly 200 OK-specific and
must not be copied from JSTorrent.

## Tagged validation result

Commit `2b7f416` and tag `desktop-v0.1.4` triggered
[Tauri App CI run 30381126333](https://github.com/kzahel/web-server-chrome/actions/runs/30381126333).
Every test and platform job passed:

- the tag-only secret checks accepted the updater, Apple, and Azure
  credentials;
- macOS arm64 and x64 apps passed Developer ID/notarization checks, and both
  PKGs passed signing, notarization, stapling, `pkgutil`, and `spctl`;
- the Windows NSIS EXE and MSI both reported Authenticode `Valid` with
  publisher `CN=Kyle Graehl`;
- Linux produced AppImage, DEB, and RPM assets;
- the matrix staged 19 assets into a private draft with canonical names; and
- the finalizer validated release `0.1.4`, wrote `SHA256SUMS` and exact
  download links, removed detached updater signatures, and alone published
  the 13 retained assets.

The resulting
[200 OK v0.1.4 release](https://github.com/kzahel/web-server-chrome/releases/tag/desktop-v0.1.4)
was published at 2026-07-28 17:11 UTC. A post-publication download of every
asset matched `SHA256SUMS`. Both downloaded PKGs were accepted as Notarized
Developer ID installers and validated their stapled tickets; both DMGs passed
`codesign`.

The deployed update service offers signed `0.1.4` metadata to `0.1.3` on
macOS arm64/x64, Windows x64, and Linux x64, selects NSIS for Windows, and
returns HTTP `204` for current `0.1.4` clients.

This tactical's release-mechanics objective is complete. Independent
clean-system inspection of the exact Windows downloads, the installed
`0.1.3` → `0.1.4` transition, and native Linux product smoke continue in the
release-readiness topic; they do not reopen the proven fail-closed publication
mechanism.
