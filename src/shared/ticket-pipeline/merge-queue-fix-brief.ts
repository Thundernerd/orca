import type { TicketFixCause } from './ticket-types'

export type MergeQueueFixBriefInput = {
  cause: TicketFixCause
  prNumber: number
  baseBranch: string
  detail: string
  /** Failing checks with their run links, for a CI fix. */
  failingChecks: readonly { name: string; url: string | null }[]
  attributionLines: readonly string[]
}

/** The message typed into a ticket's agent when the merge queue needs it to fix its PR. */
export function renderMergeQueueFixBrief(input: MergeQueueFixBriefInput): string {
  const { prNumber, baseBranch } = input
  const lines = [
    `Corka's merge queue needs a fix on PR #${prNumber} before it can merge. ${input.detail}`
  ]
  switch (input.cause) {
    case 'ci':
      lines.push(
        'Failing checks:',
        ...input.failingChecks.map((c) => `- ${c.name}${c.url ? `: ${c.url}` : ''}`),
        `Read the failures (\`gh pr checks ${prNumber}\`, then \`gh run view <run id> --log-failed\`), fix the cause, and run the same checks locally before pushing.`
      )
      break
    case 'conflict':
      lines.push(
        `Merge origin/${baseBranch} into this branch (\`git fetch origin && git merge origin/${baseBranch}\`) and resolve the conflicts, keeping both sides' intent. Do not rebase or force-push. Run the repo's checks before pushing.`
      )
      break
    case 'attribution':
      lines.push(
        'These lines carry Claude attribution and must go:',
        ...input.attributionLines.map((l) => `- ${l}`),
        `Remove them from the PR body (\`gh pr edit ${prNumber} --body-file <file>\`) and reword the commits that have them, then push with \`git push --force-with-lease\`. This is the only case where rewriting pushed commits is fine.`
      )
      break
  }
  lines.push(
    'Write commit messages in Conventional Commits style, with no Claude attribution or Co-Authored-By lines. Push to the same branch; Corka notices the push and checks again.'
  )
  return lines.join('\n')
}
