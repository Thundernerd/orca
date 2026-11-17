import {
  conventionalTypeForTicket,
  ticketBranchName
} from '../../shared/ticket-pipeline/ticket-branch-name'
import {
  renderCloudTicketBrief,
  type CloudTicketBrief
} from '../../shared/ticket-pipeline/ticket-cloud-brief'
import type {
  ConventionalType,
  TicketLaunchOutcome,
  TicketLaunchResult,
  TicketLaunchSelection,
  TicketSurveyRow
} from '../../shared/ticket-pipeline/ticket-types'
import { readIssue } from '../github/pull-requests/cloud-session-prs'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getTicketItemStore } from './ticket-item-store'
import { findAgentDocs } from './ticket-launch'
import { resolveTicketParentSelector, type TicketParentScope } from './ticket-parent-workspace'
import { surveyTicketsWithSource } from './ticket-survey'

/** The parent workspace, its GitHub-issue survey, and what every cloud brief there shares. */
async function cloudLaunchContext(runtime: OrcaRuntimeService, scope: TicketParentScope) {
  const parent = await runtime.showManagedWorktree(
    await resolveTicketParentSelector(runtime, scope)
  )
  const survey = await surveyTicketsWithSource(runtime, { worktree: `id:${parent.id}` })
  if (survey.source.kind !== 'github-issues') {
    throw new Error('Cloud sessions take GitHub issues; this project reads its tickets elsewhere.')
  }
  return {
    parent,
    ...survey,
    baseBranch: survey.result.baseRef.replace(/^[^/]+\//, ''),
    agentDocs: await findAgentDocs(parent.path)
  }
}

type CloudLaunchContext = Awaited<ReturnType<typeof cloudLaunchContext>>

async function renderBrief(
  context: CloudLaunchContext,
  row: TicketSurveyRow,
  type: ConventionalType | undefined
): Promise<{ branch: string; brief: string }> {
  const issue = await readIssue(context.repo.path, row.ticket.issueNumber ?? 0)
  const branch = ticketBranchName(row.ticket, type ?? conventionalTypeForTicket(row.ticket))
  return {
    branch,
    brief: renderCloudTicketBrief({
      ticket: row.ticket,
      ticketBody: issue.body,
      reviewRule: context.source.briefHints(row.ticket).reviewRule,
      branch,
      baseBranch: context.baseBranch,
      agentDocs: context.agentDocs
    })
  }
}

/** The brief to start a Claude cloud session on one GitHub issue with, claiming it on request so
 *  no host launches it too. Corka adopts the PR the session opens. */
export async function cloudTicketBrief(
  runtime: OrcaRuntimeService,
  scope: TicketParentScope,
  request: { ticket: string; type?: ConventionalType; claim?: boolean }
): Promise<CloudTicketBrief> {
  const context = await cloudLaunchContext(runtime, scope)
  const ticketId = /^\d+$/.test(request.ticket) ? `#${request.ticket}` : request.ticket
  const row = context.result.rows.find((r) => r.ticket.id === ticketId)
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
    const refused = await context.source.claim(row.ticket)
    if (refused) {
      throw new Error(`Could not claim ${ticketId}: ${refused}`)
    }
    claimed = true
  }
  return { ticketId, claimed, ...(await renderBrief(context, row, request.type)) }
}

/** Claims each confirmed ticket and opens a terminal in the parent workspace running
 *  `claude --cloud` with its brief, where the user answers any prompt the CLI asks. This host
 *  then adopts the PRs those sessions open. */
export async function launchCloudTickets(
  runtime: OrcaRuntimeService,
  scope: TicketParentScope,
  selections: readonly TicketLaunchSelection[]
): Promise<TicketLaunchResult> {
  const context = await cloudLaunchContext(runtime, scope)
  const { parent, result, source, baseBranch } = context
  const checkedOut = parent.branch.replace(/^refs\/heads\//, '')
  // The cloud clones the remote branch this checkout is on, not the default branch.
  if (checkedOut !== baseBranch) {
    throw new Error(
      `${parent.displayName || parent.path} is on ${checkedOut}; check out ${baseBranch} there first, since a cloud session starts from the branch its checkout is on.`
    )
  }
  await getTicketItemStore().updateSettings(parent.repoId, { adoptCloudPRs: true })
  const rows = new Map(result.rows.map((row) => [row.ticket.id, row]))
  const outcomes: TicketLaunchOutcome[] = []
  for (const selection of selections) {
    const row = rows.get(selection.id)
    const launchable =
      row?.status === 'ready' || (row?.status === 'triage' && selection.skipTriage === true)
    if (!row || !launchable || row.ticket.issueNumber === null) {
      outcomes.push({
        id: selection.id,
        status: 'skipped',
        reason: row ? `It is ${row.status} now.` : 'It is no longer an open ticket.'
      })
      continue
    }
    const refused = await source.claim(row.ticket)
    if (refused) {
      outcomes.push({ id: selection.id, status: 'skipped', reason: refused })
      continue
    }
    try {
      const { branch, brief } = await renderBrief(context, row, selection.type)
      const terminal = await runtime.launchAgentTerminal(`id:${parent.id}`, {
        agent: 'claude',
        prompt: brief,
        agentArgs: '--cloud',
        title: `${row.ticket.id} in the cloud`
      })
      outcomes.push({ id: selection.id, status: 'started', branch, terminal: terminal.handle })
    } catch (error) {
      await source.release(row.ticket).catch(() => undefined)
      outcomes.push({
        id: selection.id,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return { source: result.source, parentWorktreeId: parent.id, outcomes }
}
