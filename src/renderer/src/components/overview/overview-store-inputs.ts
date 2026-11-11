import type { AppState } from '@/store/types'
import { selectLiveAgentStatusEntriesForWorktree } from '@/components/sidebar/workspace-card/activity/worktree-agent-row-selectors'
import { readWorkspaceReviewPR } from '../../../../shared/sidebar-list/workspace-review-facts'
import {
  getExecutionHostLabel,
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import type { AgentStatusEntry } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { PRInfo } from '../../../../shared/github/pull-request-types'
import type {
  OverviewAgentInput,
  OverviewChecks,
  OverviewPr,
  OverviewRepoInput,
  OverviewWorktreeInput
} from './overview-model-types'

export type OverviewStoreSlice = Pick<
  AppState,
  | 'repos'
  | 'worktreesByRepo'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'activeWorktreeId'
  | 'prCache'
  | 'agentStatusByPaneKey'
  | 'migrationUnsupportedByPtyId'
  | 'retainedAgentsByPaneKey'
  | 'tabsByWorktree'
  | 'unifiedTabsByWorktree'
>

export function selectOverviewStoreSlice(state: AppState): OverviewStoreSlice {
  return {
    repos: state.repos,
    worktreesByRepo: state.worktreesByRepo,
    folderWorkspaces: state.folderWorkspaces,
    projectGroups: state.projectGroups,
    activeWorktreeId: state.activeWorktreeId,
    prCache: state.prCache,
    agentStatusByPaneKey: state.agentStatusByPaneKey,
    migrationUnsupportedByPtyId: state.migrationUnsupportedByPtyId,
    retainedAgentsByPaneKey: state.retainedAgentsByPaneKey,
    tabsByWorktree: state.tabsByWorktree,
    unifiedTabsByWorktree: state.unifiedTabsByWorktree
  }
}

function checksOf(pr: PRInfo): OverviewChecks {
  const summary = pr.checksSummary
  if ((summary?.failed ?? 0) > 0 || pr.checksStatus === 'failure') {
    return 'failure'
  }
  if (pr.checksStatus === 'pending' || summary?.state === 'pending') {
    return 'pending'
  }
  return pr.checksStatus === 'success' ? 'success' : 'none'
}

function overviewPr(pr: PRInfo | null): OverviewPr | null {
  return pr
    ? { number: pr.number, state: pr.state, checks: checksOf(pr), url: pr.url || null }
    : null
}

function overviewAgent(entry: AgentStatusEntry): OverviewAgentInput {
  return {
    paneKey: entry.paneKey,
    state: entry.state,
    mainAgentState: entry.mainAgent?.state,
    agentType: entry.agentType,
    lastAssistantMessage: entry.lastAssistantMessage ?? entry.lastCompletedAssistantMessage,
    stateStartedAt: entry.stateStartedAt,
    prompt: entry.prompt,
    workingMode: entry.workingMode
  }
}

function hostLabel(hostId: ExecutionHostId): string | null {
  return hostId === LOCAL_EXECUTION_HOST_ID ? null : getExecutionHostLabel(hostId)
}

export function buildOverviewStoreInputs(slice: OverviewStoreSlice): {
  repos: OverviewRepoInput[]
  worktrees: OverviewWorktreeInput[]
} {
  const repos: OverviewRepoInput[] = []
  const worktrees: OverviewWorktreeInput[] = []
  const agentsOf = (key: string): OverviewAgentInput[] =>
    selectLiveAgentStatusEntriesForWorktree(slice, key).map(overviewAgent)

  for (const repo of slice.repos) {
    const hostId = getRepoExecutionHostId(repo)
    repos.push({ id: repo.id, name: repo.displayName, host: hostLabel(hostId) })
    for (const worktree of slice.worktreesByRepo[repo.id] ?? []) {
      if (worktree.isArchived || worktree.removing) {
        continue
      }
      const branch = worktree.branch.replace(/^refs\/heads\//, '')
      worktrees.push({
        id: worktree.id,
        repoId: repo.id,
        executionHostId: worktree.hostId ?? hostId,
        name: worktree.displayName || branch || worktree.path,
        isMain: worktree.isMainWorktree,
        isActive: slice.activeWorktreeId === worktree.id,
        isUnread: worktree.isUnread,
        comment: worktree.comment,
        issue: worktree.linkedIssue,
        workspaceStatus: worktree.workspaceStatus ?? null,
        lastActivityAt: worktree.lastActivityAt || null,
        pr: overviewPr(readWorkspaceReviewPR(worktree, repo, slice.prCache)),
        agents: agentsOf(worktree.id)
      })
    }
  }

  // Folder workspaces are not git worktrees: they group under their project group.
  const groupNames = new Map(slice.projectGroups.map((group) => [group.id, group.name]))
  for (const folder of slice.folderWorkspaces) {
    if (folder.isArchived) {
      continue
    }
    const projectId = `group:${folder.projectGroupId}`
    const hostId = getRepoExecutionHostId(folder)
    if (!repos.some((repo) => repo.id === projectId)) {
      repos.push({
        id: projectId,
        name: groupNames.get(folder.projectGroupId) ?? folder.name,
        host: hostLabel(hostId)
      })
    }
    const key = folderWorkspaceKey(folder.id)
    worktrees.push({
      id: key,
      repoId: projectId,
      executionHostId: hostId,
      name: folder.name,
      isMain: false,
      isActive: slice.activeWorktreeId === key,
      isUnread: folder.isUnread,
      comment: folder.comment,
      issue: null,
      workspaceStatus: null,
      lastActivityAt: folder.lastActivityAt ?? null,
      pr: null,
      agents: agentsOf(key)
    })
  }
  return { repos, worktrees }
}
