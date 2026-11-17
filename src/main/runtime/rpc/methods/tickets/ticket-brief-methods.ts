import { TicketBrief } from '../../../../../shared/rpc-contract/ticket-params'
import { cloudTicketBrief } from '../../../../ticket-pipeline/ticket-cloud-brief-command'
import { ticketParentScope } from '../../../../ticket-pipeline/ticket-parent-workspace'
import { defineMethod } from '../../core'

/** The brief a Claude cloud session starts a ticket with; Corka adopts the PR it opens. */
export const TICKET_BRIEF_METHODS = [
  defineMethod({
    name: 'tickets.brief',
    permission: 'workspace',
    params: TicketBrief,
    handler: async (params, { runtime }) =>
      cloudTicketBrief(runtime, ticketParentScope(params), {
        ticket: params.ticket,
        type: params.type,
        claim: params.claim
      })
  })
]
