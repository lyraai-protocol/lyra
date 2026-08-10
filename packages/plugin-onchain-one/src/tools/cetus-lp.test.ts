import { describe, expect, test } from 'bun:test'
import type { SuiPolicy } from '../policy'
import type { OnchainRuntimeContext } from '../types'
import { preflight } from './cetus-lp'

// preflight only reads ctx.policy (no network), so a minimal cast is enough.
const ctxWith = (policy?: SuiPolicy) => ({ policy }) as unknown as OnchainRuntimeContext

describe('cetus.add_liquidity preflight — off-chain protocol tag', () => {
  // Regression: the off-chain policy protocol must be the TAG "cetus", not the
  // on-chain CETUS_INTEGRATE address — otherwise a tag-based protocol allowlist
  // (the documented convention, and what every sibling tool uses) can never allow
  // LP, wrongly blocking it under protocol-allowlist hardening.
  test('a protocol allowlist of ["cetus"] permits LP', () => {
    const res = preflight(ctxWith({ protocolAllowlist: ['cetus'] }), { amount: '5' })
    expect('error' in res).toBe(false)
  })

  test('no policy configured → permitted', () => {
    const res = preflight(ctxWith(undefined), { amount: '5' })
    expect('error' in res).toBe(false)
  })

  test('an allowlist without "cetus" blocks LP (tag is enforced)', () => {
    const res = preflight(ctxWith({ protocolAllowlist: ['navi'] }), { amount: '5' })
    expect('error' in res).toBe(true)
    if ('error' in res) expect(res.error).toContain('protocol')
  })
})
