import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { AgentLaunch } from '../../shared/rpc-contract/agent-launch-params'
import { renderTicketBrief } from '../../shared/ticket-pipeline/ticket-brief'
import {
  conventionalTypeForTicket,
  ticketBranchName
} from '../../shared/ticket-pipeline/ticket-branch-name'
import type {
  Ticket,
  TicketLaunchOutcome,
  TicketLaunchResult,
  TicketLaunchSelection,
  TicketSourceKind
} from '../../shared/ticket-pipeline/ticket-types'
import { gitExecFileAsync } from '../git/runner'
import type { RpcContext } from '../runtime/rpc/core'
import { launchAgentOnHost } from '../runtime/rpc/methods/agent-launch/agent-launch'
import { getTicketItemStore } from './ticket-item-store'
import { resolveTicketParentSelector } from './ticket-parent-workspace'
import { surveyTicketsWithSource } from './ticket-survey'
import type { TicketSource } from './sources/ticket-source'

const AGENT_DOC_CANDIDATES = [
  'AGENTS.md',
  'CLAUDE.md',
  'CONTEXT.md',
  'CONTRIBUTING.md',
  '.github/CONTRIBUTING.md'
]
const UNTRACKED_CONTEXT_PATHS = ['AGENTS.md', 'CLAUDE.md', 'CONTEXT.md', '.scratch', 'docs']

export type TicketLaunchRequest = {
  /** The parent workspace; absent means the project's main workspace. */
  parentWorktree?: string
  repo?: string
  source?: TicketSourceKind
  tickets: readonly TicketLaunchSelection[]
}

async function gitLines(cwd: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await gitExecFileAsync(args, { cwd })
    return stdout.split('\n').filter((line) => line.length > 0)
  } catch {
    return []
  }
}

/** Untracked or ignored agent context never reaches a fresh checkout; the brief points at it here. */
async function findUntrackedContext(parentPath: string): Promise<string[]> {
  const lines = await gitLines(parentPath, [
    'status',
    '--porcelain',
    '--ignored',
    '--',
    ...UNTRACKED_CONTEXT_PATHS
  ])
  return lines
    .filter((line) => line.startsWith('?? ') || line.startsWith('!! '))
    .map((line) => join(parentPath, line.slice(3).replace(/\/$/, '')))
}

function launchOperationId(): string {
  return `${Date.now()}-${randomUUID().replaceAll('-', '')}`
}

/** Claim, create and start an agent for each confirmed ticket that is still ready; one failure never stops the rest. */
export async function launchTickets(
  context: RpcContext,
  request: TicketLaunchRequest
): Promise<TicketLaunchResult> {
  const parentSelector = await resolveTicketParentSelector(
    context.runtime,
    request.parentWorktree ? { worktree: request.parentWorktree } : { repo: request.repo ?? '' }
  )
  const parent = await context.runtime.showManagedWorktree(parentSelector)
  const repo = await context.runtime.showRepo(parent.repoId)
  const { result: survey, source } = await surveyTicketsWithSource(
    context.runtime,
    { worktree: `id:${parent.id}` },
    request.source
  )
  const rowsById = new Map(survey.rows.map((row) => [row.ticket.id, row]))
  const baseBranch = survey.baseRef.replace(/^[^/]+\//, '')
  const trackedDocs = new Set(
    await gitLines(parent.path, ['ls-files', '--', ...AGENT_DOC_CANDIDATES])
  )
  const agentDocs = AGENT_DOC_CANDIDATES.filter((doc) => trackedDocs.has(doc))
  const untrackedContext = await findUntrackedContext(parent.path)

  const outcomes: TicketLaunchOutcome[] = []
  for (const selection of request.tickets) {
    const row = rowsById.get(selection.id)
    if (!row || row.status !== 'ready') {
      outcomes.push({
        id: selection.id,
        status: 'skipped',
        reason: row ? `It is ${row.status} now.` : 'It is no longer an open ticket.'
      })
      continue
    }
    outcomes.push(
      await launchOne(context, {
        ticket: row.ticket,
        selection,
        source,
        repo,
        parent,
        baseRef: survey.baseRef,
        brief: (branch) =>
          renderTicketBrief({
            ticket: row.ticket,
            ...source.briefHints(row.ticket),
            findingsPublish: source.create !== undefined,
            branch,
            baseBranch,
            agentDocs,
            untrackedContext
          })
      })
    )
  }
  return { source: survey.source, parentWorktreeId: parent.id, outcomes }
}

async function launchOne(
  context: RpcContext,
  args: {
    ticket: Ticket
    selection: TicketLaunchSelection
    source: TicketSource
    repo: Awaited<ReturnType<RpcContext['runtime']['showRepo']>>
    parent: { id: string }
    baseRef: string
    brief: (branch: string) => string
  }
): Promise<TicketLaunchOutcome> {
  const { ticket, repo, parent, source } = args
  const branch = ticketBranchName(ticket, args.selection.type ?? conventionalTypeForTicket(ticket))
  const claimError = await source.claim(ticket).catch((error: unknown) => String(error))
  if (claimError) {
    return { id: ticket.id, status: 'failed', reason: `Could not claim it: ${claimError}` }
  }
  let worktreeId: string
  let promptConfirmed: boolean
  let agentTerminalHandle: string | undefined
  try {
    const result = await launchAgentOnHost(
      AgentLaunch.parse({
        agent: 'claude',
        operationId: launchOperationId(),
        surface: 'terminal',
        presentation: 'background',
        prompt: { text: args.brief(branch), delivery: 'submit' },
        target: {
          kind: 'create-worktree',
          create: {
            repo: `id:${repo.id}`,
            name: branch.slice(branch.indexOf('/') + 1),
            branchNameOverride: branch,
            baseBranch: args.baseRef,
            ...source.workspaceLink(ticket),
            displayName: `${ticket.id} ${ticket.title}`,
            displayNameKind: 'user',
            workspaceStatus: 'in-progress',
            parentWorktree: `id:${parent.id}`,
            activate: false
          }
        }
      }),
      context
    )
    worktreeId = result.worktreeId
    agentTerminalHandle = result.outcome.kind === 'terminal' ? result.outcome.handle : undefined
    promptConfirmed =
      result.prompt?.outcome === 'journaled' || result.prompt?.outcome === 'handed-to-terminal'
  } catch (error) {
    await source.release(ticket).catch(() => undefined)
    return {
      id: ticket.id,
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error)
    }
  }
  const now = Date.now()
  const itemId = randomUUID()
  await getTicketItemStore().put({
    id: itemId,
    repoId: repo.id,
    parentWorktreeId: parent.id,
    childWorktreeId: worktreeId,
    source: source.kind,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    ticketUrl: ticket.url,
    issueNumber: ticket.issueNumber,
    branch,
    stage: 'implementing',
    reviewNumber: null,
    reviewUrl: null,
    ...(agentTerminalHandle ? { agentTerminalHandle } : {}),
    createdAt: now,
    updatedAt: now
  })
  // The workspace and claim stay: the agent may be running even though its prompt is unconfirmed.
  return promptConfirmed
    ? { id: ticket.id, status: 'launched', itemId, worktreeId, branch }
    : {
        id: ticket.id,
        status: 'failed',
        reason:
          'The agent started, but Corka could not confirm it got the brief. Open its workspace.',
        worktreeId
      }
}
