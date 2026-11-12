import {
  TicketClean,
  TicketCleanSurvey,
  TicketItemsList,
  TicketLaunch,
  TicketSettings,
  TicketSurvey
} from '../../../../../shared/rpc-contract/ticket-params'
import { getTicketItemStore } from '../../../../ticket-pipeline/ticket-item-store'
import { launchTickets } from '../../../../ticket-pipeline/ticket-launch'
import { surveyTickets } from '../../../../ticket-pipeline/ticket-survey'
import { startTicketTracker } from '../../../../ticket-pipeline/ticket-tracker'
import {
  cleanWorkspaces,
  surveyWorkspaceClean,
  type WorkspaceCleanScope
} from '../../../../ticket-pipeline/workspace-clean'
import { defineMethod } from '../../core'

function cleanScope(params: { worktree?: string; repo?: string }): WorkspaceCleanScope {
  return params.worktree !== undefined ? { worktree: params.worktree } : { repo: params.repo ?? '' }
}

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
    handler: async (params, { runtime }) => surveyWorkspaceClean(runtime, cleanScope(params))
  }),
  defineMethod({
    name: 'tickets.clean',
    permission: 'workspace',
    params: TicketClean,
    handler: async (params, context) =>
      cleanWorkspaces(context, cleanScope(params), params.worktreeIds)
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
  })
]
