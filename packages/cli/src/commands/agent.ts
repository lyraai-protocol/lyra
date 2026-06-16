/**
 * The Lyra agent runtime — the full Agentic Web loop as a reusable function.
 *
 *   goal -> LLM plan -> policy mirror -> PTB -> on-chain guard -> Walrus receipt
 *
 * `runGoal` is shared by the CLI (`lyra agent` / chat TUI) and the gateway.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Transaction } from '@mysten/sui/transactions'
import {
  brainFromEnv,
  evaluatePolicy,
  loadConfig,
  loadKeypair,
  mistToSui,
  planAction,
  type PolicyAction,
  policyFromEnv,
  type ProposedAction,
  SUI_TYPE,
  suiToMist,
} from 'lyra-core'
import {
  buildCreatePolicy,
  buildRecord,
  buildWithdrawTransfer,
  createdObjectByType,
  execute,
  makeClient,
  txUrl,
} from 'lyra-plugin-sui'
import { storeBlobOnChain } from 'lyra-plugin-walrus'

const cfg = loadConfig()
const client = makeClient(cfg.network)
const brain = brainFromEnv()
const policy = policyFromEnv()
const coinType = SUI_TYPE
const POLICY_FILE = '.lyra/policy.json'

function reqEnv(k: string): string {
  const v = process.env[k]
  if (!v) throw new Error(`${k} is required`)
  return v
}
const owner = loadKeypair(reqEnv('LYRA_AGENT_KEY'))
const ownerAddr = owner.toSuiAddress()

interface PolicyRef {
  packageId: string
  policyId: string
  capId: string
}

export interface GoalResult {
  goal: string
  plan: ProposedAction
  status: 'executed' | 'blocked' | 'noop'
  violations?: string[]
  txDigest?: string
  txUrl?: string
  walrusBlob?: string
  walrusUrl?: string
}

async function ensurePolicy(log: (s: string) => void): Promise<PolicyRef> {
  if (existsSync(POLICY_FILE)) {
    const j = JSON.parse(await readFile(POLICY_FILE, 'utf8')) as PolicyRef
    if (j.packageId === cfg.packageId && j.policyId && j.capId) return j
  }
  const allowedProtocols = policy.allowedProtocols ?? ['transfer', 'walrus', 'deepbook']
  const expiryMs = policy.expiryMs ?? Date.now() + 60 * 60_000
  const tx = new Transaction()
  buildCreatePolicy(tx, {
    packageId: cfg.packageId,
    coinType,
    agent: ownerAddr,
    budgetMist: suiToMist(0.05),
    maxPerTxMist: policy.maxNativeMistPerTx ?? suiToMist(0.02),
    maxSlippageBps: policy.maxSlippageBps ?? 100,
    allowedProtocols,
    expiryMs,
  })
  const res = await execute(client, owner, tx)
  const policyId = createdObjectByType(res, '::policy::AgentPolicy<')
  const capId = createdObjectByType(res, '::policy::AgentCap')
  if (!policyId || !capId) throw new Error('failed to create policy')
  const ref: PolicyRef = { packageId: cfg.packageId, policyId, capId }
  await mkdir('.lyra', { recursive: true })
  await writeFile(POLICY_FILE, JSON.stringify({ ...ref, createdAt: new Date().toISOString() }, null, 2))
  log(`policy : created ${policyId}\n         ${txUrl(cfg.network, res.digest)}`)
  return ref
}

function policySummary(): string {
  const cap = mistToSui(policy.maxNativeMistPerTx ?? suiToMist(0.02))
  const protos = (policy.allowedProtocols ?? ['transfer', 'walrus']).join(', ')
  const exp = policy.expiryMs ? `${Math.round((policy.expiryMs - Date.now()) / 60_000)} min` : 'none'
  return `- per-transaction cap: ${cap} SUI\n- allowed protocols: [${protos}]\n- autonomy: ${policy.autonomy ?? 'auto'}\n- expires in: ${exp}\n- total budget: 0.05 SUI (held in the policy object)`
}

function storeReceipt(record: Record<string, unknown>) {
  return storeBlobOnChain(JSON.stringify(record, null, 2), {
    suiClient: client,
    signer: owner,
    network: cfg.network,
    epochs: 2,
  })
}

export async function runGoal(goal: string, opts: { log?: boolean } = {}): Promise<GoalResult> {
  const log = opts.log ? (s: string) => console.log(s) : () => {}
  log(`Lyra · ${cfg.network} · package ${cfg.packageId.slice(0, 10)}…`)
  log(`goal   : "${goal}"\n`)

  const { policyId, capId } = await ensurePolicy(log)

  // 1) Advisory layer: the LLM proposes one action.
  const plan = await planAction(goal, { policySummary: policySummary(), ownerAddress: ownerAddr }, brain)
  const detail = [
    plan.amountSui ? `${plan.amountSui} SUI` : '',
    plan.recipient ? `-> ${plan.recipient}` : '',
    plan.memo ? `"${plan.memo.slice(0, 60)}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  log(`plan   : ${plan.kind} ${detail}`.trimEnd())
  log(`reason : ${plan.reasoning}\n`)

  if (plan.kind === 'noop') {
    log('→ no action taken.')
    return { goal, plan, status: 'noop' }
  }

  // 2) Control layer: deterministic policy mirror.
  const amountMist = plan.amountSui ? suiToMist(plan.amountSui) : 0n
  const action: PolicyAction = {
    kind: plan.kind === 'transfer' ? 'transfer' : 'store',
    protocol: plan.protocol || (plan.kind === 'transfer' ? 'transfer' : 'walrus'),
    coinType,
    amountRaw: amountMist,
    to: plan.recipient,
  }
  const verdict = evaluatePolicy(action, policy)
  if (!verdict.allowed) {
    log(`⛔ BLOCKED by policy: ${verdict.violations.join('; ')}`)
    log('   (the on-chain guard would also abort this — the AI cannot override it)')
    return { goal, plan, status: 'blocked', violations: verdict.violations }
  }
  if (verdict.requiresApproval) {
    log('⚠ material-risk: policy marks this for human approval (auto-proceeding in CLI demo)\n')
  }

  // 3) Execute through the guard + write a durable Walrus receipt.
  if (plan.kind === 'transfer') {
    if (!plan.recipient || !plan.amountSui) {
      return { goal, plan, status: 'blocked', violations: ['transfer missing recipient/amount'] }
    }
    const blob = await storeReceipt({
      kind: 'lyra.receipt.v1',
      network: cfg.network,
      policyId,
      agent: ownerAddr,
      action: 'transfer',
      amountSui: plan.amountSui,
      recipient: plan.recipient,
      reasoning: plan.reasoning,
      goal,
      ts: new Date().toISOString(),
    })
    const tx = new Transaction()
    buildWithdrawTransfer(tx, {
      packageId: cfg.packageId,
      coinType,
      policyId,
      capId,
      amountMist,
      protocol: 'transfer',
      recipient: plan.recipient,
    })
    buildRecord(tx, {
      packageId: cfg.packageId,
      coinType,
      policyId,
      capId,
      protocol: 'transfer',
      summary: `sent ${plan.amountSui} SUI`,
      amountMist,
      coinTypeStr: coinType,
      status: 'executed',
      walrusBlob: blob.blobId,
    })
    const res = await execute(client, owner, tx)
    log(`✅ executed · ${txUrl(cfg.network, res.digest)}`)
    log(`   walrus receipt: ${blob.url}`)
    return {
      goal,
      plan,
      status: 'executed',
      txDigest: res.digest,
      txUrl: txUrl(cfg.network, res.digest),
      walrusBlob: blob.blobId,
      walrusUrl: blob.url,
    }
  }

  // store_memory
  const memo = plan.memo ?? goal
  const blob = await storeReceipt({
    kind: 'lyra.memory.v1',
    network: cfg.network,
    policyId,
    agent: ownerAddr,
    memo,
    reasoning: plan.reasoning,
    goal,
    ts: new Date().toISOString(),
  })
  const tx = new Transaction()
  buildRecord(tx, {
    packageId: cfg.packageId,
    coinType,
    policyId,
    capId,
    protocol: 'walrus',
    summary: memo.slice(0, 80),
    amountMist: 0n,
    coinTypeStr: coinType,
    status: 'memory',
    walrusBlob: blob.blobId,
  })
  const res = await execute(client, owner, tx)
  log(`✅ stored durable memory on Walrus · ${txUrl(cfg.network, res.digest)}`)
  log(`   walrus: ${blob.url}`)
  return {
    goal,
    plan,
    status: 'executed',
    txDigest: res.digest,
    txUrl: txUrl(cfg.network, res.digest),
    walrusBlob: blob.blobId,
    walrusUrl: blob.url,
  }
}
