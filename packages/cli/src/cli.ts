#!/usr/bin/env bun
/**
 * Lyra CLI argv dispatch (structure adapted from Nebula's CLI). No subcommand
 * → TUI chat; otherwise route to commands/<name>. Commands are dynamically
 * imported so read-only commands (help, status) don't require an agent key.
 */
const argv = process.argv.slice(2)
const sub = argv[0]

async function main(): Promise<void> {
  switch (sub) {
    case undefined:
    case 'chat': {
      const { runChat } = await import('./commands/chat')
      await runChat()
      return
    }
    case 'agent': {
      const goal = argv.slice(1).join(' ').trim()
      if (!goal) {
        console.error('usage: lyra agent "<goal>"')
        process.exit(1)
      }
      const { runGoal } = await import('./commands/agent')
      await runGoal(goal, { log: true })
      return
    }
    case 'demo': {
      const { runDemo } = await import('./commands/demo')
      await runDemo()
      return
    }
    case 'status': {
      const { runStatus } = await import('./commands/status')
      await runStatus()
      return
    }
    case '-h':
    case '--help':
    case 'help': {
      printHelp()
      return
    }
    case '-v':
    case '--version':
    case 'version': {
      console.log('lyra 0.1.0')
      return
    }
    default: {
      console.log(`Unknown command: ${sub}`)
      printHelp()
      process.exit(1)
    }
  }
}

function printHelp(): void {
  console.log(
    [
      'lyra: a Sui-native, policy-bound AI agent for autonomous DeFi',
      '',
      'Commands:',
      '  lyra [chat]            interactive TUI — type goals, the agent plans + executes within policy',
      '  lyra agent "<goal>"    plan + execute a single goal end-to-end',
      '  lyra demo              run the full guarded-pipeline demo (create/spend/block/revoke/reclaim)',
      '  lyra status            show network, package, agent address, and policy',
      '  lyra version           print CLI version  (aliases: --version, -v)',
      '  lyra help              show this message   (aliases: --help, -h)',
      '',
      'The AI proposes. Sui policies enforce. Walrus remembers.',
      '',
    ].join('\n'),
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', (e as Error).message)
    process.exit(1)
  })
