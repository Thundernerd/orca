import type { Ticket } from './ticket-types'

export type TicketToTriage = {
  ticket: Pick<Ticket, 'id' | 'title'>
  /** How to read it: its read command in backticks, or the ticket file's path. */
  read: string
}

/** The prompt for an agent that triages one or more tickets with the project's triage skill, one
 *  at a time, implementing nothing. Several share one session so the repo docs load once. */
export function renderTicketTriageBrief(input: {
  tickets: readonly TicketToTriage[]
  skill: string
}): string {
  const only = input.tickets.length === 1 ? input.tickets[0] : null
  return [
    only
      ? `Triage ticket ${only.ticket.id} (${only.ticket.title}) with the /${input.skill} skill. Read it in full first: ${only.read}.`
      : `Triage these ${input.tickets.length} tickets with the /${input.skill} skill, one at a time and in this order, reading each in full before you start on it:`,
    ...(only
      ? []
      : input.tickets.map(({ ticket, read }) => `  - ${ticket.id} (${ticket.title}): ${read}`)),
    `- Triage only: implement nothing, and open no branch or PR. Other agents may be triaging other tickets in this workspace; touch only ${only ? 'this one' : 'these'}.`,
    `- Leave ${only ? 'the ticket' : 'each ticket'} in the state the skill decides; once it is ready to build, it should no longer carry a triage label or marker, so Corka can launch it.`,
    "- If a decision needs the user, run `orca worktree set --worktree active --unread --comment 'triage: <question>' --json` first, then ask.",
    only
      ? '- When done, report the outcome in a line or two.'
      : '- Report each outcome in a line or two as you finish that ticket, and list all of them at the end.'
  ].join('\n')
}
