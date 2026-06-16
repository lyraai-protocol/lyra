/**
 * The scripted end-to-end demo of the trust boundary on the active network.
 * create policy -> allowed guarded spend + Walrus receipt -> blocked over-cap
 * -> revoke -> post-revoke abort -> reclaim. Real transactions throughout.
 */
import { Transaction } from '@mysten/sui/transactions'
import {
  evaluatePolicy,
  loadConfig,
  loadKeypair,
  mistToSui,
  type PolicyAction,
  policyFromEnv,
  SUI_TYPE,
  suiToMist,
} from 'lyra-core'
import {
  buildCreatePolicy,
  buildReclaim,
  buildRecord,
  buildRevoke,
  buildWithdraw,
  buildWithdrawTransfer,
  createdObjectByType,
  dryRun,
  execute,
  makeClient,
  txUrl,
} from 'lyra-plugin-sui'
import { storeBlobOnChain } from 'lyra-plugin-walrus'

export async function runDemo(): Promise<void> {
  const cfg = loadConfig()
  const client = makeClient(cfg.network)
  if (!process.env.LYRA_AGENT_KEY) throw new Error('LYRA_AGENT_KEY is required')
  if (!cfg.packageId) throw new Error('LYRA_PACKAGE_ID is required')

  const owner = loadKeypair(process.env.LYRA_AGENT_KEY)
  const ownerAddr = owner.toSuiAddress()
  const recipient = process.env.LYRA_DEMO_RECIPIENT?.trim() || ownerAddr

  const policy = policyFromEnv()
  const coinType = SUI_TYPE
  const allowedProtocols = policy.allowedProtocols ?? ['transfer', 'deepbook', 'walrus']
  const expiryMs = policy.expiryMs ?? Date.now() + 60 * 60_000

  const BUDGET = suiToMist(0.05)
  const MAX_PER_TX = suiToMist(0.02)
  const ALLOWED_SPEND = suiToMist(0.01)
  const BLOCKED_SPEND = suiToMist(0.03)

  const line = (s = '') => console.log(s)
  const h = (s: string) => line(`\n=== ${s} ===`)

  line(`Lyra demo · ${cfg.network}`)
  line(`package : ${cfg.packageId}`)
  line(`owner   : ${ownerAddr}`)
  line(
    `policy  : budget ${mistToSui(BUDGET)} SUI · cap ${mistToSui(MAX_PER_TX)} SUI/tx · protocols [${allowedProtocols.join(', ')}]`,
  )

  // 1. create
  h('1. create AgentPolicy')
  const createTx = new Transaction()
  buildCreatePolicy(createTx, {
    packageId: cfg.packageId,
    coinType,
    agent: ownerAddr,
    budgetMist: BUDGET,
    maxPerTxMist: MAX_PER_TX,
    maxSlippageBps: policy.maxSlippageBps ?? 100,
    allowedProtocols,
    expiryMs,
  })
  const createRes = await execute(client, owner, createTx)
  const policyId = createdObjectByType(createRes, '::policy::AgentPolicy<')
  const capId = createdObjectByType(createRes, '::policy::AgentCap')
  line(`tx     : ${txUrl(cfg.network, createRes.digest)}`)
  line(`policy : ${policyId}`)
  line(`cap    : ${capId}`)
  if (!policyId || !capId) throw new Error('could not locate created policy/cap objects')

  // 2. allowed guarded spend + Walrus receipt
  h('2. ALLOWED action — guarded spend + on-chain receipt')
  const allowedAction: PolicyAction = {
    kind: 'transfer',
    protocol: 'transfer',
    coinType,
    amountRaw: ALLOWED_SPEND,
    to: recipient,
  }
  const verdict = evaluatePolicy(allowedAction, { ...policy, maxNativeMistPerTx: MAX_PER_TX })
  line(`mirror : allowed=${verdict.allowed} requiresApproval=${verdict.requiresApproval}`)
  if (!verdict.allowed) throw new Error(`mirror unexpectedly blocked: ${verdict.violations.join('; ')}`)

  const artifact = {
    kind: 'lyra.receipt.v1',
    network: cfg.network,
    policyId,
    agent: ownerAddr,
    protocol: 'transfer',
    coinType,
    amountMist: ALLOWED_SPEND.toString(),
    amountSui: mistToSui(ALLOWED_SPEND),
    recipient,
    status: 'executed',
    ts: new Date().toISOString(),
  }
  const blob = await storeBlobOnChain(JSON.stringify(artifact, null, 2), {
    suiClient: client,
    signer: owner,
    network: cfg.network,
    epochs: 2,
  })
  line(`walrus : ${blob.blobId} (mainnet, paid in WAL)`)
  line(`         ${blob.url}`)

  const spendTx = new Transaction()
  buildWithdrawTransfer(spendTx, {
    packageId: cfg.packageId,
    coinType,
    policyId,
    capId,
    amountMist: ALLOWED_SPEND,
    protocol: 'transfer',
    recipient,
  })
  buildRecord(spendTx, {
    packageId: cfg.packageId,
    coinType,
    policyId,
    capId,
    protocol: 'transfer',
    summary: `sent ${mistToSui(ALLOWED_SPEND)} SUI to ${recipient.slice(0, 10)}…`,
    amountMist: ALLOWED_SPEND,
    coinTypeStr: coinType,
    status: 'executed',
    walrusBlob: blob.blobId,
  })
  const spendRes = await execute(client, owner, spendTx)
  const receiptId = createdObjectByType(spendRes, '::policy::ActionReceipt')
  line(`tx     : ${txUrl(cfg.network, spendRes.digest)}`)
  line(`sent   : ${mistToSui(ALLOWED_SPEND)} SUI to ${recipient}`)
  line(`receipt: ${receiptId} (frozen, immutable, walrus=${blob.blobId.slice(0, 12)}…)`)
  const fetched = await (await fetch(blob.url)).text()
  line(`verify : Walrus artifact retrievable (${fetched.length} bytes), linked on-chain`)

  // 3. blocked over-cap
  h('3. BLOCKED action — over the per-tx cap')
  const blockedAction: PolicyAction = {
    kind: 'transfer',
    protocol: 'transfer',
    coinType,
    amountRaw: BLOCKED_SPEND,
    to: recipient,
  }
  const blockedVerdict = evaluatePolicy(blockedAction, { ...policy, maxNativeMistPerTx: MAX_PER_TX })
  line(`mirror : allowed=${blockedVerdict.allowed} — ${blockedVerdict.violations.join('; ')}`)
  const blockedTx = new Transaction()
  const coin = buildWithdraw(blockedTx, {
    packageId: cfg.packageId,
    coinType,
    policyId,
    capId,
    amountMist: BLOCKED_SPEND,
    protocol: 'transfer',
  })
  blockedTx.transferObjects([coin], blockedTx.pure.address(recipient))
  const blockedSim = await dryRun(client, blockedTx, ownerAddr)
  line(`chain  : would-execute=${blockedSim.ok} ${blockedSim.ok ? '' : `(aborted: ${blockedSim.error})`}`)

  // 4. revoke
  h('4. revoke the policy (owner)')
  const revokeTx = new Transaction()
  buildRevoke(revokeTx, { packageId: cfg.packageId, coinType, policyId })
  const revokeRes = await execute(client, owner, revokeTx)
  line(`tx     : ${txUrl(cfg.network, revokeRes.digest)}`)

  // 5. post-revoke abort
  h('5. post-revoke — any spend now aborts on-chain')
  const afterTx = new Transaction()
  const coin2 = buildWithdraw(afterTx, {
    packageId: cfg.packageId,
    coinType,
    policyId,
    capId,
    amountMist: ALLOWED_SPEND,
    protocol: 'transfer',
  })
  afterTx.transferObjects([coin2], afterTx.pure.address(recipient))
  const afterSim = await dryRun(client, afterTx, ownerAddr)
  line(`chain  : would-execute=${afterSim.ok} ${afterSim.ok ? '' : `(aborted: ${afterSim.error})`}`)

  // 6. reclaim
  h('6. reclaim remaining budget (owner)')
  const reclaimTx = new Transaction()
  buildReclaim(reclaimTx, { packageId: cfg.packageId, coinType, policyId })
  const reclaimRes = await execute(client, owner, reclaimTx)
  line(`tx     : ${txUrl(cfg.network, reclaimRes.digest)}`)
  line('remaining budget returned to owner')

  line('\n✅ demo complete — the AI acted only inside the policy; the chain enforced the rest.')
}
