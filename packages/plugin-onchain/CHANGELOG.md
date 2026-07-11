# lyra-plugin-onchain

## 0.1.11

### Patch Changes

- Repoint the on-chain integration at the reworked Lyra v1 Move package.

  The Move package was restructured into five focused modules (constants, allowlist,
  receipt, policy, vault) with a per-object version guard and freshly published on
  mainnet. This updates the package id every consumer targets and moves the
  `ActionReceipt` type path from the `policy` module to the new `receipt` module.

  - lyra-core@0.1.11
