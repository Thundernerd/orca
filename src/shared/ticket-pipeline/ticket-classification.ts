import type { Ticket, TicketSurveyRow } from './ticket-types'

/** The fields of an existing workspace that reveal which ticket it was launched for. */
export type TicketWorkspaceSignature = {
  worktreeId: string
  linkedIssue: number | null
  /** A linked Linear issue or Jira key (`ENG-12`). */
  linkedKey: string | null
  displayName: string
  branch: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findLaunchedWorkspace(
  ticket: Ticket,
  workspaces: readonly TicketWorkspaceSignature[]
): TicketWorkspaceSignature | undefined {
  // `issue-<n>-` is how launches named workspaces before `gh-<n>-`.
  const tokens =
    ticket.issueNumber === null ? [ticket.slugId] : [ticket.slugId, `issue-${ticket.issueNumber}`]
  const pattern = new RegExp(`(^|[-/])(${tokens.map(escapeRegExp).join('|')})-`, 'i')
  return workspaces.find(
    (w) =>
      (ticket.issueNumber !== null && w.linkedIssue === ticket.issueNumber) ||
      w.linkedKey?.toUpperCase() === ticket.id.toUpperCase() ||
      pattern.test(w.displayName) ||
      pattern.test(w.branch.replace(/^refs\/heads\//, ''))
  )
}

/** Decide, for each open ticket, whether it can be launched now. Precedence matches the survey skills. */
export function classifyTickets(
  tickets: readonly Ticket[],
  doneIds: ReadonlySet<string>,
  workspaces: readonly TicketWorkspaceSignature[]
): TicketSurveyRow[] {
  return tickets.map((ticket) => {
    const launched = findLaunchedWorkspace(ticket, workspaces)
    if (launched) {
      return { status: 'launched', ticket, waitingOn: [], worktreeId: launched.worktreeId }
    }
    if (ticket.ownedByUser) {
      return { status: 'owned', ticket, waitingOn: [] }
    }
    if (ticket.assignees.length > 0) {
      return { status: 'claimed', ticket, waitingOn: [...ticket.assignees] }
    }
    const open = ticket.blockerIds.filter((id) => !doneIds.has(id))
    return open.length > 0
      ? { status: 'blocked', ticket, waitingOn: open }
      : { status: 'ready', ticket, waitingOn: [] }
  })
}
