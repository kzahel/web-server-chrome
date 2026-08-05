# Cross-version compatibility corpus

`corpus-v1.json` freezes messages, release metadata, and stored settings that
can outlive one source revision. Component tests consume their own section and
exercise production parsers or handlers. `validate.test.mjs` owns the corpus
shape and ensures every independently released boundary retains the required
old/current/future/invalid cases.

The corpus is source-level evidence. It does not replace installing old public
artifacts beside a candidate, store rollout checks, or physical testbeds.
