# App Store Metadata Draft

This directory is the reviewed source draft for the first normal App Store
listing. It is not an App Store Connect upload payload and does not imply that
an app record, privacy response, screenshots, review submission, or public
listing exists.

Apple's current limits and requirements were reconciled on 2026-08-05 against
the official App Store Connect references:

- [app and platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/)
- [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [age-rating values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)

`ios/scripts/check-store-metadata.sh` owns the mechanical field limits and can
require final screenshot sets. Recheck Apple's live references before entering
or submitting metadata because the questionnaires and accepted device sizes
can change independently of this repository.

## Draft product choices

- Name: **200 OK Web Server**
- Subtitle: **Local HTTP from your Files**
- Primary language: English (U.S.)
- Primary category: Developer Tools
- Secondary category: Utilities
- Support URL: `https://ok200.app/support`
- Marketing URL: `https://ok200.app/`
- Privacy URL: `https://ok200.app/privacy`
- Release: manual after approval

The public name, subtitle, category pair, and first version remain an attended
product checkpoint before the app record is created.

## Public support contact

The publication campaign reuses `graehlarts@gmail.com`, the support email already
public on this same app's [Google Play listing](https://play.google.com/store/apps/details?id=app.ok200.android).
The `/support` page now includes that contact and the existing public GitHub
issue route. Verify the deployed page before entering it in App Store Connect.
Account-level legal/trader disclosures remain the Account Holder's selections.

## Screenshot plan

The first set should contain three to five honest portrait screenshots per
required family, captured from the exact accepted candidate with no private
folder names, account data, or sensitive addresses:

1. stopped first-run controls and Files selection;
2. a running localhost URL with Copy, Share, and Preview;
3. LAN and serving-behavior controls with the foreground-only explanation;
4. in-app preview of a purpose-built public fixture; and
5. optional accessibility-sized text if it remains visually clear.

Apple currently accepts one to ten images with no alpha. For the preferred
highest-resolution set, accepted iPhone 6.9-inch portrait sizes include
`1260x2736`, `1290x2796`, and `1320x2868`; a 13-inch iPad set is required and
accepts `2064x2752` or `2048x2732`. Source-build screenshots may be used for
layout review but never represented as the exact TestFlight/App Store
candidate.
