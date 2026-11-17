export type TicketFindingToCheck = { title: string; body: string; blockedBy: readonly string[] }

function findingBlock(finding: TicketFindingToCheck): string[] {
  return [
    '<finding>',
    `Title: ${finding.title}`,
    ...(finding.blockedBy.length > 0 ? [`Blocked by: ${finding.blockedBy.join(', ')}`] : []),
    '',
    finding.body,
    '</finding>'
  ]
}

/** The prompt for an agent that checks one ticket's findings, all in one session, and files each
 *  only when it is new. */
export function renderTicketFindingBrief(input: {
  findingOf: string
  findings: readonly TicketFindingToCheck[]
  /** The default branch name without its remote (`main`). */
  baseBranch: string
}): string {
  const { findingOf, findings, baseBranch } = input
  const only = findings.length === 1 ? findings[0] : null
  // One finding names its blockers outright; several each carry their own.
  const blockedByFlags = only
    ? only.blockedBy.map((id) => ` --blocked-by "${id}"`).join('')
    : ' and a `--blocked-by "<id>"` per blocker the finding names'
  return [
    only
      ? `Check one finding the agent implementing ticket ${findingOf} handed over, and file it as a ticket only if it is new. Implement nothing, and open no branch or PR. Other agents may be checking other findings in this workspace; touch only this one.`
      : `Check the ${findings.length} findings the agent implementing ticket ${findingOf} handed over, one at a time, and file each as a ticket only if it is new. Implement nothing, and open no branch or PR. Other agents may be checking other findings in this workspace; touch only these.`,
    only ? 'The finding as that agent wrote it:' : 'The findings as that agent wrote them:',
    ...findings.flatMap(findingBlock),
    only
      ? 'Work through these in order; the first that settles it ends the check:'
      : "Work through these in order for each finding; the first that settles it ends that finding's check:",
    `- Already done: run \`git fetch origin\` and check origin/${baseBranch} itself (its log and code), since other agents merge while you work. If it has it, file nothing.`,
    "- Already ticketed: search the open tickets by concept, not by the finding's wording (`orca tickets survey --json`), and read the likely ones in full in their tracker. If one covers it, file nothing: comment on it in its tracker with what was found, and the design if it differs.",
    `- New: update its file:line citations if origin/${baseBranch} has moved, write the body to a file, and run \`orca tickets create --finding-of "${findingOf}" --title "<title>" --body-file <file>${blockedByFlags}\`. Corka marks it for triage.`,
    '- Blockers, once filed: go through the open tickets again. When one cannot be built until the new ticket lands, run `orca tickets link --ticket <that ticket> --blocked-by <new ticket>`; when the new ticket needs another open ticket first, run `orca tickets link --ticket <new ticket> --blocked-by <that ticket>`. Link only real code dependencies, not overlapping topics.',
    "- If a decision needs the user, run `orca worktree set --worktree active --unread --comment 'finding: <question>' --json` first, then ask.",
    `- When done, report in a line or two${only ? '' : ' per finding'}: done already (where on origin/${baseBranch}), extended (with a link), or filed (with a link and the blockers you linked).`
  ].join('\n')
}
