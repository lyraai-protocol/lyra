import { describe, expect, test } from 'bun:test'
import type { DepositExecutors } from './deposit-driver'
import { type DurableDepositRepo, driveDurableTick } from './deposit-driver-loop'
import type { PendingDeposit } from './deposit-store'

function rec(over: Partial<PendingDeposit>): PendingDeposit {
  return {
    id: 'd',
    owner: '0xowner',
    sourceChain: 'Base',
    sourceToken: 'USDC',
    amount: '10',
    needsSwap: false,
    status: 'initiated',
    createdMs: 0,
    updatedMs: 0,
    ...over,
  }
}

class MockRepo implements DurableDepositRepo {
  saved: PendingDeposit[] = []
  constructor(private records: PendingDeposit[]) {}
  listActive(): Promise<PendingDeposit[]> {
    return Promise.resolve(
      this.records
        .filter(d => d.status !== 'vault_deposited' && d.status !== 'failed')
        .map(d => ({ ...d })),
    )
  }
  save(d: PendingDeposit): Promise<void> {
    this.saved.push(d)
    return Promise.resolve()
  }
}

// Executors that always advance (return artifacts), except awaitSourceBurn which is
// "not ready" until a burn tx hash is present — the realistic gate.
const advancing: DepositExecutors = {
  awaitSourceBurn: d => Promise.resolve(d.burnTxHash ? { burnTxHash: d.burnTxHash } : null),
  awaitAttestation: () => Promise.resolve({ attestation: 'att' }),
  submitSuiRedeem: () => Promise.resolve({ suiRedeemDigest: 'redeem' }),
  swapToUsdc: () => Promise.resolve({ suiSwapDigest: 'swap' }),
  depositToVault: () => Promise.resolve({ vaultDepositDigest: 'vault' }),
}

describe('driveDurableTick', () => {
  test('empty work-list is a no-op', async () => {
    const repo = new MockRepo([])
    const r = await driveDurableTick(repo, advancing, { now: 100 })
    expect(r).toEqual({ active: 0, advanced: 0, reaped: 0 })
    expect(repo.saved).toHaveLength(0)
  })

  test('advances a ready deposit one step + persists it', async () => {
    const repo = new MockRepo([rec({ id: 'a', status: 'attested', updatedMs: 1 })])
    const r = await driveDurableTick(repo, advancing, { now: 100 })
    expect(r.advanced).toBe(1)
    expect(repo.saved).toHaveLength(1)
    expect(repo.saved[0]).toMatchObject({
      id: 'a',
      status: 'sui_redeemed',
      suiRedeemDigest: 'redeem',
    })
  })

  test('does NOT persist a deposit that stays put (no burn yet)', async () => {
    const repo = new MockRepo([rec({ id: 'b', status: 'initiated', updatedMs: 1 })])
    const r = await driveDurableTick(repo, advancing, { now: 100 })
    expect(r.advanced).toBe(0)
    expect(repo.saved).toHaveLength(0)
  })

  test('persists the burn-tx advance once the hash is present', async () => {
    const repo = new MockRepo([
      rec({ id: 'c', status: 'initiated', burnTxHash: '0xburn', updatedMs: 1 }),
    ])
    await driveDurableTick(repo, advancing, { now: 100 })
    expect(repo.saved[0]).toMatchObject({ id: 'c', status: 'source_burned' })
  })

  test('reaps a stale deposit to failed', async () => {
    const repo = new MockRepo([rec({ id: 'old', status: 'initiated', updatedMs: 0 })])
    const r = await driveDurableTick(repo, advancing, { now: 10_000, maxAgeMs: 5_000 })
    expect(r.reaped).toBe(1)
    expect(repo.saved[0]).toMatchObject({ id: 'old', status: 'failed' })
  })

  test('a failing executor fails just that deposit', async () => {
    const boom: DepositExecutors = {
      ...advancing,
      submitSuiRedeem: () => Promise.reject(new Error('redeem blew up')),
    }
    const repo = new MockRepo([
      rec({ id: 'ok', status: 'attested', updatedMs: 1 }),
      rec({ id: 'bad', status: 'attested', updatedMs: 1 }),
    ])
    // Both attempt submit_sui_redeem; one throws → failed, the other advances.
    const r = await driveDurableTick(
      { listActive: () => repo.listActive(), save: d => repo.save(d) },
      {
        ...boom,
        submitSuiRedeem: d =>
          d.id === 'bad'
            ? Promise.reject(new Error('redeem blew up'))
            : Promise.resolve({ suiRedeemDigest: 'ok' }),
      },
      { now: 100 },
    )
    expect(r.active).toBe(2)
    const byId = Object.fromEntries(repo.saved.map(d => [d.id, d.status]))
    expect(byId.ok).toBe('sui_redeemed')
    expect(byId.bad).toBe('failed')
  })
})
