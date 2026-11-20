import { routeTicketLaunch } from '../../shared/ticket-pipeline/ticket-launch-routing'
import type {
  TicketLaunchOutcome,
  TicketLaunchResult,
  TicketLaunchSelection,
  TicketSurveyRow
} from '../../shared/ticket-pipeline/ticket-types'

type GroupLauncher = (selections: readonly TicketLaunchSelection[]) => Promise<TicketLaunchResult>

/**
 * Launches each ticket where the survey says it runs: cloud tickets through `launchCloud`, then
 * local ones through `launchLocal`, skipping a group with no tickets, and reports every outcome in
 * the order asked. When both groups have tickets, a group that is refused as a whole (the checkout
 * off the default branch, say) fails only its own tickets; a launch of one group throws as before.
 */
export async function launchRoutedTickets(args: {
  selections: readonly TicketLaunchSelection[]
  rows: readonly TicketSurveyRow[]
  cloud: boolean
  launchCloud: GroupLauncher
  launchLocal: GroupLauncher
}): Promise<TicketLaunchResult> {
  const route = routeTicketLaunch(args.selections, args.rows, args.cloud)
  const groups = [
    { selections: route.cloud, launch: args.launchCloud },
    { selections: route.local, launch: args.launchLocal }
  ].filter((group) => group.selections.length > 0)

  const byId = new Map<string, TicketLaunchOutcome>()
  let result: TicketLaunchResult | undefined
  let firstRefusal: unknown
  for (const group of groups) {
    try {
      const groupResult = await group.launch(group.selections)
      result ??= groupResult
      for (const outcome of groupResult.outcomes) {
        byId.set(outcome.id, outcome)
      }
    } catch (error) {
      firstRefusal ??= error
      const reason = error instanceof Error ? error.message : String(error)
      for (const selection of group.selections) {
        byId.set(selection.id, { id: selection.id, status: 'failed', reason })
      }
    }
  }
  if (!result) {
    // Every group was refused, so the launch as a whole was: say why, as a single launch did.
    throw firstRefusal
  }
  const outcomes = args.selections.map((selection): TicketLaunchOutcome => {
    const outcome = byId.get(selection.id) ?? {
      id: selection.id,
      status: 'skipped',
      reason: 'It is no longer an open ticket.'
    }
    return outcome.status === 'launched' && route.keptLocal.has(selection.id)
      ? { ...outcome, keptLocal: 'ready-for-human' }
      : outcome
  })
  return { ...result, outcomes }
}
