import { useAppStore } from '@/store/index'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { runtimeTargetForRepoOwner } from '@/lib/workspace/ownership/repo-runtime-owner'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type {
  TicketLaunchResult,
  TicketLaunchSelection,
  TicketPipelineSettings,
  TicketQueueView,
  TicketSurveyResult,
  WorkspaceCleanResult,
  WorkspaceCleanSurveyResult
} from '../../../../shared/ticket-pipeline/ticket-types'
import type { OverviewActionResult } from './overview-actions'

const SURVEY_TIMEOUT_MS = 120_000
// Each ticket creates a workspace and starts an agent before the next one begins.
const LAUNCH_TIMEOUT_MS = 10 * 60_000

export type OverviewSurveyOutcome =
  | { status: 'ok'; result: TicketSurveyResult }
  | { status: 'failed'; error: string }
  | { status: 'unavailable' }

/** The host that owns a git project, or null for folders and unreachable hosts. */
function projectTarget(projectId: string): RuntimeClientTarget | null {
  const state = useAppStore.getState()
  const repo = state.repos.find((candidate) => candidate.id === projectId)
  if (!repo || isFolderRepo(repo)) {
    return null
  }
  return runtimeTargetForRepoOwner(state, projectId)
}

export async function surveyOverviewProject(projectId: string): Promise<OverviewSurveyOutcome> {
  const target = projectTarget(projectId)
  if (!target) {
    return { status: 'unavailable' }
  }
  try {
    const result = await callRuntimeRpc<TicketSurveyResult>(
      target,
      'tickets.survey',
      { repo: projectId },
      { timeoutMs: SURVEY_TIMEOUT_MS }
    )
    return { status: 'ok', result }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

/** Launches the chosen tickets from the project's main workspace and summarises what happened. */
export async function launchOverviewTickets(
  projectId: string,
  projectName: string,
  tickets: readonly TicketLaunchSelection[]
): Promise<OverviewActionResult> {
  const target = projectTarget(projectId)
  if (!target) {
    return {
      ok: false,
      message: translate(
        'auto.components.overview.launchTickets.unavailable',
        'Tickets cannot be launched for {{project}} from here.',
        { project: projectName }
      )
    }
  }
  const result = await callRuntimeRpc<TicketLaunchResult>(
    target,
    'tickets.launch',
    { repo: projectId, tickets },
    { timeoutMs: LAUNCH_TIMEOUT_MS }
  )
  const launched = result.outcomes.filter((o) => o.status === 'launched')
  const details = result.outcomes.flatMap((o) =>
    o.status === 'launched' ? [] : [`${o.id}: ${o.reason}`]
  )
  return {
    ok: details.length === 0,
    message: [
      translate(
        'auto.components.overview.launchTickets.result',
        'Launched {{count}} of {{total}} tickets in {{project}}.',
        { count: launched.length, total: result.outcomes.length, project: projectName }
      ),
      ...details
    ].join(' ')
  }
}

function requireProjectTarget(projectId: string): RuntimeClientTarget {
  const target = projectTarget(projectId)
  if (!target) {
    throw new Error(
      translate(
        'auto.components.overview.cleanUpWorkspaces.unavailable',
        'This project cannot be cleaned up from here.'
      )
    )
  }
  return target
}

export function surveyOverviewClean(projectId: string): Promise<WorkspaceCleanSurveyResult> {
  return callRuntimeRpc<WorkspaceCleanSurveyResult>(
    requireProjectTarget(projectId),
    'tickets.cleanSurvey',
    { repo: projectId },
    { timeoutMs: SURVEY_TIMEOUT_MS }
  )
}

export function overviewTicketSettings(
  projectId: string,
  patch?: Partial<TicketPipelineSettings>
): Promise<TicketPipelineSettings> {
  return callRuntimeRpc<TicketPipelineSettings>(
    requireProjectTarget(projectId),
    'tickets.settings',
    {
      repo: projectId,
      ...(patch ? { patch } : {})
    }
  )
}

/** Removes the confirmed workspaces the host still clears, and summarises what happened. */
export async function cleanOverviewWorkspaces(
  projectId: string,
  projectName: string,
  worktreeIds: readonly string[]
): Promise<OverviewActionResult> {
  const result = await callRuntimeRpc<WorkspaceCleanResult>(
    requireProjectTarget(projectId),
    'tickets.clean',
    { repo: projectId, worktreeIds },
    { timeoutMs: LAUNCH_TIMEOUT_MS }
  )
  const removed = result.outcomes.filter((o) => o.status === 'removed')
  const kept = result.outcomes.length - removed.length
  const leftovers = removed.flatMap((o) => (o.branchLeftover ? [o.branchLeftover] : []))
  return {
    ok: kept === 0,
    message: [
      translate(
        'auto.components.overview.cleanUpWorkspaces.result',
        'Removed {{count}} of {{total}} workspaces in {{project}}.',
        { count: removed.length, total: result.outcomes.length, project: projectName }
      ),
      ...(leftovers.length > 0
        ? [
            translate(
              'auto.components.overview.cleanUpWorkspaces.leftoverBranches',
              'Kept unmerged branches: {{branches}}.',
              { branches: leftovers.join(', ') }
            )
          ]
        : [])
    ].join(' ')
  }
}

export function overviewMergeQueue(
  projectId: string,
  action: 'view' | 'resume' = 'view'
): Promise<TicketQueueView> {
  return callRuntimeRpc<TicketQueueView>(
    requireProjectTarget(projectId),
    action === 'resume' ? 'tickets.queueResume' : 'tickets.queue',
    { repo: projectId },
    { timeoutMs: SURVEY_TIMEOUT_MS }
  )
}

/** Merges the queue head if it is ready; otherwise reports what it is waiting on. */
export async function mergeOverviewQueueHead(
  projectId: string,
  projectName: string
): Promise<OverviewActionResult> {
  const target = requireProjectTarget(projectId)
  const view = await overviewMergeQueue(projectId)
  const head = view.entries[0]
  if (view.pausedReason) {
    return {
      ok: false,
      message: translate(
        'auto.components.overview.mergeQueue.paused',
        'The merge queue in {{project}} is paused: {{reason}}',
        { project: projectName, reason: view.pausedReason }
      )
    }
  }
  if (!head || head.queue?.status !== 'ready') {
    return {
      ok: false,
      message: head
        ? translate(
            'auto.components.overview.mergeQueue.notReady',
            '{{ticket}} is not ready to merge yet: {{detail}}',
            { ticket: head.ticketId, detail: head.queue?.detail ?? '' }
          )
        : translate(
            'auto.components.overview.mergeQueue.empty',
            'No ticket PRs are waiting to merge in {{project}}.',
            { project: projectName }
          )
    }
  }
  await callRuntimeRpc<TicketQueueView>(
    target,
    'tickets.merge',
    { itemId: head.itemId },
    { timeoutMs: SURVEY_TIMEOUT_MS }
  )
  return {
    ok: true,
    message: translate(
      'auto.components.overview.mergeQueue.merged',
      'Merged {{ticket}} in {{project}}.',
      {
        ticket: head.ticketId,
        project: projectName
      }
    )
  }
}
