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

const ScopeFields = { worktree: Selector.optional(), repo: Selector.optional() }
const exactlyOneScope = (params: { worktree?: string; repo?: string }) =>
  (params.worktree === undefined) !== (params.repo === undefined)
const scopeMessage = { message: 'Pass exactly one of worktree or repo' }

/** Children of a parent workspace (or the project's main one) that are safe to remove. */
export const TicketCleanSurvey = z.object(ScopeFields).refine(exactlyOneScope, scopeMessage)

export const TicketClean = z
  .object({ ...ScopeFields, worktreeIds: z.array(z.string().min(1).max(4096)).min(1).max(200) })
  .refine(exactlyOneScope, scopeMessage)

/** Reads a project's ticket settings; `patch` changes them first. */
export const TicketSettings = z.object({
  repo: Selector,
  patch: z.object({ autoClean: z.boolean().optional() }).optional()
})
