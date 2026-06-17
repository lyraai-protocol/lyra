/**
 * Render a MIST amount as a 6-decimal SUI string. Matches the statusline,
 * `lyra balance`, and ledger output styles. Always emits exactly 6 decimal
 * places (zero-padded) so columns align. 1 SUI = 1e9 MIST.
 */
export function formatSui(mist: bigint | string | number): string {
  const m = typeof mist === 'bigint' ? mist : BigInt(mist)
  const neg = m < 0n
  const abs = neg ? -m : m
  const whole = abs / 1_000_000_000n
  const frac = (abs % 1_000_000_000n).toString().padStart(9, '0').slice(0, 6)
  return `${neg ? '-' : ''}${whole}.${frac}`
}
