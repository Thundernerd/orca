import type {
  TicketItem,
  TicketLaunchResult,
  TicketQueueView,
  TicketSurveyResult,
  WorkspaceCleanResult,
  WorkspaceCleanSurveyResult
} from '../../shared/ticket-pipeline/ticket-types'

export function formatLaunch(result: TicketLaunchResult): string {
  return result.outcomes
    .map((o) =>
      o.status === 'launched'
        ? `launched\t${o.id}\t${o.branch}`
        : `${o.status}\t${o.id}\t${o.reason}`
    )
    .join('\n')
}

export function formatItems(result: { items: TicketItem[] }): string {
  if (result.items.length === 0) {
    return 'No launched tickets.'
  }
  return result.items
    .map((item) =>
      [item.stage, item.ticketId, item.ticketTitle, item.reviewUrl ?? item.branch].join('\t')
    )
    .join('\n')
}

export function formatCleanSurvey(result: WorkspaceCleanSurveyResult): string {
  if (result.rows.length === 0) {
    return 'This workspace has no child workspaces.'
  }
  return [...result.rows]
    .sort((a, b) => (a.verdict === b.verdict ? 0 : a.verdict === 'remove' ? -1 : 1))
    .map((row) => [row.verdict, row.name, row.reason, row.worktreeId].join('\t'))
    .join('\n')
}

export function formatClean(result: WorkspaceCleanResult): string {
  if (result.outcomes.length === 0) {
    return 'Nothing to remove.'
  }
  return result.outcomes
    .map((o) =>
      o.status === 'removed'
        ? `removed\t${o.worktreeId}${o.branchLeftover ? `\tbranch ${o.branchLeftover} left: not fully merged` : ''}`
        : `kept\t${o.worktreeId}\t${o.reason}`
    )
    .join('\n')
}

export function formatQueue(view: TicketQueueView): string {
  const lines = [
    `auto-merge: ${view.autoMerge ? 'on' : 'off'}`,
    ...(view.pausedReason ? [`PAUSED: ${view.pausedReason}`] : [])
  ]
  if (view.entries.length === 0) {
    lines.push('No ticket PRs are waiting to merge.')
  }
  for (const entry of view.entries) {
    const pr = entry.reviewNumber ? `#${entry.reviewNumber}` : '-'
    const state = entry.queue ? `${entry.queue.status}: ${entry.queue.detail}` : 'waiting its turn'
    lines.push([entry.ticketId, pr, entry.ticketTitle, state].join('\t'))
  }
  return lines.join('\n')
}

export function formatSurvey(result: TicketSurveyResult): string {
  const lines = [`source: ${result.source} (${result.baseRef})`]
  for (const row of result.rows) {
    const waiting = row.waitingOn.length > 0 ? row.waitingOn.join(' ') : '-'
    lines.push([row.status, row.ticket.id, row.ticket.title, waiting].join('\t'))
  }
  if (result.rows.length === 0) {
    lines.push('No open tickets.')
  }
  return lines.join('\n')
}
