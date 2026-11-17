import type { PRState } from '../../shared/github/pull-requests/pull-request-types'
import type { PRSnapshotReply } from '../../shared/github/pull-requests/refresh/pull-request-refresh-types'
import type {
  RuntimeWorktreeListResult,
  RuntimeWorktreePsResult
} from '../../shared/worktree/catalog/runtime-worktree-contracts'
import {
  reconcileTicketItem,
  type TicketItemObservation
} from '../../shared/ticket-pipeline/ticket-item-reconcile'
import { isCloudTicket, type TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'
import { cleanWorkspaces } from './workspace-clean'
import { getMergeQueue } from './merge-queue'
import { resolveTicketSource } from './sources/ticket-source-resolution'
import { foundPR } from './ticket-pr-lookup'
import { adoptCloudTicketPRs } from './ticket-cloud-adoption'

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
  ): Promise<PRSnapshotReply>
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

// How long a closed ticket stays watched for a new PR on its branch.
const CLOSED_WATCH_MS = 7 * 24 * 60 * 60 * 1000

/** Followed each tick: still in progress, or closed recently enough that a new PR may reopen it. */
function isActive(item: TicketItem, now: number): boolean {
  if (item.stage === 'closed') {
    return now - item.updatedAt < CLOSED_WATCH_MS
  }
  return item.stage !== 'merged' && item.stage !== 'cleaned'
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
  // A PR the queue just merged can stay cached as open, which would hold the queue on it.
  const queueMerged = item.queue?.status === 'merging'
  // A closed PR may have been replaced: look the branch up afresh, where an open PR wins.
  const closed = cached?.state === 'closed' || item.stage === 'closed'
  if (cached?.url && isPRState(cached.state) && !queueMerged && !closed) {
    return { number: cached.number, url: cached.url, state: cached.state }
  }
  // The branch lookup shares the PR refresh budget; it only runs until the PR is linked and cached.
  const pr = foundPR(
    await runtime
      .getRepoPRForBranch(
        `id:${item.repoId}`,
        item.branch,
        closed ? null : item.reviewNumber,
        null,
        true,
        null,
        'watch'
      )
      .catch(() => null)
  )
  return pr ? { number: pr.number, url: pr.url, state: pr.state } : null
}

/** Follows each launched ticket to its PR and merge, keeping the item and the workspace board in step. */
export class TicketTracker {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<void> | null = null
  private checkedAt: number | null = null

  constructor(
    private readonly runtime: TicketTrackerRuntime,
    /** Removes a merged item's workspace if the clean-up survey clears it; absent disables auto-clean. */
    private readonly autoClean?: (item: TicketItem) => Promise<void>,
    /** Moves the head of each merge queue one step; absent disables the queue. */
    private readonly advanceQueues?: () => Promise<void>,
    /** Finishes the ticket in its tracker once its PR merged, where merging alone does not. */
    private readonly completeTicket?: (item: TicketItem) => Promise<void>,
    /** Takes PRs Claude cloud sessions opened into the queue; absent disables it. */
    private readonly adoptCloudPRs?: () => Promise<number>,
    private readonly store: TicketItemStore = getTicketItemStore()
  ) {}

  /** Merged items whose project cleans up automatically stay in the loop until their workspace goes. */
  private async awaitingAutoClean(items: readonly TicketItem[]): Promise<TicketItem[]> {
    if (!this.autoClean) {
      return []
    }
    const waiting: TicketItem[] = []
    // A cloud ticket has no workspace to clean.
    for (const item of items.filter((i) => i.stage === 'merged' && !isCloudTicket(i))) {
      if ((await this.store.getSettings(item.repoId)).autoClean) {
        waiting.push(item)
      }
    }
    return waiting
  }

  /** When the last pass finished, and whether another is scheduled or running. */
  status(): { checkedAt: number | null; watching: boolean } {
    return { checkedAt: this.checkedAt, watching: this.timer !== null || this.running !== null }
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
          this.checkedAt = Date.now()
          if (keepGoing) {
            this.schedule(TICK_MS)
          }
        })
    }, delay)
  }

  /** One pass over the active items; false when none are left, so the timer stops until the next launch. */
  async tick(): Promise<boolean> {
    // A cloud session's PR can appear at any time, so a project that adopts them keeps the loop on.
    const adopting = this.adoptCloudPRs
      ? (await this.store.reposAdoptingCloudPRs()).length > 0
      : false
    if (adopting) {
      await this.adoptCloudPRs?.()
    }
    const items = await this.store.list()
    const now = Date.now()
    const active = items.filter((item) => isActive(item, now))
    const cleanable = await this.awaitingAutoClean(items)
    if (active.length === 0 && cleanable.length === 0) {
      return adopting
    }
    const [ps, listed] = await Promise.all([
      this.runtime.getWorktreePs(SCAN_LIMIT),
      this.runtime.listManagedWorktrees(undefined, SCAN_LIMIT)
    ])
    const existing = new Set(listed.worktrees.map((w) => w.id))
    const summaries = new Map(ps.worktrees.map((w) => [w.worktreeId, w]))
    // A closed ticket can only reopen while its workspace is still there to push from.
    // A cloud ticket has no workspace: its PR alone says where it stands, and it can always reopen.
    const hasWorkspace = (item: TicketItem): boolean =>
      isCloudTicket(item) || existing.has(item.childWorktreeId)
    const followed = active.filter((item) => item.stage !== 'closed' || hasWorkspace(item))
    for (const item of followed) {
      const summary = isCloudTicket(item) ? undefined : summaries.get(item.childWorktreeId)
      const observed: TicketItemObservation = {
        workspaceExists: hasWorkspace(item),
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
      const onBoard = observed.workspaceExists && !isCloudTicket(item)
      if (onBoard && (boardStatus || update.reviewNumber !== item.reviewNumber)) {
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
    return followed.length > 0 || cleanable.length > 0 || adopting
  }
}

let tracker: TicketTracker | null = null

export function ticketTrackerStatus(): { checkedAt: number | null; watching: boolean } {
  return tracker?.status() ?? { checkedAt: null, watching: false }
}

export function startTicketTracker(runtime: OrcaRuntimeService): void {
  tracker ??= new TicketTracker(
    runtime,
    async (item) => {
      const held = await cleanWorkspaces({ runtime }, { worktree: `id:${item.parentWorktreeId}` }, [
        item.childWorktreeId
      ]).then(
        ({ outcomes }) => outcomes.find((o) => o.status === 'kept')?.reason ?? null,
        (error: unknown) => (error instanceof Error ? error.message : String(error))
      )
      if (held) {
        await getTicketItemStore().update(item.id, {
          autoCleanHeld: { reason: held, at: Date.now() }
        })
      }
    },
    () => getMergeQueue(runtime).advanceAll(),
    async (item) => {
      const { source } = await resolveTicketSource(await runtime.showRepo(`id:${item.repoId}`))
      // The project may have switched trackers since launch; never write to the wrong one.
      if (source.kind === item.source) {
        await source.complete(item.ticketId)
      }
    },
    () => adoptCloudTicketPRs(runtime)
  )
  tracker.start()
}
