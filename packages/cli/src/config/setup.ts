import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type LyraNetwork, agentPaths, defineConfig, placeholderAgentId } from 'lyra-core'
import { resolvePackageId } from './defaults'
import { writeConfigTs } from './render'

/**
 * Write `~/.lyra/config.ts` + seed starter memory for an agent we already have
 * (a fresh key, or one linked from the web). Shared by `lyra init` and
 * `lyra login` so BOTH produce a complete, runnable setup — `lyra login` used to
 * write only the agent key, leaving `lyra` (chat) without a config to load.
 */
export async function finalizeSetup(opts: {
  agentAddress: string
  linkedOwner: string | null
  network: LyraNetwork
  brainProvider?: string | null
  brainModel?: string | null
}): Promise<{ agentId: string; configPath: string; packageId: string }> {
  const configPath = agentPaths.config
  const agentId = placeholderAgentId(opts.agentAddress)
  const paths = agentPaths.agent(agentId)
  await mkdir(paths.dir, { recursive: true })

  // Telegram is env-driven on Sui (TELEGRAM_BOT_TOKEN). Auto-enable the plugin
  // when the token is present so `lyra` brings the DM gateway online.
  const telegramEnabled = !!process.env.TELEGRAM_BOT_TOKEN

  await seedStarterMemoryFiles({
    paths,
    network: opts.network,
    agentAddress: opts.agentAddress,
    brainProvider: opts.brainProvider ?? null,
    brainModel: opts.brainModel ?? null,
  })

  const cfg = defineConfig({
    identity: { operator: opts.linkedOwner, agent: opts.agentAddress },
    network: opts.network,
    storage: { network: opts.network },
    brain: { provider: opts.brainProvider ?? null, model: opts.brainModel ?? null },
    plugins: telegramEnabled ? ['onchain', 'system', 'telegram'] : ['onchain', 'system'],
    tools: {},
    imports: { claudeCode: true },
  })
  await writeConfigTs(configPath, cfg, {
    header: '// Written by lyra (init / login). Edit freely; type-safe.',
  })

  return { agentId, configPath, packageId: resolvePackageId() }
}

interface SeedStarterOpts {
  paths: ReturnType<typeof agentPaths.agent>
  network: LyraNetwork
  agentAddress: string
  brainProvider: string | null
  brainModel: string | null
}

/**
 * Seed `MEMORY.md`, `/agent/identity.md`, and `/agent/persona.md` so the brain's
 * first turn sees a parseable memory index and introduces itself.
 */
export async function seedStarterMemoryFiles(opts: SeedStarterOpts): Promise<void> {
  const memDir = opts.paths.memoryDir
  const agentMem = `${memDir}/agent`
  const userMem = `${memDir}/user`
  await mkdir(agentMem, { recursive: true })
  await mkdir(userMem, { recursive: true })

  const now = new Date().toISOString().slice(0, 10)
  const identity = `---\nname: identity\ndescription: Auto-written agent identity facts.\ntype: agent-identity\n---\n# Lyra identity\n\n- Name: Lyra\n- Agent address: ${opts.agentAddress} (${opts.network})\n- Created: ${now}\n${opts.brainProvider ? `- Brain provider: ${opts.brainProvider}\n` : ''}${opts.brainModel ? `- Brain model: ${opts.brainModel}\n` : ''}`
  const persona =
    '---\nname: persona\ndescription: Voice + behavior style.\ntype: agent-persona\n---\n# Persona\n\nI am Lyra, a Sui-native autonomous finance agent. I convert goals into policy-checked PTBs, execute only within my approved protocol scope, and store auditable memory and receipts with Walrus. Every value-moving action is checked by a deterministic policy (mirrored on-chain by lyra::policy) before it runs. I am direct, concise, and factual.\n'
  const profile =
    '---\nname: profile\ndescription: User profile (local only).\ntype: user\n---\n# User profile\n\n(empty, fills as we chat)\n'

  await writeFile(join(agentMem, 'identity.md'), identity, 'utf8')
  await writeFile(join(agentMem, 'persona.md'), persona, 'utf8')
  await writeFile(join(userMem, 'profile.md'), profile, 'utf8')
  await writeFile(opts.paths.memoryIndex, '# Lyra Memory Index\n\n', 'utf8')
}
