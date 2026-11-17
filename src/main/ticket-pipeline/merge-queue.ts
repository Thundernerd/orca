import type { GitHubRepositoryIdentity } from '../../shared/github/repositories/repository-identity'
import { renderMergeQueueFixBrief } from '../../shared/ticket-pipeline/merge-queue-fix-brief'
import {
  ENQUEUE_WAIT_LIMIT_MS,
  decideMergeQueueStep,
  type MergeQueueAction
} from '../../shared/ticket-pipeline/merge-queue-step'
import type { TicketItem, TicketQueueState } from '../../shared/ticket-pipeline/ticket-types'
import {
  getPRBlocker,
  getPRMergeQueueState,
  prRepoFromUrl,
  updatePRBranch
} from '../github/pull-requests/pr-merge-queue-github'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'
import { queueOrder } from './merge-queue-order'
import { observeQueueHead, type QueueHeadContext } from './merge-queue-observation'
import { sendTicketAgentFixBrief } from './ticket-agent-reach'

const MAX_ERROR_STREAK = 3
const REQUIRED_CHECKS_PENDING =
  /status checks? (have|has) not succeeded|status checks? (is|are) expected/i

function withoutAwaitedFix(state: TicketQueueState): TicketQueueState {
  return {
    ...state,
    awaitingPushFrom: undefined,
    awaitingPushSince: undefined,
    awaitingCause: undefined
  }
}

export class MergeQueue {
  constructor(
    private readonly runtime: OrcaRuntimeService,
    private readonly store: TicketItemStore = getTicketItemStore()
  ) {}

  /** One step for the head of every unpaused queue, and for every PR behind it where GitHub's
   *  merge queue tests each on top of those ahead, so none waits for the one before to merge. */
  async advanceAll(): Promise<void> {
    const items = await this.store.list()
    const parents = new Set(
      items.filter((i) => i.stage === 'in-review').map((i) => i.parentWorktreeId)
    )
    for (const parent of parents) {
      if (await this.store.getQueuePause(parent)) {
        continue
      }
      const [head, ...rest] = queueOrder(items, parent)
      if (!head) {
        continue
      }
      const viaGitHubQueue = await this.advance(head).catch(async (error: unknown) => {
        await this.recordError(head.id, error)
        return head.queue?.viaGitHubQueue === true
      })
      for (const item of rest) {
        if (viaGitHubQueue) {
          await this.advance(item).catch((error: unknown) => this.recordError(item.id, error))
        } else if (item.queue) {
          // Left from when the base merged through GitHub's queue: only the head carries state.
          await this.store.update(item.id, { queue: undefined })
        }
      }
    }
  }

  /** Retries on the next ticks; only an error that keeps coming back pauses the queue. */
  private async recordError(itemId: string, error: unknown): Promise<void> {
    const item = (await this.store.list()).find((i) => i.id === itemId)
    if (!item) {
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    const queue = item.queue ?? { status: 'waiting-ci', detail: '', fixAttempts: {} }
    const errorStreak = (queue.errorStreak ?? 0) + 1
    if (errorStreak >= MAX_ERROR_STREAK) {
      await this.pause(
        { ...item, queue: { ...queue, errorStreak } },
        `The merge queue hit an error ${errorStreak} times in a row: ${message}`
      )
      return
    }
    await this.setQueue(item, {
      ...queue,
      errorStreak,
      detail: `GitHub returned an error; retrying on the next check. (${message})`
    })
  }

  private async setQueue(item: TicketItem, queue: TicketQueueState): Promise<void> {
    const statusSince =
      item.queue?.status === queue.status ? (item.queue.statusSince ?? Date.now()) : Date.now()
    await this.store.update(item.id, { queue: { ...queue, statusSince } })
  }

  private async pause(item: TicketItem, detail: string): Promise<void> {
    await this.store.setQueuePause(item.parentWorktreeId, `${item.ticketId}: ${detail}`)
    await this.setQueue(item, { ...(item.queue ?? { fixAttempts: {} }), status: 'paused', detail })
    // The user decides what happens next; make the workspace ask for attention.
    await this.runtime
      .updateManagedWorktreeMeta(`id:${item.childWorktreeId}`, {
        isUnread: true,
        comment: `merge queue paused: ${detail}`
      })
      .catch(() => undefined)
  }

  /** One step for one PR; true when its base merges through GitHub's merge queue. */
  private async advance(item: TicketItem): Promise<boolean> {
    const context = await observeQueueHead(this.runtime, item)
    if (!context) {
      await this.setQueue(item, {
        ...(item.queue ?? { fixAttempts: {} }),
        status: 'waiting-ci',
        detail: 'Reading the PR from GitHub.',
        errorStreak: undefined
      })
      return item.queue?.viaGitHubQueue === true
    }
    const { pr, prRepo, repoPath, observed } = context
    let action = decideMergeQueueStep(item.queue, observed)
    if (action.kind === 'ready') {
      // Only worth asking GitHub once everything else is green.
      const viaQueue = observed.githubQueue !== null
      const blocker = await getPRBlocker(repoPath, prRepo, pr.number, viaQueue)
      action = decideMergeQueueStep(item.queue, { ...observed, mergeBlocker: blocker })
    }
    await this.apply(item, action, context)
    return observed.githubQueue !== null
  }

  private async apply(
    item: TicketItem,
    action: MergeQueueAction,
    context: QueueHeadContext
  ): Promise<void> {
    // Reaching a step means GitHub answered, so the error streak is over.
    const stored: TicketQueueState = {
      ...(item.queue ?? { status: 'waiting-ci', detail: '', fixAttempts: {} }),
      errorStreak: undefined,
      viaGitHubQueue: context.observed.githubQueue !== null
    }
    // Still waiting on a fix keeps the awaited head; any other step means the fix landed.
    const stillFixing = action.kind === 'wait' && action.status === 'fixing'
    const previous: TicketQueueState = stillFixing ? stored : withoutAwaitedFix(stored)
    const { pr, prRepo, observed } = context
    switch (action.kind) {
      case 'done':
        return
      case 'wait':
        await this.setQueue(item, { ...previous, status: action.status, detail: action.detail })
        return
      case 'pause':
        await this.pause(item, action.detail)
        return
      case 'requeue':
        await this.enqueue(item, prRepo, pr.number, previous, observed.headSha, action.detail, true)
        return
      case 'update-branch':
        await updatePRBranch(context.repoPath, prRepo, pr.number, observed.headSha)
        await this.setQueue(item, { ...previous, status: 'updating-branch', detail: action.detail })
        return
      case 'rerun-failed': {
        const rerun = await this.runtime.rerunRepoPRChecks(`id:${item.repoId}`, pr.number, {
          headSha: observed.headSha,
          failedOnly: true,
          prRepo
        })
        if (!rerun.ok) {
          await this.pause(item, `Could not rerun the failed check: ${rerun.error}`)
          return
        }
        await this.setQueue(item, {
          ...previous,
          status: 'rerunning',
          detail: action.detail,
          rerunHead: observed.headSha
        })
        return
      }
      case 'send-fix': {
        const brief = renderMergeQueueFixBrief({
          cause: action.cause,
          prNumber: pr.number,
          baseBranch: context.baseBranch,
          detail: action.detail,
          failingChecks: context.checks
            .filter((c) => action.failing.includes(c.name))
            .map((c) => ({ name: c.name, url: c.url })),
          attributionLines: observed.attributionHits
        })
        const sent = context.agent
          ? await sendTicketAgentFixBrief(this.runtime, item, context.agent, brief)
          : false
        if (!sent) {
          await this.pause(item, `The agent did not take the fix brief. ${action.detail}`)
          return
        }
        await this.setQueue(item, {
          ...previous,
          status: 'fixing',
          detail: `Asked the agent to fix it. ${action.detail}`,
          fixAttempts: {
            ...previous.fixAttempts,
            [action.cause]: (previous.fixAttempts[action.cause] ?? 0) + 1
          },
          awaitingPushFrom: observed.headSha,
          awaitingPushSince: observed.now,
          awaitingCause: action.cause
        })
        return
      }
      case 'ready': {
        const { autoMerge } = await this.store.getSettings(item.repoId)
        if (autoMerge) {
          await this.merge(item, prRepo)
          return
        }
        await this.setQueue(item, { ...previous, status: 'ready', detail: action.detail })
      }
    }
  }

  private async enqueue(
    item: TicketItem,
    prRepo: GitHubRepositoryIdentity,
    prNumber: number,
    previous: TicketQueueState,
    headSha: string,
    detail: string,
    requeued: boolean
  ): Promise<void> {
    // Enqueues directly, or through auto-merge where the repo allows it; GitHub picks the merge method.
    const result = await this.runtime.setRepoPRAutoMerge(
      `id:${item.repoId}`,
      prNumber,
      true,
      'merge',
      prRepo
    )
    if (!result.ok) {
      // A fresh push can read as green before GitHub registers its checks; GitHub then refuses.
      const refusedSince = previous.checksRefusedSince ?? Date.now()
      if (
        REQUIRED_CHECKS_PENDING.test(result.error) &&
        Date.now() - refusedSince <= ENQUEUE_WAIT_LIMIT_MS
      ) {
        await this.setQueue(item, {
          ...previous,
          status: 'waiting-ci',
          detail: 'Waiting for GitHub to see the required checks pass.',
          checksRefusedSince: refusedSince
        })
        return
      }
      await this.pause(item, `GitHub would not add the PR to its merge queue: ${result.error}`)
      return
    }
    await this.setQueue(item, {
      ...previous,
      status: 'merging',
      detail,
      enqueued: { head: headSha, at: Date.now(), requeued },
      checksRefusedSince: undefined
    })
  }

  /** Merges the queue head with a merge commit, or hands it to GitHub's merge queue where the base
   *  requires one; the tracker then sees it merged and moves on. */
  async merge(
    item: TicketItem,
    prRepo = item.reviewUrl ? prRepoFromUrl(item.reviewUrl) : null
  ): Promise<void> {
    if (!item.reviewNumber) {
      throw new Error(`${item.ticketId} has no PR to merge.`)
    }
    if (prRepo) {
      const repo = await this.runtime.showRepo(`id:${item.repoId}`)
      const github = await getPRMergeQueueState(repo.path, prRepo, item.reviewNumber)
      if (github.enabled) {
        if (!github.headSha) {
          throw new Error(`Could not read the head of ${item.ticketId}'s PR.`)
        }
        const previous = item.queue ?? { status: 'waiting-ci', detail: '', fixAttempts: {} }
        await this.enqueue(
          item,
          prRepo,
          item.reviewNumber,
          previous,
          github.headSha,
          "Added to GitHub's merge queue.",
          false
        )
        return
      }
    }
    const result = await this.runtime.mergeRepoPR(
      `id:${item.repoId}`,
      item.reviewNumber,
      'merge',
      prRepo
    )
    if (!result.ok) {
      await this.pause(item, `GitHub refused the merge: ${result.error}`)
      return
    }
    await this.setQueue(item, {
      ...(item.queue ?? { fixAttempts: {} }),
      status: 'merging',
      detail: 'Merged; waiting for GitHub to confirm.'
    })
  }
}

let queue: MergeQueue | null = null

export function getMergeQueue(runtime: OrcaRuntimeService): MergeQueue {
  queue ??= new MergeQueue(runtime)
  return queue
}
