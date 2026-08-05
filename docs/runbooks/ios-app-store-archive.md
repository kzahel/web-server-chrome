# iOS App Store Archive

Use this runbook to turn an accepted iOS source commit into an inspected App
Store archive and IPA. It does not register an App ID, create an App Store
Connect record, create or revoke credentials, upload a build, add testers,
submit for review, or publish an approved version.

The continuing product contract and sanitized status live in
[`../topics/ios-runtime.md`](../topics/ios-runtime.md). The release campaign and
external authority gates live in
[`../tactical/017-ios-store-readiness.md`](../tactical/017-ios-store-readiness.md).
Private account choices and credential locations do not belong here.

## Version and build policy

`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `ios/project.yml` are the
canonical values. Marketing versions use `X.Y.Z`. Build numbers are positive
integers and increase for every App Store Connect upload, including rejected
or TestFlight-only candidates. Never reuse an uploaded build number.

Every candidate needs a matching heading in `ios/CHANGELOG.md`. Regenerate and
commit `ios/OK200.xcodeproj` whenever either value changes. An already installed
release must continue to decode the oldest/current/additive-future settings
fixtures; a version bump does not authorize a persisted-data cutover.

## Non-mutating preflight

From a clean checkout with full Xcode, xcodegen, and ripgrep installed:

```bash
ios/scripts/release-archive.sh --check
```

This verifies the tools, bundle ID, version/build shape, changelog entry,
deployment target, and iPhone/iPad device families. It reports only whether a
distribution identity and the named signing inputs are available; it does not
print account identifiers or credential values.

The ordinary source gate remains unsigned and credential-free:

```bash
scripts/release-check.sh ios
```

## Unsigned archive rehearsal

Use the unsigned mode to exercise the archive structure and exact-artifact
inspection before any signing checkpoint:

```bash
ios/scripts/release-archive.sh --unsigned
```

The command reruns the complete source gate, creates an unsigned Release
`.xcarchive`, and inspects its bundle ID, version/build, deployment target,
device families, arm64 slice, compiled icons, privacy manifest, absence of
DEBUG hooks, and absence of embedded third-party frameworks. Output goes under
the ignored `ios/build/AppStoreRelease/` tree and is never uploadable.

## Private signing configuration

Copy `ios/release.env.example` to ignored `ios/release.local.env`, or export
the same variables from an attended shell. Configure only:

- `IOS_TEAM_ID` for the selected Apple developer team; and
- `IOS_PROVISIONING_PROFILE_SPECIFIER` for the installed, app-specific App
  Store profile.

The Apple Distribution identity and private key must already be available in
the current keychain search list. The script does not import a `.p12`, unlock a
keychain, create a profile, or enable automatic provisioning. It fails if the
explicit identity or configuration is missing.

Do not put passwords, `.p12` data, provisioning-profile data, or `.p8` contents
in the local environment file. Keep it mode-restricted because the team and
profile names are still private account context.

## Signed archive and export

After the signing checkpoint and from a clean tracked worktree:

```bash
ios/scripts/release-archive.sh --signed
```

The command runs the complete source gate, archives with manual Apple
Distribution signing, inspects the archive, generates an ignored export plist,
exports one App Store IPA, and inspects the IPA again. Distribution inspection
requires:

- a valid Apple Distribution signature;
- an exact team/bundle application identifier;
- `get-task-allow=false`;
- an unexpired App Store provisioning profile with no device list;
- no enterprise provisioning; and
- the same runtime, privacy, icon, architecture, and DEBUG-hook checks as the
  unsigned rehearsal.

The output directory is immutable for the command: if it already exists, the
script fails and requires a new explicit `IOS_RELEASE_OUTPUT_DIR`. It writes
the commit, Xcode version, sanitized inspection reports, and IPA SHA-256 under
its ignored `evidence/` directory. The reports say that team/profile matching
passed but do not include their identifiers or signer name.

## Apple validation

Once the correct App Store Connect app record exists, an attended operator may
add `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`, and `ASC_API_KEY_PATH` to the local
environment and run:

```bash
ios/scripts/release-archive.sh --signed --validate
```

This asks Apple's current `altool` to validate the exported IPA and stores its
response only in the ignored evidence directory. It does not upload a build.
The API-key path must name a mode-restricted local `.p8`; never put its contents
in this repository or a command-line argument.

## Local candidate tag

Prepare a candidate only from clean `main`. The checked local release helper
requires the exact changelog/version/build tuple, rejects existing local or
remote tags, and reruns the complete release gate:

```bash
scripts/release-ios.sh 0.1.0 1 --check
scripts/release-ios.sh 0.1.0 1
```

The second command updates and commits `ios/project.yml` plus the generated
project only when the requested tuple differs from source, then creates a local
tag such as `ios-v0.1.0-b1`. It never pushes. If source already has the tuple,
it tags the already accepted commit without manufacturing an empty commit.

After an attended review, the helper prints the explicit atomic push command.
Pushing this tag does not upload to Apple; the App Store workflow is manual
dispatch only.

## Guarded GitHub candidate workflow

`.github/workflows/ios-release.yml` must be dispatched from an exact
`ios-vX.Y.Z-bN` tag. It has three explicit actions:

- `build-only` imports signing into an ephemeral keychain, validates the
  certificate/profile relationship, produces and inspects the signed IPA, and
  uploads the IPA plus ignored-style evidence as GitHub run artifacts;
- `validate` additionally asks Apple to validate that IPA without creating a
  build; and
- `upload` requires the separate exact `UPLOAD` confirmation, repeats Apple
  validation, then enters the `ios-app-store-upload` GitHub environment before
  downloading, reinspecting, and uploading the exact IPA.

Before the first upload, configure `ios-app-store-upload` with a required
maintainer reviewer. Configure the `IOS_TEAM_ID` repository variable and the
secret names listed in the private signing runbook; never put their values in
workflow source. The setup step proves the imported certificate is current,
belongs to the expected team, and is one of the profile's developer
certificates. It also proves that the profile is for the exact bundle, is
distribution-only, has no devices, is not enterprise provisioning, and is not
expired.

Both jobs remove the temporary `.p12`, profile copy, decoded `.p8`, and
ephemeral keychain on success or failure. The workflow never adds TestFlight
testers, submits for App Review, changes price/territories, chooses a release
date, or publishes an approved version.

## Acceptance and handoff

Before any upload, review the ignored evidence and reject the candidate if any
expected identity, version, privacy, icon, entitlement, profile, architecture,
or hash check is absent. Copy only sanitized conclusions and the exact IPA hash
into Tactical 017 or a release evidence record.

An unsigned archive proves packaging structure only. A signed/local IPA does
not prove TestFlight or App Store delivery. After upload, the exact distributed
build still requires the physical Files, external-LAN, HTTP, preview,
stop/restart, invalid-root, and foreground/background campaign.
