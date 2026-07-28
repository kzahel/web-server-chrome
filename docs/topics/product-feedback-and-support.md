# Product Feedback and Support

> Released applications link to stable `ok200.app` entry points that we
> control. Those routes may change providers without requiring an application
> update.

Topic: product-feedback-and-support

Status: **interim GitHub Issues routing implemented in source; accountless
intake and publication pending.**

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

- [x] `/feedback`, `/support`, and `/suggestions` build as static redirect pages
  with an accessible fallback link.
- [x] Every current application surface opens `/feedback` externally rather than
  navigating its embedded UI.
- [x] Every current application surface exposes the public repository and MIT
  label.
- [x] A root MIT `LICENSE` exists and active package metadata does not contradict
  it.
- [x] No product surface links directly to a form provider that would require an
  app release to change.
- [x] The topic continues to call out GitHub-account dependence until an
  accountless flow is deployed.

## Implementation result

Implemented as reviewable commits:

- `354ef59` establishes this routing and accountless-intake contract;
- `6ff9b1a` adds the three Astro aliases, root MIT license, stable package
  feedback metadata, and the corrected public CLI repository URL;
- `671dbd1` adds the feedback/source controls to desktop, website, and README;
- `e506b18` adds equivalent controls to the Chrome extension and Android app;
  and
- `c2090f9` makes the GitHub Pages workflow use the repository's frozen pnpm
  lockfile.

Current source behavior:

- desktop opens both links through Tauri's native opener;
- Android uses the platform URI handler;
- the extension opens both links in browser tabs;
- the website exposes Feedback and Source in primary navigation and the footer;
  and
- `/feedback`, `/support`, and `/suggestions` all replace themselves with the
  public GitHub Issues list while retaining a normal fallback link.

## Validation evidence

Completed on 2026-07-28:

- `gh` confirmed the public Issues configuration and enumerated all 15 open
  requests;
- the repository TypeScript workflow passed, including 76 engine tests with
  two existing skips;
- the production Astro build emitted all six current routes, and the three
  aliases were checked for both automatic and fallback destinations;
- production desktop and extension bundles built successfully;
- Android debug Kotlin compilation and unit tests passed;
- the production-style macOS app was rebuilt, installed, and visually
  inspected with both controls present at its portrait size; and
- the installed desktop app runs as one process with no Vite listener.

These changes have not been published. Local `main` remains ahead of
`origin/main`; the public aliases will not resolve until the branch is pushed
and the GitHub Pages workflow succeeds. Published Android and extension builds
likewise retain their current UI until their next releases.
