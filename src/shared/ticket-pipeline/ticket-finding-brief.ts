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
    `- Already ticketed: search by concept, not by the finding's wording: the open tickets (\`orca tickets survey --json\`), the tickets closed in the last two weeks in the tracker, and every ticket already filed as a finding of ${findingOf} or of the tickets it was itself found while implementing (follow each "Found while implementing" line up). Read the likely ones in full. If an open one covers it, file nothing: comment on it in its tracker with what was found, and the design if it differs. If a closed one settled it, done or declined, file nothing.`,
    `- Not a finding: file nothing when it is a problem in code that exists only on ${findingOf}'s unmerged branch (comment it on that branch's PR instead, so it is fixed there); a /code-review point or design preference with no bug behind it; or a refactor or tidy-up of code that ${findingOf} or the tickets it was found while implementing already reworked. Each finding becomes a ticket whose agent hands over more, so these keep a chain of near-identical tickets going.`,
    `- New: update its file:line citations if origin/${baseBranch} has moved, write the body to a file, and run \`orca tickets create --finding-of "${findingOf}" --title "<title>" --body-file <file>${blockedByFlags}\`. Corka marks it for triage.`,
    '- Blockers, once filed: go through the open tickets again. When one cannot be built until the new ticket lands, run `orca tickets link --ticket <that ticket> --blocked-by <new ticket>`; when the new ticket needs another open ticket first, run `orca tickets link --ticket <new ticket> --blocked-by <that ticket>`. Link only real code dependencies, not overlapping topics.',
    "- If a decision needs the user, run `orca worktree set --worktree active --unread --comment 'finding: <question>' --json` first, then ask.",
    `- When done, report in a line or two${only ? '' : ' per finding'}: done already (where on origin/${baseBranch}), extended (with a link), settled already (with a link), not a finding (with why), or filed (with a link and the blockers you linked).`
  ].join('\n')
}
