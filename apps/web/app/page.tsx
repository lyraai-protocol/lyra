'use client'

import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:8787'
const PACKAGE = '0x26e5c029a07f74308d2a72002f09c54affd5b0914e401de25480046f45316885'

type Row = { role: 'user' | 'tool' | 'result' | 'assistant' | 'error'; text: string }

const SUGGESTIONS = [
  "What's my balance and the top 3 Sui yields?",
  'Show my on-chain policy and recent receipts',
  'Send 0.005 SUI to myself',
  'Remember: keep 6 months of runway liquid',
]

export default function Home() {
  const account = useCurrentAccount()
  const [goal, setGoal] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  async function send(preset?: string) {
    const g = (preset ?? goal).trim()
    if (!g || busy) return
    setGoal('')
    setRows((r) => [...r, { role: 'user', text: g }])
    setBusy(true)
    try {
      const res = await fetch(`${GATEWAY}/api/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: g }),
      })
      const data = await res.json()
      if (data.error) {
        setRows((r) => [...r, { role: 'error', text: data.error }])
      } else {
        const next: Row[] = []
        for (const e of data.events ?? []) {
          if (e.type === 'tool-call') {
            next.push({ role: 'tool', text: `${e.name}(${e.args === '{}' ? '' : e.args})` })
          } else if (e.type === 'tool-result') {
            next.push({ role: 'result', text: e.text })
          }
        }
        if (data.finalText) next.push({ role: 'assistant', text: data.finalText })
        setRows((r) => [...r, ...next])
      }
    } catch {
      setRows((r) => [
        ...r,
        { role: 'error', text: `gateway unreachable at ${GATEWAY} — start it with \`bun run gateway\`` },
      ])
    }
    setBusy(false)
  }

  return (
    <main className="min-h-screen bg-paper text-ink font-body">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <header className="flex items-center justify-between">
          <div className="font-display text-2xl tracking-tight">Lyra</div>
          <ConnectButton />
        </header>

        <section className="mt-14 mb-8">
          <h1 className="font-display text-4xl sm:text-5xl leading-[1.1]">
            The AI proposes. <span className="font-italic italic">Sui policies enforce.</span> Walrus remembers.
          </h1>
          <p className="mt-5 text-ink-2 max-w-xl">
            A Sui-native, policy-bound AI agent for autonomous DeFi. Every value-moving action is checked against an
            on-chain policy, executed as a Programmable Transaction Block, and recorded as a verifiable Walrus receipt.
          </p>
          <div className="mt-4 text-xs font-mono text-ink-3">
            mainnet package{' '}
            <a
              className="underline"
              href={`https://suiscan.xyz/mainnet/object/${PACKAGE}`}
              target="_blank"
              rel="noreferrer"
            >
              {PACKAGE.slice(0, 18)}…
            </a>{' '}
            · source-verified
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-cream/30 p-4">
          <div className="min-h-[280px] max-h-[460px] overflow-y-auto space-y-3 px-1">
            {rows.length === 0 ? (
              <div className="text-ink-3 text-sm">
                {account ? 'Ask the agent anything:' : 'Connect a Sui wallet, then ask the agent anything:'}
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-border px-3 py-1 text-xs hover:bg-cream"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              rows.map((r, i) => <Bubble key={`${r.role}-${i}`} row={r} />)
            )}
            {busy && <div className="text-ink-3 text-sm">working…</div>}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send()
              }}
              placeholder="send 0.005 SUI to myself"
              className="flex-1 rounded-xl border border-border bg-paper px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={busy}
              className="rounded-xl bg-ink text-paper px-4 py-2 text-sm disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </section>

        <footer className="mt-10 text-xs text-ink-3">
          The agent runs via the Lyra gateway ({GATEWAY}). Bounded by the on-chain policy — it can act, but never beyond
          your limits.
        </footer>
      </div>
    </main>
  )
}

function Bubble({ row }: { row: Row }) {
  if (row.role === 'user') {
    return (
      <div className="text-right">
        <span className="inline-block rounded-2xl bg-ink text-paper px-3 py-2 text-sm">{row.text}</span>
      </div>
    )
  }
  if (row.role === 'tool') return <div className="font-mono text-xs text-ink-3">⏺ {row.text}</div>
  if (row.role === 'result') {
    return <div className="font-mono text-xs text-ink-3 pl-4 whitespace-pre-wrap">⎿ {row.text}</div>
  }
  if (row.role === 'error') return <div className="text-sm text-red-500">{row.text}</div>
  return (
    <div className="text-sm leading-relaxed [&_a]:underline [&_strong]:font-semibold">
      <Markdown remarkPlugins={[remarkGfm]}>{row.text}</Markdown>
    </div>
  )
}
