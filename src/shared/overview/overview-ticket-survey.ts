// Parses the TSV the launch-tickets skill's survey.sh prints:
//   source: <issues|files> (<main>)
//   <status>\t<id>\t<title>\t<blockers>\t<ref>

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

const STATUSES = ['ready', 'blocked', 'launched', 'owned', 'claimed'] as const
type SurveyStatus = (typeof STATUSES)[number]

function isSurveyStatus(value: string): value is SurveyStatus {
  return STATUSES.some((status) => status === value)
}

export function parseTicketSurvey(stdout: string, now: number): OverviewTicketCounts {
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
  for (const line of stdout.split('\n')) {
    const [status, id, title] = line.split('\t')
    if (!status || !isSurveyStatus(status)) {
      continue
    }
    counts[status] += 1
    if (status === 'ready' && id) {
      counts.readyTitles.push(`${id} ${title ?? ''}`.trim())
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
