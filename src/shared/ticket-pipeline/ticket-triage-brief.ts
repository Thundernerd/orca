import type { Ticket } from './ticket-types'

/** The prompt for an agent that triages one ticket with the project's triage skill, implementing nothing. */
export function renderTicketTriageBrief(input: {
  ticket: Pick<Ticket, 'id' | 'ref' | 'title'>
  skill: string
  /** A command that prints the ticket; null when it is a file in the checkout. */
  readCommand: string | null
}): string {
  const { ticket } = input
  const read = input.readCommand ? `\`${input.readCommand}\`` : ticket.ref
  return [
    `Triage ticket ${ticket.id} (${ticket.title}) with the /${input.skill} skill. Read it in full first: ${read}.`,
    '- Triage only: do not implement it, and open no branch or PR.',
    '- Leave the ticket in the state the skill decides; once it is ready to build, it should no longer carry a triage label or marker, so Corka can launch it.',
    "- If a decision needs the user, run `orca worktree set --worktree active --unread --comment 'triage: <question>' --json` first, then ask.",
    '- When done, report the outcome in a line or two.'
  ].join('\n')
}
