import { describe, expect, test } from 'bun:test'
import { SWEEP_GAS_RESERVE_MIST, computeSweepAmount } from './drain'

const AGENT = `0x${'1'.repeat(64)}`
/** 1 SUI in MIST. */
const sui = (n: number): bigint => BigInt(Math.round(n * 1e9))

describe('computeSweepAmount', () => {
  test('subtracts default gas reserve from balance when comfortable', () => {
    const balanceMist = sui(0.1)
    const r = computeSweepAmount({ balanceMist, agentAddress: AGENT })
    expect(r.error).toBeUndefined()
    expect(r.gasReserve).toBe(SWEEP_GAS_RESERVE_MIST)
    expect(r.value).toBe(balanceMist - SWEEP_GAS_RESERVE_MIST)
  })

  test('returns error string when balance below reserve', () => {
    const balanceMist = SWEEP_GAS_RESERVE_MIST
    const r = computeSweepAmount({ balanceMist, agentAddress: AGENT })
    expect(r.value).toBe(0n)
    expect(r.error).toContain('below gas reserve')
  })

  test('honors gasReserveOverride', () => {
    const balanceMist = sui(1)
    const override = sui(0.005)
    const r = computeSweepAmount({
      balanceMist,
      agentAddress: AGENT,
      gasReserveOverride: override,
    })
    expect(r.gasReserve).toBe(override)
    expect(r.value).toBe(balanceMist - override)
  })

  test('error wording surfaces the agent address + balance + reserve', () => {
    const r = computeSweepAmount({ balanceMist: 0n, agentAddress: AGENT })
    expect(r.error).toContain(AGENT)
    expect(r.error).toContain('0.000000 SUI')
  })
})
