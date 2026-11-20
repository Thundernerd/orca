const OWNER_USER_LINE = /^Owner:\s*user\b/im

export function isOwnedByUser(body: string): boolean {
  return OWNER_USER_LINE.test(body)
}

// `triage`, `needs-triage`, `status: needs triage`, `untriaged`; never `triaged`, which is done.
const TRIAGE_WORD = /(^|[^a-z])(un)?triage(d?)([^a-z]|$)/i
const TRIAGE_LINE = /^\s*(?:status:\s*)?(?:needs[ -]?)?triage\s*$/im

/** What Corka marks a filed finding with, so it waits for triage before anyone launches it. */
export const TRIAGE_BODY_LINE = 'Status: needs triage'
export const TRIAGE_LABEL = 'needs-triage'

/** A ticket waiting for someone to decide what it is: a triage label, state or body line. */
export function needsTriage(input: {
  labels: readonly string[]
  body?: string
  /** The tracker's workflow state name or type (Linear's `triage`, a Jira `Needs Triage`). */
  state?: string
}): boolean {
  const marked = (text: string) => {
    const match = TRIAGE_WORD.exec(text)
    return match !== null && (match[2] !== undefined || match[3] === '')
  }
  return (
    input.labels.some(marked) ||
    (input.state !== undefined && marked(input.state)) ||
    (input.body !== undefined && TRIAGE_LINE.test(input.body))
  )
}

/** The triage skill's label for a ticket specified well enough to run in a Claude cloud session. */
export const READY_FOR_AGENT_LABEL = 'ready-for-agent'
/** The triage skill's label for a ticket that likely needs a person, so it runs locally. */
export const READY_FOR_HUMAN_LABEL = 'ready-for-human'

/** Where a GitHub issue runs when launched: a Claude cloud session or a local ticket workspace. */
export type TicketRunsIn = 'cloud' | 'local'

/** Where a ticket's labels say it runs; undefined when neither label is set. Both labels mean
 *  local, the safe choice. Matching ignores case. */
export function ticketRunsIn(labels: readonly string[]): TicketRunsIn | undefined {
  const names = new Set(labels.map((label) => label.trim().toLowerCase()))
  if (names.has(READY_FOR_HUMAN_LABEL)) {
    return 'local'
  }
  return names.has(READY_FOR_AGENT_LABEL) ? 'cloud' : undefined
}

/** Issue numbers listed under a markdown `Blocked by` heading, up to the next heading. */
export function parseBlockedBySection(body: string): number[] {
  const numbers = new Set<number>()
  let inSection = false
  for (const line of body.split(/\r?\n/)) {
    if (/^#+\s*blocked by\b/i.test(line)) {
      inSection = true
      continue
    }
    if (line.startsWith('#')) {
      inSection = false
      continue
    }
    if (!inSection) {
      continue
    }
    for (const match of line.matchAll(/#(\d+)/g)) {
      numbers.add(Number(match[1]))
    }
  }
  return [...numbers]
}

/** Ticket-file ids on the first `Deps:` or `Blocked by:` line. */
export function parseTicketFileDeps(body: string): string[] {
  const line = body.split(/\r?\n/).find((l) => /^(Deps|Blocked by):/i.test(l))
  return line ? [...new Set(line.match(/[A-Z]+\d+/g) ?? [])] : []
}

/** The H1 title of a ticket file without its `T86:` prefix. */
export function parseTicketFileTitle(body: string): string {
  const first = body.split(/\r?\n/, 1)[0] ?? ''
  return first.replace(/^#\s*([A-Z]+\d+:\s*)?/, '').trim()
}

export const TICKET_FILE_NAME = /^([A-Z]+\d+)-[^/]*\.md$/

// An agent's draft often already opens with the lines Corka adds, so the filed body said them twice.
const FINDING_ORIGIN_LINE = /^\s*found while (implementing|checking|reviewing)\b.*$/i

/** A filed finding's body: where it was found and the triage line, each once, then the draft. */
export function findingIssueBody(findingOf: string, draft: string): string {
  const lines = draft.split(/\r?\n/)
  let start = 0
  while (
    start < lines.length &&
    (lines[start].trim() === '' ||
      FINDING_ORIGIN_LINE.test(lines[start]) ||
      TRIAGE_LINE.test(lines[start]))
  ) {
    start++
  }
  return [
    `Found while implementing ${findingOf}.`,
    '',
    TRIAGE_BODY_LINE,
    '',
    lines.slice(start).join('\n')
  ].join('\n')
}
