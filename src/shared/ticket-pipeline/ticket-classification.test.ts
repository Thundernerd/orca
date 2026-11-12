import { describe, expect, it } from 'vitest'
import { classifyTickets, type TicketWorkspaceSignature } from './ticket-classification'
import type { Ticket } from './ticket-types'

function issue(n: number, extra: Partial<Ticket> = {}): Ticket {
  return {
    id: `#${n}`,
    slugId: `gh-${n}`,
    title: `Issue ${n}`,
    url: null,
    ref: String(n),
    issueNumber: n,
    assignees: [],
    ownedByUser: false,
    blockerIds: [],
    labels: [],
    externalId: null,
    ...extra
  }
}

function workspace(extra: Partial<TicketWorkspaceSignature>): TicketWorkspaceSignature {
  return {
    worktreeId: 'repo::/w',
    linkedIssue: null,
    linkedKey: null,
    displayName: '',
    branch: '',
    ...extra
  }
}

describe('classifyTickets', () => {
  it('marks a ticket ready only when every blocker is done', () => {
    const rows = classifyTickets(
      [issue(2, { blockerIds: ['#1'] }), issue(3, { blockerIds: ['#1', '#2'] })],
      new Set(['#1']),
      []
    )
    expect(rows.map((r) => [r.ticket.id, r.status, r.waitingOn])).toEqual([
      ['#2', 'ready', []],
      ['#3', 'blocked', ['#2']]
    ])
  })

  it('recognises a launched workspace by linked issue, name or branch, old prefixes included', () => {
    const rows = classifyTickets([issue(4), issue(5), issue(6), issue(7)], new Set(), [
      workspace({ worktreeId: 'a', linkedIssue: 4 }),
      workspace({ worktreeId: 'b', branch: 'refs/heads/feat/gh-5-login-form' }),
      workspace({ worktreeId: 'c', displayName: 'issue-6-old-launch' }),
      workspace({ worktreeId: 'd', branch: 'feat/gh-70-other' })
    ])
    expect(rows.map((r) => [r.status, r.worktreeId])).toEqual([
      ['launched', 'a'],
      ['launched', 'b'],
      ['launched', 'c'],
      ['ready', undefined]
    ])
  })

  it('keeps owned and claimed tickets out of the ready list, launched taking precedence', () => {
    const rows = classifyTickets(
      [
        issue(8, { ownedByUser: true, assignees: ['me'] }),
        issue(9, { assignees: ['alice'], blockerIds: ['#1'] }),
        issue(10, { assignees: ['me'] })
      ],
      new Set(),
      [workspace({ worktreeId: 'x', linkedIssue: 10 })]
    )
    expect(rows.map((r) => [r.status, r.waitingOn])).toEqual([
      ['owned', []],
      ['claimed', ['alice']],
      ['launched', []]
    ])
  })

  it('recognises a Linear or Jira ticket by the workspace link or its key in the branch', () => {
    const eng: Ticket = { ...issue(0), id: 'ENG-12', slugId: 'eng-12', issueNumber: null }
    const ops: Ticket = { ...eng, id: 'OPS-3', slugId: 'ops-3' }
    const rows = classifyTickets([eng, ops], new Set(), [
      workspace({ worktreeId: 'a', linkedKey: 'eng-12' }),
      workspace({ worktreeId: 'b', branch: 'fix/ops-3-retry' })
    ])
    expect(rows.map((r) => r.worktreeId)).toEqual(['a', 'b'])
  })

  it('matches ticket files by their lower-case id', () => {
    const t86: Ticket = { ...issue(0), id: 'T86', slugId: 't86', issueNumber: null }
    const t8: Ticket = { ...t86, id: 'T8', slugId: 't8' }
    const rows = classifyTickets([t86, t8], new Set(), [
      workspace({ branch: 'fix/t86-discover-filters' })
    ])
    expect(rows.map((r) => r.status)).toEqual(['launched', 'ready'])
  })
})
