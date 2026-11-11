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
      { id: 'repo-a', name: 'Alpha', host: null },
      { id: 'repo-b', name: 'Beta', host: null }
    ],
    worktrees,
    tickets: {},
    ticketsLoading: new Set(),
    pendingMerges: new Set(),
    hidden: new Set(),
    pinned: new Set(),
    ...overrides
  })
}

describe('buildOverviewSnapshot', () => {
  it('orders needs-you by kind, then by how long it has waited', () => {
    const snapshot = input([
      worktree('flagged-old', { isUnread: true, lastActivityAt: 100 }),
      worktree('ready', {
        lastActivityAt: 500,
        pr: { number: 7, state: 'open', checks: 'success', url: null }
      }),
      worktree('blocked-new', { agents: [agent({ state: 'blocked', stateStartedAt: 900 })] }),
      worktree('waiting-old', { agents: [agent({ state: 'waiting', stateStartedAt: 200 })] }),
      worktree('failing', {
        lastActivityAt: 50,
        pr: { number: 8, state: 'open', checks: 'failure', url: null }
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

  it('hides ready-to-merge items while /merge-tickets runs in the main workspace', () => {
    const ready = worktree('ready', {
      pr: { number: 7, state: 'open', checks: 'success', url: null }
    })
    const mainMerging = worktree('main', {
      isMain: true,
      agents: [agent({ state: 'working', prompt: '/merge-tickets' })]
    })
    expect(input([mainMerging, ready]).attention).toEqual([])
    expect(
      input([worktree('main', { isMain: true }), ready], { pendingMerges: new Set(['repo-a']) })
        .attention
    ).toEqual([])
    expect(input([worktree('main', { isMain: true }), ready]).attention.map((i) => i.kind)).toEqual(
      ['pr-ready']
    )
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
