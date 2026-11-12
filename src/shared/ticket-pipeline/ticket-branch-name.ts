import type { ConventionalType, Ticket } from './ticket-types'

const MAX_TITLE_SLUG = 40

const LABEL_TYPES: readonly [RegExp, ConventionalType][] = [
  [/\b(bug|regression|crash|defect)\b/i, 'fix'],
  [/\bperf(ormance)?\b/i, 'perf'],
  [/\brefactor(ing)?\b/i, 'refactor'],
  [/\b(docs?|documentation)\b/i, 'docs'],
  [/\btests?\b/i, 'test'],
  [/\bci\b/i, 'ci'],
  [/\b(build|dependencies|deps)\b/i, 'build'],
  [/\bchore\b/i, 'chore']
]

/** The Conventional Commits type a ticket's main commit likely takes; `feat` when no label says otherwise. */
export function conventionalTypeForTicket(ticket: Pick<Ticket, 'labels'>): ConventionalType {
  for (const [pattern, type] of LABEL_TYPES) {
    if (ticket.labels.some((label) => pattern.test(label))) {
      return type
    }
  }
  return 'feat'
}

export function slugifyTicketTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.slice(0, MAX_TITLE_SLUG).replace(/-+$/, '')
}

/** `<type>/<slugId>-<title slug>`: the survey recognises a launched ticket by its slugId in the branch. */
export function ticketBranchName(
  ticket: Pick<Ticket, 'slugId' | 'title'>,
  type: ConventionalType
): string {
  const title = slugifyTicketTitle(ticket.title)
  return title ? `${type}/${ticket.slugId}-${title}` : `${type}/${ticket.slugId}`
}
