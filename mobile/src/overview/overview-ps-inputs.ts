// Maps the host's `worktree.ps` rows to the shared overview model's inputs.
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../../src/shared/execution-host'
import type {
  OverviewAgentInput,
  OverviewAgentState,
  OverviewChecks,
  OverviewPr,
  OverviewRepoInput,
  OverviewWorktreeInput
} from '../../../src/shared/overview/overview-model-types'
import type { Worktree } from '../worktree/workspace-list-types'

const AGENT_STATES: readonly OverviewAgentState[] = ['working', 'blocked', 'waiting', 'done']

function agentState(value: unknown): OverviewAgentState | undefined {
  return AGENT_STATES.find((state) => state === value)
}

function checksOf(pr: NonNullable<Worktree['linkedPR']>): OverviewChecks {
  const summary = pr.checksSummary
  if ((summary?.failed ?? 0) > 0 || pr.checksStatus === 'failure') {
    return 'failure'
  }
  if (pr.checksStatus === 'pending' || summary?.state === 'pending') {
    return 'pending'
  }
  return pr.checksStatus === 'success' ? 'success' : 'none'
}

const PR_STATES: readonly OverviewPr['state'][] = ['open', 'closed', 'merged', 'draft']

function overviewPr(pr: Worktree['linkedPR']): OverviewPr | null {
  if (!pr) {
    return null
  }
  const state = PR_STATES.find((s) => s === pr.state.toLowerCase())
  return state
    ? {
        number: pr.number,
        state,
        checks: checksOf(pr),
        url: pr.url ?? null,
        // The host's rows carry check counts, not names.
        failingChecks: []
      }
    : null
}

function overviewAgents(row: Worktree): OverviewAgentInput[] {
  const agents: OverviewAgentInput[] = []
  for (const agent of row.agents ?? []) {
    const state = agentState(agent.state)
    if (!state) {
      continue
    }
    const mainAgentState = agentState(agent.mainAgent?.state)
    agents.push({
      paneKey: agent.paneKey,
      state,
      ...(mainAgentState ? { mainAgentState } : {}),
      ...(agent.agentType ? { agentType: agent.agentType } : {}),
      ...(agent.lastAssistantMessage ? { lastAssistantMessage: agent.lastAssistantMessage } : {}),
      stateStartedAt: agent.stateStartedAt,
      prompt: agent.prompt,
      ...(agent.workingMode ? { workingMode: agent.workingMode } : {})
    })
  }
  return agents
}

function hostScoped(hostId: ExecutionHostId, id: string): string {
  return hostId === LOCAL_EXECUTION_HOST_ID ? id : `${hostId}|${id}`
}

/** Projects come from the rows: each repo on each host is one project, named as the host names it. */
export function overviewInputsFromRows(
  rows: readonly Worktree[],
  hostLabel: (hostId: ExecutionHostId) => string | null
): { repos: OverviewRepoInput[]; worktrees: OverviewWorktreeInput[] } {
  const repos = new Map<string, OverviewRepoInput>()
  const worktrees: OverviewWorktreeInput[] = []
  for (const row of rows) {
    if (row.isArchived || row.removing) {
      continue
    }
    const hostId: ExecutionHostId = row.hostId ?? LOCAL_EXECUTION_HOST_ID
    const projectId = hostScoped(hostId, row.repoId)
    if (!repos.has(projectId)) {
      repos.set(projectId, {
        id: projectId,
        name: row.repo,
        host: hostId === LOCAL_EXECUTION_HOST_ID ? null : hostLabel(hostId),
        groupId: null
      })
    }
    worktrees.push({
      key: hostScoped(hostId, row.worktreeId),
      id: row.worktreeId,
      repoId: projectId,
      executionHostId: hostId,
      name: row.displayName || row.branch?.replace(/^refs\/heads\//, '') || row.path || row.repo,
      isMain: row.isMainWorktree ?? false,
      isActive: row.isActive ?? false,
      isUnread: row.unread ?? false,
      comment: row.comment ?? '',
      issue: row.linkedIssue ?? null,
      workspaceStatus: row.workspaceStatus || null,
      lastActivityAt: row.lastActivityAt ?? null,
      pr: overviewPr(row.linkedPR),
      agents: overviewAgents(row)
    })
  }
  return { repos: [...repos.values()], worktrees }
}
