import { beforeEach, describe, expect, test } from 'bun:test'
import { type DepositExecutors, driveOnce, driveTick, reapStale } from './deposit-driver'
import { isTerminal } from './deposit-lifecycle'
import { InMemoryDepositStore, type NewDeposit } from './deposit-store'

const BASE: NewDeposit = {
  id: 'd1',
  owner: '0xowner',
  sourceChain: 'Ethereum',
  sourceToken: 'USDC',
  amount: '100',
  needsSwap: false,
}

function mockExecutors(overrides: Partial<DepositExecutors> = {}): DepositExecutors {
  return {
    awaitSourceBurn: async () => ({ burnTxHash: '0xburn' }),
    awaitAttestation: async () => ({ attestation: 'att' }),
    submitSuiRedeem: async () => ({ suiRedeemDigest: 'redeem' }),
    swapToUsdc: async () => ({ suiSwapDigest: 'swap' }),
    depositToVault: async () => ({ vaultDepositDigest: 'deposit' }),
    ...overrides,
  }
}

let store: InMemoryDepositStore
beforeEach(() => {
  store = new InMemoryDepositStore()
})

/** Drive a deposit to a terminal state (bounded so a bug can't loop forever). */
async function driveToEnd(id: string, ex: DepositExecutors, t = 1000): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = store.get(id)
    if (!d || isTerminal(d.status)) return
    await driveOnce(store, d, ex, t + i)
  }
  throw new Error('did not terminate within 12 steps')
}

describe('driveOnce', () => {
  test('advances initiated → source_burned and records the artifact', async () => {
    store.create(BASE, 1000)
    const d = await driveOnce(store, store.get('d1')!, mockExecutors(), 1100)
    expect(d.status).toBe('source_burned')
    expect(d.burnTxHash).toBe('0xburn')
    expect(d.updatedMs).toBe(1100)
  })

  test('stays in place when the executor is not ready yet (returns null)', async () => {
    store.create(BASE, 1000)
    const d = await driveOnce(
      store,
      store.get('d1')!,
      mockExecutors({ awaitSourceBurn: async () => null }),
      1100,
    )
    expect(d.status).toBe('initiated') // unchanged; retried next tick
    expect(store.get('d1')!.updatedMs).toBe(1000) // no transition recorded
  })

  test('a throwing executor fails the deposit with the reason', async () => {
    store.create(BASE, 1000)
    store.transition('d1', 'source_burned', {}, 1050)
    store.transition('d1', 'attested', {}, 1060)
    const d = await driveOnce(
      store,
      store.get('d1')!,
      mockExecutors({
        submitSuiRedeem: async () => {
          throw new Error('redeem reverted')
        },
      }),
      1100,
    )
    expect(d.status).toBe('failed')
    expect(d.error).toBe('redeem reverted')
  })

  test('a terminal deposit is a no-op', async () => {
    store.create(BASE, 1000)
    await driveToEnd('d1', mockExecutors())
    const before = store.get('d1')!
    const after = await driveOnce(store, before, mockExecutors(), 9999)
    expect(after.status).toBe('vault_deposited')
    expect(after.updatedMs).toBe(before.updatedMs) // untouched
  })
})

describe('full runs', () => {
  test('native-USDC deposit reaches vault_deposited (no swap)', async () => {
    store.create(BASE, 1000)
    await driveToEnd('d1', mockExecutors())
    const d = store.get('d1')!
    expect(d.status).toBe('vault_deposited')
    expect(d.burnTxHash).toBe('0xburn')
    expect(d.attestation).toBe('att')
    expect(d.suiRedeemDigest).toBe('redeem')
    expect(d.vaultDepositDigest).toBe('deposit')
    expect(d.suiSwapDigest).toBeUndefined() // no swap on the USDC path
  })

  test('long-tail deposit runs the swap leg', async () => {
    let swapCalled = false
    store.create({ ...BASE, needsSwap: true, sourceToken: 'PEPE' }, 1000)
    await driveToEnd(
      'd1',
      mockExecutors({
        swapToUsdc: async () => {
          swapCalled = true
          return { suiSwapDigest: 'swap' }
        },
      }),
    )
    const d = store.get('d1')!
    expect(d.status).toBe('vault_deposited')
    expect(swapCalled).toBe(true)
    expect(d.suiSwapDigest).toBe('swap')
  })
})

describe('driveTick', () => {
  test('advances every active deposit one step and skips terminal ones', async () => {
    store.create({ ...BASE, id: 'a' }, 1000)
    store.create({ ...BASE, id: 'b' }, 1000)
    store.transition('b', 'source_burned', {}, 1000)
    store.transition('b', 'attested', {}, 1000)
    store.transition('b', 'sui_redeemed', {}, 1000)
    store.transition('b', 'vault_deposited', {}, 1000) // b already done
    await driveTick(store, mockExecutors(), 1100)
    expect(store.get('a')!.status).toBe('source_burned') // advanced one step
    expect(store.get('b')!.status).toBe('vault_deposited') // untouched
  })
})

describe('reapStale', () => {
  test('fails active deposits with no progress past the TTL', () => {
    store.create({ ...BASE, id: 'old' }, 1000)
    store.create({ ...BASE, id: 'fresh' }, 5000)
    const reaped = reapStale(store, 1000, 5500) // old: 4500ms idle > 1000; fresh: 500ms
    expect(reaped.map(d => d.id)).toEqual(['old'])
    expect(store.get('old')!.status).toBe('failed')
    expect(store.get('fresh')!.status).toBe('initiated')
  })

  test('leaves completed deposits alone', async () => {
    store.create(BASE, 1000)
    await driveToEnd('d1', mockExecutors())
    const reaped = reapStale(store, 0, 9_999_999)
    expect(reaped).toEqual([]) // terminal ⇒ not active ⇒ not reaped
  })
})
