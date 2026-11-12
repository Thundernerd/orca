import { translate } from '../i18n/mobile-i18n'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { interpretOrThrowRefusalMessage } from '../transport/rpc/rpc-refusal-message'
import {
  ticketCleanRun,
  ticketCleanSurveyRead,
  ticketDraftDiscardRun,
  ticketDraftListRead,
  ticketDraftPublishRun,
  ticketDraftStartRun,
  ticketLaunchRun,
  ticketMergeRun,
  ticketQueueRead,
  ticketQueueResumeRun,
  ticketSurveyRead,
  type MobileTicketDraftBatch,
  type MobileTicketQueue,
  type MobileTicketSurvey,
  type MobileWorkspaceCleanSurvey
} from './overview-ticket-operations'

export type MobileTicketResult = { ok: boolean; message: string }

const failed = (what: string) =>
  translate('overview.mobile.tickets.failed', 'Could not {{what}}', { what })

/** The phone's view of the ticket pipeline: every call runs on the host that serves the project. */
export function mobileTicketActions(client: RpcClient, projectId: string) {
  const repo = projectId
  return {
    survey: async (): Promise<MobileTicketSurvey> => {
      const response = await ticketSurveyRead.request(client, { repo })
      return interpretOrThrowRefusalMessage(
        () => ticketSurveyRead.interpret(response),
        failed('read the tickets')
      )
    },
    launch: async (ids: readonly string[]): Promise<MobileTicketResult> => {
      const response = await ticketLaunchRun.request(client, {
        repo,
        tickets: ids.map((id) => ({ id }))
      })
      const result = interpretOrThrowRefusalMessage(
        () => ticketLaunchRun.interpret(response),
        failed('launch the tickets')
      )
      const launched = result.outcomes.filter((o) => o.status === 'launched').length
      const problems = result.outcomes.flatMap((o) =>
        o.status === 'launched' ? [] : [`${o.id}: ${o.reason ?? o.status}`]
      )
      return {
        ok: problems.length === 0,
        message: [
          translate('overview.mobile.tickets.launched', 'Launched {{count}} of {{total}}', {
            count: launched,
            total: result.outcomes.length
          }),
          ...problems
        ].join(' ')
      }
    },
    cleanSurvey: async (): Promise<MobileWorkspaceCleanSurvey> => {
      const response = await ticketCleanSurveyRead.request(client, { repo })
      return interpretOrThrowRefusalMessage(
        () => ticketCleanSurveyRead.interpret(response),
        failed('check the workspaces')
      )
    },
    clean: async (worktreeIds: readonly string[]): Promise<MobileTicketResult> => {
      const response = await ticketCleanRun.request(client, {
        repo,
        worktreeIds: [...worktreeIds]
      })
      const result = interpretOrThrowRefusalMessage(
        () => ticketCleanRun.interpret(response),
        failed('remove the workspaces')
      )
      const removed = result.outcomes.filter((o) => o.status === 'removed').length
      return {
        ok: removed === result.outcomes.length,
        message: translate('overview.mobile.tickets.removed', 'Removed {{count}} of {{total}}', {
          count: removed,
          total: result.outcomes.length
        })
      }
    },
    queue: async (action: 'view' | 'resume' = 'view'): Promise<MobileTicketQueue> => {
      const operation = action === 'resume' ? ticketQueueResumeRun : ticketQueueRead
      const response = await operation.request(client, { repo })
      return interpretOrThrowRefusalMessage(
        () => operation.interpret(response),
        failed('read the merge queue')
      )
    },
    merge: async (itemId: string): Promise<MobileTicketQueue> => {
      const response = await ticketMergeRun.request(client, { itemId })
      return interpretOrThrowRefusalMessage(
        () => ticketMergeRun.interpret(response),
        failed('merge the PR')
      )
    },
    startDraft: async (request: string): Promise<MobileTicketResult> => {
      const response = await ticketDraftStartRun.request(client, { repo, request })
      interpretOrThrowRefusalMessage(
        () => ticketDraftStartRun.interpret(response),
        failed('start drafting')
      )
      return {
        ok: true,
        message: translate(
          'overview.mobile.tickets.drafting',
          'Claude is drafting; review the drafts under Drafts when they are ready'
        )
      }
    },
    drafts: async (): Promise<MobileTicketDraftBatch[]> => {
      const response = await ticketDraftListRead.request(client, { repo })
      return interpretOrThrowRefusalMessage(
        () => ticketDraftListRead.interpret(response),
        failed('read the drafts')
      ).batches
    },
    publish: async (batch: MobileTicketDraftBatch): Promise<MobileTicketDraftBatch> => {
      const response = await ticketDraftPublishRun.request(client, {
        batchId: batch.id,
        drafts: batch.drafts
      })
      return interpretOrThrowRefusalMessage(
        () => ticketDraftPublishRun.interpret(response),
        failed('publish the drafts')
      )
    },
    discard: async (batchId: string): Promise<MobileTicketDraftBatch> => {
      const response = await ticketDraftDiscardRun.request(client, { batchId })
      return interpretOrThrowRefusalMessage(
        () => ticketDraftDiscardRun.interpret(response),
        failed('discard the drafts')
      )
    }
  }
}

export type MobileTicketActions = ReturnType<typeof mobileTicketActions>
