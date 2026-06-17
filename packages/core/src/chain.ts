import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { LyraNetwork } from './config'

/**
 * Sui chain helpers for Lyra core. One agent keypair signs and pays gas; the
 * deterministic policy (enforced on-chain by `lyra::policy`) bounds what it may
 * do. Mirrors the patterns in `plugin-onchain/src/client.ts`.
 */

/** Canonical Sui fullnode JSON-RPC URL for a network. */
export function suiRpcUrl(network: LyraNetwork): string {
  return getFullnodeUrl(network)
}

/** A Sui JSON-RPC client for the given network. */
export function makeSuiClient(network: LyraNetwork): SuiClient {
  return new SuiClient({ url: getFullnodeUrl(network) })
}

/**
 * Build a keypair from a secret. Accepts a Sui bech32 secret
 * (`suiprivkey1...`, preferred) or a base64-encoded 32-byte seed.
 */
export function keypairFromSecret(secret: string): Ed25519Keypair {
  const s = secret.trim()
  if (s.startsWith('suiprivkey')) return Ed25519Keypair.fromSecretKey(s)
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(s, 'base64')))
}

/** Total SUI balance of an address, in MIST (1 SUI = 1e9 MIST). */
export async function getSuiBalanceMist(client: SuiClient, address: string): Promise<bigint> {
  const { totalBalance } = await client.getBalance({ owner: address })
  return BigInt(totalBalance)
}
