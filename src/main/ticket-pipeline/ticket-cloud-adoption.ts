import { randomUUID } from 'node:crypto'
import { getRepoRoutingConnectionId } from '../../shared/execution-host/execution-host'
import { isFolderRepo } from '../../shared/repository/repo-kind'
import { CONVENTIONAL_TYPES, type TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import type { GitHubRepositoryIdentity } from '../../shared/github/repositories/repository-identity'
import {
  listOpenCloudSessionPRs,
  readIssue,
  readPRBody,
  removeCloudSessionFooter,
  withoutCloudSessionFooter
} from '../github/pull-requests/cloud-session-prs'
import { parsePRFindings } from '../../shared/ticket-pipeline/ticket-pr-findings'
import { startFindingCheck, TICKET_PIPELINE_CALLER } from './ticket-finding-check'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'
import { resolveTicketParentSelector } from './ticket-parent-workspace'

// `fix/gh-314-keep-…`: the branch a ticket brief names, so the issue number is in it.
const TICKET_BRANCH = new RegExp(`^(?:${CONVENTIONAL_TYPES.join('|')})/gh-(\\d+)(?:-|$)`)

/** Takes PRs Claude cloud sessions opened on ticket branches into the merge queue of their
 *  project's main workspace, for every project that adopts them on this host, and checks the
 *  findings each PR lists in one session. */
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
  const parentSelector = await resolveTicketParentSelector(runtime, { repo: `id:${repoId}` })
  const parentWorktreeId = parentSelector.replace(/^id:/, '')
  for (const { pr, issueNumber } of fresh) {
    const issue = await readIssue(repo.path, issueNumber, ownerRepo)
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
  await checkCloudFindings(runtime, store, {
    repoId,
    repoPath: repo.path,
    ownerRepo,
    parentSelector
  })
  return fresh.length
}

/** A cloud session has no Corka CLI to hand findings over with, so it lists them in its PR: each
 *  cloud ticket's are checked in one session, retried each tick until that session starts. */
async function checkCloudFindings(
  runtime: OrcaRuntimeService,
  store: TicketItemStore,
  where: {
    repoId: string
    repoPath: string
    ownerRepo: GitHubRepositoryIdentity
    parentSelector: string
  }
): Promise<void> {
  const unchecked = (await store.list()).filter(
    (i) =>
      i.repoId === where.repoId &&
      i.agentCloudSessionId &&
      !i.cloudFindingsChecked &&
      i.reviewNumber
  )
  for (const item of unchecked) {
    try {
      const body = await readPRBody(where.repoPath, where.ownerRepo, item.reviewNumber ?? 0)
      const findings = parsePRFindings(withoutCloudSessionFooter(body))
      if (findings.length > 0) {
        await startFindingCheck({ runtime, caller: TICKET_PIPELINE_CALLER }, where.parentSelector, {
          findingOf: item.ticketId,
          findings
        })
      }
      await store.update(item.id, { cloudFindingsChecked: true })
    } catch (error) {
      console.warn(`[tickets] could not start the finding check for ${item.ticketId}`, error)
    }
  }
}
