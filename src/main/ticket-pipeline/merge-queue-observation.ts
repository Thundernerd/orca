import type { PRCheckDetail } from '../../shared/github/checks/check-types'
import type { PRInfo } from '../../shared/github/pull-requests/pull-request-types'
import type { GitHubRepositoryIdentity } from '../../shared/github/repositories/repository-identity'
import {
  findAttribution,
  type MergeQueueObservation
} from '../../shared/ticket-pipeline/merge-queue-step'
import type { TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import {
  getPRMergeQueueState,
  getPRTexts,
  isPRBehindBase,
  prRepoFromUrl
} from '../github/pull-requests/pr-merge-queue-github'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { findTicketAgent, type TicketAgentReach } from './ticket-agent-reach'
import { foundPR } from './ticket-pr-lookup'

/** What the queue read about its head, and what acting on it needs. */
export type QueueHeadContext = {
  pr: PRInfo
  prRepo: GitHubRepositoryIdentity
  repoPath: string
  baseBranch: string
  agent: TicketAgentReach | null
  checks: readonly PRCheckDetail[]
  observed: MergeQueueObservation
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
  return foundPR(outcome)
}

/** Reads the head's PR, checks, text, agent and merge queue from GitHub; null until the PR is readable. */
export async function observeQueueHead(
  runtime: OrcaRuntimeService,
  item: TicketItem
): Promise<QueueHeadContext | null> {
  const pr = await readPR(runtime, item)
  const prRepo = pr ? prRepoFromUrl(pr.url) : null
  if (!pr || !prRepo || !pr.headSha) {
    return null
  }
  const repo = await runtime.showRepo(`id:${item.repoId}`)
  const baseBranch = pr.baseRefName ?? 'main'
  const [checks, texts, behindBase, agent, github] = await Promise.all([
    runtime.getRepoPRChecks(`id:${item.repoId}`, pr.number, pr.headSha, prRepo, {
      noCache: true
    }),
    getPRTexts(repo.path, prRepo, pr.number),
    isPRBehindBase(repo.path, prRepo, baseBranch, pr.headSha),
    findTicketAgent(runtime, item),
    getPRMergeQueueState(repo.path, prRepo, pr.number)
  ])
  return {
    pr,
    prRepo,
    repoPath: repo.path,
    baseBranch,
    agent,
    checks,
    observed: {
      headSha: pr.headSha,
      state: pr.state,
      mergeable: pr.mergeable,
      behindBase,
      checks,
      attributionHits: findAttribution(texts),
      mergeBlocker: null,
      agentReachable: agent !== null,
      githubQueue: github.enabled ? { inQueue: github.inQueue, removed: github.removed } : null,
      now: Date.now()
    }
  }
}
