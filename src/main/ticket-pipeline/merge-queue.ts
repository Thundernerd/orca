import { randomUUID } from 'node:crypto'
import type { PRCheckDetail } from '../../shared/github/check-types'
import type { PRInfo } from '../../shared/github/pull-request-types'
import { renderMergeQueueFixBrief } from '../../shared/ticket-pipeline/merge-queue-fix-brief'
import {
  decideMergeQueueStep,
  findAttribution,
  type MergeQueueAction,
  type MergeQueueObservation
} from '../../shared/ticket-pipeline/merge-queue-step'
import type { TicketItem, TicketQueueState } from '../../shared/ticket-pipeline/ticket-types'
import {
  getPRBlocker,
  getPRTexts,
  isPRBehindBase,
  prRepoFromUrl,
  updatePRBranch
} from '../github/pr-merge-queue-github'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'
import { queueOrder } from './merge-queue-order'

function withoutAwaitedFix(state: TicketQueueState): TicketQueueState {
  return {
    ...state,
    awaitingPushFrom: undefined,
    awaitingPushSince: undefined,
    awaitingCause: undefined
  }
}

async function findAgentTerminal(
  runtime: OrcaRuntimeService,
  item: TicketItem
): Promise<string | null> {
  const listed = await runtime
    .listTerminals(`id:${item.childWorktreeId}`, undefined, { includeVisualLayouts: false })
    .catch(() => null)
  const terminals = listed?.terminals ?? []
  const launched = terminals.find((t) => t.handle === item.agentTerminalHandle)
  return (launched ?? terminals.find((t) => t.agentIdentity))?.handle ?? null
}

async function readPR(runtime: OrcaRuntimeService, item: TicketItem): Promise<PRInfo | null> {
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
  return outcome?.kind === 'found' ? outcome.pr : null
}

export class MergeQueue {
  constructor(
    private readonly runtime: OrcaRuntimeService,
    private readonly store: TicketItemStore = getTicketItemStore()
  ) {}

  /** One step for the head of every unpaused queue. */
  async advanceAll(): Promise<void> {
    const items = await this.store.list()
    const parents = new Set(
      items.filter((i) => i.stage === 'in-review').map((i) => i.parentWorktreeId)
    )
    for (const parent of parents) {
      if (await this.store.getQueuePause(parent)) {
        continue
      }
      const head = queueOrder(items, parent)[0]
      if (head) {
        await this.advance(head).catch((error: unknown) =>
          this.pause(
            head,
            `The merge queue hit an error: ${error instanceof Error ? error.message : String(error)}`
          )
        )
      }
    }
  }

  private async setQueue(item: TicketItem, queue: TicketQueueState): Promise<void> {
    await this.store.update(item.id, { queue })
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

  private async advance(item: TicketItem): Promise<void> {
    const pr = await readPR(this.runtime, item)
    const prRepo = pr ? prRepoFromUrl(pr.url) : null
    if (!pr || !prRepo || !pr.headSha) {
      await this.setQueue(item, {
        ...(item.queue ?? { fixAttempts: {} }),
        status: 'waiting-ci',
        detail: 'Reading the PR from GitHub.'
      })
      return
    }
    const repo = await this.runtime.showRepo(`id:${item.repoId}`)
    const baseBranch = pr.baseRefName ?? 'main'
    const [checks, texts, behindBase, terminal] = await Promise.all([
      this.runtime.getRepoPRChecks(`id:${item.repoId}`, pr.number, pr.headSha, prRepo, {
        noCache: true
      }),
      getPRTexts(repo.path, prRepo, pr.number),
      isPRBehindBase(repo.path, prRepo, baseBranch, pr.headSha),
      findAgentTerminal(this.runtime, item)
    ])
    const observed: MergeQueueObservation = {
      headSha: pr.headSha,
      state: pr.state,
      mergeable: pr.mergeable,
      behindBase,
      checks,
      attributionHits: findAttribution(texts),
      mergeBlocker: null,
      agentReachable: terminal !== null,
      now: Date.now()
    }
    let action = decideMergeQueueStep(item.queue, observed)
    if (action.kind === 'ready') {
      // Only worth asking GitHub once everything else is green.
      const blocker = await getPRBlocker(repo.path, prRepo, pr.number)
      action = decideMergeQueueStep(item.queue, { ...observed, mergeBlocker: blocker })
    }
    await this.apply(item, action, {
      pr,
      prRepo,
      repoPath: repo.path,
      baseBranch,
      terminal,
      checks,
      observed
    })
  }

  private async apply(
    item: TicketItem,
    action: MergeQueueAction,
    context: {
      pr: PRInfo
      prRepo: NonNullable<ReturnType<typeof prRepoFromUrl>>
      repoPath: string
      baseBranch: string
      terminal: string | null
      checks: readonly PRCheckDetail[]
      observed: MergeQueueObservation
    }
  ): Promise<void> {
    const stored: TicketQueueState = item.queue ?? {
      status: 'waiting-ci',
      detail: '',
      fixAttempts: {}
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
        const sent = context.terminal
          ? await this.runtime.sendTerminalAgentPrompt(context.terminal, brief, {
              inputKind: 'orchestration',
              acceptQueued: true,
              observationTimeoutMs: 0,
              requestId: randomUUID()
            })
          : null
        if (!sent?.accepted) {
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

  /** Merges the queue head with a merge commit; the tracker then sees it merged and moves on. */
  async merge(
    item: TicketItem,
    prRepo = item.reviewUrl ? prRepoFromUrl(item.reviewUrl) : null
  ): Promise<void> {
    if (!item.reviewNumber) {
      throw new Error(`${item.ticketId} has no PR to merge.`)
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
