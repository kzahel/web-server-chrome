Read and follow [`CLAUDE.md`](CLAUDE.md) for repository setup, validation, and
release commands.

## Documentation roles

Focused, living records of continuing concerns live under
[`docs/topics/`](docs/topics/README.md). Before changing desktop or Android
runtime, release/signing, or legacy migration behavior, read the corresponding
topic document. Update it when work changes the current state, accepted
decision, evidence, gaps, or recommended next direction.

Bounded implementation plans and execution records live under
[`docs/tactical/`](docs/tactical/README.md). Tactical filenames use
zero-padded numeric prefixes such as `000-topic.md`, `001-next-topic.md`.
Completed tacticals remain as execution records; continuing guidance belongs
in topic or architecture documents.

Architecture and research documents own durable system shape, product history,
or external facts. They must not silently override a newer accepted decision in
a topic document. Mark historical proposals explicitly and link to the current
topic.

When a commit series implements a documented topic, normally reuse the topic
filename slug in `Topic: <slug>` commit trailers. Register new topic strings in
the root [`topics.md`](topics.md) log before reusing them across a series.

## Current decision entry points

- Desktop runtime: [`docs/topics/desktop-runtime.md`](docs/topics/desktop-runtime.md)
- Android runtime: [`docs/topics/android-runtime.md`](docs/topics/android-runtime.md)
- ChromeOS extension launcher:
  [`docs/topics/chromeos-extension-launcher.md`](docs/topics/chromeos-extension-launcher.md)
- ChromeOS Crostini launcher/controller:
  [`docs/topics/chromeos-crostini-launcher.md`](docs/topics/chromeos-crostini-launcher.md)
- Desktop CI, signing, and releases:
  [`docs/topics/desktop-release-readiness.md`](docs/topics/desktop-release-readiness.md)
- Legacy Chrome App migration:
  [`docs/topics/legacy-app-migration.md`](docs/topics/legacy-app-migration.md)
- Active release confidence closeout:
  [`docs/tactical/009-release-confidence-closeout.md`](docs/tactical/009-release-confidence-closeout.md)
- Active desktop production repair and validation:
  [`docs/tactical/015-desktop-production-validation.md`](docs/tactical/015-desktop-production-validation.md)
- Desktop post-publication production runbook:
  [`docs/runbooks/desktop-production-validation.md`](docs/runbooks/desktop-production-validation.md)
- Active ChromeOS launcher and network closeout:
  [`docs/tactical/011-extension-launcher-and-chromeos-network-readiness.md`](docs/tactical/011-extension-launcher-and-chromeos-network-readiness.md)
