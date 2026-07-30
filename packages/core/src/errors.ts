/**
 * Normalize any thrown value into a short, safe error string. Shared across the
 * monorepo so error output is consistent and the cap lives in one place — tool
 * results and logs are bounded, keeping stack-trace dumps out of the model context.
 */
export function errMsg(e: unknown, len = 240): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.slice(0, len)
}
