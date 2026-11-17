import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import type { TicketQueueView } from '../../../../shared/ticket-pipeline/ticket-types'
import { ticketQueueNextMerge } from '../../../../shared/ticket-pipeline/ticket-queue-head'
import type { OverviewActionResult } from './overview-actions'
import { requireProjectRoute } from './overview-project-route'
import { SURVEY_TIMEOUT_MS } from './overview-ticket-pipeline'

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

/** Holds ticket PRs out of the merge queue, or lets them back in. */
export async function selectOverviewQueue(
  projectId: string,
  itemIds: readonly string[],
  included: boolean
): Promise<TicketQueueView> {
  const route = requireProjectRoute(projectId)
  return callRuntimeRpc<TicketQueueView>(route.target, 'tickets.queueSelect', {
    repo: route.repo,
    itemIds,
    included
  })
}

/** Merges the first ready PR, or adds it to GitHub's merge queue; otherwise reports what the head waits on. */
export async function mergeOverviewQueueHead(
  projectId: string,
  projectName: string
): Promise<OverviewActionResult> {
  const { target } = requireProjectRoute(projectId)
  const view = await overviewMergeQueue(projectId)
  const head = ticketQueueNextMerge(view.entries)
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
    message: view.viaGitHubQueue
      ? translate(
          'auto.components.overview.mergeQueue.queued',
          "Added {{ticket}} to GitHub's merge queue in {{project}}.",
          { ticket: head.ticketId, project: projectName }
        )
      : translate(
          'auto.components.overview.mergeQueue.merged',
          'Merged {{ticket}} in {{project}}.',
          {
            ticket: head.ticketId,
            project: projectName
          }
        )
  }
}
