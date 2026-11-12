import type { TicketSourceConfig } from './ticket-types'

/** A short, stable name for a source: `auto`, `github-issues`, `linear:ENG`, `jira:OPS`. */
export function ticketSourceKey(source: TicketSourceConfig): string {
  switch (source.kind) {
    case 'linear':
      return `linear:${source.teamKey}`
    case 'jira':
      return `jira:${source.projectKey}`
    case 'auto':
    case 'github-issues':
      return source.kind
  }
}
