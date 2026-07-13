/**
 * Bridge driver entry point — the long-running poller that carries cross-chain
 * deposits from source-burn to Sui vault. Run under NODE (not Bun: the Wormhole SDK
 * Sui-signer path hits a `@noble/hashes/crypto` resolution bug under Bun), e.g.
 *   node --import tsx src/driver-run.ts
 * on the VPS under pm2, alongside the signer.
 *
 * It owns no chain logic of its own — it wires:
 *   - a DURABLE repo over the api service's token-gated /deposits routes,
 *   - the real CCTP executor (`makeCctpExecutor`) for burn-watch → attestation →
 *     Sui redeem, with the vault-deposit leg delegated back to the v1 app over HTTP
 *     (the v1 vault contract + remote signer live there, not in this v2 package),
 * then calls {@link driveDurableTick} on an interval.
 *
 * Required env: API_URL, API_WRITE_TOKEN (durable store); SUI_RELAYER_KEY (suiprivkey
 * that pays permissionless redeem gas); APP_URL, BRIDGE_DRIVER_TOKEN (vault-deposit
 * callback). Optional: CCTP_NETWORK (Mainnet|Testnet, default Mainnet), POLL_MS
 * (default 30000), MAX_AGE_MS (default 3_600_000 — reap after 1h of no progress).
 */

import type { CctpNetwork } from './cctp-chains'
import { makeCctpExecutor } from './cctp-executor'
import { type DurableDepositRepo, driveDurableTick } from './deposit-driver-loop'
import type { PendingDeposit } from './deposit-store'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`bridge driver: missing required env ${name}`)
  return v
}

const API_URL = requireEnv('API_URL').replace(/\/$/, '')
const API_TOKEN = requireEnv('API_WRITE_TOKEN')
const APP_URL = requireEnv('APP_URL').replace(/\/$/, '')
const DRIVER_TOKEN = requireEnv('BRIDGE_DRIVER_TOKEN')
const RELAYER_KEY = requireEnv('SUI_RELAYER_KEY')
const NETWORK = (process.env.CCTP_NETWORK as CctpNetwork) ?? 'Mainnet'
const POLL_MS = Number(process.env.POLL_MS ?? 30_000)
const MAX_AGE_MS = Number(process.env.MAX_AGE_MS ?? 3_600_000)

function key(owner: string, id: string): string {
  return `${owner.toLowerCase().replace(/[^a-z0-9x]/g, '')}/${encodeURIComponent(id)}`
}

// Durable store over the api service's /deposits routes (the same token the console
// server uses). Read failures throw (skip the tick); saves throw (retry next tick).
const repo: DurableDepositRepo = {
  async listActive() {
    const res = await fetch(`${API_URL}/deposits/_active`, {
      headers: { authorization: `Bearer ${API_TOKEN}` },
    })
    if (!res.ok) throw new Error(`listActive ${res.status}`)
    const body = (await res.json()) as { deposits?: PendingDeposit[] }
    return body.deposits ?? []
  },
  async save(d) {
    const res = await fetch(`${API_URL}/deposits/${key(d.owner, d.id)}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ deposit: d }),
    })
    if (!res.ok) throw new Error(`save ${d.id} ${res.status}`)
  },
}

const executors = makeCctpExecutor({
  network: NETWORK,
  suiRelayerKey: RELAYER_KEY,
  // The final leg: hand the owner off to the v1 app, which moves the redeemed USDC
  // into their Vault<USDC> (signed by the agent via the remote signer).
  depositToVault: async d => {
    const res = await fetch(`${APP_URL}/api/bridge/execute-deposit`, {
      method: 'POST',
      headers: { authorization: `Bearer ${DRIVER_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ owner: d.owner }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      vaultDepositDigest?: string
      error?: string
    }
    if (!(res.ok && body.vaultDepositDigest)) {
      throw new Error(`vault deposit failed: ${body.error ?? res.status}`)
    }
    return { vaultDepositDigest: body.vaultDepositDigest }
  },
})

async function tick(): Promise<void> {
  try {
    const r = await driveDurableTick(repo, executors, { maxAgeMs: MAX_AGE_MS })
    if (r.active > 0) {
      console.log(`[driver] active=${r.active} advanced=${r.advanced} reaped=${r.reaped}`)
    }
  } catch (e) {
    console.error(`[driver] tick error: ${(e as Error).message}`)
  }
}

console.log(`[driver] starting — network=${NETWORK} poll=${POLL_MS}ms api=${API_URL}`)
await tick()
setInterval(() => void tick(), POLL_MS)
