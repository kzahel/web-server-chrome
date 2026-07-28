# Product Feedback and Support

> Released applications link to stable `ok200.app` entry points that we
> control. Those routes may change providers without requiring an application
> update.

Topic: product-feedback-and-support

Status: **accepted routing contract; interim GitHub Issues destination being
implemented.**

Last reconciled: **2026-07-28**.

Related:

- [`product-branding.md`](product-branding.md)
- [`legacy-app-migration.md`](legacy-app-migration.md)

## Scope

This topic owns:

- durable public URLs for feedback, suggestions, and support;
- where those URLs currently send users;
- visible feedback and source entry points across product surfaces;
- the distinction between interim GitHub intake and future accountless
  feedback; and
- the public source-code and license presentation.

It does not turn GitHub Issues into a complete customer-support system, choose
the final form provider, or define private security-reporting operations.

## Accepted URL contract

| Stable product URL | Current destination | Intended role |
|---|---|---|
| `https://ok200.app/feedback` | GitHub Issues list | Canonical app-facing entry point |
| `https://ok200.app/support` | GitHub Issues list | Memorable support alias |
| `https://ok200.app/suggestions` | GitHub Issues list | Memorable idea alias |
| GitHub repository URL | `kzahel/web-server-chrome` | Source, contribution, and MIT license |

Applications should link to `/feedback`, not directly to the current intake
provider. `/support` and `/suggestions` are public aliases for people and
external copy; they do not require separate app controls.

The static Astro site is hosted on GitHub Pages, which does not provide
application-level HTTP redirects. Each alias therefore emits a small,
accessible, no-index redirect document using `location.replace`, a refresh
fallback, a canonical destination, and a normal link for browsers that block
automatic navigation.

## Current GitHub evidence

A `gh` audit on 2026-07-28 found:

- Issues enabled on the public repository;
- 15 open Issues, all older feature requests inherited from the legacy
  project;
- no issue forms or templates; and
- Discussions disabled.

The interim aliases lead to the Issues list rather than directly opening a new
issue. This gives users a chance to search and react to an existing request
before creating a duplicate.

GitHub Issues is an interim destination, not the desired general-user intake.
Submitting there requires a GitHub account, which is an inappropriate
long-term requirement for product feedback or support. The intended next
destination is an accountless form controlled through `ok200.app`; Buttondown,
Google Forms, or an owned form backend remain candidates. Changing that
destination must require only a website deployment.

## Surface contract

| Surface | Required entry points |
|---|---|
| Desktop control window | Prominent **Feedback & support** and **Source · MIT** links |
| Android application | Visible **Feedback & support** and **Source · MIT** links after the primary controls |
| Chrome extension popup | Compact **Feedback & support** and **Source · MIT** links |
| Website | Feedback in primary navigation and feedback/source/license links in the footer |
| README and package metadata | Feedback/Issues, repository, homepage, and MIT license information |

**Feedback & support** must use `https://ok200.app/feedback`. **Source · MIT**
may link directly to the public GitHub repository: the destination itself is
part of the transparency signal.

Do not place support calls to action in served directory listings. Those pages
may be opened by people who are consuming shared files rather than operating
the application.

## License contract

The project is MIT licensed. The repository must contain a root `LICENSE`
document so GitHub, package consumers, and users can inspect the actual grant;
a README footer or one package's metadata is not sufficient.

The root license covers project-owned code. Bundled third-party components
retain their own licenses and notices.

## Future accountless intake

Before presenting the feedback route to a broad legacy audience:

1. select an accountless form destination;
2. collect only the minimum useful fields: product surface, version/platform,
   category, description, optional reply address, and optional diagnostic
   attachment;
3. explain what is public or private and how a reply address is used;
4. provide distinct guidance for bugs, suggestions, general help, and private
   security reports; and
5. update only the website route, leaving released app URLs unchanged.

Buttondown is already used for the update-signup flow, but that does not make
it the automatic choice for structured support. Google Forms is acceptable as
a temporary accountless intake if it permits submission without sign-in.

## Acceptance checks

- `/feedback`, `/support`, and `/suggestions` build as static redirect pages
  with an accessible fallback link.
- Every current application surface opens `/feedback` externally rather than
  navigating its embedded UI.
- Every current application surface exposes the public repository and MIT
  label.
- A root MIT `LICENSE` exists and active package metadata does not contradict
  it.
- No product surface links directly to a form provider that would require an
  app release to change.
- The topic continues to call out GitHub-account dependence until an
  accountless flow is deployed.
