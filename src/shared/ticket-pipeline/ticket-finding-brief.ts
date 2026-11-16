/** The prompt for an agent that checks one finding and files it only when it is new. */
export function renderTicketFindingBrief(input: {
  findingOf: string
  title: string
  body: string
  blockedBy: readonly string[]
  /** The default branch name without its remote (`main`). */
  baseBranch: string
}): string {
  const { findingOf, baseBranch } = input
  const blockedByFlags = input.blockedBy.map((id) => ` --blocked-by "${id}"`).join('')
  return [
    `Check one finding the agent implementing ticket ${findingOf} handed over, and file it as a ticket only if it is new. Implement nothing, and open no branch or PR. Other agents may be checking other findings in this workspace; touch only this one.`,
    'The finding as that agent wrote it:',
    '<finding>',
    `Title: ${input.title}`,
    ...(input.blockedBy.length > 0 ? [`Blocked by: ${input.blockedBy.join(', ')}`] : []),
    '',
    input.body,
    '</finding>',
    'Work through these in order; the first that settles it ends the check:',
    `- Already done: run \`git fetch origin\` and check origin/${baseBranch} itself (its log and code), since other agents merge while you work. If it has it, file nothing.`,
    "- Already ticketed: search the open tickets by concept, not by the finding's wording (`orca tickets survey --json`), and read the likely ones in full in their tracker. If one covers it, file nothing: comment on it in its tracker with what was found, and the design if it differs.",
    `- New: update its file:line citations if origin/${baseBranch} has moved, write the body to a file, and run \`orca tickets create --finding-of "${findingOf}" --title "<title>" --body-file <file>${blockedByFlags}\`. Corka marks it for triage.`,
    '- Blockers, once filed: go through the open tickets again. When one cannot be built until the new ticket lands, run `orca tickets link --ticket <that ticket> --blocked-by <new ticket>`; when the new ticket needs another open ticket first, run `orca tickets link --ticket <new ticket> --blocked-by <that ticket>`. Link only real code dependencies, not overlapping topics.',
    "- If a decision needs the user, run `orca worktree set --worktree active --unread --comment 'finding: <question>' --json` first, then ask.",
    `- When done, report in a line or two: done already (where on origin/${baseBranch}), extended (with a link), or filed (with a link and the blockers you linked).`
  ].join('\n')
}
