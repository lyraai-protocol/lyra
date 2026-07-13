/**
 * CctpExecutor — the REAL {@link DepositExecutors} implementation over Circle CCTP +
 * the Wormhole SDK. It plugs into the tested orchestration spine (intent → lifecycle
 * → store → driver): the driver reads each deposit's `nextAction` and calls the
 * matching method here.
 *
 * This wraps the flow verified end-to-end on testnet (Base Sepolia burn → Circle
 * attestation → Sui redeem → USDC minted). Notes learned there, encoded below:
 *  - the source-chain BURN is signed by the USER's own wallet (self-custody); the
 *    server only watches for it, then drives attestation + redeem.
 *  - the Sui REDEEM (`receiveMessage`) is permissionless — any funded Sui signer can
 *    submit it; the USDC mints to the recipient encoded in the burn (the agent). So
 *    a dedicated relayer key pays redeem gas.
 *  - build the Sui signer as `new SuiSigner(chain, grpcClient, Ed25519Keypair
 *    .fromSecretKey(key))` — `getSuiSigner` wrongly expects a mnemonic.
 *  - run this under Node, NOT Bun (Bun mis-resolves `@noble/hashes/crypto` on the
 *    Sui-signer path). The bridge poller is a Node process, separate from the gateway.
 *
 * The Sui-native legs (swap, vault deposit) are DELEGATED to caller-provided functions
 * so the v1 vault contract + signer stay out of this v2 package. The deposit PTB
 * (`vault::deposit_entry<USDC>`) is verified on testnet: 1 CCTP-redeemed USDC deposited
 * into a `Vault<USDC>`. Still required to go live: an app flow that provisions the
 * owner's `Vault<USDC>` + wires `depositToVault`, and one run THROUGH this spine.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { CircleTransfer, wormhole } from '@wormhole-foundation/sdk'
import { SuiSigner } from '@wormhole-foundation/sdk-sui'
import evm from '@wormhole-foundation/sdk/evm'
import sui from '@wormhole-foundation/sdk/sui'
import { type CctpNetwork, whChainName } from './cctp-chains'
import type { DepositExecutors } from './deposit-driver'
import type { PendingDeposit } from './deposit-store'

export interface CctpExecutorConfig {
  network: CctpNetwork
  /** suiprivkey… for the redeem gas payer (permissionless — not the recipient). */
  suiRelayerKey: string
  /** How long each attestation poll waits before yielding back to the driver (ms). */
  attestationPollMs?: number
  /**
   * Deposit the redeemed USDC into the owner's `Vault<USDC>`. Delegated to the caller
   * so the v1 vault contract + signer stay in the v1 plugin (this package pins
   * @mysten/sui v2 for the Wormhole SDK). Verified on testnet:
   * `vault::deposit_entry<USDC>(vault, coin)`.
   */
  depositToVault: (deposit: PendingDeposit) => Promise<{ vaultDepositDigest: string }>
  /**
   * Swap a redeemed long-tail asset to USDC on Sui before the vault. Delegated (v1
   * swap). Omit if you only support native-USDC (CCTP) deposits.
   */
  swapToUsdc?: (deposit: PendingDeposit) => Promise<{ suiSwapDigest: string }>
}

/** Build the real CCTP executor. `deposit` handlers reconstruct the transfer from the
 *  user's burn tx and drive it forward. Requires a Node runtime (see file header). */
export function makeCctpExecutor(cfg: CctpExecutorConfig): DepositExecutors {
  const wh = () => wormhole(cfg.network, [evm, sui])
  const pollMs = cfg.attestationPollMs ?? 60_000

  const transferOf = async (d: PendingDeposit) => {
    const w = await wh()
    return CircleTransfer.from(
      w,
      { chain: whChainName(d.sourceChain, cfg.network) as never, txid: d.burnTxHash as string },
      120_000,
    )
  }

  return {
    // The user burns on the source chain themselves; we only advance once their burn
    // tx is known (reported into the deposit) and reconstructs cleanly.
    async awaitSourceBurn(d) {
      if (!d.burnTxHash) return null
      await transferOf(d) // throws if the tx isn't a finalized CCTP burn yet
      return { burnTxHash: d.burnTxHash }
    },

    async awaitAttestation(d) {
      const xfer = await transferOf(d)
      try {
        const ids = await xfer.fetchAttestation(pollMs)
        return { attestation: JSON.stringify(ids) }
      } catch {
        return null // not attested yet — retry next tick
      }
    },

    async submitSuiRedeem(d) {
      const w = await wh()
      const xfer = await transferOf(d)
      await xfer.fetchAttestation(120_000)
      const client = await w.getChain('Sui').getRpc()
      const signer = new SuiSigner(
        'Sui' as never,
        client as never,
        Ed25519Keypair.fromSecretKey(cfg.suiRelayerKey),
      )
      const dstTxs = await xfer.completeTransfer(signer as never)
      return { suiRedeemDigest: String(dstTxs[dstTxs.length - 1] ?? dstTxs[0]) }
    },

    swapToUsdc(d): Promise<{ suiSwapDigest: string }> {
      if (!cfg.swapToUsdc) {
        return Promise.reject(new Error('swapToUsdc not configured — native-USDC deposits only'))
      }
      return cfg.swapToUsdc(d)
    },

    depositToVault(d): Promise<{ vaultDepositDigest: string }> {
      return cfg.depositToVault(d)
    },
  }
}
