# Runbooks

Runbooks define repeatable operating procedures whose product assertions belong
in this repository. They must stay machine-neutral: do not add controller
hostnames, VM names, credentials, account identifiers, private service paths,
or local evidence locations.

Machine discovery and controller-specific invocation belong in the private
dotfiles repository. Testbed lifecycle and transport behavior belong in each
standalone testbed repository. A runbook here owns what the 200 OK product must
do, what evidence is required, and what constitutes pass or fail.

## Current runbooks

| Runbook | Purpose |
|---|---|
| [`desktop-production-validation.md`](desktop-production-validation.md) | Accept or reject the actual public desktop release, production updater/download services, and Chrome Web Store extension on macOS, Windows, and Linux |
| [`ios-app-store-archive.md`](ios-app-store-archive.md) | Preflight, archive, export, and inspect an iOS App Store candidate without crossing upload or publication authority gates |
| [`release-evidence-template.md`](release-evidence-template.md) | Record automated gates, exact artifact hashes, advisory testbed passes or explicit skips, and remaining claim limits for any component release |
