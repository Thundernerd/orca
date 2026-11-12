import type { PRState } from '../../shared/github/pull-requests/pull-request-types'
import type { PRRefreshOutcome } from '../../shared/github/pull-requests/refresh/pull-request-refresh-types'
import type {
  RuntimeWorktreeListResult,
  RuntimeWorktreePsResult
} from '../../shared/runtime-worktree-contracts'
import {
  reconcileTicketItem,
  type TicketItemObservation
} from '../../shared/ticket-pipeline/ticket-item-reconcile'
import type { TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'
import { cleanWorkspaces } from './workspace-clean'
import { getMergeQueue } from './merge-queue'
import { resolveTicketSource } from './sources/ticket-source-resolution'

export type TicketTrackerRuntime = {
  getWorktreePs(limit: number): Promise<RuntimeWorktreePsResult>
  listManagedWorktrees(repoSelector: undefined, limit: number): Promise<RuntimeWorktreeListResult>
  getRepoPRForBranch(
    repoSelector: string,
    branch: string,
    linkedPRNumber?: number | null,
    fallbackPRNumber?: number | null,
    acceptMergedFallbackPR?: boolean,
    currentHeadOid?: string | null,
    reason?: 'watch'
  ): Promise<PRRefreshOutcome>
  updateManagedWorktreeMeta(
    worktreeSelector: string,
    updates: { workspaceStatus?: string; linkedPR?: number | null }
  ): Promise<unknown>
}

const TICK_MS = 60_000
const SCAN_LIMIT = 10_000

const PR_STATES: readonly PRState[] = ['open', 'closed', 'merged', 'draft']

function isPRState(value: string): value is PRState {
  return PR_STATES.some((state) => state === value)
}

function isActive(item: TicketItem): boolean {
  return item.stage !== 'merged' && item.stage !== 'closed' && item.stage !== 'cleaned'
}

/** The workspace status a stage puts on the board; null leaves the user's choice alone. */
function boardStatusFor(stage: TicketItem['stage']): string | null {
  switch (stage) {
    case 'in-review':
      return 'in-review'
    case 'merged':
      return 'completed'
    case 'implementing':
    case 'agent-waiting':
    case 'closed':
    case 'cleaned':
      return null
  }
}

async function findReview(
  runtime: TicketTrackerRuntime,
  item: TicketItem,
  cached: { number: number; state: string; url?: string } | null | undefined
): Promise<TicketItemObservation['review']> {
  if (cached?.url && isPRState(cached.state)) {
    return { number: cached.number, url: cached.url, state: cached.state }
  }
  // The branch lookup shares the PR refresh budget; it only runs until the PR is linked and cached.
  const outcome = await runtime
    .getRepoPRForBranch(
      `id:${item.repoId}`,
      item.branch,
      item.reviewNumber,
      null,
      true,
      null,
      'watch'
    )
    .catch(() => null)
  return outcome?.kind === 'found'
    ? { number: outcome.pr.number, url: outcome.pr.url, state: outcome.pr.state }
    : null
}

/** Follows each launched ticket to its PR and merge, keeping the item and the workspace board in step. */
export class TicketTracker {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<void> | null = null

  constructor(
    private readonly runtime: TicketTrackerRuntime,
    /** Removes a merged item's workspace if the clean-up survey clears it; absent disables auto-clean. */
    private readonly autoClean?: (item: TicketItem) => Promise<void>,
    /** Moves the head of each merge queue one step; absent disables the queue. */
    private readonly advanceQueues?: () => Promise<void>,
    /** Finishes the ticket in its tracker once its PR merged, where merging alone does not. */
    private readonly completeTicket?: (item: TicketItem) => Promise<void>,
    private readonly store: TicketItemStore = getTicketItemStore()
  ) {}

  /** Merged items whose project cleans up automatically stay in the loop until their workspace goes. */
  private async awaitingAutoClean(items: readonly TicketItem[]): Promise<TicketItem[]> {
    if (!this.autoClean) {
      return []
    }
    const waiting: TicketItem[] = []
    for (const item of items.filter((i) => i.stage === 'merged')) {
      if ((await this.store.getSettings(item.repoId)).autoClean) {
        waiting.push(item)
      }
    }
    return waiting
  }

  /** Idempotent: ticks now and keeps ticking while any item is active. */
  start(): void {
    if (this.timer || this.running) {
      return
    }
    this.schedule(0)
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      this.timer = null
      this.running = this.tick()
        .catch((error: unknown) => {
          console.warn('[tickets] tracker tick failed', error)
          return true
        })
        .then((keepGoing) => {
          this.running = null
          if (keepGoing) {
            this.schedule(TICK_MS)
          }
        })
    }, delay)
  }

  /** One pass over the active items; false when none are left, so the timer stops until the next launch. */
  async tick(): Promise<boolean> {
    const items = await this.store.list()
    const active = items.filter(isActive)
    const cleanable = await this.awaitingAutoClean(items)
    if (active.length === 0 && cleanable.length === 0) {
      return false
    }
    const [ps, listed] = await Promise.all([
      this.runtime.getWorktreePs(SCAN_LIMIT),
      this.runtime.listManagedWorktrees(undefined, SCAN_LIMIT)
    ])
    const existing = new Set(listed.worktrees.map((w) => w.id))
    const summaries = new Map(ps.worktrees.map((w) => [w.worktreeId, w]))
    for (const item of active) {
      const summary = summaries.get(item.childWorktreeId)
      const observed: TicketItemObservation = {
        workspaceExists: existing.has(item.childWorktreeId),
        agentWaiting: summary?.status === 'permission' || summary?.status === 'done',
        review: await findReview(this.runtime, item, summary?.linkedPR)
      }
      const update = reconcileTicketItem(item, observed)
      if (!update) {
        continue
      }
      await this.store.update(item.id, update)
      if (update.stage === 'merged') {
        await this.completeTicket?.(item).catch((error: unknown) =>
          console.warn('[tickets] could not mark the ticket done', error)
        )
      }
      const boardStatus = update.stage !== item.stage ? boardStatusFor(update.stage) : null
      if (observed.workspaceExists && (boardStatus || update.reviewNumber !== item.reviewNumber)) {
        await this.runtime
          .updateManagedWorktreeMeta(`id:${item.childWorktreeId}`, {
            ...(boardStatus ? { workspaceStatus: boardStatus } : {}),
            ...(update.reviewNumber !== item.reviewNumber ? { linkedPR: update.reviewNumber } : {})
          })
          .catch((error: unknown) => console.warn('[tickets] could not update workspace', error))
      }
    }
    await this.advanceQueues?.().catch((error: unknown) =>
      console.warn('[tickets] merge queue step failed', error)
    )
    // Includes items that merged this tick; a kept workspace (an agent still busy) is retried next tick.
    for (const item of await this.awaitingAutoClean(await this.store.list())) {
      await this.autoClean?.(item).catch((error: unknown) =>
        console.warn('[tickets] auto-clean failed', error)
      )
    }
    return true
  }
}

let tracker: TicketTracker | null = null

export function startTicketTracker(runtime: OrcaRuntimeService): void {
  tracker ??= new TicketTracker(
    runtime,
    async (item) => {
      await cleanWorkspaces({ runtime }, { worktree: `id:${item.parentWorktreeId}` }, [
        item.childWorktreeId
      ])
    },
    () => getMergeQueue(runtime).advanceAll(),
    async (item) => {
      const { source } = await resolveTicketSource(await runtime.showRepo(`id:${item.repoId}`))
      // The project may have switched trackers since launch; never write to the wrong one.
      if (source.kind === item.source) {
        await source.complete(item.ticketId)
      }
    }
  )
  tracker.start()
}
