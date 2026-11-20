import type { z } from 'zod'
import type { TicketLaunch } from '../../shared/rpc-contract/ticket-params'
import type { TicketLaunchResult } from '../../shared/ticket-pipeline/ticket-types'
import type { RpcContext } from '../runtime/rpc/core'
import { launchCloudTickets } from './ticket-cloud-launch'
import { launchTickets } from './ticket-launch'
import { launchRoutedTickets } from './ticket-launch-routed'
import { resolveTicketParentSelector, ticketParentScope } from './ticket-parent-workspace'
import { surveyTicketsWithSource } from './ticket-survey'

/** A `tickets.launch` request: one survey says where each ticket runs, by its `ready-for-agent` /
 *  `ready-for-human` label or else the request's cloud switch, and serves both launchers. */
export async function launchRequestedTickets(
  context: RpcContext,
  params: z.infer<typeof TicketLaunch>
): Promise<TicketLaunchResult> {
  const parent = await context.runtime.showManagedWorktree(
    await resolveTicketParentSelector(context.runtime, ticketParentScope(params))
  )
  const parentWorktree = `id:${parent.id}`
  const survey = await surveyTicketsWithSource(
    context.runtime,
    { worktree: parentWorktree },
    params.source
  )
  return launchRoutedTickets({
    selections: params.tickets,
    rows: survey.result.rows,
    cloud: params.cloud === true,
    launchCloud: (tickets) =>
      launchCloudTickets(context.runtime, { worktree: parentWorktree }, tickets, survey),
    launchLocal: (tickets) =>
      launchTickets(context, {
        parentWorktree,
        ...(params.source ? { source: params.source } : {}),
        tickets,
        survey
      })
  })
}
