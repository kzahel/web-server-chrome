# 200 OK Web Server Branding

> The current product is **200 OK Web Server**. **Web Server for Chrome** is
> the proper name of the legacy packaged app and an important migration/search
> phrase, not the name of the cross-platform replacement.

Topic: product-branding

Status: **accepted product identity; active source surfaces reconciled,
publication pending.**

Last reconciled: **2026-08-04**.

## Scope

This topic owns:

- the canonical current product name and its short form;
- how desktop, Android, ChromeOS Linux, the extension, website, and directory
  listings present the brand;
- how the legacy name is retained for recognition, migration, and search; and
- naming rules for application metadata, store copy, documentation, and
  user-visible interfaces.

It does not rename stable technical identities such as bundle identifiers,
package scopes, Crostini commands, update URLs, or native-messaging host names.
It also does not rewrite historical records that accurately discuss the
original Chrome packaged app or retired implementation lanes.

## Canonical identity

| Use | Form |
|---|---|
| Descriptive product name | **200 OK Web Server** |
| Compact product name | **200 OK** |
| Product descriptor | **Web Server** |
| Domain | `ok200.app` |
| Legacy relationship | **The successor to Web Server for Chrome** |
| Migration transition | **Web Server for Chrome is now 200 OK Web Server** |

Use **200 OK Web Server** when a surface needs to establish what the product
is: websites, page and window titles, store listings, README headings,
directory listings, and first-run or migration copy.

Use **200 OK** where the category is already clear or space is constrained:
menu items, buttons, tray labels, and compact headers. A nearby **Web Server**
descriptor may visually form the full name.

Operating-system application and launcher metadata use
**200 OK Web Server** so system search surfaces can match the product category.
On macOS, the `.app` filename and `CFBundleDisplayName` use the full name while
the short `CFBundleName` remains **200 OK**. Windows uses the full installed
application and shortcut name. Linux and ChromeOS Linux `.desktop` entries use
the full `Name`, the generic name **Web Server**, and explicit web/server/HTTP
search keywords. Executable names, package names, desktop-file IDs, bundle
identifiers, menu items, and compact in-app treatment remain stable and may use
**200 OK**.

Android follows the same searchability rule: its application and launcher
metadata use **200 OK Web Server**, so launcher search can match both the
distinctive name and the product category. The compact in-app header stays
**200 OK** with a nearby **Web Server** descriptor, and a home-screen launcher
may truncate the longer metadata label visually.

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
ChromeOS availability and fallback claims must also follow
[`chromeos-extension-launcher.md`](chromeos-extension-launcher.md); branding
must not conceal that Android apps and Google Play are unavailable on some
Chromebooks or accounts. The ChromeOS Linux component's
**200 OK Web Server** Launcher and control surface are governed by
[`chromeos-crostini-launcher.md`](chromeos-crostini-launcher.md).

## Surface contract

| Surface | Brand treatment |
|---|---|
| macOS bundle/launcher | **200 OK Web Server** for system search; short bundle/menu name **200 OK** |
| Windows installed app/shortcut | **200 OK Web Server**; technical executable and app identity remain stable |
| Linux desktop launcher | **200 OK Web Server**, generic name **Web Server**, and searchable keywords; package/desktop IDs remain stable |
| ChromeOS Linux launcher | **200 OK Web Server**, generic name **Web Server**, and searchable keywords; component/desktop/service IDs remain stable |
| Desktop window and primary header | **200 OK Web Server** |
| Android launcher/system metadata | **200 OK Web Server** for launcher search |
| Android compact UI | **200 OK**, with **Web Server** descriptor |
| Chrome extension listing and popup | **200 OK Web Server**; describe it as the launcher for the desktop or Android app |
| Website site name/header | **200 OK Web Server** |
| Website SEO | Lead with **200 OK Web Server** and explicitly include **successor to Web Server for Chrome** |
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
- the `@ok200/*` workspace package scope and independently named
  `ok200-crostini` component;
- `ok200.app`;
- the **200 OK** application icon and searchable **200 OK Web Server** Android
  system label; and
- native host descriptions that use **200 OK Web Server**.

Current reconciliation should update active product surfaces while preserving
accurate historical references in `legacy/`, research documents, changelogs,
and migration history.

As of 2026-08-04, current source uses the accepted identity in the desktop
window and control header, Rust directory listings, website header and
metadata, README, and Chrome extension manifest and popup. Android already
uses the searchable **200 OK Web Server** system label while retaining the
compact **200 OK** header with a **Web Server** descriptor. Unreleased macOS
source now also generates **200 OK Web Server.app**, advertises that full
display name to the system, and retains **200 OK** as its short bundle name.
Unreleased Windows, Linux, and ChromeOS Linux source now likewise exposes the
full descriptive name to system launch/search surfaces while preserving their
technical identities.

The unpublished Node `ok200` package has been retired. Its command name and
branding survive only in accurate historical records; there is no current CLI
surface requiring a branding contract.

This source state is ahead of distribution. The locally installed desktop
review app has been rebuilt and visually checked with the changed window and
header title. The published website, Chrome Web Store listing, and
application/store metadata will not change until their normal deployment or
release workflows run. The existing Chrome Web Store release may therefore
continue to display its previous name until the branded extension update is
reviewed and published.

Implementation commits:

- `32ba314` defines this canonical naming contract;
- `c2da50f` applies it to the desktop control surface and Rust directory
  listing;
- `90b921d` reconciles the README, website, SEO, and migration copy; and
- `cd4f7f4` applies it to the Chrome extension and removes its stale product
  destination.

Validation on 2026-07-28:

- repository TypeScript type-checking and tests passed;
- the Astro site, Chrome extension, and static desktop webview production
  builds passed;
- strict Rust formatting and Clippy passed, along with all 37 workspace tests;
- the generated website was inspected with the current header, legacy
  relationship, and cross-platform message; and
- the unsigned production-style macOS app was rebuilt, installed, and
  inspected at its persisted portrait size with **200 OK Web Server** in both
  the title bar and control header and no Vite listener.

## Acceptance checks

- No current desktop window, application header, website header, extension
  manifest, or generated directory listing uses **Web Server for Chrome** as
  the current product name.
- macOS, Windows, Linux, ChromeOS Linux, and Android launcher search match
  **Web Server** while their compact in-app treatment and stable technical
  identities remain intact.
- Website and migration metadata still contain the exact legacy name in
  explicit successor/migration context.
- Extension copy states that the desktop or Android application serves files.
- README, vision, topics, and active product metadata agree on **200 OK Web
  Server**.
