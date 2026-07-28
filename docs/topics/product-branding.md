# 200 OK Web Server Branding

> The current product is **200 OK Web Server**. **Web Server for Chrome** is
> the proper name of the legacy packaged app and an important migration/search
> phrase, not the name of the cross-platform replacement.

Topic: product-branding

Status: **accepted product identity; repository reconciliation active.**

Last reconciled: **2026-07-28**.

## Scope

This topic owns:

- the canonical current product name and its short form;
- how desktop, Android, the extension, CLI, website, and directory listings
  present the brand;
- how the legacy name is retained for recognition, migration, and search; and
- naming rules for application metadata, store copy, documentation, and
  user-visible interfaces.

It does not rename stable technical identities such as bundle identifiers,
package scopes, the `ok200` command, update URLs, or native-messaging host
names. It also does not rewrite historical records that accurately discuss the
original Chrome packaged app.

## Canonical identity

| Use | Form |
|---|---|
| Descriptive product name | **200 OK Web Server** |
| Compact product name | **200 OK** |
| Product descriptor | **Web Server** |
| CLI command and package | `ok200` |
| Domain | `ok200.app` |
| Legacy relationship | **The successor to Web Server for Chrome** |
| Migration transition | **Web Server for Chrome is now 200 OK Web Server** |

Use **200 OK Web Server** when a surface needs to establish what the product
is: websites, page and window titles, store listings, README headings,
directory listings, and first-run or migration copy.

Use **200 OK** where the category is already clear or space is constrained:
application filenames, operating-system launcher labels, mobile home-screen
labels, menu items, buttons, tray labels, and compact headers. A nearby
**Web Server** descriptor may visually form the full name without forcing a
long mobile label.

The logo artwork may retain its handwritten `200 OK!` treatment. Normal prose
and accessible labels omit the exclamation mark.

## Legacy and search language

**Web Server for Chrome** remains valuable because more than 200,000 legacy
users may recognize or search for it. Retain the exact phrase:

- when naming the original Chrome packaged app;
- in page titles, descriptions, and body copy that explicitly describe 200 OK
  Web Server as its successor;
- in migration notifications and landing pages; and
- in extension/store descriptions where it helps existing users find the new
  product.

Do not present **Web Server for Chrome** as the current desktop, Android,
extension-plus-app, or cross-platform product. In particular, it must not be a
standalone current application title or header: that implies the server runs
inside or is intended only for Chrome.

The extension is a launcher/status surface, not the HTTP server. Its current
name is **200 OK Web Server**, with its Chrome-extension role and legacy
relationship explained in description and migration copy.

## Surface contract

| Surface | Brand treatment |
|---|---|
| Desktop bundle/launcher | **200 OK** |
| Desktop window and primary header | **200 OK Web Server** |
| Android launcher and compact UI | **200 OK**, with **Web Server** descriptor |
| Chrome extension listing and popup | **200 OK Web Server**; describe it as the launcher for the desktop or Android app |
| Website site name/header | **200 OK Web Server** |
| Website SEO | Lead with **200 OK Web Server** and explicitly include **successor to Web Server for Chrome** |
| CLI | `ok200`; describe it as the 200 OK Web Server CLI |
| Served directory listing | **200 OK Web Server** |
| Legacy packaged app | Preserve **Web Server for Chrome** |

## Names not to use

- **OK 200** reverses the established HTTP status phrase and conflicts with
  the logo, domain, package names, and command.
- **Simple Web Server** collides with the existing third-party Electron fork.
- **Web Server** alone is a descriptor, not a distinctive product identity.
- **Web Server for Chrome** without explicit legacy context misrepresents the
  current product.
- **200 OK desktop** and similar implementation-oriented labels are internal
  phrasing, not user-facing brand copy.

## Repository status

The stable technical identities already align with this decision:

- `app.ok200.desktop` and `app.ok200.android`;
- the `ok200` CLI and `@ok200/*` packages;
- `ok200.app`;
- the **200 OK** application icon and mobile label; and
- native host descriptions that use **200 OK Web Server**.

Current reconciliation should update active product surfaces while preserving
accurate historical references in `legacy/`, research documents, changelogs,
and migration history.

## Acceptance checks

- No current desktop window, application header, website header, extension
  manifest, or generated directory listing uses **Web Server for Chrome** as
  the current product name.
- Desktop and Android compact system labels remain readable.
- Website and migration metadata still contain the exact legacy name in
  explicit successor/migration context.
- Extension copy states that the desktop or Android application serves files.
- README, vision, topics, and active product metadata agree on **200 OK Web
  Server**.
