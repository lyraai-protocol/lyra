import { loadConfig, loadKeypair, mistToSui, policyFromEnv, suiToMist } from 'lyra-core'

/** Show network, package, agent address, and the active policy. */
export async function runStatus(): Promise<void> {
  const cfg = loadConfig()
  const policy = policyFromEnv()
  const addr = process.env.LYRA_AGENT_KEY
    ? loadKeypair(process.env.LYRA_AGENT_KEY).toSuiAddress()
    : '(no LYRA_AGENT_KEY set)'
  const cap = mistToSui(policy.maxNativeMistPerTx ?? suiToMist(0.02))
  console.log('Lyra status')
  console.log(`  network   : ${cfg.network}`)
  console.log(`  package   : ${cfg.packageId}`)
  console.log(`  agent     : ${addr}`)
  console.log(`  per-tx cap: ${cap} SUI`)
  console.log(`  protocols : [${(policy.allowedProtocols ?? []).join(', ')}]`)
  console.log(`  autonomy  : ${policy.autonomy ?? 'auto'}`)
}
