---
"lyra-core": patch
"lyra-plugin-onchain-one": patch
---

Internal refactor (no behaviour change beyond additive result fields):

- Consolidate the value-moving lending pipeline — NAVI, Scallop, and Suilend now
  share one `runLendingWrite` helper (mainnet → minimum → policy → build → simulate
  → result), so the policy/simulate/receipt path is a single source of truth.
- Add a shared `errMsg` error normalizer, now exported from `lyra-core` and used
  across the on-chain tools and the CLI/gateway/system packages for consistent,
  bounded error output.
