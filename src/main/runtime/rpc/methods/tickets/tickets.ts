import {
  TicketClean,
  TicketCleanSurvey,
  TicketItemsList,
  TicketLaunch,
  TicketMerge,
  TicketQueue,
  TicketSettings,
  TicketSurvey
} from '../../../../../shared/rpc-contract/ticket-params'
import { getTicketItemStore } from '../../../../ticket-pipeline/ticket-item-store'
import { launchTickets } from '../../../../ticket-pipeline/ticket-launch'
import { surveyTickets } from '../../../../ticket-pipeline/ticket-survey'
import { startTicketTracker } from '../../../../ticket-pipeline/ticket-tracker'
import { cleanWorkspaces, surveyWorkspaceClean } from '../../../../ticket-pipeline/workspace-clean'
import { getMergeQueue } from '../../../../ticket-pipeline/merge-queue'
import {
  queueOrder,
  resumeTicketQueue,
  ticketQueueView
} from '../../../../ticket-pipeline/merge-queue-order'
import {
  resolveTicketParentSelector,
  ticketParentScope
} from '../../../../ticket-pipeline/ticket-parent-workspace'
import { defineMethod } from '../../core'

export const TICKET_METHODS = [
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
      const result = await launchTickets(context, {
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
      return ticketQueueView(parent.id, parent.repoId)
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
      await resumeTicketQueue(parent.id)
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
      // Only the ready head of an unpaused queue merges: order and the checks still hold.
      const head = item ? queueOrder(items, item.parentWorktreeId)[0] : undefined
      if (!item || head?.id !== item.id || item.queue?.status !== 'ready') {
        throw new Error(
          'That ticket is not ready to merge; the queue has moved on or it is not first.'
        )
      }
      await getMergeQueue(runtime).merge(item)
      startTicketTracker(runtime)
      return ticketQueueView(item.parentWorktreeId, item.repoId)
    }
  })
]
