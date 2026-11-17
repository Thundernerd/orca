import {
  conventionalTypeForTicket,
  ticketBranchName
} from '../../shared/ticket-pipeline/ticket-branch-name'
import {
  renderCloudTicketBrief,
  type CloudTicketBrief
} from '../../shared/ticket-pipeline/ticket-cloud-brief'
import type { ConventionalType } from '../../shared/ticket-pipeline/ticket-types'
import { readIssue } from '../github/pull-requests/cloud-session-prs'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { findAgentDocs } from './ticket-launch'
import { resolveTicketParentSelector, type TicketParentScope } from './ticket-parent-workspace'
import { surveyTicketsWithSource } from './ticket-survey'

/** The brief to start a Claude cloud session on one GitHub issue with, claiming it on request so
 *  no host launches it too. Corka adopts the PR the session opens. */
export async function cloudTicketBrief(
  runtime: OrcaRuntimeService,
  scope: TicketParentScope,
  request: { ticket: string; type?: ConventionalType; claim?: boolean }
): Promise<CloudTicketBrief> {
  const parent = await runtime.showManagedWorktree(
    await resolveTicketParentSelector(runtime, scope)
  )
  const { result, source, repo } = await surveyTicketsWithSource(runtime, {
    worktree: `id:${parent.id}`
  })
  if (source.kind !== 'github-issues') {
    throw new Error('Cloud sessions take GitHub issues; this project reads its tickets elsewhere.')
  }
  const ticketId = /^\d+$/.test(request.ticket) ? `#${request.ticket}` : request.ticket
  const row = result.rows.find((r) => r.ticket.id === ticketId)
  if (!row || row.ticket.issueNumber === null) {
    throw new Error(`${ticketId} is not an open ticket here.`)
  }
  if (row.status === 'launched' || row.status === 'blocked' || row.status === 'triage') {
    const why = {
      launched: 'already has a workspace',
      blocked: `waits on ${row.waitingOn.join(', ')}`,
      triage: 'is marked for triage'
    }
    throw new Error(`${ticketId} ${why[row.status]}.`)
  }
  let claimed = false
  if (request.claim && row.status === 'ready') {
    const refused = await source.claim(row.ticket)
    if (refused) {
      throw new Error(`Could not claim ${ticketId}: ${refused}`)
    }
    claimed = true
  }
  const issue = await readIssue(repo.path, row.ticket.issueNumber)
  const branch = ticketBranchName(row.ticket, request.type ?? conventionalTypeForTicket(row.ticket))
  return {
    ticketId,
    branch,
    claimed,
    brief: renderCloudTicketBrief({
      ticket: row.ticket,
      ticketBody: issue.body,
      reviewRule: source.briefHints(row.ticket).reviewRule,
      branch,
      baseBranch: result.baseRef.replace(/^[^/]+\//, ''),
      agentDocs: await findAgentDocs(parent.path)
    })
  }
}
