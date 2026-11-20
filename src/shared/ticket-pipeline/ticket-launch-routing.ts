import type { TicketLaunchSelection, TicketSurveyRow } from './ticket-types'

/** A launch request split by where each ticket runs. */
export type TicketLaunchRoute = {
  cloud: TicketLaunchSelection[]
  local: TicketLaunchSelection[]
  /** Tickets asked for in the cloud that run locally because they are `ready-for-human`. */
  keptLocal: Set<string>
}

/**
 * Splits a launch by the survey's answer for each ticket: a labelled GitHub issue goes where its
 * label says, and only the rest follow the request's cloud switch. A ticket the survey no longer
 * has follows the switch too, so that launcher reports it as skipped.
 */
export function routeTicketLaunch(
  selections: readonly TicketLaunchSelection[],
  rows: readonly TicketSurveyRow[],
  cloud: boolean
): TicketLaunchRoute {
  const runsIn = new Map(rows.map((row) => [row.ticket.id, row.runsIn]))
  const route: TicketLaunchRoute = { cloud: [], local: [], keptLocal: new Set() }
  for (const selection of selections) {
    const where = runsIn.get(selection.id) ?? (cloud ? 'cloud' : 'local')
    route[where].push(selection)
    if (cloud && where === 'local') {
      route.keptLocal.add(selection.id)
    }
  }
  return route
}

/** Whether the cloud switch decides any of the selected tickets: labelled ones go where their label says. */
export function cloudSwitchDecides(selected: readonly Pick<TicketSurveyRow, 'runsIn'>[]): boolean {
  return selected.length === 0 || selected.some((row) => !row.runsIn)
}
