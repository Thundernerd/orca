const OWNER_USER_LINE = /^Owner:\s*user\b/im

export function isOwnedByUser(body: string): boolean {
  return OWNER_USER_LINE.test(body)
}

// `triage`, `needs-triage`, `status: needs triage`, `untriaged`; never `triaged`, which is done.
const TRIAGE_WORD = /(^|[^a-z])(un)?triage(d?)([^a-z]|$)/i
const TRIAGE_LINE = /^\s*(?:status:\s*)?(?:needs[ -]?)?triage\s*$/im

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
