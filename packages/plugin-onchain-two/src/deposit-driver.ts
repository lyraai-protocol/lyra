/**
 * The deposit driver — the runtime that advances pending cross-chain deposits by
 * one step per tick. It reads each deposit's {@link nextAction}, calls the matching
 * executor, and records the result as a state transition. The executors (the actual
 * chain work — CCTP burn watch, Circle attestation poll, Sui redeem, swap, vault
 * deposit) are INJECTED, so this control loop is fully testable with mocks and the
 * risky cross-chain integration is swapped in behind a stable interface.
 *
 * A step either advances the deposit (executor returned artifacts), leaves it in
 * place to retry next tick (executor returned `null` — "not ready yet", e.g. the
 * user hasn't burned or Circle hasn't attested), or fails it (executor threw).
 */

import { nextAction } from './deposit-lifecycle'
import type { DepositStore, PendingDeposit } from './deposit-store'

/**
 * Chain executors, one per driving action. The "await_*" steps return `null` while
 * still pending (retry later) or the artifacts once done; the submit/swap/deposit
 * steps return their artifacts or throw. Throwing fails the deposit.
 */
export interface DepositExecutors {
  awaitSourceBurn(d: PendingDeposit): Promise<{ burnTxHash: string } | null>
  awaitAttestation(d: PendingDeposit): Promise<{ attestation: string } | null>
  submitSuiRedeem(d: PendingDeposit): Promise<{ suiRedeemDigest: string }>
  swapToUsdc(d: PendingDeposit): Promise<{ suiSwapDigest: string }>
  depositToVault(d: PendingDeposit): Promise<{ vaultDepositDigest: string }>
}

/** Advance ONE deposit by at most one step. Returns the (possibly unchanged) record. */
export async function driveOnce(
  store: DepositStore,
  deposit: PendingDeposit,
  ex: DepositExecutors,
  now?: number,
): Promise<PendingDeposit> {
  const action = nextAction(deposit.status, deposit.needsSwap)
  try {
    switch (action) {
      case 'await_source_burn': {
        const r = await ex.awaitSourceBurn(deposit)
        return r ? store.transition(deposit.id, 'source_burned', r, now) : deposit
      }
      case 'await_attestation': {
        const r = await ex.awaitAttestation(deposit)
        return r ? store.transition(deposit.id, 'attested', r, now) : deposit
      }
      case 'submit_sui_redeem':
        return store.transition(deposit.id, 'sui_redeemed', await ex.submitSuiRedeem(deposit), now)
      case 'swap_to_usdc':
        return store.transition(deposit.id, 'swapped_to_usdc', await ex.swapToUsdc(deposit), now)
      case 'deposit_to_vault':
        return store.transition(
          deposit.id,
          'vault_deposited',
          await ex.depositToVault(deposit),
          now,
        )
      default:
        return deposit // terminal — nothing to do
    }
  } catch (e) {
    return store.fail(deposit.id, (e as Error).message, now)
  }
}

/** Drive EVERY active deposit one step — one poll tick. Errors are isolated per
 *  deposit (a failing one fails itself, not the tick). */
export async function driveTick(
  store: DepositStore,
  ex: DepositExecutors,
  now?: number,
): Promise<PendingDeposit[]> {
  return Promise.all(store.listActive().map(d => driveOnce(store, d, ex, now)))
}

/** Fail any active deposit that hasn't advanced within `maxAgeMs` (a stuck source
 *  burn or an attestation that never arrived), so it can't linger forever. Returns
 *  the deposits it reaped. */
export function reapStale(
  store: DepositStore,
  maxAgeMs: number,
  now = Date.now(),
): PendingDeposit[] {
  return store
    .listActive()
    .filter(d => now - d.updatedMs > maxAgeMs)
    .map(d => store.fail(d.id, `stale: no progress for ${maxAgeMs}ms`, now))
}
