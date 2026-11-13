import type { WorkspaceCleanReason } from './workspace-clean-verdict'
import type { TicketFinding } from './ticket-draft-types'

export type TicketSourceKind = 'github-issues' | 'repo-files' | 'linear' | 'jira'

/** Where a project's tickets live; `auto` is ticket files when the default branch has them, else GitHub issues. */
export type TicketSourceConfig =
  | { kind: 'auto' }
  | { kind: 'github-issues' }
  | { kind: 'linear'; workspaceId: string; teamId: string; teamKey: string }
  | { kind: 'jira'; siteId: string; projectId: string; projectKey: string }

/** A ticket as its tracker reports it, before readiness is decided. */
export type Ticket = {
  /** Display id: `#12` for GitHub issues, `T86` for ticket files, `ENG-12` for Linear or Jira. */
  id: string
  /** Lower-case token a launched branch or workspace name carries: `gh-12`, `t86`, `eng-12`. */
  slugId: string
  /** The tracker's own id where it differs from the display id: Linear's issue uuid. */
  externalId: string | null
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
  /** The agent's terminal from launch; fix briefs go here. */
  agentTerminalHandle?: string
  /** The agent's chat session from launch, when it opened as a chat; fix briefs go here. */
  agentSessionId?: string
  /** Why auto-clean last kept this merged ticket's workspace; it tries again on the next check. */
  autoCleanHeld?: { reason: string; at: number }
  /** Where the merge queue has this item; absent until it reaches the head of the queue. */
  queue?: TicketQueueState
  /** Tickets its agent filed for problems outside this ticket's scope. */
  findings?: TicketFinding[]
  createdAt: number
  updatedAt: number
}

export type TicketQueueStatus =
  | 'waiting-ci'
  | 'updating-branch'
  | 'rerunning'
  | 'fixing'
  | 'ready'
  | 'merging'
  | 'paused'

export type TicketFixCause = 'attribution' | 'conflict' | 'ci'

export type TicketQueueState = {
  status: TicketQueueStatus
  /** When it entered this status; absent on state written before this was recorded. */
  statusSince?: number
  /** Plain-language detail: what is being waited on, fixed, or why it paused. */
  detail: string
  /** Fix briefs sent per cause; a second failure of the same cause pauses the queue. */
  fixAttempts: Partial<Record<TicketFixCause, number>>
  /** The head a fix was asked for; the queue waits for a push that replaces it. */
  awaitingPushFrom?: string
  awaitingPushSince?: number
  /** What the awaited fix is for, so a fix that needs no push still unblocks the queue. */
  awaitingCause?: TicketFixCause
  /** The head whose failed jobs were already rerun once as a possible flake. */
  rerunHead?: string
  /** Ticks in a row that failed with an error; a passing GitHub hiccup must not pause the queue. */
  errorStreak?: number
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
  /** Merge the head of the queue as soon as it is ready, instead of waiting for a click. */
  autoMerge: boolean
  source: TicketSourceConfig
}

export const DEFAULT_TICKET_PIPELINE_SETTINGS: TicketPipelineSettings = {
  autoClean: false,
  autoMerge: false,
  source: { kind: 'auto' }
}

/** A source the user can pick for a project, labelled for a menu. */
export type TicketSourceOption = { label: string; config: TicketSourceConfig }

export type TicketQueueEntry = {
  itemId: string
  ticketId: string
  ticketTitle: string
  reviewNumber: number | null
  reviewUrl: string | null
  childWorktreeId: string
  /** Null for entries behind the head: they wait their turn. */
  queue: TicketQueueState | null
}

export type TicketQueueView = {
  parentWorktreeId: string
  pausedReason: string | null
  autoMerge: boolean
  entries: TicketQueueEntry[]
}

/** What the merge queue and auto-clean are doing for one parent workspace, cheap enough to poll. */
export type TicketPipelineStatus = {
  /** When the host last checked the queue and clean-up; null if not since it started. */
  checkedAt: number | null
  /** False once nothing is left to follow; the next launch or settings change starts it again. */
  watching: boolean
  autoMerge: boolean
  autoClean: boolean
  queue: {
    head: {
      ticketId: string
      reviewNumber: number | null
      /** Null until the queue first looks at it. */
      status: TicketQueueStatus | null
      detail: string | null
      since: number | null
    } | null
    /** PRs behind the head. */
    waiting: number
    pausedReason: string | null
  }
  clean: {
    lastRemoved: { ticketId: string; at: number } | null
    /** Merged tickets whose workspace auto-clean kept, with a survey reason or an error message. */
    held: { ticketId: string; reason: string; at: number }[]
    /** Merged tickets auto-clean has not tried yet. */
    pending: number
  }
}
