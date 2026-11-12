import type { OverviewTicketCounts } from './overview-ticket-survey'
import type { ExecutionHostId } from '../execution-host'

export type OverviewAttentionKind = 'agent-waiting' | 'ci-failing' | 'pr-ready' | 'flagged'
export type OverviewAgentState = 'blocked' | 'waiting' | 'working' | 'done'
export type OverviewChecks = 'success' | 'failure' | 'pending' | 'none'

export type OverviewPr = {
  number: number
  state: 'open' | 'closed' | 'merged' | 'draft'
  checks: OverviewChecks
  url: string | null
  /** Names of the failing checks, when the host reported them. */
  failingChecks: string[]
}

export type OverviewAgentInput = {
  paneKey: string
  state: OverviewAgentState
  /** Set while the session monitors a wait between turns; it may be blocked while `state` reads done. */
  mainAgentState?: OverviewAgentState
  agentType?: string
  lastAssistantMessage?: string
  stateStartedAt: number
  prompt: string
  workingMode?: string
}

export type OverviewWorktreeInput = {
  /** Unique across hosts: a twin (same id locally and on a server) is two workspaces. */
  key: string
  /** The id its host knows it by; with executionHostId it names the workspace for actions. */
  id: string
  repoId: string
  executionHostId: ExecutionHostId
  name: string
  isMain: boolean
  isActive: boolean
  isUnread: boolean
  comment: string
  issue: number | null
  workspaceStatus: string | null
  lastActivityAt: number | null
  pr: OverviewPr | null
  agents: OverviewAgentInput[]
}

export type OverviewRepoInput = {
  id: string
  name: string
  /** SSH or runtime host label; null on this machine. */
  host: string | null
  /** The project group it is filed under in the sidebar; null when ungrouped. */
  groupId: string | null
}

export type OverviewSort = 'attention' | 'name'

export type OverviewModelInput = {
  repos: OverviewRepoInput[]
  worktrees: OverviewWorktreeInput[]
  tickets: Readonly<Record<string, OverviewTicketCounts>>
  ticketsLoading: ReadonlySet<string>
  hidden: ReadonlySet<string>
  pinned: ReadonlySet<string>
  sort: OverviewSort
  /** UI language for the name sort; the caller's, since this model runs on desktop and phone. */
  locale?: string
}

export type OverviewWorkspaceRow = {
  worktreeId: string
  executionHostId: ExecutionHostId
  name: string
  isMain: boolean
  isActive: boolean
  status: string | null
  issue: number | null
  pr: OverviewPr | null
  agentState: OverviewAgentState | null
  agentSince: number | null
  lastMessage: string | null
  comment: string | null
  unread: boolean
  lastActivityAt: number | null
  attention: OverviewAttentionKind[]
  cleanable: boolean
}

export type OverviewAttentionItem = {
  key: string
  kind: OverviewAttentionKind
  kinds: OverviewAttentionKind[]
  reasons: string[]
  worktreeId: string
  executionHostId: ExecutionHostId
  workspaceName: string
  projectId: string
  projectName: string
  /** The paired server or SSH host it lives on; null on this machine. */
  host: string | null
  /** The workspace's PR, so the card can link to it. */
  prUrl: string | null
  isMain: boolean
  unread: boolean
  since: number | null
}

export type OverviewProject = {
  id: string
  name: string
  host: string | null
  groupId: string | null
  ticketSource: string | null
  mainWorktreeId: string | null
  isActive: boolean
  activeWorkspace: string | null
  hidden: boolean
  pinned: boolean
  usesTickets: boolean
  attentionCount: number
  runningAgents: number
  openPrs: number
  readyPrs: number
  cleanupCount: number
  lastActivityAt: number
  tickets: OverviewTicketCounts | null
  ticketsLoading: boolean
  workspaces: OverviewWorkspaceRow[]
}

export type OverviewSnapshot = {
  projects: OverviewProject[]
  attention: OverviewAttentionItem[]
}
