import { describe, expect, it } from 'vitest'
import { reconcileTicketItem, type TicketItemObservation } from './ticket-item-reconcile'
import type { TicketItem } from './ticket-types'

const item: TicketItem = {
  id: 'i1',
  repoId: 'r',
  parentWorktreeId: 'r::/main',
  childWorktreeId: 'r::/child',
  source: 'github-issues',
  ticketId: '#12',
  ticketTitle: 'Login',
  ticketUrl: null,
  issueNumber: 12,
  branch: 'feat/gh-12-login',
  stage: 'implementing',
  reviewNumber: null,
  reviewUrl: null,
  createdAt: 1,
  updatedAt: 1
}

const seen = (extra: Partial<TicketItemObservation>): TicketItemObservation => ({
  workspaceExists: true,
  agentWaiting: false,
  review: null,
  ...extra
})

describe('reconcileTicketItem', () => {
  it('moves to agent-waiting and back while no PR exists', () => {
    expect(reconcileTicketItem(item, seen({ agentWaiting: true }))?.stage).toBe('agent-waiting')
    expect(reconcileTicketItem({ ...item, stage: 'agent-waiting' }, seen({}))?.stage).toBe(
      'implementing'
    )
    expect(reconcileTicketItem(item, seen({}))).toBeNull()
  })

  it('follows the PR to review, merged or closed, and keeps its link', () => {
    const review = { number: 40, url: 'https://x/pull/40', state: 'open' as const }
    expect(reconcileTicketItem(item, seen({ review, agentWaiting: true }))).toEqual({
      stage: 'in-review',
      reviewNumber: 40,
      reviewUrl: 'https://x/pull/40'
    })
    expect(reconcileTicketItem(item, seen({ review: { ...review, state: 'merged' } }))?.stage).toBe(
      'merged'
    )
    expect(reconcileTicketItem(item, seen({ review: { ...review, state: 'closed' } }))?.stage).toBe(
      'closed'
    )
  })

  it('closes an item whose workspace is gone, and never reopens a merged one', () => {
    expect(reconcileTicketItem(item, seen({ workspaceExists: false }))?.stage).toBe('closed')
    expect(
      reconcileTicketItem({ ...item, stage: 'merged' }, seen({ agentWaiting: true }))
    ).toBeNull()
  })

  it('reopens a closed item when a new PR opens on its branch, while its workspace exists', () => {
    const closed = { ...item, stage: 'closed' as const, reviewNumber: 40, reviewUrl: 'x/40' }
    const fresh = { number: 52, url: 'x/52', state: 'open' as const }
    expect(reconcileTicketItem(closed, seen({ review: fresh }))).toEqual({
      stage: 'in-review',
      reviewNumber: 52,
      reviewUrl: 'x/52'
    })
    expect(
      reconcileTicketItem(closed, seen({ review: { ...fresh, state: 'merged' } }))?.stage
    ).toBe('merged')
    expect(
      reconcileTicketItem(closed, seen({ review: { number: 40, url: 'x/40', state: 'closed' } }))
    ).toBeNull()
    expect(
      reconcileTicketItem(closed, seen({ workspaceExists: false, review: fresh }))?.stage
    ).toBe('closed')
  })
})
