import type { AppState } from '@/store/types'
import { selectLiveAgentStatusEntriesForWorktree } from '@/components/sidebar/workspace-card/activity/worktree-agent-row-selectors'
import { readWorkspaceReviewPR } from '../../../../shared/sidebar-list/workspace-review-facts'
import {
  getExecutionHostLabel,
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { getFolderWorkspaceHostId } from '../../../../shared/folder-workspaces/folder-workspace-host-id'
import type { AgentStatusEntry } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { PRInfo } from '../../../../shared/github/pull-requests/pull-request-types'
import type {
  OverviewAgentInput,
  OverviewChecks,
  OverviewPr,
  OverviewRepoInput,
  OverviewWorktreeInput
} from '../../../../shared/overview/overview-model-types'

export type OverviewStoreSlice = Pick<
  AppState,
  | 'repos'
  | 'worktreesByRepo'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'activeWorktreeId'
  | 'activeWorkspaceExecutionHostId'
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
    activeWorkspaceExecutionHostId: state.activeWorkspaceExecutionHostId,
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
    ? {
        number: pr.number,
        state: pr.state,
        checks: checksOf(pr),
        url: pr.url || null,
        failingChecks: pr.failingCheckNames ?? []
      }
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

/** Host labels as the sidebar names them; this machine has none. */
export type OverviewHostLabels = ReadonlyMap<ExecutionHostId, string>

/** A remote copy of a project is its own project: the same repo id can live on two hosts. */
function hostScoped(hostId: ExecutionHostId, id: string): string {
  return hostId === LOCAL_EXECUTION_HOST_ID ? id : `${hostId}|${id}`
}

/** Inverse of {@link hostScoped}; null when the host part is not a valid host id. */
export function parseOverviewProjectId(
  projectId: string
): { hostId: ExecutionHostId; repoId: string } | null {
  const split = projectId.lastIndexOf('|')
  if (split === -1) {
    return { hostId: LOCAL_EXECUTION_HOST_ID, repoId: projectId }
  }
  const hostId = normalizeExecutionHostId(projectId.slice(0, split))
  return hostId ? { hostId, repoId: projectId.slice(split + 1) } : null
}

export function buildOverviewStoreInputs(
  slice: OverviewStoreSlice,
  hostLabels: OverviewHostLabels
): {
  repos: OverviewRepoInput[]
  worktrees: OverviewWorktreeInput[]
} {
  const repos: OverviewRepoInput[] = []
  const worktrees: OverviewWorktreeInput[] = []
  const agentsOf = (key: string): OverviewAgentInput[] =>
    selectLiveAgentStatusEntriesForWorktree(slice, key).map(overviewAgent)
  const labelOf = (hostId: ExecutionHostId): string | null =>
    hostId === LOCAL_EXECUTION_HOST_ID
      ? null
      : (hostLabels.get(hostId) ?? getExecutionHostLabel(hostId))
  const isActive = (id: string, hostId: ExecutionHostId): boolean =>
    slice.activeWorktreeId === id &&
    (slice.activeWorkspaceExecutionHostId ?? LOCAL_EXECUTION_HOST_ID) === hostId

  for (const repo of slice.repos) {
    const hostId = getRepoExecutionHostId(repo)
    const projectId = hostScoped(hostId, repo.id)
    repos.push({
      id: projectId,
      name: repo.displayName,
      host: labelOf(hostId),
      groupId: repo.projectGroupId ?? null
    })
    // worktreesByRepo is keyed by bare repo id, so a twin's rows from every host share one list.
    for (const worktree of slice.worktreesByRepo[repo.id] ?? []) {
      const rowHostId = worktree.hostId ?? LOCAL_EXECUTION_HOST_ID
      if (worktree.isArchived || worktree.removing || rowHostId !== hostId) {
        continue
      }
      const branch = worktree.branch.replace(/^refs\/heads\//, '')
      worktrees.push({
        key: hostScoped(hostId, worktree.id),
        id: worktree.id,
        repoId: projectId,
        executionHostId: hostId,
        name: worktree.displayName || branch || worktree.path,
        isMain: worktree.isMainWorktree,
        isActive: isActive(worktree.id, hostId),
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
    const hostId = getFolderWorkspaceHostId(folder, slice.projectGroups)
    const projectId = hostScoped(hostId, `group:${folder.projectGroupId}`)
    if (!repos.some((repo) => repo.id === projectId)) {
      repos.push({
        id: projectId,
        name: groupNames.get(folder.projectGroupId) ?? folder.name,
        host: labelOf(hostId),
        groupId: folder.projectGroupId
      })
    }
    const id = folderWorkspaceKey(folder.id)
    worktrees.push({
      key: hostScoped(hostId, id),
      id,
      repoId: projectId,
      executionHostId: hostId,
      name: folder.name,
      isMain: false,
      isActive: isActive(id, hostId),
      isUnread: folder.isUnread,
      comment: folder.comment,
      issue: null,
      workspaceStatus: null,
      lastActivityAt: folder.lastActivityAt ?? null,
      pr: null,
      agents: agentsOf(id)
    })
  }
  return { repos, worktrees }
}
