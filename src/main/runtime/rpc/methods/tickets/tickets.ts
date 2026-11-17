import {
  TicketClean,
  TicketCleanSurvey,
  TicketCreate,
  TicketDraftDiscard,
  TicketDraftList,
  TicketDraftPublish,
  TicketDraftStart,
  TicketDraftSubmit,
  TicketFindingCheck,
  TicketItemsList,
  TicketLaunch,
  TicketLink,
  TicketMerge,
  TicketQueue,
  TicketQueueSelect,
  TicketSettings,
  TicketStatus,
  TicketTriage,
  TicketSourceOptions,
  TicketSurvey
} from '../../../../../shared/rpc-contract/ticket-params'
import { getTicketItemStore } from '../../../../ticket-pipeline/ticket-item-store'
import { adoptUntrackedTicketWorkspaces } from '../../../../ticket-pipeline/ticket-adoption'
import { startFindingCheck } from '../../../../ticket-pipeline/ticket-finding-check'
import { launchTickets } from '../../../../ticket-pipeline/ticket-launch'
import { launchCloudTickets } from '../../../../ticket-pipeline/ticket-cloud-launch'
import { surveyTickets } from '../../../../ticket-pipeline/ticket-survey'
import { startTicketTracker } from '../../../../ticket-pipeline/ticket-tracker'
import { ticketPipelineStatus } from '../../../../ticket-pipeline/ticket-pipeline-status'
import { startTicketTriage } from '../../../../ticket-pipeline/ticket-triage'
import { cleanWorkspaces, surveyWorkspaceClean } from '../../../../ticket-pipeline/workspace-clean'
import { getMergeQueue } from '../../../../ticket-pipeline/merge-queue'
import { listTicketSourceOptions } from '../../../../ticket-pipeline/sources/ticket-source-options'
import {
  createFindingTicket,
  discardTicketDrafts,
  linkTicketBlocker,
  listTicketDraftBatches,
  publishTicketDrafts,
  startTicketDrafting,
  submitTicketDrafts
} from '../../../../ticket-pipeline/ticket-drafts'
import {
  queueOrder,
  resumeTicketQueue,
  selectTicketQueue,
  ticketQueueView
} from '../../../../ticket-pipeline/merge-queue-order'
import {
  resolveTicketParentSelector,
  ticketParentScope
} from '../../../../ticket-pipeline/ticket-parent-workspace'
import { defineMethod } from '../../core'
import { TICKET_BRIEF_METHODS } from './ticket-brief-methods'

/** Adoption reads the tracker and GitHub; a failure must not hide the queue itself. */
async function adoptForQueue(
  runtime: Parameters<typeof adoptUntrackedTicketWorkspaces>[0],
  parent: { id: string; repoId: string }
): Promise<number> {
  return adoptUntrackedTicketWorkspaces(runtime, parent).catch((error: unknown) => {
    console.warn('[tickets] could not adopt untracked ticket workspaces', error)
    return 0
  })
}

export const TICKET_METHODS = [
  ...TICKET_BRIEF_METHODS,
  defineMethod({
    name: 'tickets.survey',
    permission: 'workspace',
    params: TicketSurvey,
    handler: async (params, { runtime }) =>
      surveyTickets(
        runtime,
        params.worktree !== undefined ? { worktree: params.worktree } : { repo: params.repo ?? '' },
        params.source
      )
  }),
  defineMethod({
    name: 'tickets.launch',
    permission: 'workspace',
    params: TicketLaunch,
    handler: async (params, context) => {
      const result = params.cloud
        ? await launchCloudTickets(context.runtime, ticketParentScope(params), params.tickets)
        : await launchTickets(context, {
            ...(params.worktree !== undefined ? { parentWorktree: params.worktree } : {}),
            ...(params.repo !== undefined ? { repo: params.repo } : {}),
            ...(params.source ? { source: params.source } : {}),
            tickets: params.tickets
          })
      startTicketTracker(context.runtime)
      return result
    }
  }),
  defineMethod({
    name: 'tickets.triage',
    permission: 'workspace',
    params: TicketTriage,
    handler: async (params, context) =>
      startTicketTriage(context, ticketParentScope(params), params.ticketIds)
  }),
  defineMethod({
    name: 'tickets.items',
    permission: 'workspace',
    params: TicketItemsList,
    handler: async (params, { runtime }) => {
      const repoId = params.repo ? (await runtime.showRepo(params.repo)).id : null
      const items = await getTicketItemStore().list()
      return { items: repoId ? items.filter((item) => item.repoId === repoId) : items }
    }
  }),
  defineMethod({
    name: 'tickets.cleanSurvey',
    permission: 'workspace',
    params: TicketCleanSurvey,
    handler: async (params, { runtime }) => surveyWorkspaceClean(runtime, ticketParentScope(params))
  }),
  defineMethod({
    name: 'tickets.clean',
    permission: 'workspace',
    params: TicketClean,
    handler: async (params, context) =>
      cleanWorkspaces(context, ticketParentScope(params), params.worktreeIds)
  }),
  defineMethod({
    name: 'tickets.settings',
    permission: 'workspace',
    params: TicketSettings,
    handler: async (params, { runtime }) => {
      const repoId = (await runtime.showRepo(params.repo)).id
      const store = getTicketItemStore()
      if (!params.patch) {
        return store.getSettings(repoId)
      }
      const settings = await store.updateSettings(repoId, params.patch)
      // Auto-clean acts from the tracker, so already-merged tickets get picked up now.
      startTicketTracker(runtime)
      return settings
    }
  }),
  defineMethod({
    name: 'tickets.queue',
    permission: 'workspace',
    params: TicketQueue,
    handler: async (params, { runtime }) => {
      const parent = await runtime.showManagedWorktree(
        await resolveTicketParentSelector(runtime, ticketParentScope(params))
      )
      if (await adoptForQueue(runtime, parent)) {
        startTicketTracker(runtime)
      }
      return ticketQueueView(parent.id, parent.repoId)
    }
  }),
  defineMethod({
    name: 'tickets.status',
    permission: 'workspace',
    params: TicketStatus,
    handler: async (params, { runtime }) => {
      const parent = await runtime.showManagedWorktree(
        await resolveTicketParentSelector(runtime, ticketParentScope(params))
      )
      return ticketPipelineStatus(parent.id, parent.repoId)
    }
  }),
  defineMethod({
    name: 'tickets.queueResume',
    permission: 'workspace',
    params: TicketQueue,
    handler: async (params, { runtime }) => {
      const parent = await runtime.showManagedWorktree(
        await resolveTicketParentSelector(runtime, ticketParentScope(params))
      )
      await adoptForQueue(runtime, parent)
      await resumeTicketQueue(parent.id)
      startTicketTracker(runtime)
      return ticketQueueView(parent.id, parent.repoId)
    }
  }),
  defineMethod({
    name: 'tickets.queueSelect',
    permission: 'workspace',
    params: TicketQueueSelect,
    handler: async (params, { runtime }) => {
      const parent = await runtime.showManagedWorktree(
        await resolveTicketParentSelector(runtime, ticketParentScope(params))
      )
      await selectTicketQueue(parent.id, params.itemIds, params.included)
      startTicketTracker(runtime)
      return ticketQueueView(parent.id, parent.repoId)
    }
  }),
  defineMethod({
    name: 'tickets.merge',
    permission: 'workspace',
    params: TicketMerge,
    handler: async (params, { runtime }) => {
      const items = await getTicketItemStore().list()
      const item = items.find((i) => i.id === params.itemId)
      // Only a ready PR the queue works on merges: the head, or any included PR under GitHub's queue.
      const order = item ? queueOrder(items, item.parentWorktreeId) : []
      const worked =
        order[0]?.id === item?.id ||
        (order[0]?.queue?.viaGitHubQueue === true && order.some((i) => i.id === item?.id))
      if (!item || !worked || item.queue?.status !== 'ready') {
        throw new Error(
          'That ticket is not ready to merge; the queue has moved on or it is not first.'
        )
      }
      await getMergeQueue(runtime).merge(item)
      startTicketTracker(runtime)
      return ticketQueueView(item.parentWorktreeId, item.repoId)
    }
  }),
  defineMethod({
    name: 'tickets.draftStart',
    permission: 'workspace',
    params: TicketDraftStart,
    handler: async (params, context) =>
      startTicketDrafting(context, ticketParentScope(params), params.request)
  }),
  defineMethod({
    name: 'tickets.draftSubmit',
    permission: 'workspace',
    params: TicketDraftSubmit,
    handler: async (params, { runtime }) =>
      submitTicketDrafts(runtime, params.batchId, params.drafts, params.decisions)
  }),
  defineMethod({
    name: 'tickets.draftList',
    permission: 'workspace',
    params: TicketDraftList,
    handler: async (params, { runtime }) => ({
      batches: await listTicketDraftBatches(
        params.repo ? (await runtime.showRepo(params.repo)).id : null
      )
    })
  }),
  defineMethod({
    name: 'tickets.draftPublish',
    permission: 'workspace',
    params: TicketDraftPublish,
    handler: async (params, { runtime }) =>
      publishTicketDrafts(runtime, params.batchId, params.drafts)
  }),
  defineMethod({
    name: 'tickets.draftDiscard',
    permission: 'workspace',
    params: TicketDraftDiscard,
    handler: async (params) => discardTicketDrafts(params.batchId)
  }),
  defineMethod({
    name: 'tickets.create',
    permission: 'workspace',
    params: TicketCreate,
    handler: async (params, { runtime }) =>
      createFindingTicket(
        runtime,
        { worktree: params.worktree },
        {
          title: params.title,
          body: params.body,
          labels: params.labels,
          blockedBy: params.blockedBy,
          ...(params.findingOf ? { findingOf: params.findingOf } : {})
        }
      )
  }),
  defineMethod({
    name: 'tickets.finding',
    permission: 'workspace',
    params: TicketFindingCheck,
    handler: async (params, context) =>
      startFindingCheck(context, params.worktree, {
        findingOf: params.findingOf,
        findings: [{ title: params.title, body: params.body, blockedBy: params.blockedBy }]
      })
  }),
  defineMethod({
    name: 'tickets.link',
    permission: 'workspace',
    params: TicketLink,
    handler: async (params, { runtime }) =>
      linkTicketBlocker(
        runtime,
        { worktree: params.worktree },
        { ticketId: params.ticketId, blockerId: params.blockerId }
      )
  }),
  defineMethod({
    name: 'tickets.sourceOptions',
    permission: 'workspace',
    params: TicketSourceOptions,
    handler: async (params, { runtime }) => ({
      options: await listTicketSourceOptions(await runtime.showRepo(params.repo))
    })
  })
]
