# Shared HTTP conformance

`corpus-v1.json` is the language-neutral externally observable HTTP contract
for the independent Swift, Kotlin, and Rust servers. `schema-v1.json` defines
the versioned case shape, and `validate.test.mjs` rejects duplicate cases,
unsafe fixture paths, unknown configurations, and any runtime that is neither
claimed nor explicitly excluded with a reason.

The adapters are:

- `ios/200OKTests/HTTPConformanceTests.swift`
- `android/app/src/test/java/app/ok200/android/server/HttpConformanceTest.kt`
- `desktop/core/tests/http_conformance.rs`

Each adapter creates the same fixture tree, runs every case claimed for its
runtime, and prints the contract version plus claimed-case count. Platform
lifecycle and storage APIs remain in their native suites. Additive changes to
the contract belong in the current corpus; incompatible schema changes require
a new schema/corpus version and adapters for all applicable runtimes.
