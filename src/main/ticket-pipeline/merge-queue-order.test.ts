import { describe, expect, it } from 'vitest'
import type { TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import { queueCandidates, queueOrder } from './merge-queue-order'

function item(ticketId: string, issueNumber: number, overrides: Partial<TicketItem> = {}) {
  const base: TicketItem = {
    id: `item-${ticketId}`,
    repoId: 'repo',
    parentWorktreeId: 'parent',
    childWorktreeId: `child-${ticketId}`,
    source: 'github-issues',
    ticketId,
    ticketTitle: ticketId,
    ticketUrl: null,
    issueNumber,
    branch: `feat/${issueNumber}`,
    stage: 'in-review',
    reviewNumber: issueNumber + 100,
    reviewUrl: null,
    createdAt: 0,
    updatedAt: 0
  }
  return { ...base, ...overrides }
}

describe('queueOrder', () => {
  const items = [
    item('#9', 9),
    item('#3', 3, { queueHeld: true }),
    item('#5', 5),
    item('#4', 4, { stage: 'implementing' }),
    item('#1', 1, { parentWorktreeId: 'other' })
  ]

  it('merges in ticket order, skipping PRs the user held out', () => {
    expect(queueOrder(items, 'parent').map((i) => i.ticketId)).toEqual(['#5', '#9'])
  })

  it('keeps held-out PRs in their place among the candidates', () => {
    expect(queueCandidates(items, 'parent').map((i) => i.ticketId)).toEqual(['#3', '#5', '#9'])
  })
})
