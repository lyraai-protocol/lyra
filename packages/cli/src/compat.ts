/**
 * Compatibility shim for the symbols Nebula's copied TUI imported from
 * `nebula-ai-core`. Lyra doesn't have Nebula's permission/slash-command
 * runtime, so these are light stubs: the approval modal and slash menu are
 * inert in Lyra's TUI (no pendingApproval is ever set, suggestForPrefix
 * returns nothing). Kept so the reused UI compiles unchanged.
 */

export type PermissionMode = 'strict' | 'prompt' | 'off' | 'yolo'
// Loose union — the approval modal is never opened in Lyra, so accept any
// decision label the copied UI emits (allow-once, allow-session, deny, …).
export type PermissionDecision = string

// Loose by design — the approval modal is never opened in Lyra.
// biome-ignore lint/suspicious/noExplicitAny: inert-shim type.
export type PermissionRequest = any

export interface SlashCommand {
  name: string
  description?: string
  argHint?: string
  surfaces?: readonly string[]
}

export function suggestForPrefix(_prefix: string, _extra?: unknown): SlashCommand[] {
  return []
}
