import { Transaction } from '@mysten/sui/transactions'
import { getSuiBalanceMist, keypairFromSecret, makeSuiClient } from '../chain'
import type { LyraNetwork } from '../config'
import { formatSui } from '../format'

/**
 * Sweep an agent's SUI balance to a recipient address. Reserves a fixed amount
 * of MIST for the sweep transaction's own gas, so the resulting balance is "as
 * close to 0 as the gas reserve allows" without underpaying.
 *
 * Used by `lyra drain` for fund recovery on a retiring agent.
 */

export interface DrainAgentResult {
  digest: string
  amountSent: bigint
  gasReserved: bigint
}

/** Default MIST kept aside to cover the sweep transaction's gas. ~0.01 SUI. */
export const SWEEP_GAS_RESERVE_MIST = 10_000_000n

/**
 * Pure helper: given balance + optional reserve override, return the value to
 * send, the gas reserve, and an error message if the balance can't cover the
 * sweep. Lifted out so it can be unit-tested without a live RPC.
 */
export function computeSweepAmount(opts: {
  balanceMist: bigint
  agentAddress: string
  gasReserveOverride?: bigint
}): { value: bigint; gasReserve: bigint; error?: string } {
  const gasReserve = opts.gasReserveOverride ?? SWEEP_GAS_RESERVE_MIST
  if (opts.balanceMist <= gasReserve) {
    return {
      value: 0n,
      gasReserve,
      error: `agent ${opts.agentAddress} has ${formatSui(opts.balanceMist)} SUI; below gas reserve ${formatSui(gasReserve)} SUI`,
    }
  }
  return { value: opts.balanceMist - gasReserve, gasReserve }
}

export async function drainAgentEOA(opts: {
  network: LyraNetwork
  secret: string
  to: string
  /** Override the gas reserve (in MIST). Default = SWEEP_GAS_RESERVE_MIST. */
  gasReserveMist?: bigint
}): Promise<DrainAgentResult> {
  const client = makeSuiClient(opts.network)
  const keypair = keypairFromSecret(opts.secret)
  const address = keypair.getPublicKey().toSuiAddress()

  const balance = await getSuiBalanceMist(client, address)
  const sweep = computeSweepAmount({
    balanceMist: balance,
    agentAddress: address,
    gasReserveOverride: opts.gasReserveMist,
  })
  if (sweep.error) throw new Error(sweep.error)

  const tx = new Transaction()
  tx.setGasBudget(sweep.gasReserve)
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(sweep.value)])
  tx.transferObjects([coin], tx.pure.address(opts.to))

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  })
  await client.waitForTransaction({ digest: result.digest })

  return { digest: result.digest, amountSent: sweep.value, gasReserved: sweep.gasReserve }
}
