import { FINDING_DEFINITION, TICKET_COMMIT_RULE, ticketWorkLines } from './ticket-brief'
import { prFindingsFormat } from './ticket-pr-findings'
import type { Ticket } from './ticket-types'

/** What `orca tickets brief` returns: the brief, and the branch it names. */
export type CloudTicketBrief = { ticketId: string; branch: string; claimed: boolean; brief: string }

export type CloudTicketBriefInput = {
  ticket: Pick<Ticket, 'id' | 'title'>
  /** The ticket's text: a cloud session may have no tracker CLI to read it with. */
  ticketBody: string
  /** How the PR names the ticket so its tracker links it. */
  reviewRule: string
  branch: string
  /** The default branch name without its remote (`main`). */
  baseBranch: string
  /** Agent docs the repo has, e.g. `AGENTS.md`, `CLAUDE.md`. */
  agentDocs: readonly string[]
}

/** The prompt for a Claude cloud session: no Corka CLI there, so findings and questions go in the
 *  PR and the session, and Corka adopts the PR into its merge queue. */
export function renderCloudTicketBrief(input: CloudTicketBriefInput): string {
  const { ticket, branch, baseBranch } = input
  const docs =
    input.agentDocs.length > 0 ? input.agentDocs.join(', ') : "the repo's contributing docs"
  return [
    `Implement ticket ${ticket.id} (${ticket.title}) on a new branch named exactly \`${branch}\`, created from origin/${baseBranch}.`,
    `The ticket's text is below; it is the spec. Read ${docs} and any references the ticket lists.`,
    "- Proof: if the ticket changes something that can be seen (a page, a command's output) and you can capture it here, capture the before now, before you change anything.",
    ...ticketWorkLines(baseBranch),
    FINDING_DEFINITION,
    `  Related to this ticket and small: fix it here, as its own commit. Otherwise do not fix it: list it ${prFindingsFormat(ticket.id)}. Write each in the ticket format (Goal, Scope, Seams under test, Acceptance criteria), citing file:line as the code stands on origin/${baseBranch}. Corka checks each against origin/${baseBranch} and the open tickets and files only the new ones.`,
    TICKET_COMMIT_RULE,
    `- When every fix is committed, push the branch and open a PR to ${baseBranch}, writing its body with /pr, ${input.reviewRule}. Put the proof in its Evidence: the before, the after on this branch, and the test runs that show it. Do not merge it: Corka's merge queue merges it.`,
    '- If you are blocked (a missing dependency, a spec you cannot resolve) or a decision needs the user, say so in this session and stop instead of guessing.',
    '- Once the PR is up, report the PR URL, each finding you listed, and each point you left, with why.',
    '',
    'The ticket:',
    '',
    '---',
    '',
    input.ticketBody.trim()
  ].join('\n')
}
