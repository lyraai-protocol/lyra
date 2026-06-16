/**
 * The Lyra chat TUI command. Boots an @opentui/solid renderer and renders the
 * (Nebula-derived) chat App; each submitted goal flows through Lyra's agent
 * runtime (runGoal): LLM plan -> policy mirror -> on-chain guard -> Walrus.
 */
import { createCliRenderer } from '@opentui/core'
import { render } from '@opentui/solid'
import { loadConfig } from 'lyra-core'
import { ChatApp } from '../ui/app'
import { createChatState } from '../ui/state'
import { type GoalResult, runGoal } from './agent'

function formatResult(r: GoalResult): string {
  const lines: string[] = [`**plan:** ${r.plan.kind} — ${r.plan.reasoning}`]
  if (r.status === 'blocked') {
    lines.push(`⛔ **blocked by policy:** ${(r.violations ?? []).join('; ')}`)
    lines.push('_(the on-chain guard would also abort this — the AI cannot override it)_')
  } else if (r.status === 'noop') {
    lines.push('_no action taken._')
  } else {
    lines.push(`✅ **executed** · ${r.txUrl}`)
    if (r.walrusUrl) lines.push(`📦 walrus receipt: ${r.walrusUrl}`)
  }
  return lines.join('\n')
}

export async function runChat(): Promise<void> {
  const cfg = loadConfig()
  const state = createChatState({
    initialSystem: `Lyra · ${cfg.network} · package ${cfg.packageId.slice(0, 10)}…  —  type a goal (e.g. "send 0.005 SUI to myself"), or "exit".`,
    identityLabel: 'lyra',
    approvalsMode: 'prompt',
  })

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    consoleMode: 'disabled',
    openConsoleOnError: false,
  })

  let exiting = false
  const handleExit = () => {
    if (exiting) return
    exiting = true
    try {
      renderer.stop?.()
    } catch {
      // best effort
    }
    process.exit(0)
  }

  const handleSubmit = async (goal: string): Promise<void> => {
    state.pushRow({ role: 'user', text: goal })
    state.setStatus('thinking')
    try {
      const result = await runGoal(goal, { log: false })
      state.pushRow({ role: 'assistant', text: formatResult(result) })
      state.setStatus('idle')
    } catch (e) {
      state.pushRow({ role: 'system', text: `error: ${(e as Error).message}` })
      state.setStatus('error')
    }
  }

  await render(() => <ChatApp state={state} onSubmit={handleSubmit} onExit={handleExit} />, renderer)
  // render() resolves on mount; keep the process alive until the user exits.
  await new Promise<void>(() => {})
}
