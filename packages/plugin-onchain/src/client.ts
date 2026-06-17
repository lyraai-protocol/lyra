/**
 * Sui client + agent keypair construction for Lyra's on-chain plugin.
 *
 * One agent address signs and pays gas. The deterministic policy (off-chain
 * mirror in `./policy.ts`, enforced again on-chain by `lyra::policy`) bounds
 * what it may do.
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

export type SuiNetwork = 'testnet' | 'mainnet'

/** Canonical fullnode JSON-RPC URL for a network. */
export function suiRpcUrl(network: SuiNetwork): string {
  return getFullnodeUrl(network)
}

/** A Sui JSON-RPC client for the given network. */
export function makeSuiClient(network: SuiNetwork): SuiClient {
  return new SuiClient({ url: getFullnodeUrl(network) })
}

/**
 * Build the agent keypair from a secret. Accepts a Sui bech32 secret
 * (`suiprivkey1...`, preferred) or a base64-encoded 32-byte seed.
 */
export function keypairFromSecret(secret: string): Ed25519Keypair {
  const s = secret.trim()
  if (s.startsWith('suiprivkey')) return Ed25519Keypair.fromSecretKey(s)
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(s, 'base64')))
}
