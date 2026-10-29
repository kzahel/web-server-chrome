# Tooling provenance

The offline workflow, Android adapter, terminology fingerprints, ICU validator,
worker ownership/resumption and their initial regression tests are adapted from
the `kzahel/jstorrent` working checkout, based at
`32627b3588ef3a3b5f2e02c70fc03326376b316c` when imported
(`scripts/localization.py`, `localization-codex.py`, `localization-ya.py`,
`localization-icu.mjs`, `translation_terms.py` and
`clients/android/scripts/localization.py`). MIT licensed, copyright 2026 Kyle
Graehl; the repository root LICENSE retains the required notice.

Changes separate common utilities, Android and execution backends, adapt local
paths, add extension and Apple catalogs, and provide registry/build gates.
No JSTorrent translations or review identities are imported. Catalogs are
independently authored for 200 OK. No sibling checkout is needed at runtime.

The remaining-language campaign planner, profile guidance and supervision
runbook also adapt JSTorrent's October 29 workflow at
`43f5ca93b885e246851d429ee192d8a4cd5fb507`
(`scripts/localization-campaign.py`, `localization/campaigns/legacy-android.json`,
`docs/development/localization-overnight.md`). This project adds French to its
English/German baseline, covers five native surfaces, retains workspace-write
permissions, and binds qualification to exact runtime/catalog/review inputs.
Only tooling and register guidance are adapted; no translated catalogs or
review attestations are imported.
