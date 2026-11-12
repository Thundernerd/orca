import * as z from 'zod'

const Selector = z.string().trim().min(1).max(4096)

/** Survey from a parent workspace (`worktree`) or for a whole project (`repo`). */
export const TicketSurvey = z
  .object({
    worktree: Selector.optional(),
    repo: Selector.optional(),
    source: z.enum(['github-issues', 'repo-files']).optional()
  })
  .refine((params) => (params.worktree === undefined) !== (params.repo === undefined), {
    message: 'Pass exactly one of worktree or repo'
  })

const ConventionalTypeParam = z.enum([
  'feat',
  'fix',
  'refactor',
  'perf',
  'test',
  'docs',
  'build',
  'ci',
  'chore'
])

/** Launch confirmed tickets from a parent workspace, or from the project's main workspace. */
export const TicketLaunch = z
  .object({
    worktree: Selector.optional(),
    repo: Selector.optional(),
    source: z.enum(['github-issues', 'repo-files']).optional(),
    tickets: z
      .array(z.object({ id: z.string().min(1).max(200), type: ConventionalTypeParam.optional() }))
      .min(1)
      .max(50)
  })
  .refine((params) => (params.worktree === undefined) !== (params.repo === undefined), {
    message: 'Pass exactly one of worktree or repo'
  })

export const TicketItemsList = z.object({ repo: Selector.optional() })
