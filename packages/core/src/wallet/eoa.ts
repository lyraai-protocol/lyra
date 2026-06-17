import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { type EncryptedKeystore, decryptKey, encryptKey } from './keystore'

/**
 * Sui agent wallet material. Callers reconstruct the keypair at point of use
 * via `Ed25519Keypair.fromSecretKey(secret)` (or `keypairFromSecret`).
 */
export interface AgentWalletMaterial {
  /** Bech32 Sui secret key (`suiprivkey1...`). */
  secret: string
  /** Sui address derived from the key (`0x`-prefixed). */
  address: string
}

/**
 * Generate a fresh Ed25519 agent keypair. Returns the bech32 secret
 * (`suiprivkey1...`) and the derived Sui address.
 */
export function generateAgentKeypair(): { address: string; secret: string } {
  const kp = Ed25519Keypair.generate()
  return {
    address: kp.getPublicKey().toSuiAddress(),
    secret: kp.getSecretKey(),
  }
}

/** Back-compat alias used across Lyra: an agent "wallet" is its keypair. */
export function generateAgentWallet(): AgentWalletMaterial {
  return generateAgentKeypair()
}

export async function saveKeystore(
  path: string,
  secret: string,
  passphrase: string,
): Promise<void> {
  // Persist the raw secret string bytes; chain-agnostic AES-GCM keystore.
  const secretBytes = new TextEncoder().encode(secret)
  const encrypted = encryptKey(secretBytes, passphrase)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(encrypted, null, 2), 'utf8')
}

export async function loadKeystore(path: string, passphrase: string): Promise<AgentWalletMaterial> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Keystore not found at ${path}`)
    }
    throw e
  }
  const encrypted = JSON.parse(raw) as EncryptedKeystore
  const secretBytes = decryptKey(encrypted, passphrase)
  const secret = new TextDecoder().decode(secretBytes)
  const kp = Ed25519Keypair.fromSecretKey(secret)
  return { secret, address: kp.getPublicKey().toSuiAddress() }
}
