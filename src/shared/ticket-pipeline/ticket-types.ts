import type { WorkspaceCleanReason } from './workspace-clean-verdict'

export type TicketSourceKind = 'github-issues' | 'repo-files'

/** A ticket as its tracker reports it, before readiness is decided. */
export type Ticket = {
  /** Display id: `#12` for issues, `T86` for repo files. */
  id: string
  /** Lower-case token a launched branch or workspace name carries: `gh-12`, `t86`. */
  slugId: string
  title: string
  url: string | null
  /** Issue number, or the ticket file's path on the default branch. */
  ref: string
  issueNumber: number | null
  assignees: string[]
  /** `Owner: user` marks a ticket the user keeps for themselves. */
  ownedByUser: boolean
  /** Ids of the tickets this one waits on (`#12` or `T12`). */
  blockerIds: string[]
  /** Tracker labels; pick the branch's Conventional Commits type. */
  labels: string[]
}

export type TicketSurveyStatus = 'ready' | 'blocked' | 'launched' | 'owned' | 'claimed'

export type TicketSurveyRow = {
  status: TicketSurveyStatus
  ticket: Ticket
  /** Unfinished blockers for `blocked`, assignees for `claimed`, else empty. */
  waitingOn: string[]
  /** The existing workspace for `launched`. */
  worktreeId?: string
}

export type TicketSurveyResult = {
  source: TicketSourceKind
  baseRef: string
  /** Null for a project-wide survey. */
  parentWorktreeId: string | null
  rows: TicketSurveyRow[]
}

export const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'refactor',
  'perf',
  'test',
  'docs',
  'build',
  'ci',
  'chore'
] as const
export type ConventionalType = (typeof CONVENTIONAL_TYPES)[number]

export type TicketLaunchSelection = {
  /** The ticket id the survey reported (`#12`, `T86`). */
  id: string
  type?: ConventionalType
}

export type TicketLaunchOutcome =
  | { id: string; status: 'launched'; itemId: string; worktreeId: string; branch: string }
  | { id: string; status: 'skipped'; reason: string }
  | { id: string; status: 'failed'; reason: string; worktreeId?: string }

export type TicketLaunchResult = {
  source: TicketSourceKind
  parentWorktreeId: string
  outcomes: TicketLaunchOutcome[]
}

/**
 * Where a launched ticket stands. The merge queue arrives in a later phase;
 * `agent-waiting` means the agent stopped for the user (a question, a permission, or blocked).
 */
export type TicketItemStage =
  | 'implementing'
  | 'agent-waiting'
  | 'in-review'
  | 'merged'
  | 'closed'
  /** Merged, and its workspace has been removed. */
  | 'cleaned'

export type TicketItem = {
  id: string
  repoId: string
  parentWorktreeId: string
  childWorktreeId: string
  source: TicketSourceKind
  ticketId: string
  ticketTitle: string
  ticketUrl: string | null
  issueNumber: number | null
  branch: string
  stage: TicketItemStage
  reviewNumber: number | null
  reviewUrl: string | null
  createdAt: number
  updatedAt: number
}

export type WorkspaceCleanRow = {
  worktreeId: string
  name: string
  branch: string
  verdict: 'remove' | 'keep'
  reason: WorkspaceCleanReason
  reviewNumber: number | null
}

export type WorkspaceCleanSurveyResult = {
  parentWorktreeId: string
  baseRef: string
  rows: WorkspaceCleanRow[]
}

export type WorkspaceCleanOutcome =
  | { worktreeId: string; status: 'removed'; branchLeftover?: string }
  | { worktreeId: string; status: 'kept'; reason: string }

export type WorkspaceCleanResult = { outcomes: WorkspaceCleanOutcome[] }

/** Per project; everything defaults off so nothing irreversible happens unasked. */
export type TicketPipelineSettings = {
  /** Remove a ticket's workspace once its PR merges and the clean-up survey says it is safe. */
  autoClean: boolean
}

export const DEFAULT_TICKET_PIPELINE_SETTINGS: TicketPipelineSettings = { autoClean: false }
