import type { Ticket } from './ticket-types'

export type TicketBriefInput = {
  ticket: Pick<Ticket, 'id' | 'ref' | 'title'>
  /** A command that prints the ticket; null when it is a file in the checkout. */
  readCommand: string | null
  /** How the PR names the ticket so its tracker links it. */
  reviewRule: string
  /** Findings become tickets published at once; otherwise they are ticket files committed here. */
  findingsPublish: boolean
  branch: string
  /** The default branch name without its remote (`main`). */
  baseBranch: string
  /** Agent docs the repo has, e.g. `AGENTS.md`, `CLAUDE.md`. */
  agentDocs: readonly string[]
  /** Untracked agent context in the parent checkout, as absolute paths. */
  untrackedContext: readonly string[]
}

/** The prompt an implementing agent starts with; Corka itself tracks the PR, merge and clean-up. */
export function renderTicketBrief(input: TicketBriefInput): string {
  const { ticket, branch, baseBranch } = input
  const ticketName = input.readCommand ? `ticket ${ticket.id}` : ticket.ref
  const readTicket = input.readCommand ? ` (\`${input.readCommand}\`)` : ''
  const docs =
    input.agentDocs.length > 0 ? input.agentDocs.join(', ') : "the repo's contributing docs"
  // Findings publish at once: the user reviews them when choosing what to launch.
  const newTicket = input.findingsPublish
    ? `a ticket: write it in the ticket format (Goal, Scope, Seams under test, Acceptance criteria), citing file:line as the code stands on main and marking code that exists only on your branch; decide design choices yourself, recommending one in the Goal with the alternatives in a line each; then run \`orca tickets create --finding-of "${ticket.id}" --title "<title>" --body-file <file>\`, adding \`--blocked-by "${ticket.id}"\` when it builds on code from this unmerged branch`
    : 'a new docs/tickets/<next free ID>-<slug>.md committed on this branch'
  // Ticket files another agent opened sit on its branch until it merges, so the survey misses them.
  const searchTickets = input.findingsPublish
    ? '`orca tickets survey --json`'
    : "`orca tickets survey --json`, and docs/tickets/ on other agents' branches (`git branch -r`, then `git grep -i <term> <branch> -- docs/tickets`)"
  const extendTicket = input.findingsPublish
    ? 'comment on it in its tracker with what you found, and your design if it differs'
    : 'add what you found, and your design if it differs, to that ticket file in a commit here (if the file is only on another branch, put it in your report instead)'
  const parkingLabel = input.findingsPublish ? ' (`--label <name>`)' : ''
  const prRule = input.reviewRule
  const lines = [
    `Implement ${ticketName} in this worktree, on branch ${branch}.`,
    `Read the ticket in full${readTicket}, then ${docs} and any references the ticket lists. Commit there; leave merging and other worktrees to the user.`,
    `- Use the /tdd skill. The ticket's "Seams under test" are agreed: build on them without asking. Work in vertical red→green slices.`,
    '- Run the type checker and the single test file you are working on as you go, and the full test suite once at the end.',
    `- When the acceptance criteria are met and the repo's checks pass, run /code-review with fixed point origin/${baseBranch} and the ticket as the spec. Fix what it finds or raise it as a finding (below).`,
    "- Findings: a finding is a problem outside this ticket's scope (a bug, gap, follow-up, or a /code-review point you did not fix). Triage each one yourself, in this order; the first that fits decides it:",
    `  - Already done: run \`git fetch origin\` and check origin/${baseBranch} itself, since other agents merge while you work. If it has it, file nothing.`,
    `  - Already ticketed: search the open tickets by concept, not by your wording, including ones opened after this branch started: ${searchTickets}. If one covers it, open nothing new: ${extendTicket}.`,
    '  - Related to this ticket and small: fix it here, as its own commit on this branch.',
    `  - Bigger, or unrelated: open a new ticket that names this one: ${newTicket}. If ${docs} set a roadmap or build order and the finding does not serve its current step, park it: give it the parking label they name${parkingLabel} and a line saying what it waits for.`,
    '  - Unsure which: ask the user, running `orca worktree set --worktree active --unread --json` first so they see the question.',
    '- Write commit messages in Conventional Commits style; commits and the PR body carry no Claude attribution or Co-Authored-By lines.',
    `- When every fix is committed, push the branch (\`git push -u origin ${branch}\`) and open a PR to ${baseBranch}, writing its body with /pr, ${prRule}. Corka notices the PR and moves this workspace to review.`,
    "- If you are blocked (a missing dependency, a spec you cannot resolve), run: orca worktree set --worktree active --unread --comment 'blocked: <why>' --json and stop.",
    `- Once the PR is up, report: the PR URL; every finding and its outcome (done already, with where on origin/${baseBranch}; extended, with a link; fixed, with the commit; filed, with a link; or parked, with a link); if you built the project, the absolute paths of the build output and the concrete steps the user should test by hand; if the PR's CI uploads a build artifact, a link to that run and the \`gh run download\` command for it (wait for the run with \`gh run watch\` and report a failure).`
  ]
  if (input.untrackedContext.length > 0) {
    lines.push(
      'This repo keeps some agent context untracked, so it is not in your checkout. Read it from the source checkout:',
      ...input.untrackedContext.map((path) => `- ${path}`)
    )
  }
  return lines.join('\n')
}
