import type { Ticket } from './ticket-types'

export type TicketBriefInput = {
  ticket: Pick<Ticket, 'id' | 'ref' | 'title'>
  /** A command that prints the ticket; null when it is a file in the checkout. */
  readCommand: string | null
  /** How the PR names the ticket so its tracker links it. */
  reviewRule: string
  /** A command that comments on the ticket, `<file>` holding the body; null when it is a file here. */
  commentCommand: string | null
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

/** The test-first work, checks and review every implementing brief asks for, local or cloud. */
export function ticketWorkLines(baseBranch: string): string[] {
  return [
    `- Use the /tdd skill. The ticket's "Seams under test" are agreed: build on them without asking. Work in vertical red→green slices.`,
    '- Run the type checker and the single test file you are working on as you go, and the full test suite once at the end.',
    `- When the acceptance criteria are met and the repo's checks pass, run /code-review with fixed point origin/${baseBranch} and the ticket as the spec. Fix what it finds, or leave it with a reason, or raise it as a finding when it is one (below).`
  ]
}

/** What counts as a finding, for every implementing brief. Each finding becomes a ticket whose agent
 *  finds more, so tidy-ups and judgement calls are kept out or the chain never ends. */
export const FINDING_DEFINITION =
  "- Findings: a finding is a real problem outside this ticket's scope: a bug, or a gap in behaviour, tests or docs. Problems in code this branch adds or changes are in scope: fix them here, however small, instead of handing them over. These are not findings, so hand none of them over and say in your report why you left each: a /code-review point you judged not worth fixing; a refactor or tidy-up with no bug behind it; a further pass over code a recent ticket already reworked."

export const TICKET_COMMIT_RULE =
  '- Write commit messages in Conventional Commits style; commits and the PR body carry no Claude attribution or Co-Authored-By lines.'

/** The prompt an implementing agent starts with; Corka itself tracks the PR, merge and clean-up. */
export function renderTicketBrief(input: TicketBriefInput): string {
  const { ticket, branch, baseBranch } = input
  const ticketName = input.readCommand ? `ticket ${ticket.id}` : ticket.ref
  const readTicket = input.readCommand ? ` (\`${input.readCommand}\`)` : ''
  const docs =
    input.agentDocs.length > 0 ? input.agentDocs.join(', ') : "the repo's contributing docs"
  // On a tracker, an agent per finding checks it against main and the open tickets before filing it.
  const findingSteps = input.findingsPublish
    ? [
        '  - Related to this ticket and small: fix it here, as its own commit on this branch.',
        `  - Bigger, or unrelated: hand it over, one finding at a time. Write it in the ticket format (Goal, Scope, Seams under test, Acceptance criteria), citing file:line as the code stands on main and marking code that exists only on your branch; decide design choices yourself, recommending one in the Goal with the alternatives in a line each; then run \`orca tickets finding --of "${ticket.id}" --title "<title>" --body-file <file>\`, adding \`--blocked-by "${ticket.id}"\` when it builds on code from this unmerged branch. Corka starts an agent that checks it against origin/${baseBranch} and the open tickets, files it only if it is new, and links its blockers.`
      ]
    : [
        `  - Already done: run \`git fetch origin\` and check origin/${baseBranch} itself, since other agents merge while you work. If it has it, file nothing.`,
        // Ticket files another agent opened sit on its branch until it merges, so the survey misses them.
        "  - Already ticketed: search the open tickets by concept, not by your wording, including ones opened after this branch started: `orca tickets survey --json`, and docs/tickets/ on other agents' branches (`git branch -r`, then `git grep -i <term> <branch> -- docs/tickets`). If one covers it, open nothing new: add what you found, and your design if it differs, to that ticket file in a commit here (if the file is only on another branch, put it in your report instead).",
        '  - Related to this ticket and small: fix it here, as its own commit on this branch.',
        '  - Bigger, or unrelated: open a new ticket that names this one: a new docs/tickets/<next free ID>-<slug>.md committed on this branch.'
      ]
  const findingOutcomes = input.findingsPublish
    ? 'fixed, with the commit; or handed over, with its title'
    : `done already, with where on origin/${baseBranch}; extended, with a link; fixed, with the commit; or filed, with a link`
  const prRule = input.reviewRule
  const recordOnTicket = input.commentCommand
    ? `comment on the ticket (\`${input.commentCommand}\`)`
    : `add a "## Resolution" section to ${ticket.ref} in a commit on this branch, and push it`
  const lines = [
    `Implement ${ticketName} in this worktree, on branch ${branch}.`,
    `Read the ticket in full${readTicket}, then ${docs} and any references the ticket lists. Commit there; leave merging and other worktrees to the user.`,
    `- Proof: if the ticket changes something that can be seen (a UI, a page, a command's output) and this environment lets you capture it, capture the before now, before you change anything: a screenshot, or the output as text.`,
    ...ticketWorkLines(baseBranch),
    FINDING_DEFINITION,
    '  Triage each finding yourself, in this order; the first that fits decides it:',
    ...findingSteps,
    '  - Unsure which: ask the user, running `orca worktree set --worktree active --unread --json` first so they see the question.',
    TICKET_COMMIT_RULE,
    `- When every fix is committed, push the branch (\`git push -u origin ${branch}\`) and open a PR to ${baseBranch}, writing its body with /pr, ${prRule}. Put the proof in its Evidence: the before, the same capture on this branch as the after, and the test runs that show it. Reference each screenshot by its local path in the body and pass it with \`--attach <path>\` to \`gh pr create\` (or \`gh pr edit\`), which uploads it; never commit them. If your \`gh\` has no \`--attach\`, list their paths in your report instead. Corka notices the PR and moves this workspace to review.`,
    `- Then ${recordOnTicket}: what changed and how, the PR link, and how to verify it.`,
    "- If you are blocked (a missing dependency, a spec you cannot resolve), run: orca worktree set --worktree active --unread --comment 'blocked: <why>' --json and stop.",
    `- Once the PR is up, report: the PR URL; every finding and its outcome (${findingOutcomes}); and each point you left, with why; if you built the project, the absolute paths of the build output and the concrete steps the user should test by hand; if the PR's CI uploads a build artifact, a link to that run and the \`gh run download\` command for it (wait for the run with \`gh run watch\` and report a failure).`
  ]
  if (input.untrackedContext.length > 0) {
    lines.push(
      'This repo keeps some agent context untracked, so it is not in your checkout. Read it from the source checkout:',
      ...input.untrackedContext.map((path) => `- ${path}`)
    )
  }
  return lines.join('\n')
}
