import { randomUUID } from 'node:crypto'
import { getRepoRoutingConnectionId } from '../../shared/execution-host/execution-host'
import { isFolderRepo } from '../../shared/repository/repo-kind'
import { CONVENTIONAL_TYPES, type TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import {
  listOpenCloudSessionPRs,
  readIssueSummary,
  removeCloudSessionFooter
} from '../github/pull-requests/cloud-session-prs'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'
import { resolveTicketParentSelector } from './ticket-parent-workspace'

// `fix/gh-314-keep-…`: the branch a ticket brief names, so the issue number is in it.
const TICKET_BRANCH = new RegExp(`^(?:${CONVENTIONAL_TYPES.join('|')})/gh-(\\d+)(?:-|$)`)

/** Takes PRs Claude cloud sessions opened on ticket branches into the merge queue of their
 *  project's main workspace, for every project that adopts them on this host. */
export async function adoptCloudTicketPRs(
  runtime: OrcaRuntimeService,
  store: TicketItemStore = getTicketItemStore()
): Promise<number> {
  let adopted = 0
  for (const repoId of await store.reposAdoptingCloudPRs()) {
    adopted += await adoptForRepo(runtime, store, repoId).catch((error: unknown) => {
      console.warn('[tickets] could not adopt cloud-session PRs', error)
      return 0
    })
  }
  return adopted
}

async function adoptForRepo(
  runtime: OrcaRuntimeService,
  store: TicketItemStore,
  repoId: string
): Promise<number> {
  const repo = await runtime.showRepo(`id:${repoId}`)
  // GitHub issues on a git project this host serves: the only tickets a cloud session works.
  if (isFolderRepo(repo) || getRepoRoutingConnectionId(repo)) {
    return 0
  }
  const { ownerRepo, prs } = await listOpenCloudSessionPRs(repo.path)
  const tracked = new Set(
    (await store.list()).filter((i) => i.repoId === repoId).map((i) => i.branch)
  )
  const fresh = prs.flatMap((pr) => {
    const issueNumber = Number(TICKET_BRANCH.exec(pr.branch)?.[1] ?? Number.NaN)
    return Number.isNaN(issueNumber) || tracked.has(pr.branch) ? [] : [{ pr, issueNumber }]
  })
  if (fresh.length === 0) {
    return 0
  }
  const parentSelector = await resolveTicketParentSelector(runtime, { repo: `id:${repoId}` })
  const parentWorktreeId = parentSelector.replace(/^id:/, '')
  for (const { pr, issueNumber } of fresh) {
    const issue = await readIssueSummary(repo.path, ownerRepo, issueNumber)
    await removeCloudSessionFooter(repo.path, ownerRepo, pr)
    const now = Date.now()
    const item: TicketItem = {
      id: randomUUID(),
      repoId,
      parentWorktreeId,
      childWorktreeId: '',
      source: 'github-issues',
      ticketId: `#${issueNumber}`,
      ticketTitle: issue.title,
      ticketUrl: issue.url,
      issueNumber,
      branch: pr.branch,
      stage: 'in-review',
      reviewNumber: pr.number,
      reviewUrl: pr.url,
      agentCloudSessionId: pr.sessionId,
      createdAt: now,
      updatedAt: now
    }
    await store.put(item)
  }
  return fresh.length
}
