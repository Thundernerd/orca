import { describe, expect, it } from 'vitest'
import {
  decideMergeQueueStep,
  findAttribution,
  type MergeQueueObservation
} from './merge-queue-step'
import type { TicketQueueState } from './ticket-types'

const green: MergeQueueObservation = {
  headSha: 'h1',
  state: 'open',
  mergeable: 'MERGEABLE',
  behindBase: false,
  checks: [{ name: 'test', status: 'completed', conclusion: 'success' }],
  attributionHits: [],
  mergeBlocker: null,
  agentReachable: true,
  now: 1_000
}

const step = (extra: Partial<MergeQueueObservation>, previous?: TicketQueueState) =>
  decideMergeQueueStep(previous, { ...green, ...extra })

const queued = (extra: Partial<TicketQueueState>): TicketQueueState => ({
  status: 'waiting-ci',
  detail: '',
  fixAttempts: {},
  ...extra
})

describe('decideMergeQueueStep', () => {
  it('is ready only with clean attribution, a fresh head, green checks and nothing blocking', () => {
    expect(step({}).kind).toBe('ready')
    expect(step({ checks: [] }).kind).toBe('ready')
    expect(step({ mergeable: 'UNKNOWN' }).kind).toBe('wait')
    expect(step({ mergeBlocker: 'Needs a review.' })).toEqual({
      kind: 'pause',
      detail: 'Needs a review.'
    })
  })

  it('checks attribution, then freshness, then CI', () => {
    expect(step({ attributionHits: ['x'], behindBase: true })).toMatchObject({
      kind: 'send-fix',
      cause: 'attribution'
    })
    expect(step({ behindBase: true }).kind).toBe('update-branch')
    expect(step({ behindBase: true, mergeable: 'CONFLICTING' })).toMatchObject({
      kind: 'send-fix',
      cause: 'conflict'
    })
    expect(step({ checks: [{ name: 'lint', status: 'in_progress', conclusion: null }] })).toEqual({
      kind: 'wait',
      status: 'waiting-ci',
      detail: 'Waiting for lint.'
    })
  })

  it('reruns a single failing job once per head, then hands CI failures to the agent', () => {
    const failing = {
      checks: [{ name: 'test', status: 'completed' as const, conclusion: 'failure' as const }]
    }
    expect(step(failing).kind).toBe('rerun-failed')
    expect(step(failing, queued({ rerunHead: 'h1' }))).toMatchObject({
      kind: 'send-fix',
      cause: 'ci',
      failing: ['test']
    })
    const two = {
      checks: [
        { name: 'a', status: 'completed' as const, conclusion: 'failure' as const },
        { name: 'b', status: 'completed' as const, conclusion: 'timed_out' as const }
      ]
    }
    expect(step(two).kind).toBe('send-fix')
  })

  it('waits for the push a fix owes, and pauses after 3 hours or a repeated failure', () => {
    const awaiting = queued({
      status: 'fixing',
      detail: 'fixing',
      awaitingPushFrom: 'h1',
      awaitingPushSince: 0
    })
    expect(step({ attributionHits: ['x'] }, awaiting)).toEqual({
      kind: 'wait',
      status: 'fixing',
      detail: 'fixing'
    })
    expect(step({ now: 3 * 60 * 60 * 1000 + 1 }, awaiting).kind).toBe('pause')
    expect(step({ mergeable: 'CONFLICTING' }, queued({ fixAttempts: { conflict: 2 } })).kind).toBe(
      'pause'
    )
    expect(step({ mergeable: 'CONFLICTING', agentReachable: false }).kind).toBe('pause')
  })

  it('moves on without a push once a body-only attribution or a conflict is gone', () => {
    const awaiting = (awaitingCause: 'attribution' | 'conflict' | 'ci') =>
      queued({
        status: 'fixing',
        detail: 'fixing',
        awaitingPushFrom: 'h1',
        awaitingPushSince: 0,
        awaitingCause
      })
    expect(step({}, awaiting('attribution')).kind).toBe('ready')
    expect(step({ attributionHits: ['x'] }, awaiting('attribution')).kind).toBe('wait')
    expect(step({}, awaiting('conflict')).kind).toBe('ready')
    expect(step({}, awaiting('ci')).kind).toBe('wait')
  })

  it('stops once the PR is merged or closed', () => {
    expect(step({ state: 'merged' }).kind).toBe('done')
    expect(step({ state: 'closed', attributionHits: ['x'] }).kind).toBe('done')
  })
})

describe('findAttribution', () => {
  it('finds Claude attribution lines and nothing else', () => {
    expect(
      findAttribution([
        'Fix the login form\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
        '## Summary\nCloses #1\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
        'Co-authored-by: Alice <alice@example.com>\nMentions claude in prose'
      ])
    ).toEqual([
      'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)'
    ])
  })
})
