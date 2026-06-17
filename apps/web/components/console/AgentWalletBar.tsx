'use client'

import { useAgentWallet } from '@/components/AgentWalletContext'
import { getSuiBalance } from '@/lib/chain/sui'
import { accountUrl } from '@/lib/chainscan'
import { formatSui, shortAddress } from '@/lib/format'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { useEffect, useState } from 'react'

export function AgentWalletBar() {
  const account = useCurrentAccount()
  const { agentAddress, identity, policy } = useAgentWallet()
  const [bal, setBal] = useState<bigint | null>(null)

  useEffect(() => {
    if (!agentAddress) {
      setBal(null)
      return
    }
    let alive = true
    getSuiBalance(agentAddress, identity.network)
      .then(b => {
        if (alive) setBal(b)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [agentAddress, identity.network])

  if (!account) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-5 py-2">
      {agentAddress ? (
        <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-[var(--color-ink-2)]">
          <span className="text-[var(--color-ink-3)]">agent</span>
          <a
            href={accountUrl(agentAddress, identity.network)}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-ink)] transition-colors hover:text-[var(--color-ink-2)]"
          >
            {shortAddress(agentAddress, 6, 4)} ↗
          </a>
          <span className="text-[var(--color-ink-3)]">
            · {bal !== null ? `${formatSui(bal)} SUI` : '…'}
          </span>
          {policy ? (
            <span className="text-[var(--color-ink-3)]">
              · budget {formatSui(policy.budgetMist)} · spent {formatSui(policy.spentMist)}
              {policy.revoked ? ' · revoked' : ''}
            </span>
          ) : null}
        </div>
      ) : (
        <span className="text-[12px] text-[var(--color-ink-2)]">
          No agent configured. Run <code className="font-mono text-[var(--color-ink)]">lyra init</code>{' '}
          to create an agent + AgentPolicy on Sui.
        </span>
      )}
    </div>
  )
}
