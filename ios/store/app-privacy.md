# App Privacy Response Draft

Expected App Store Connect answer for the reviewed `0.1.0 (1)` source:

> No, we do not collect data from this app.

Rationale:

- selected files, the security-scoped bookmark, and app settings remain on the
  device;
- HTTP requests go directly between the user's device and the requesting local
  client, not through a developer-operated service;
- the app has no account, advertising, analytics, tracking, crash-reporting
  SDK, or developer backend;
- system Copy and Share surfaces act only when the user invokes them; and
- the installed app does not load `ok200.app` or its website fonts during
  ordinary operation.

The required privacy policy URL is `https://ok200.app/privacy`. A User Privacy
Choices URL is unnecessary for this no-collection version. Re-audit the exact
candidate and all linked SDKs before publishing the response; App Store privacy
answers are app-level and must be updated if any data flow changes.
