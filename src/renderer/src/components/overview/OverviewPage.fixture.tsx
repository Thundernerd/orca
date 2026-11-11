import { defineFixture } from '../../component-fixtures/component-fixture'
import OverviewPage from './OverviewPage'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

const NOW = Date.now()

function repo(id: string, displayName: string): Repo {
  return { id, path: `/code/${id}`, displayName, badgeColor: '#888', addedAt: 0 }
}

function worktree(repoId: string, name: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: `${repoId}::/code/${repoId}/${name}`,
    repoId,
    displayName: name,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: NOW - 30 * 60_000,
    path: `/code/${repoId}/${name}`,
    head: 'abc',
    branch: `refs/heads/${name}`,
    isBare: false,
    isMainWorktree: false,
    ...overrides
  }
}

const repos = [repo('alpha', 'UpcomingReleases'), repo('beta', 'rally-point')]
const worktreesByRepo = {
  alpha: [
    worktree('alpha', 'main', { isMainWorktree: true }),
    worktree('alpha', 'chore/gh-8-add-a-license', {
      isUnread: true,
      lastActivityAt: NOW - 9 * 60_000
    })
  ],
  beta: [
    worktree('beta', 'main', { isMainWorktree: true }),
    worktree('beta', 'docs/gh-309-sci-fi-pack', {
      isUnread: true,
      comment: 'Need you: add the free Low Poly Sci-Fi RTS Pack from the asset store.',
      lastActivityAt: NOW - 25 * 60_000
    }),
    worktree('beta', 'feat/gh-311-units-face-target', { lastActivityAt: NOW - 6 * 60_000 })
  ]
}

const store = {
  repos,
  worktreesByRepo,
  activeWorktreeId: worktreesByRepo.alpha[0].id,
  overviewPrefs: {
    pinned: [],
    minimized: [],
    hidden: [],
    openTables: ['beta'],
    tickets: {
      alpha: {
        ready: 2,
        blocked: 1,
        launched: 1,
        owned: 0,
        claimed: 0,
        readyTitles: [],
        fetchedAt: NOW - 60_000,
        error: null
      }
    }
  }
}

export const wide = defineFixture({
  width: 1200,
  store,
  render: () => (
    <div className="flex h-[640px]">
      <OverviewPage />
    </div>
  )
})

export const narrow = defineFixture({
  width: 600,
  store,
  render: () => (
    <div className="flex h-[900px]">
      <OverviewPage />
    </div>
  )
})

const tableStore = { ...store, overviewPrefs: { ...store.overviewPrefs, layout: 'table' as const } }

export const table = defineFixture({
  width: 1200,
  store: tableStore,
  render: () => (
    <div className="flex h-[640px]">
      <OverviewPage />
    </div>
  )
})

export const tableNarrow = defineFixture({
  width: 600,
  store: tableStore,
  render: () => (
    <div className="flex h-[640px]">
      <OverviewPage />
    </div>
  )
})
