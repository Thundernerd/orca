import * as z from 'zod'
import { EXISTING_TICKET } from '../ticket-pipeline/ticket-draft-order'

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

const Id = z.string().trim().min(1).max(200)

export const TicketSourceConfigSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('auto') }),
  z.object({ kind: z.literal('github-issues') }),
  z.object({ kind: z.literal('linear'), workspaceId: Id, teamId: Id, teamKey: Id }),
  z.object({ kind: z.literal('jira'), siteId: Id, projectId: Id, projectKey: Id })
])

/** The sources a project can take its tickets from. */
export const TicketSourceOptions = z.object({ repo: Selector })

/** Reads a project's ticket settings; `patch` changes them first. */
export const TicketSettings = z.object({
  repo: Selector,
  patch: z
    .object({
      autoClean: z.boolean().optional(),
      autoMerge: z.boolean().optional(),
      source: TicketSourceConfigSchema.optional()
    })
    .optional()
})

/** The merge queue of a parent workspace (or the project's main one). */
export const TicketQueue = z.object(ScopeFields).refine(exactlyOneScope, scopeMessage)

/** What the merge queue and auto-clean are doing; reads local state only. */
export const TicketStatus = z.object(ScopeFields).refine(exactlyOneScope, scopeMessage)

/** Merges the head of a queue that is ready, on the user's say-so. */
export const TicketMerge = z.object({ itemId: z.string().min(1).max(200) })

const DraftKey = z.string().trim().min(1).max(100)
const TicketRef = z
  .string()
  .trim()
  .regex(EXISTING_TICKET, 'Existing tickets are named #<number> or KEY-<number>')
const Labels = z.array(z.string().trim().min(1).max(100)).max(20)

export const TicketDraftSchema = z.object({
  key: DraftKey,
  title: z.string().trim().min(1).max(256),
  body: z.string().max(60_000),
  labels: Labels.default([]),
  blockedBy: z
    .array(z.union([DraftKey, TicketRef]))
    .max(50)
    .default([]),
  covers: z.array(z.string().max(2000)).max(50).default([])
})

/** Starts a drafting agent in a parent workspace (or the project's main one). */
export const TicketDraftStart = z
  .object({ ...ScopeFields, request: z.string().trim().min(1).max(20_000) })
  .refine(exactlyOneScope, scopeMessage)

/** The drafting agent's hand-over; publishing waits for the user. */
export const TicketDraftSubmit = z.object({
  batchId: z.string().min(1).max(200),
  drafts: z.array(TicketDraftSchema).min(1).max(30),
  decisions: z.array(z.string().max(4000)).max(50).default([])
})

export const TicketDraftList = z.object({ repo: Selector.optional() })

/** Publishes the (possibly edited) drafts of a batch in review. */
export const TicketDraftPublish = z.object({
  batchId: z.string().min(1).max(200),
  drafts: z.array(TicketDraftSchema).min(1).max(30)
})

export const TicketDraftDiscard = z.object({ batchId: z.string().min(1).max(200) })

/** A finding an implementing agent publishes at once. */
export const TicketCreate = z.object({
  worktree: Selector,
  title: z.string().trim().min(1).max(256),
  body: z.string().max(60_000),
  labels: Labels.default([]),
  blockedBy: z.array(TicketRef).max(20).default([]),
  findingOf: z.string().trim().min(1).max(200).optional()
})
