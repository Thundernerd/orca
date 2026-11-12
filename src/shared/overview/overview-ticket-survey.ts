import type { TicketSurveyRow } from '../ticket-pipeline/ticket-types'

export type OverviewTicketCounts = {
  ready: number
  blocked: number
  launched: number
  owned: number
  claimed: number
  readyTitles: string[]
  fetchedAt: number
  error: string | null
}

export function countTicketSurvey(
  rows: readonly TicketSurveyRow[],
  now: number
): OverviewTicketCounts {
  const counts: OverviewTicketCounts = {
    ready: 0,
    blocked: 0,
    launched: 0,
    owned: 0,
    claimed: 0,
    readyTitles: [],
    fetchedAt: now,
    error: null
  }
  for (const row of rows) {
    counts[row.status] += 1
    if (row.status === 'ready') {
      counts.readyTitles.push(`${row.ticket.id} ${row.ticket.title}`.trim())
    }
  }
  return counts
}

/** Keeps the last good counts on a failed survey so the card does not blank out. */
export function failedTicketSurvey(
  error: string,
  now: number,
  previous: OverviewTicketCounts | null
): OverviewTicketCounts {
  return previous
    ? { ...previous, error, fetchedAt: now }
    : {
        ready: 0,
        blocked: 0,
        launched: 0,
        owned: 0,
        claimed: 0,
        readyTitles: [],
        fetchedAt: now,
        error
      }
}
