/**
 * The shared guarded pipeline for a value-moving lending action (supply / withdraw /
 * borrow / repay), across the NAVI, Scallop, and Suilend adapters.
 *
 * Every write runs the SAME sequence as sui.send — mainnet guard → minimum guard →
 * policy gate → build the protocol PTB → dry-run simulate → execute → standardized
 * result. Only the two protocol-specific bits (the amount/minimum the caller computes,
 * and the `build` closure that assembles the PTB) differ; the policy/simulate/receipt
 * path lives HERE so it changes in one place instead of once per protocol × verb.
 *
 * The dry-run simulate inside `simulateAndExecute` is the safety net for the PTB; the
 * guards below are the safety net for the POLICY — so getting the per-call guard params
 * right (which action gates on policy, which has a minimum) is the whole point of
 * centralizing them.
 */

import type { Transaction } from '@mysten/sui/transactions'
import { errMsg } from './err'
import { simulateAndExecute } from './execute'
import { policyBlock } from './policy'
import type { OnchainRuntimeContext } from './types'

export type LendingResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string }

/** What a protocol's `build` returns: the PTB (+ any dynamic result fields), or an
 *  error (e.g. "no position to withdraw") surfaced before the simulate. */
export type BuildResult = { tx: Transaction; extra?: Record<string, unknown> } | { error: string }

export interface LendingWriteOpts {
  /** Result label + action, e.g. protocol 'navi', action 'supply'. */
  protocol: string
  action: string
  /** Message when the runtime isn't mainnet (the SDKs are mainnet-only). */
  mainnetError: string
  /** The value moved, in base units of `coinType` (already parsed + validated > 0). */
  amountBase: bigint
  /** Coin type for the policy check. */
  coinType: string
  /** A caller-computed minimum-size error, or null to skip the minimum guard. */
  minError?: string | null
  /** The policy `protocol` tag, or null to skip the policy gate (e.g. a withdraw that
   *  only pulls the agent's own funds back). */
  policyProtocol?: string | null
  /** Static result fields (e.g. `{ amountSui }`). Dynamic ones come from `build`. */
  extra?: Record<string, unknown>
  /** Assemble the protocol PTB. May return `{ error }` to fail cleanly pre-simulate. */
  build: () => Promise<BuildResult>
}

export async function runLendingWrite(
  ctx: OnchainRuntimeContext,
  opts: LendingWriteOpts,
): Promise<LendingResult> {
  if (ctx.network !== 'mainnet') return { ok: false, error: opts.mainnetError }
  if (opts.amountBase <= 0n) return { ok: false, error: 'invalid amount' }
  if (opts.minError) return { ok: false, error: opts.minError }
  if (opts.policyProtocol) {
    const blocked = policyBlock(ctx.policy, {
      kind: 'transfer',
      coinType: opts.coinType,
      amountMist: opts.amountBase,
      protocol: opts.policyProtocol,
    })
    if (blocked) return { ok: false, error: blocked }
  }

  try {
    const built = await opts.build()
    if ('error' in built) return { ok: false, error: built.error }
    // Simulate-before-write, then execute + wait for indexing so a follow-up action
    // doesn't race the not-yet-settled accounting.
    const exec = await simulateAndExecute(ctx, built.tx)
    if (!exec.ok) return exec
    return {
      ok: true,
      data: {
        protocol: opts.protocol,
        action: opts.action,
        digest: exec.value.digest,
        simGasUsed: exec.value.gasUsed,
        policyEnforced: ctx.policy != null,
        ...opts.extra,
        ...built.extra,
      },
    }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}
