# lyra-ai-agent

The `lyra` CLI — a **Sui-native, policy-aware AI treasury assistant**. Real
on-chain work on Sui (balances, transfers, swaps, Scallop / NAVI / Suilend lending,
native + liquid staking, yield discovery, Walrus receipts) from your terminal, where
every value-moving action is checked against a deterministic on-chain policy, dry-run
simulated, and held for approval before broadcast. The model proposes; code disposes.

## Install

```bash
bun add -g lyra-ai-agent
lyra init     # bootstrap an agent (fresh Sui keypair, local encrypted keystore)
lyra          # chat with your agent
```

Requires [bun](https://bun.sh) — the CLI shebangs `bun`.

## Commands

```
lyra init                bootstrap a new agent (fresh keypair) OR log in with the web
lyra [--yolo]            interactive chat (default; --yolo skips approvals)
lyra login               device-link: use the same agent your web wallet derives
lyra whoami              show owner → agent → vault (and treasury balance)
lyra status              agent + wallet + config state
lyra logs                tail the activity log
lyra model               re-pick the brain model
lyra telegram <sub>      phone-DM gateway         (setup | status | remove)
lyra pairing <sub>       DM pairing approvals     (list | approve | revoke | clear-pending)
lyra gateway <sub>       always-on daemon         (run | start | stop | restart | status | logs)
lyra demo                guarded-pipeline demo (policy → blocked over-cap → send → Walrus)
```

Zero-config: `lyra` ships sensible mainnet defaults, so it runs with no env vars.
Configure the brain with `OPENAI_API_KEY` (or any OpenAI-compatible `LYRA_LLM_*`),
set `LYRA_POLICY_*` fund-control limits to tighten the guardrails, and fund the agent
address with a little SUI for gas. Material-risk actions pause for your approval.

See the [root README](https://github.com/lyraai-protocol/lyra#readme) for architecture
and the full reference.
