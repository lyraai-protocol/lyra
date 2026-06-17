/**
 * Public types for lyra-plugin-onchain. The runtime context is side-banded onto
 * PluginContext under `.onchain` (the harness builds it; the plugin reads it via
 * `(ctx as any).onchain`), keeping PluginContext free of plugin-specific fields.
 */

import type { SuiClient } from '@mysten/sui/client'
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { SuiNetwork } from './client'
import type { SuiPolicy } from './policy'

export interface OnchainRuntimeContext {
  /** Sui JSON-RPC client for `network`. */
  client: SuiClient
  /** The agent signer (signs + pays gas). */
  keypair: Ed25519Keypair
  /** `keypair.toSuiAddress()`, cached. */
  agentAddress: string
  network: SuiNetwork
  /** Deterministic fund-control policy. When set, every write is checked before simulate/execute. */
  policy?: SuiPolicy
  /** Deployed `lyra::policy` package id (for on-chain receipts + policy objects). */
  packageId?: string
  /** Shared `AgentPolicy` object id. When set, writes compose an on-chain receipt + enforcement. */
  policyObjectId?: string
  /** Walrus network for receipt/memory storage (defaults to `network`). */
  walrusNetwork?: SuiNetwork
  agentDir: string
  /** Optional: brain provider/model, surfaced by account.info. */
  brainProvider?: string | null
  brainModel?: string | null
}
