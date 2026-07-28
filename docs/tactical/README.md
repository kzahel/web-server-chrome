# Implementation Tactical Documents

Bounded implementation plans and execution records live here.

Use zero-padded numeric prefixes for new tactical documents:
`000-topic.md`, `001-next-topic.md`, and so on. Keep one active implementation
slice per document when practical. A parent sequencing tactical is acceptable
when it explicitly delegates bounded follow-up slices and remains an index,
deadline ledger, and completion record.

Completed tacticals remain as historical execution records. Update the living
documents under [`../topics/`](../topics/README.md) when current status,
decisions, evidence, or recommended next work changes.

## Current tacticals

| Tactical | Status | Purpose |
|---|---|---|
| [`000-desktop-native-core-and-release-readiness.md`](000-desktop-native-core-and-release-readiness.md) | active parent; documentation baseline recorded 2026-07-28 | Sequence release/signing hardening, desktop Rust-core migration, launcher fixes, and the final legacy Chrome App migration window |
