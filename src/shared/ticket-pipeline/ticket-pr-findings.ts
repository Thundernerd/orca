/** A finding an agent outside Corka's reach lists in its PR body instead of handing it over. */
export type PRFinding = { title: string; body: string; blockedBy: string[] }

const SECTION = '## Findings'
const BLOCKED_BY = /^Blocked by:\s*(.+)$/im

/** How the agent writes them, for its brief; `parsePRFindings` reads exactly this shape. */
export function prFindingsFormat(ticketId: string): string {
  return `under a \`${SECTION}\` heading in the PR body, one \`### <title>\` per finding with its body below it, using \`####\` headings for the body's parts (the section ends at the next \`##\` heading), and a line \`Blocked by: ${ticketId}\` when it builds on code only on this branch`
}

/** The findings under the PR body's `## Findings` heading, up to the next `##` heading. */
export function parsePRFindings(body: string): PRFinding[] {
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === SECTION)
  if (start === -1) {
    return []
  }
  const end = lines.findIndex((line, i) => i > start && /^##\s/.test(line))
  const section = lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
  return section
    .split(/^###\s+/m)
    .slice(1)
    .flatMap((chunk) => {
      const [titleLine = '', ...rest] = chunk.split('\n')
      const title = titleLine.trim()
      let text = rest.join('\n')
      const blocked = BLOCKED_BY.exec(text)
      const blockedBy = blocked
        ? blocked[1]
            .split(/[\s,]+/)
            .map((id) => id.trim())
            .filter(Boolean)
        : []
      text = text.replace(BLOCKED_BY, '').trim()
      return title ? [{ title, body: text, blockedBy }] : []
    })
}
