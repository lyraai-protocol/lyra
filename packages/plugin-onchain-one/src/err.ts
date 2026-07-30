/**
 * Normalize any thrown value into a short, safe error string. Used across the tools
 * so error output is consistent and the cap lives in one place — tool results are fed
 * back to the model, so a bounded message keeps a stack-trace dump out of the context.
 */
export function errMsg(e: unknown, len = 240): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.slice(0, len)
}
