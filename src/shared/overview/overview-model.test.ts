import { describe, expect, it } from 'vitest'
import { buildOverviewSnapshot } from './overview-model'
import type {
  OverviewAgentInput,
  OverviewModelInput,
  OverviewWorktreeInput
} from './overview-model-types'

function worktree(
  id: string,
  overrides: Partial<OverviewWorktreeInput> = {}
): OverviewWorktreeInput {
  return {
    key: id,
    id,
    repoId: 'repo-a',
    executionHostId: 'local',
    name: id,
    isMain: false,
    isActive: false,
    isUnread: false,
    comment: '',
    issue: null,
    workspaceStatus: null,
    lastActivityAt: 1_000,
    pr: null,
    agents: [],
    ...overrides
  }
}

function agent(overrides: Partial<OverviewAgentInput>): OverviewAgentInput {
  return { paneKey: 'tab:leaf', state: 'working', stateStartedAt: 1_000, prompt: '', ...overrides }
}

function input(worktrees: OverviewWorktreeInput[], overrides: Partial<OverviewModelInput> = {}) {
  return buildOverviewSnapshot({
    repos: [
      { id: 'repo-a', name: 'Alpha', host: null, groupId: null },
      { id: 'repo-b', name: 'Beta', host: null, groupId: null }
    ],
    worktrees,
    tickets: {},
    ticketsLoading: new Set(),
    hidden: new Set(),
    pinned: new Set(),
    sort: 'attention',
    ...overrides
  })
}

describe('buildOverviewSnapshot', () => {
  it('orders needs-you by kind, then by how long it has waited', () => {
    const snapshot = input([
      worktree('flagged-old', { isUnread: true, lastActivityAt: 100 }),
      worktree('ready', {
        lastActivityAt: 500,
        pr: { number: 7, state: 'open', checks: 'success', url: null, failingChecks: [] }
      }),
      worktree('blocked-new', { agents: [agent({ state: 'blocked', stateStartedAt: 900 })] }),
      worktree('waiting-old', { agents: [agent({ state: 'waiting', stateStartedAt: 200 })] }),
      worktree('failing', {
        lastActivityAt: 50,
        pr: { number: 8, state: 'open', checks: 'failure', url: null, failingChecks: [] }
      })
    ])
    expect(snapshot.attention.map((item) => item.worktreeId)).toEqual([
      'waiting-old',
      'blocked-new',
      'failing',
      'ready',
      'flagged-old'
    ])
  })

  it('keeps hidden projects out of needs-you and sorts them last', () => {
    const snapshot = input(
      [
        worktree('a', { isUnread: true }),
        worktree('b', { repoId: 'repo-b', isUnread: true, lastActivityAt: 9_000 })
      ],
      { hidden: new Set(['repo-b']) }
    )
    expect(snapshot.attention.map((item) => item.projectId)).toEqual(['repo-a'])
    expect(snapshot.projects.map((project) => project.id)).toEqual(['repo-a', 'repo-b'])
  })
})

describe('project sort', () => {
  it('sorts by name when asked, keeping pinned first and hidden last', () => {
    const snapshot = buildOverviewSnapshot({
      repos: [
        { id: 'c', name: 'charlie', host: null, groupId: null },
        { id: 'a', name: 'Alpha', host: null, groupId: null },
        { id: 'b', name: 'bravo', host: null, groupId: null },
        { id: 'z', name: 'Zulu', host: null, groupId: null }
      ],
      worktrees: ['a', 'b', 'c', 'z'].map((repoId) =>
        worktree(`${repoId}-main`, { repoId, isMain: true, isUnread: repoId === 'c' })
      ),
      tickets: {},
      ticketsLoading: new Set(),
      hidden: new Set(['a']),
      pinned: new Set(['z']),
      sort: 'name'
    })
    expect(snapshot.projects.map((p) => p.name)).toEqual(['Zulu', 'bravo', 'charlie', 'Alpha'])
  })
})
