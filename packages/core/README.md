# lyra-core

The SDK behind **lyra**, a Sui-native, policy-aware AI treasury assistant:
the brain (OpenAI-compatible), local file-based memory + index,
the **permission service + approval floor**, a Sui keypair identity + local
encrypted keystore, deterministic per-owner agent derivation, the plugin host,
tool registry, and event queue.

## Install

```bash
bun add lyra-core
```

Bun / TypeScript-native (ships TS source). Requires [bun](https://bun.sh).

## Use

Install [`lyra-ai-agent`](https://www.npmjs.com/package/lyra-ai-agent) (the
CLI) for the full agent. This package is for plugin authors and library consumers
who want to embed the runtime, the deterministic policy/approval spine, or the
per-owner agent derivation.

See the [root README](https://github.com/lyraai-protocol/lyra#readme) for the full surface.
