# lyra-core

The SDK behind **lyra**, a Sui-native, policy-aware AI treasury assistant:
the brain (OpenAI-compatible), local file-based memory + index,
the **permission service + approval floor**, plain-EOA identity + a local
encrypted keystore, the **lyra::policy (Trustless Agents) identity client**, the
plugin host, tool registry, and event queue.

## Install

```bash
bun add lyra-core
```

Bun / TypeScript-native (ships TS source). Requires [bun](https://bun.sh).

## Use

Install [`lyra-ai-agent`](https://www.npmjs.com/package/lyra-ai-agent) (the
CLI) for the full agent. This package is for plugin authors and library consumers
who want to embed the runtime, the deterministic policy/approval spine, or the
lyra::policy identity client (`registerAgent`, `resolveAgentById`, `buildAgentCard`).

See the [root README](https://github.com/rifkyeasy/lyra#readme) for the full surface.
