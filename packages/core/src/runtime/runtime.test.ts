import { test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StubBrain } from '../brain/stub'
import { defineConfig } from '../config'
import { LocalStubStorage } from '../storage/local-stub'
import { type IdentityProvider, Runtime } from './runtime'

/** Minimal in-memory identity for runtime tests. */
class StubIdentity implements IdentityProvider {
  constructor(private readonly agentId: string) {}
  current() {
    return { agentId: this.agentId }
  }
}

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const prev = process.env.LYRA_ROOT
  const tmp = mkdtempSync(join(tmpdir(), 'lyra-root-'))
  process.env.LYRA_ROOT = tmp
  try {
    return await fn(tmp)
  } finally {
    process.env.LYRA_ROOT = prev
    rmSync(tmp, { recursive: true, force: true })
  }
}

test('runtime boots, seeds memory dir, routes stub brain echo', async () => {
  await withTempRoot(async root => {
    const agentAddr = `0x${'a'.repeat(64)}`
    const identity = new StubIdentity(agentAddr)
    const brain = new StubBrain()
    const storage = new LocalStubStorage(join(root, 'storage-stub-test'))

    const runtime = new Runtime({
      config: defineConfig({ network: 'testnet' }),
      identity,
      brain,
      storage,
    })

    await runtime.start()

    await runtime.fire({
      source: 'stdin',
      payload: { label: 'hello', data: 'hello world' },
    })

    await new Promise(r => setTimeout(r, 50))

    await runtime.stop()
  })
})
