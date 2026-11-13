import { useAppStore } from '@/store/index'
import { translate } from '@/i18n/i18n'
import { ipcOrRuntimeTargetForHostId } from '@/runtime/rpc/targets/runtime-client-target'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { parseOverviewProjectId } from './overview-store-inputs'

export type ProjectRoute = { target: RuntimeClientTarget; repo: string }

/** The host that owns a git project and its bare repo id there, or null for folders and unreachable hosts. */
export function projectRoute(projectId: string): ProjectRoute | null {
  const parsed = parseOverviewProjectId(projectId)
  const repo = parsed
    ? useAppStore
        .getState()
        .repos.find((r) => r.id === parsed.repoId && getRepoExecutionHostId(r) === parsed.hostId)
    : undefined
  const target =
    parsed && repo && !isFolderRepo(repo) ? ipcOrRuntimeTargetForHostId(parsed.hostId) : null
  return parsed && target ? { target, repo: parsed.repoId } : null
}

export function requireProjectRoute(projectId: string): ProjectRoute {
  const route = projectRoute(projectId)
  if (!route) {
    throw new Error(
      translate(
        'auto.components.overview.ticketActions.unavailable',
        'Tickets for this project cannot be managed from here.'
      )
    )
  }
  return route
}
