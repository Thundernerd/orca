import type {
  OverviewAgentInput,
  OverviewAgentState,
  OverviewAttentionItem,
  OverviewAttentionKind,
  OverviewModelInput,
  OverviewProject,
  OverviewSnapshot,
  OverviewWorkspaceRow,
  OverviewWorktreeInput
} from './overview-model-types'

const MAX_CHECK_NAMES = 3

function failingReason(pr: { number: number; failingChecks: string[] }): string {
  const names = pr.failingChecks
  if (names.length === 0) {
    return `PR #${pr.number} CI failing`
  }
  const shown = names.slice(0, MAX_CHECK_NAMES).join(', ')
  const more = names.length > MAX_CHECK_NAMES ? ` +${names.length - MAX_CHECK_NAMES}` : ''
  return `PR #${pr.number} failing: ${shown}${more}`
}

const TICKET_BRANCH = /(^|[-/])(gh|issue)-\d+-/
const KIND_RANK: Record<OverviewAttentionKind, number> = {
  'agent-waiting': 0,
  'ci-failing': 1,
  'pr-ready': 2,
  flagged: 3
}
const URGENCY: readonly OverviewAgentState[] = ['blocked', 'waiting', 'working', 'done']

function agentStates(agent: OverviewAgentInput): OverviewAgentState[] {
  return agent.mainAgentState ? [agent.state, agent.mainAgentState] : [agent.state]
}

export function isWaitingAgent(agent: OverviewAgentInput): boolean {
  return agentStates(agent).some((state) => state === 'blocked' || state === 'waiting')
}

/** A Claude session that finished its turn and will take a new prompt now. */
export function isIdleClaude(agent: OverviewAgentInput): boolean {
  return agent.agentType === 'claude' && agent.state === 'done' && !isWaitingAgent(agent)
}

function urgentState(agent: OverviewAgentInput): OverviewAgentState {
  const states = agentStates(agent)
  return URGENCY.find((state) => states.includes(state)) ?? agent.state
}

/** Agents ordered so the one that needs you comes first, then the busiest. */
export function agentsByUrgency(agents: readonly OverviewAgentInput[]): OverviewAgentInput[] {
  return [...agents].sort(
    (a, b) => URGENCY.indexOf(urgentState(a)) - URGENCY.indexOf(urgentState(b))
  )
}

function truncate(text: string | null | undefined, max: number): string | null {
  if (!text) {
    return null
  }
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat || null
}

/** A /merge-tickets run is still going here: working, monitoring CI, or asking. */
export function isMergingTickets(worktree: OverviewWorktreeInput | null): boolean {
  return (worktree?.agents ?? []).some(
    (agent) =>
      /^\/merge-tickets\b/.test(agent.prompt.trim()) &&
      (agent.state !== 'done' || agent.workingMode === 'monitoring' || isWaitingAgent(agent))
  )
}

type Condition = { kind: OverviewAttentionKind; reason: string; since: number | null }

function workspaceConditions(
  worktree: OverviewWorktreeInput,
  merging: boolean,
  comment: string | null
): Condition[] {
  const conditions: Condition[] = []
  const waiting = worktree.agents.find(isWaitingAgent)
  if (waiting) {
    const message = truncate(waiting.lastAssistantMessage, 140)
    conditions.push({
      kind: 'agent-waiting',
      reason: `Agent ${urgentState(waiting)}${message ? `: ${message}` : ''}`,
      since: waiting.stateStartedAt
    })
  }
  const pr = worktree.pr
  if (comment && /^blocked:/i.test(comment)) {
    conditions.push({ kind: 'flagged', reason: comment, since: worktree.lastActivityAt })
  } else if (worktree.isUnread) {
    // A comment that is only the PR's link says nothing the PR line does not.
    const saysMore = comment && !(pr?.url && comment === pr.url)
    conditions.push({
      kind: 'flagged',
      reason: saysMore ? `Unread: ${truncate(comment, 140)}` : 'Marked unread',
      since: worktree.lastActivityAt
    })
  }
  if (pr?.state === 'open' && pr.checks === 'failure') {
    conditions.push({
      kind: 'ci-failing',
      reason: failingReason(pr),
      since: worktree.lastActivityAt
    })
  } else if (pr?.state === 'open' && pr.checks === 'success' && !merging) {
    // While /merge-tickets runs it works through every green PR, so they need nothing from you.
    conditions.push({
      kind: 'pr-ready',
      reason: `PR #${pr.number} ready to merge`,
      since: worktree.lastActivityAt
    })
  }
  return conditions.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
}

function workspaceRow(
  worktree: OverviewWorktreeInput,
  merging: boolean
): { row: OverviewWorkspaceRow; conditions: Condition[] } {
  const urgent = agentsByUrgency(worktree.agents)[0] ?? null
  const comment = worktree.comment.trim() || null
  const conditions = workspaceConditions(worktree, merging, comment)
  const pr = worktree.pr
  return {
    conditions,
    row: {
      worktreeId: worktree.key,
      executionHostId: worktree.executionHostId,
      name: worktree.name,
      isMain: worktree.isMain,
      isActive: worktree.isActive,
      status: worktree.workspaceStatus,
      issue: worktree.issue,
      pr,
      agentState: urgent ? urgentState(urgent) : null,
      agentSince: urgent?.stateStartedAt ?? null,
      lastMessage: truncate(urgent?.lastAssistantMessage, 200),
      comment,
      unread: worktree.isUnread,
      lastActivityAt: worktree.lastActivityAt,
      attention: conditions.map((condition) => condition.kind),
      cleanable:
        !worktree.isMain && (pr?.state === 'merged' || worktree.workspaceStatus === 'completed')
    }
  }
}

function usesTickets(worktrees: readonly OverviewWorktreeInput[]): boolean {
  return worktrees.some((w) => w.issue !== null || TICKET_BRANCH.test(w.name))
}

export function buildOverviewSnapshot(input: OverviewModelInput): OverviewSnapshot {
  const byRepo = new Map<string, OverviewWorktreeInput[]>()
  for (const worktree of input.worktrees) {
    const list = byRepo.get(worktree.repoId) ?? []
    list.push(worktree)
    byRepo.set(worktree.repoId, list)
  }
  // A remote project shows the ticket counts of a local checkout of the same repo: issues live on GitHub.
  const localByName = new Map<string, string>()
  for (const repo of input.repos) {
    if (!repo.host && !localByName.has(repo.name)) {
      localByName.set(repo.name, repo.id)
    }
  }

  const projects: OverviewProject[] = []
  const attention: OverviewAttentionItem[] = []
  for (const repo of input.repos) {
    const worktrees = byRepo.get(repo.id) ?? []
    if (worktrees.length === 0) {
      continue
    }
    const main = worktrees.find((w) => w.isMain) ?? null
    const merging = isMergingTickets(main) || input.pendingMerges.has(repo.id)
    const hidden = input.hidden.has(repo.id)
    const rows: OverviewWorkspaceRow[] = []
    const items: OverviewAttentionItem[] = []
    for (const worktree of worktrees) {
      const { row, conditions } = workspaceRow(worktree, merging)
      rows.push(row)
      if (conditions.length === 0) {
        continue
      }
      const times = conditions.map((c) => c.since).filter((t): t is number => t !== null)
      items.push({
        key: `ws:${worktree.key}`,
        kind: conditions[0].kind,
        kinds: conditions.map((c) => c.kind),
        reasons: conditions.map((c) => c.reason),
        worktreeId: worktree.key,
        executionHostId: worktree.executionHostId,
        workspaceName: worktree.name,
        projectId: repo.id,
        projectName: repo.name,
        host: repo.host,
        prUrl: worktree.pr?.url ?? null,
        isMain: worktree.isMain,
        unread: worktree.isUnread,
        since: times.length > 0 ? Math.min(...times) : null
      })
    }
    // Main first, then attention, then most recently active.
    rows.sort(
      (a, b) =>
        Number(b.isMain) - Number(a.isMain) ||
        b.attention.length - a.attention.length ||
        (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)
    )
    if (!hidden) {
      attention.push(...items)
    }
    const active = rows.find((r) => r.isActive) ?? null
    const ticketSource = repo.host ? (localByName.get(repo.name) ?? null) : repo.id
    const tickets = ticketSource ? (input.tickets[ticketSource] ?? null) : null
    projects.push({
      id: repo.id,
      name: repo.name,
      host: repo.host,
      groupId: repo.groupId,
      ticketSource,
      mainWorktreeId: main?.key ?? null,
      isActive: active !== null,
      activeWorkspace: active?.name ?? null,
      merging,
      hidden,
      pinned: input.pinned.has(repo.id),
      usesTickets: usesTickets(worktrees) || tickets !== null,
      attentionCount: items.length,
      runningAgents: rows.filter((r) => r.agentState === 'working').length,
      openPrs: rows.filter((r) => r.pr?.state === 'open').length,
      readyPrs: rows.filter((r) => r.pr?.state === 'open' && r.pr.checks === 'success').length,
      cleanupCount: rows.filter((r) => r.cleanable).length,
      lastActivityAt: Math.max(0, ...rows.map((r) => r.lastActivityAt ?? 0)),
      tickets,
      ticketsLoading: ticketSource !== null && input.ticketsLoading.has(ticketSource),
      workspaces: rows
    })
  }

  // Built per sort: the UI language can change while the app runs.
  const collator = new Intl.Collator(input.locale, { sensitivity: 'base' })
  projects.sort(
    (a, b) =>
      Number(a.hidden) - Number(b.hidden) ||
      Number(b.pinned) - Number(a.pinned) ||
      (input.sort === 'name'
        ? collator.compare(a.name, b.name) || collator.compare(a.host ?? '', b.host ?? '')
        : Number(b.attentionCount > 0) - Number(a.attentionCount > 0) ||
          b.lastActivityAt - a.lastActivityAt)
  )
  // Urgent kinds first (a blocked agent beats a stale unread flag), then what waited longest.
  attention.sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      (a.since ?? Number.MAX_SAFE_INTEGER) - (b.since ?? Number.MAX_SAFE_INTEGER)
  )
  return { projects, attention }
}
