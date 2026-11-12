import {
  TicketItemsList,
  TicketLaunch,
  TicketSurvey
} from '../../../../../shared/rpc-contract/ticket-params'
import { getTicketItemStore } from '../../../../ticket-pipeline/ticket-item-store'
import { launchTickets } from '../../../../ticket-pipeline/ticket-launch'
import { surveyTickets } from '../../../../ticket-pipeline/ticket-survey'
import { startTicketTracker } from '../../../../ticket-pipeline/ticket-tracker'
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
  })
]
