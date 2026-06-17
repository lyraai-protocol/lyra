// Server-side Lyra agent for the web console. Runs a real OpenAI tool-calling
// loop over live Sui reads (@mysten/sui) — balances, the agent's on-chain
// AgentPolicy, recent ActionReceipts, and DeFiLlama yield discovery.
//
// Value-moving actions are NOT executed here: on Sui they run through the CLI /
// gateway as policy-checked PTBs (deterministic Move code enforces the bounds in
// the live `AgentPolicy`). The web brain is a read + advise surface, so it never
// holds a signing key and never broadcasts.
import 'server-only'

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import {
  LYRA_POLICY_PACKAGE_ID,
  SUI_COIN_TYPE,
  type SuiNetwork,
  getActionReceiptsForOwner,
  getAgentPolicy,
} from '@/lib/chain/sui'

const NETWORK: SuiNetwork = (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) || 'mainnet'
const sui = new SuiClient({ url: getFullnodeUrl(NETWORK) })

// 1 SUI = 1e9 MIST.
const MIST_PER_SUI = 1_000_000_000n

function fmtSui(mist: bigint, decimals = 4): string {
  const negative = mist < 0n
  const w = negative ? -mist : mist
  const whole = w / MIST_PER_SUI
  const frac = w % MIST_PER_SUI
  const fracStr = frac.toString().padStart(9, '0').slice(0, decimals).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fracStr ? `.${fracStr}` : ''}`
}

function isSuiAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(s)
}

// ─── tool context ─────────────────────────────────────────────────────────────
interface ToolContext {
  /** The signed-in / connected wallet, used as the default "my" subject. */
  walletAddress: string | null
}

// ─── tool implementations ─────────────────────────────────────────────────────

async function getBalanceTool(args: Record<string, unknown>, ctx: ToolContext) {
  const addr = (typeof args.address === 'string' && args.address) || ctx.walletAddress
  if (!addr || !isSuiAddress(addr)) return { error: 'no valid Sui address (connect a wallet or pass one)' }
  const [suiBal, all] = await Promise.all([
    sui.getBalance({ owner: addr, coinType: SUI_COIN_TYPE }),
    sui.getAllBalances({ owner: addr }).catch(() => []),
  ])
  const coins = all
    .filter(b => b.coinType !== SUI_COIN_TYPE && BigInt(b.totalBalance) > 0n)
    .slice(0, 12)
    .map(b => ({ coinType: b.coinType, raw: b.totalBalance }))
  return {
    address: addr,
    sui: fmtSui(BigInt(suiBal.totalBalance)),
    suiMist: suiBal.totalBalance,
    otherCoins: coins,
  }
}

async function portfolioTool(args: Record<string, unknown>, ctx: ToolContext) {
  const addr = (typeof args.address === 'string' && args.address) || ctx.walletAddress
  if (!addr || !isSuiAddress(addr)) return { error: 'no valid Sui address (connect a wallet or pass one)' }
  const all = await sui.getAllBalances({ owner: addr }).catch(() => [])
  const holdings = all
    .filter(b => BigInt(b.totalBalance) > 0n)
    .map(b => ({
      coinType: b.coinType,
      raw: b.totalBalance,
      ...(b.coinType === SUI_COIN_TYPE ? { sui: fmtSui(BigInt(b.totalBalance)) } : {}),
    }))
  return { address: addr, holdings, note: 'Raw balances are in base units; SUI shown in whole SUI.' }
}

async function agentPolicyTool(args: Record<string, unknown>, ctx: ToolContext) {
  const id =
    (typeof args.policyObjectId === 'string' && args.policyObjectId) ||
    process.env.NEXT_PUBLIC_LYRA_POLICY_OBJECT_ID ||
    null
  if (!id) return { error: 'no AgentPolicy object id configured or provided' }
  const p = await getAgentPolicy(id, NETWORK)
  if (!p) return { error: `no AgentPolicy at ${id}` }
  return {
    objectId: p.objectId,
    owner: p.owner,
    agent: p.agent,
    budgetSui: fmtSui(p.budgetMist),
    spentSui: fmtSui(p.spentMist),
    remainingSui: fmtSui(p.budgetMist - p.spentMist),
    maxPerTxSui: fmtSui(p.maxPerTxMist),
    allowedCoins: p.allowedCoins,
    allowedProtocols: p.allowedProtocols,
    expiry: p.expiryMs > 0n ? new Date(Number(p.expiryMs)).toISOString() : 'no expiry',
    revoked: p.revoked,
  }
}

async function recentReceiptsTool(args: Record<string, unknown>, ctx: ToolContext) {
  const agent =
    (typeof args.agent === 'string' && args.agent) ||
    process.env.NEXT_PUBLIC_LYRA_AGENT_ADDRESS ||
    ctx.walletAddress
  if (!agent || !isSuiAddress(agent)) return { error: 'no valid agent address' }
  const receipts = await getActionReceiptsForOwner(agent, NETWORK, 15).catch(() => [])
  return {
    agent,
    count: receipts.length,
    receipts: receipts.map(r => ({
      objectId: r.objectId,
      action: r.action,
      amountSui: r.amountMist !== undefined ? fmtSui(r.amountMist) : undefined,
      timestamp: r.timestampMs !== undefined ? new Date(Number(r.timestampMs)).toISOString() : undefined,
    })),
  }
}

async function defiYieldsTool(args: Record<string, unknown>) {
  const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 12) : 5
  try {
    const json = (await fetch('https://yields.llama.fi/pools').then(r => r.json())) as {
      data?: Array<{
        chain: string
        project: string
        symbol: string
        tvlUsd: number
        apy: number
        stablecoin?: boolean
      }>
    }
    const pools = (json.data ?? [])
      .filter(p => p.chain === 'Sui')
      .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
      .slice(0, limit)
      .map(p => ({
        project: p.project,
        symbol: p.symbol,
        apyPct: Number((p.apy ?? 0).toFixed(2)),
        tvlUsd: Math.round(p.tvlUsd ?? 0),
        stablecoin: Boolean(p.stablecoin),
      }))
    return { chain: 'Sui', pools }
  } catch (e) {
    return { error: `DeFiLlama unreachable: ${(e as Error).message}` }
  }
}

async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case 'get_balance':
      return getBalanceTool(args, ctx)
    case 'portfolio':
      return portfolioTool(args, ctx)
    case 'agent_policy':
      return agentPolicyTool(args, ctx)
    case 'recent_receipts':
      return recentReceiptsTool(args, ctx)
    case 'defi_yields':
      return defiYieldsTool(args)
    default:
      return { error: `unknown tool ${name}` }
  }
}

// ─── tool specs (OpenAI function-calling) ──────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_balance',
      description: 'Get the SUI balance (and other coin balances) of a Sui address. Defaults to the connected wallet.',
      parameters: {
        type: 'object',
        properties: { address: { type: 'string', description: 'Sui 0x address. Defaults to the connected wallet.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'portfolio',
      description:
        "Full coin portfolio for a Sui address: balances of every coin type held. Defaults to the user's connected wallet — use for 'my portfolio / my treasury / my positions'.",
      parameters: {
        type: 'object',
        properties: { address: { type: 'string', description: 'Sui 0x address. Defaults to the connected wallet.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agent_policy',
      description:
        "Read the agent's on-chain AgentPolicy: budget, spent, per-tx cap (in SUI), allowed coins and protocols, expiry, and whether it is revoked. This is the deterministic fund-control boundary the agent runs under.",
      parameters: {
        type: 'object',
        properties: { policyObjectId: { type: 'string', description: 'AgentPolicy object id. Defaults to the configured policy.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recent_receipts',
      description: "List the agent's recent on-chain ActionReceipts (what it has done, policy-checked).",
      parameters: {
        type: 'object',
        properties: { agent: { type: 'string', description: 'Agent Sui address. Defaults to the configured agent.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'defi_yields',
      description: 'Top Sui DeFi pools by APY (DeFiLlama), with TVL. Read-only discovery.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'How many pools (default 5).' } },
      },
    },
  },
] as const

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
}

export interface AgentResult {
  reply: string
  trace: { tool: string; args: unknown; result: unknown }[]
}

const SYSTEM_PROMPT = `You are lyra, a Sui-native, policy-aware AI treasury assistant.
You operate on Sui. Use the tools to answer with live on-chain data — never invent numbers.
The defensible idea: the AI advises, deterministic Move code enforces the fund controls. An agent acts
ONLY within its on-chain AgentPolicy (budget, per-tx cap, allowed coins/protocols, expiry) — read it
with agent_policy and explain the bounds when asked.
Value-moving actions (swaps on Cetus/Turbos, lending on Suilend/NAVI, transfers) are NOT executed from
this chat: they run through the Lyra CLI / gateway as policy-checked PTBs that the agent signs. When a
user asks to swap/lend/send, explain what the agent WOULD do, note it is bounded by the AgentPolicy and
recorded as an ActionReceipt, and point them to the CLI/gateway to execute — never claim you executed it.
Amounts are in SUI (1 SUI = 1e9 MIST). Memory and receipts are anchored with Walrus.
Be concise and concrete. When you cite a balance, yield, policy field, or receipt, it must come from a tool result.`

const OPENAI_URL = (process.env.LYRA_LLM_BASE_URL ?? 'https://api.openai.com/v1') + '/chat/completions'
const MODEL = process.env.LYRA_LLM_MODEL ?? 'gpt-4o-mini'

export interface RunAgentOptions {
  /** Authenticated / connected wallet address for this request, if any. */
  authedAddress?: string | null
}

export async function runAgent(history: ChatMessage[], opts: RunAgentOptions = {}): Promise<AgentResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LYRA_LLM_API_KEY
  if (!apiKey) return { reply: 'The agent brain is not configured (no OPENAI_API_KEY on the server).', trace: [] }

  const walletAddress =
    opts.authedAddress && isSuiAddress(opts.authedAddress) ? opts.authedAddress : null
  const ctx: ToolContext = { walletAddress }

  const sys = walletAddress
    ? `${SYSTEM_PROMPT}\nThe user's connected Sui wallet is ${walletAddress}. When they say "my", treat that as this address — call tools with no address (they default to it) and never ask them to paste an address.`
    : `${SYSTEM_PROMPT}\nThe user is not signed in, so there is no connected wallet. If they ask about "my" balance/portfolio, ask them to connect their Sui wallet (top-right) — or answer for a specific address if they give one.\nThe live Lyra policy package on Sui mainnet is ${LYRA_POLICY_PACKAGE_ID}.`

  const messages: ChatMessage[] = [{ role: 'system', content: sys }, ...history]
  const trace: AgentResult['trace'] = []

  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.3 }),
    })
    if (!res.ok) return { reply: `brain error: ${res.status} ${(await res.text()).slice(0, 160)}`, trace }
    const data = (await res.json()) as {
      choices: { message: ChatMessage & { tool_calls?: ChatMessage['tool_calls'] } }[]
    }
    const msg = data.choices?.[0]?.message
    if (!msg) return { reply: 'no response from brain', trace }
    messages.push(msg)

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { reply: msg.content || '(no reply)', trace }
    }

    for (const call of msg.tool_calls) {
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(call.function.arguments || '{}')
      } catch {}
      let result: unknown
      try {
        result = await runTool(call.function.name, parsed, ctx)
      } catch (e) {
        result = { error: (e as Error).message }
      }
      trace.push({ tool: call.function.name, args: parsed, result })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  return { reply: 'Stopped after several tool calls without a final answer — try rephrasing.', trace }
}
