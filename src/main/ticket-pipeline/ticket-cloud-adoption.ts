import { randomUUID } from 'node:crypto'
import { getRepoRoutingConnectionId } from '../../shared/execution-host/execution-host'
import { isFolderRepo } from '../../shared/repository/repo-kind'
import {
  CONVENTIONAL_TYPES,
  isCloudTicket,
  type TicketItem
} from '../../shared/ticket-pipeline/ticket-types'
import type { GitHubRepositoryIdentity } from '../../shared/github/repositories/repository-identity'
import {
  claimCloudSessionPR,
  listOpenRepoPRs,
  readFirstRevisionSessionId,
  readIssue,
  readPRBody,
  type CloudSessionPR,
  type OpenRepoPR
} from '../github/pull-requests/cloud-session-prs'
import type { CloudSessionTag } from '../../shared/ticket-pipeline/cloud-session-marker'
import { cloudSessionBodyText } from '../../shared/ticket-pipeline/cloud-session-marker'
import { loadOrCreateHostInstallationId } from '../runtime/hosts/platform-probe/host-descriptor'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { parsePRFindings } from '../../shared/ticket-pipeline/ticket-pr-findings'
import { startFindingCheck, TICKET_PIPELINE_CALLER } from './ticket-finding-check'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'
import { resolveTicketParentSelector } from './ticket-parent-workspace'
import { recordLaunchedCloudSessions } from './ticket-cloud-launch-session'

// `fix/gh-314-keep-…`: the branch a ticket brief names, so the issue number is in it.
const TICKET_BRANCH = new RegExp(`^(?:${CONVENTIONAL_TYPES.join('|')})/gh-(\\d+)(?:-|$)`)

// Ticket-branch PRs whose first revision named no session, such as one a person opened: asking
// GitHub's edit history once per PR is enough.
const notCloudPRs = new Set<string>()

/** The session a ticket-branch PR's body names now, else the one this host launched for its
 *  issue, else the one its body named when opened. */
async function cloudSessionOf(
  store: TicketItemStore,
  repo: { id: string; path: string },
  ownerRepo: GitHubRepositoryIdentity,
  pr: OpenRepoPR,
  issueNumber: number
): Promise<CloudSessionTag | null> {
  if (pr.tag) {
    return pr.tag
  }
  const launched = await store.cloudLaunchSession(repo.id, issueNumber)
  if (launched) {
    return { sessionId: launched, host: null }
  }
  const key = `${ownerRepo.owner}/${ownerRepo.repo}#${pr.number}`
  if (notCloudPRs.has(key)) {
    return null
  }
  const sessionId = await readFirstRevisionSessionId(repo.path, ownerRepo, pr.number)
  if (!sessionId) {
    notCloudPRs.add(key)
    return null
  }
  return { sessionId, host: null }
}

/** Takes PRs Claude cloud sessions opened on ticket branches into the merge queue of their
 *  project's main workspace, for every project that adopts them on this host, and checks the
 *  findings each PR lists in one session. A PR another host claimed stays with that host. */
export async function adoptCloudTicketPRs(
  runtime: OrcaRuntimeService,
  store: TicketItemStore = getTicketItemStore()
): Promise<number> {
  const repoIds = await store.reposAdoptingCloudPRs()
  if (repoIds.length === 0) {
    return 0
  }
  // Stable across restarts, unlike the runtime id, so a claim outlives this process.
  const host = await loadOrCreateHostInstallationId(getCanonicalUserDataPath())
  let adopted = 0
  for (const repoId of repoIds) {
    adopted += await adoptForRepo(runtime, store, repoId, host).catch((error: unknown) => {
      console.warn('[tickets] could not adopt cloud-session PRs', error)
      return 0
    })
  }
  return adopted
}

async function adoptForRepo(
  runtime: OrcaRuntimeService,
  store: TicketItemStore,
  repoId: string,
  host: string
): Promise<number> {
  const repo = await runtime.showRepo(`id:${repoId}`)
  // GitHub issues on a git project this host serves: the only tickets a cloud session works.
  if (isFolderRepo(repo) || getRepoRoutingConnectionId(repo)) {
    return 0
  }
  const { ownerRepo, prs: open } = await listOpenRepoPRs(repo.path)
  const parentSelector = await resolveTicketParentSelector(runtime, { repo: `id:${repoId}` })
  await recordLaunchedCloudSessions(runtime, store, repoId, parentSelector).catch(
    (error: unknown) => console.warn('[tickets] could not read cloud launch terminals', error)
  )
  const byBranch = new Map(
    (await store.list()).filter((i) => i.repoId === repoId).map((i) => [i.branch, i])
  )
  const fresh: { pr: CloudSessionPR; issueNumber: number; earlier: TicketItem | null }[] = []
  for (const pr of open) {
    const issueNumber = Number(TICKET_BRANCH.exec(pr.branch)?.[1] ?? Number.NaN)
    const earlier = byBranch.get(pr.branch) ?? null
    // A local launch of the same ticket whose workspace went is closed and followed no more, so
    // the cloud session's PR on its branch takes that record over instead of being skipped.
    const takesOver = earlier !== null && earlier.stage === 'closed' && !isCloudTicket(earlier)
    if (Number.isNaN(issueNumber) || (earlier !== null && !takesOver)) {
      continue
    }
    const tag = await cloudSessionOf(
      store,
      { id: repoId, path: repo.path },
      ownerRepo,
      pr,
      issueNumber
    )
    // A PR another host claimed stays with that host.
    if (tag && (tag.host === null || tag.host === host)) {
      fresh.push({ pr: { ...pr, ...tag }, issueNumber, earlier })
    }
  }
  const parentWorktreeId = parentSelector.replace(/^id:/, '')
  for (const { pr, issueNumber, earlier } of fresh) {
    // Two hosts can claim one PR at once; only the one its body names afterwards keeps it.
    if ((await claimCloudSessionPR(repo.path, ownerRepo, pr, host)) !== host) {
      continue
    }
    await store.forgetCloudLaunch(repoId, issueNumber)
    if (earlier) {
      await store.update(earlier.id, {
        parentWorktreeId,
        childWorktreeId: '',
        stage: 'in-review',
        reviewNumber: pr.number,
        reviewUrl: pr.url,
        agentCloudSessionId: pr.sessionId,
        agentTerminalHandle: undefined,
        agentSessionId: undefined,
        queue: undefined,
        cloudFindingsChecked: undefined
      })
      continue
    }
    const issue = await readIssue(repo.path, issueNumber, ownerRepo)
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
      const findings = parsePRFindings(cloudSessionBodyText(body))
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
