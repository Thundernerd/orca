import type { Ticket } from './ticket-types'

/** The prompt for an agent that triages one ticket with the project's triage skill, implementing nothing. */
export function renderTicketTriageBrief(input: {
  ticket: Pick<Ticket, 'id' | 'title'>
  /** How to read it: its read command in backticks, or the ticket file's path. */
  read: string
  skill: string
}): string {
  const { ticket } = input
  return [
    `Triage ticket ${ticket.id} (${ticket.title}) with the /${input.skill} skill. Read it in full first: ${input.read}.`,
    '- Triage only: implement nothing, and open no branch or PR. Other agents may be triaging other tickets in this workspace; touch only this one.',
    '- Leave the ticket in the state the skill decides; once it is ready to build, it should no longer carry a triage label or marker, so Corka can launch it.',
    "- If a decision needs the user, run `orca worktree set --worktree active --unread --comment 'triage: <question>' --json` first, then ask.",
    '- When done, report the outcome in a line or two.'
  ].join('\n')
}
