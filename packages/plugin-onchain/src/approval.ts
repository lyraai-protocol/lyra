/**
 * Permission-gate bridge between the deterministic policy engine and the
 * harness permission service.
 *
 * The CLI + gateway pre-tool-call hooks build a permission request for every
 * value-moving tool call. On its own the permission service only knows the
 * session MODE (strict/prompt/off) — under YOLO it would let any in-cap spend
 * through silently. This helper runs the SAME `evaluatePolicy` the tool runs and,
 * when the policy flags the action as material-risk (`requiresApproval`), the
 * hook forces an approval prompt beneath the session mode. Fund controls in
 * code, not in the model (CLAUDE.md).
 */

import { type SuiPolicy, type SuiPolicyAction, evaluatePolicy, suiToMist } from './policy'

const SUI_TYPE = '0x2::sui::SUI'

/** Map a tool call (name + raw args) to a best-effort PolicyAction. */
function actionForCall(name: string, a: Record<string, unknown>): SuiPolicyAction | null {
  switch (name) {
    case 'sui.send': {
      const amount = typeof a.amount === 'string' ? a.amount : String(a.amount ?? '')
      return {
        kind: 'transfer',
        coinType: SUI_TYPE,
        amountMist: suiToMist(amount) ?? 0n,
        to: typeof a.to === 'string' ? a.to : undefined,
        protocol: 'transfer',
      }
    }
    default:
      return null
  }
}

/**
 * True when the policy requires human approval for this tool call (the gate
 * should force a prompt regardless of mode). False when no policy is configured
 * or the call is not value-moving.
 */
export function policyRequiresApprovalForCall(
  name: string,
  args: Record<string, unknown>,
  policy: SuiPolicy | undefined,
): boolean {
  if (!policy) return false
  const action = actionForCall(name, args)
  if (!action) return false
  return evaluatePolicy(action, policy).requiresApproval
}
