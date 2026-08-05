Read and follow [`CLAUDE.md`](CLAUDE.md) for repository setup, validation, and
release commands.

## Cross-version compatibility

For every feature or behavioral change, explicitly consider backward and
forward compatibility between versions that users may run at the same time.
Identify all independently released producers and consumers—including store
apps, extensions, desktop/mobile apps, controllers, installers, update feeds,
and services—and do not assume their deployments are atomic or ordered.

When a change affects a shared protocol, API, persisted data, configuration,
artifact, or update path:

- Prefer additive changes, capability negotiation, and overlapping supported
  version ranges over an exact-version cutover.
- Plan a rollout in which old/new and new/old component combinations continue
  to interoperate throughout store review, staged rollout, and delayed updates.
- Add cross-version tests for each supported pairing, and make release checks
  reject a new artifact when it has no compatibility overlap with a counterpart
  that users can still receive or run.
- Document the compatibility window, rollout order, fallback/error behavior,
  and eventual removal plan for legacy support in the owning topic or tactical
  document.

Do not intentionally strand a supported released component or require users to
update independently distributed components in lockstep unless the maintainer
has explicitly accepted the incompatibility and its user-visible consequences.

## Documentation roles

Focused, living records of continuing concerns live under
[`docs/topics/`](docs/topics/README.md). Before changing desktop, Android, or
iOS runtime, release/signing, or legacy migration behavior, read the
corresponding topic document. Update it when work changes the current state,
accepted decision, evidence, gaps, or recommended next direction.

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
- iOS runtime: [`docs/topics/ios-runtime.md`](docs/topics/ios-runtime.md)
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
- Completed native iOS implementation and physical-device validation:
  [`docs/tactical/016-native-swift-ios-app.md`](docs/tactical/016-native-swift-ios-app.md)
- Planned iOS store-readiness follow-up:
  [`docs/tactical/017-ios-store-readiness.md`](docs/tactical/017-ios-store-readiness.md)
- Completed cross-platform CI and test-confidence implementation:
  [`docs/tactical/018-cross-platform-ci-and-test-confidence.md`](docs/tactical/018-cross-platform-ci-and-test-confidence.md)
- Desktop post-publication production runbook:
  [`docs/runbooks/desktop-production-validation.md`](docs/runbooks/desktop-production-validation.md)
- Active ChromeOS launcher and network closeout:
  [`docs/tactical/011-extension-launcher-and-chromeos-network-readiness.md`](docs/tactical/011-extension-launcher-and-chromeos-network-readiness.md)
