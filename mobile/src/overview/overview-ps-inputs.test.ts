import { describe, expect, it } from 'vitest'
import { buildOverviewSnapshot } from '../../../src/shared/overview/overview-model'
import type { Worktree } from '../worktree/workspace-list-types'
import { overviewInputsFromRows } from './overview-ps-inputs'

function row(worktreeId: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    worktreeId,
    repoId: 'repo-1',
    repo: 'rally-point',
    branch: `refs/heads/${worktreeId}`,
    displayName: '',
    path: `/code/${worktreeId}`,
    liveTerminalCount: 0,
    hasAttachedPty: false,
    unread: false,
    isPinned: false,
    linkedPR: null,
    ...overrides
  }
}

function snapshotOf(rows: Worktree[]) {
  const inputs = overviewInputsFromRows(rows, (hostId) =>
    hostId === 'runtime:reach' ? 'Reach' : null
  )
  return buildOverviewSnapshot({
    ...inputs,
    tickets: {},
    ticketsLoading: new Set(),
    hidden: new Set(),
    pinned: new Set(),
    sort: 'attention'
  })
}

describe('overviewInputsFromRows', () => {
  it('turns host rows into needs-you items, keeping a remote copy of a repo its own project', () => {
    const snapshot = snapshotOf([
      row('main', { isMainWorktree: true }),
      row('fix', {
        agents: [
          {
            paneKey: 'tab:leaf',
            parentPaneKey: null,
            state: 'waiting',
            agentType: 'claude',
            prompt: '',
            taskTitle: null,
            displayName: null,
            lastAssistantMessage: 'Which file?',
            toolName: null,
            toolInput: null,
            interrupted: false,
            stateStartedAt: 100,
            updatedAt: 100
          }
        ]
      }),
      row('remote-fix', {
        hostId: 'runtime:reach',
        unread: true,
        linkedPR: { number: 9, state: 'OPEN', checksStatus: 'failure' }
      }),
      row('old', { isArchived: true, unread: true })
    ])
    expect(snapshot.projects.map((p) => [p.name, p.host])).toEqual([
      ['rally-point', null],
      ['rally-point', 'Reach']
    ])
    expect(snapshot.attention.map((item) => [item.workspaceName, item.reasons])).toEqual([
      ['fix', ['Agent waiting: Which file?']],
      ['remote-fix', ['PR #9 CI failing', 'Marked unread']]
    ])
  })
})
