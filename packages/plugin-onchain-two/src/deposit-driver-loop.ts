/**
 * The durable driver tick — bridges the ASYNC durable store (the api service's
 * /deposits, loaded/saved over HTTP) to the SYNC {@link DepositStore} + {@link
 * driveTick} spine. One tick:
 *   1. load the active (non-terminal) work-list from the durable store,
 *   2. hydrate an in-memory store from it (so the sync spine can run),
 *   3. drive every deposit one step (and reap stale ones),
 *   4. persist back only the records this tick actually touched.
 *
 * Keeping the spine sync (and fully unit-tested) while the durable layer is async
 * means the risky cross-chain executors and the state machine stay decoupled — the
 * loop here is the only place the two meet, and it's testable with a mock repo.
 */

import { driveTick, reapStale } from './deposit-driver'
import type { DepositExecutors } from './deposit-driver'
import { InMemoryDepositStore, type PendingDeposit } from './deposit-store'

/** The durable persistence the driver needs: read the active work-list, write back a
 *  record. Implemented over the api service's /deposits routes in `driver-run`. */
export interface DurableDepositRepo {
  listActive(): Promise<PendingDeposit[]>
  save(deposit: PendingDeposit): Promise<void>
}

export interface DriveTickResult {
  active: number
  advanced: number
  reaped: number
}

/**
 * Run one durable driver tick. `maxAgeMs` (if set) fails any deposit that hasn't
 * progressed within that window (a burn that never came, an attestation that never
 * arrived). Returns per-tick counts for logging. A record is "touched" iff the spine
 * stamped it with this tick's `now` — those, and only those, are persisted.
 */
export async function driveDurableTick(
  repo: DurableDepositRepo,
  ex: DepositExecutors,
  opts: { maxAgeMs?: number; now?: number } = {},
): Promise<DriveTickResult> {
  const now = opts.now ?? Date.now()
  const active = await repo.listActive()
  if (active.length === 0) return { active: 0, advanced: 0, reaped: 0 }

  const mem = InMemoryDepositStore.fromRecords(active)
  const driven = await driveTick(mem, ex, now)
  const reaped = opts.maxAgeMs ? reapStale(mem, opts.maxAgeMs, now) : []

  // The spine sets updatedMs = now on every transition (advance / fail), and returns
  // records unchanged otherwise — so `updatedMs === now` is exactly "touched".
  const touched = new Map<string, PendingDeposit>()
  for (const d of [...driven, ...reaped]) {
    if (d.updatedMs === now) touched.set(d.id, d)
  }
  await Promise.all([...touched.values()].map(d => repo.save(d)))

  const touchedList = [...touched.values()]
  return {
    active: active.length,
    advanced: touchedList.filter(d => d.status !== 'failed').length,
    reaped: touchedList.filter(d => d.status === 'failed').length,
  }
}
