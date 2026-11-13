import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import type {
  TicketLaunchResult,
  TicketLaunchSelection,
  TicketPipelineSettings,
  TicketPipelineStatus,
  TicketQueueView,
  TicketSourceOption,
  TicketSurveyResult,
  WorkspaceCleanResult,
  WorkspaceCleanSurveyResult
} from '../../../../shared/ticket-pipeline/ticket-types'
import type {
  TicketDraft,
  TicketDraftBatch
} from '../../../../shared/ticket-pipeline/ticket-draft-types'
import type { OverviewActionResult } from './overview-actions'
import { projectRoute, requireProjectRoute } from './overview-project-route'
import { keptWorkspaceNotes } from './workspace-clean-outcome-text'

const SURVEY_TIMEOUT_MS = 120_000
// Each ticket creates a workspace and starts an agent before the next one begins.
const LAUNCH_TIMEOUT_MS = 10 * 60_000

export type OverviewSurveyOutcome =
  | { status: 'ok'; result: TicketSurveyResult }
  | { status: 'failed'; error: string }
  | { status: 'unavailable' }

export async function surveyOverviewProject(projectId: string): Promise<OverviewSurveyOutcome> {
  const route = projectRoute(projectId)
  if (!route) {
    return { status: 'unavailable' }
  }
  try {
    const result = await callRuntimeRpc<TicketSurveyResult>(
      route.target,
      'tickets.survey',
      { repo: route.repo },
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
  const route = projectRoute(projectId)
  if (!route) {
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
    route.target,
    'tickets.launch',
    { repo: route.repo, tickets },
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

export async function surveyOverviewClean(projectId: string): Promise<WorkspaceCleanSurveyResult> {
  const route = requireProjectRoute(projectId)
  return callRuntimeRpc<WorkspaceCleanSurveyResult>(
    route.target,
    'tickets.cleanSurvey',
    { repo: route.repo },
    { timeoutMs: SURVEY_TIMEOUT_MS }
  )
}

export async function overviewTicketSettings(
  projectId: string,
  patch?: Partial<TicketPipelineSettings>
): Promise<TicketPipelineSettings> {
  const route = requireProjectRoute(projectId)
  return callRuntimeRpc<TicketPipelineSettings>(route.target, 'tickets.settings', {
    repo: route.repo,
    ...(patch ? { patch } : {})
  })
}

/** What the merge queue and auto-clean are doing; local reads on the host, so cheap to poll. */
export async function overviewTicketStatus(projectId: string): Promise<TicketPipelineStatus> {
  const route = requireProjectRoute(projectId)
  return callRuntimeRpc<TicketPipelineStatus>(route.target, 'tickets.status', { repo: route.repo })
}

/** Removes the confirmed workspaces the host still clears, and summarises what happened. */
export async function cleanOverviewWorkspaces(
  projectId: string,
  projectName: string,
  worktreeIds: readonly string[]
): Promise<OverviewActionResult> {
  const route = requireProjectRoute(projectId)
  const result = await callRuntimeRpc<WorkspaceCleanResult>(
    route.target,
    'tickets.clean',
    { repo: route.repo, worktreeIds },
    { timeoutMs: LAUNCH_TIMEOUT_MS }
  )
  const removed = result.outcomes.filter((o) => o.status === 'removed')
  const kept = keptWorkspaceNotes(result.outcomes)
  const leftovers = removed.flatMap((o) => (o.branchLeftover ? [o.branchLeftover] : []))
  return {
    ok: kept.length === 0,
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
        : []),
      ...kept
    ].join(' ')
  }
}

export async function overviewMergeQueue(
  projectId: string,
  action: 'view' | 'resume' = 'view'
): Promise<TicketQueueView> {
  const route = requireProjectRoute(projectId)
  return callRuntimeRpc<TicketQueueView>(
    route.target,
    action === 'resume' ? 'tickets.queueResume' : 'tickets.queue',
    { repo: route.repo },
    { timeoutMs: SURVEY_TIMEOUT_MS }
  )
}

/** Merges the queue head if it is ready; otherwise reports what it is waiting on. */
export async function mergeOverviewQueueHead(
  projectId: string,
  projectName: string
): Promise<OverviewActionResult> {
  const { target } = requireProjectRoute(projectId)
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

export async function startOverviewDrafting(
  projectId: string,
  request: string
): Promise<TicketDraftBatch> {
  const route = requireProjectRoute(projectId)
  return callRuntimeRpc<TicketDraftBatch>(
    route.target,
    'tickets.draftStart',
    { repo: route.repo, request },
    { timeoutMs: LAUNCH_TIMEOUT_MS }
  )
}

export async function overviewDraftBatches(projectId: string): Promise<TicketDraftBatch[]> {
  const route = requireProjectRoute(projectId)
  const result = await callRuntimeRpc<{ batches: TicketDraftBatch[] }>(
    route.target,
    'tickets.draftList',
    { repo: route.repo },
    { timeoutMs: SURVEY_TIMEOUT_MS }
  )
  return result.batches
}

export async function publishOverviewDrafts(
  projectId: string,
  batchId: string,
  drafts: TicketDraft[]
): Promise<TicketDraftBatch> {
  const route = requireProjectRoute(projectId)
  return callRuntimeRpc<TicketDraftBatch>(
    route.target,
    'tickets.draftPublish',
    { batchId, drafts },
    { timeoutMs: LAUNCH_TIMEOUT_MS }
  )
}

export async function discardOverviewDrafts(
  projectId: string,
  batchId: string
): Promise<TicketDraftBatch> {
  const route = requireProjectRoute(projectId)
  return callRuntimeRpc<TicketDraftBatch>(route.target, 'tickets.draftDiscard', {
    batchId
  })
}

/** Starts drafting and says where the drafts will appear. */
export async function startOverviewDraftingWithNotice(
  projectId: string,
  projectName: string,
  request: string
): Promise<OverviewActionResult> {
  await startOverviewDrafting(projectId, request)
  return {
    ok: true,
    message: translate(
      'auto.components.overview.writeTicket.started',
      'Claude is drafting tickets in {{project}}; review them from Write ticket when they are ready.',
      { project: projectName }
    )
  }
}

export function publishedDraftsNotice(
  batch: TicketDraftBatch,
  projectName: string
): OverviewActionResult {
  return {
    ok: true,
    message: translate(
      'auto.components.overview.writeTicket.publishedNotice',
      'Published {{numbers}} in {{project}}.',
      { numbers: batch.published.map((p) => p.id).join(', '), project: projectName }
    )
  }
}

export async function overviewTicketSourceOptions(
  projectId: string
): Promise<TicketSourceOption[]> {
  const route = requireProjectRoute(projectId)
  const result = await callRuntimeRpc<{ options: TicketSourceOption[] }>(
    route.target,
    'tickets.sourceOptions',
    { repo: route.repo },
    { timeoutMs: SURVEY_TIMEOUT_MS }
  )
  return result.options
}
