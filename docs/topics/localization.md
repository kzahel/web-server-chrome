# Localization

Topic: localization

Status: **English/German catalogs and local qualification are complete. The
actual Play-delivered Android 0.2.4/code 9 passed physical Pixel smoke;
production promotion at 1% was accepted by the API. Extension 0.1.9 is pending
Google review (public 0.1.8). Desktop 0.1.12 is publicly signed/notarized and passed a basic installed macOS
German smoke, checksum, website and updater-route checks.
[Tactical 022](../tactical/022-german-release-and-device-smoke.md) owns current
distribution/device evidence. The remaining seventeen-language supervisor is
prepared in [Tactical 023](../tactical/023-remaining-language-supervisor.md);
its translation workers have not started.**

The registry at `localization/locales.json` owns availability for React,
native desktop/Crostini, extension metadata, Android and iOS. English is the
source and fallback. The target set matches JSTorrent: `de fr es it pt-BR nl sv
da cs pl ro ru uk tr ja ko zh-CN zh-TW`; only English/German are initial app
release inputs. Website routes, store metadata/screenshots and the retiring
legacy Chrome App are outside this first slice.

[Tactical 020](../tactical/020-localization-foundation-and-german.md) owns the
implementation/evidence record; [scripts/LOCALIZATION.md](../../scripts/LOCALIZATION.md)
owns maintained commands. Reviewed German covers 255 React messages, 21 native
menu/launcher messages, three extension metadata fields, 180 Android resources
and 51 Apple string/permission entries. Each resource retains actual distinct
translation/review session identities and source/content/terminology hashes.
No third-party translations or JSTorrent review attestations were imported.

## Runtime decisions

Each component bundles native offline catalogs and can update independently.
Desktop's native layer owns its separate app-language preference and synchronizes
the React view and native menus. Extension popup/Crostini controls share an
extension-local preference. Android uses AppCompat/OS per-app locales, includes
all shipping translations in its base bundle, and localizes service/controller
contexts before API 33. iOS follows native app/OS language selection and uses
Apple string catalogs, including local-network permission copy.

Language changes preserve server state, selected folders and runtime contracts.
No locale is added to native messaging or the Crostini controller protocol.
Known legacy display messages are localized at presentation time; unknown
old/new technical diagnostics remain verbatim. Existing configuration and
older components continue to work without any rollout order. New locale
preferences are isolated from server settings; unknown future preferences are
retained and use an English fallback. Legacy support needs no timed removal.

Chinese script/region matching and Brazilian Portuguese matching are tested.
English fallback, ordered system preferences, persisted overrides and native
menu changes are covered. Expanded and mirrored pseudo catalogs are test-build
only; ordinary registration/output checks exclude them.

## Maintenance and limits

The MIT-licensed JSTorrent workflow was adapted at the revision recorded in
[UPSTREAM.md](../../localization/UPSTREAM.md), with common utilities, native
adapters and worker plumbing separated. There is no dependency on the sibling
checkout. AI execution is explicit, bounded and resumable, and uses independent
translation/review sessions. CI runs deterministic catalog, provenance,
generation and source checks with no model calls. Release-input registration
alone never proves runtime or store delivery.

Apple currently has no plural/device-varying product copy; unsupported variants
fail closed until an adapter and round-trip tests are added. Developer/installer
diagnostics and served HTTP directory listings remain outside app translation.
The [overnight runbook](../runbooks/localization-overnight.md) and frozen
campaign manifest sequence French then sixteen target languages. A supervising
agent executes bounded, resumable independent translation/review, serialized
five-surface native qualification and exact completion records. Plan/status/
verify/handoff commands launch no workers. Publication remains a separate
maintainer-authorized action. Website/store localization, iOS distribution and
broader exact-artifact acceptance remain follow-ups.
