# lyra-plugin-onchain

The **Sui limbs** for **lyra** — the brain tools that do real on-chain work,
every value-moving call routed through the deterministic policy → simulation →
approval pipeline:

- **Wallet / account** — `account.info`, `chain.balance`, `tokens.info`
- **Transfers** — `chain.send`, `chain.wrap`, `chain.unwrap`
- **Trading** — `swap.best` / `swap.compare` (**Cetus Finance** + **DeepBook**
  best-execution), `swap.quote` / `swap.execute`, `moe.quote` / `moe.swap`
- **Lending** — full **Scallop V3** suite: `scallop.markets` / `position` / `supply` /
  `withdraw` / `borrow` / `repay`
- **Discovery + risk** — `defi.yields` (DeFiLlama), `risk.token`, `nansen.labels`,
  `cex.balance` (Bybit, read-only)
- **Identity** — `identity.resolve` / `identity.register` (**lyra::policy** Trustless
  Agents)
- **Controls + analysis** — `policy.show`, `tx.simulate`, `chain.read` /
  `chain.write`, `chain.tx` / `chain.contract` / `chain.activity`, `chain.block` /
  `chain.gas`

## Install

Auto-installed with [`lyra-ai-agent`](https://www.npmjs.com/package/lyra-ai-agent).
Or directly: `bun add lyra-plugin-onchain`.

See the [root README](https://github.com/rifkyeasy/lyra#readme) for the full tool reference.
