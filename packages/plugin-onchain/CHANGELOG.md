# lyra-plugin-onchain

## 0.2.0

### Minor Changes

- Add Walrus (WAL) staking + a single-source protocol registry.

  - New `walrus.stake` / `walrus.unstake` / `walrus.staking` tools: delegate WAL to
    a Walrus storage node's pool (min 1 WAL), through the guarded policy pipeline.
  - Consolidate the protocol allowlist into one `REGISTRY` (deriving PROTOCOL_IDS,
    PROTOCOL_LABELS, ALLOWLISTABLE_PROTOCOLS) + a dependency-free `./protocol-ids`
    subpath export so clients import the allowlist instead of mirroring it.
  - Guidance updated so the agent knows it can list + do WAL staking.

### Patch Changes

- lyra-core@0.2.0

## 0.1.11

### Patch Changes

- Repoint the on-chain integration at the reworked Lyra v1 Move package.

  The Move package was restructured into five focused modules (constants, allowlist,
  receipt, policy, vault) with a per-object version guard and freshly published on
  mainnet. This updates the package id every consumer targets and moves the
  `ActionReceipt` type path from the `policy` module to the new `receipt` module.

  - lyra-core@0.1.11
