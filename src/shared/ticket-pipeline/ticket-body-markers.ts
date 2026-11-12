const OWNER_USER_LINE = /^Owner:\s*user\b/im

export function isOwnedByUser(body: string): boolean {
  return OWNER_USER_LINE.test(body)
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
