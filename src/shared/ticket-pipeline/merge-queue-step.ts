import type { PRCheckDetail } from '../github/check-types'
import type { TicketFixCause, TicketQueueState } from './ticket-types'

/** A push the agent owes has not come for this long: the queue stops and asks the user. */
export const PUSH_WAIT_LIMIT_MS = 3 * 60 * 60 * 1000
/** The same cause failing again after this many fix briefs pauses the queue. */
export const MAX_FIX_ATTEMPTS = 2

export type MergeQueueObservation = {
  headSha: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  /** GitHub's mergeable flag; UNKNOWN while it is still computing. */
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  /** The base has commits the head does not. */
  behindBase: boolean
  checks: readonly Pick<PRCheckDetail, 'name' | 'status' | 'conclusion'>[]
  /** Lines in the PR body or commits that carry Claude attribution. */
  attributionHits: readonly string[]
  /** What GitHub still requires before a merge (a review, say); null when nothing. */
  mergeBlocker: string | null
  /** The agent's terminal is reachable for a fix brief. */
  agentReachable: boolean
  now: number
}

export type MergeQueueAction =
  | { kind: 'wait'; status: 'waiting-ci' | 'fixing'; detail: string }
  | { kind: 'update-branch'; detail: string }
  | { kind: 'rerun-failed'; detail: string }
  | { kind: 'send-fix'; cause: TicketFixCause; detail: string; failing: string[] }
  | { kind: 'ready'; detail: string }
  | { kind: 'pause'; detail: string }
  | { kind: 'done' }

const FAILED: readonly (PRCheckDetail['conclusion'] | undefined)[] = [
  'failure',
  'cancelled',
  'timed_out',
  'action_required'
]

function failingChecks(checks: MergeQueueObservation['checks']): string[] {
  return checks
    .filter((c) => c.status === 'completed' && FAILED.includes(c.conclusion))
    .map((c) => c.name)
}

function pendingChecks(checks: MergeQueueObservation['checks']): string[] {
  return checks.filter((c) => c.status !== 'completed').map((c) => c.name)
}

/** Attribution can live only in the PR body, and GitHub can clear a conflict itself; CI needs a new head. */
function fixedWithoutPush(cause: TicketFixCause, observed: MergeQueueObservation): boolean {
  switch (cause) {
    case 'attribution':
      return observed.attributionHits.length === 0
    case 'conflict':
      return observed.mergeable === 'MERGEABLE'
    case 'ci':
      return false
  }
}

/** What the head of the queue needs next. Mirrors /merge-tickets: clean attribution, a fresh head, green CI, then merge. */
export function decideMergeQueueStep(
  previous: TicketQueueState | undefined,
  observed: MergeQueueObservation
): MergeQueueAction {
  if (observed.state === 'merged' || observed.state === 'closed') {
    return { kind: 'done' }
  }
  // A fix was asked for: nothing else is judged until the agent pushes over that head, unless the
  // problem was fixable without a push (attribution only in the PR body) and is gone.
  if (
    previous?.awaitingPushFrom === observed.headSha &&
    !(previous.awaitingCause && fixedWithoutPush(previous.awaitingCause, observed))
  ) {
    const waited = observed.now - (previous.awaitingPushSince ?? observed.now)
    return waited > PUSH_WAIT_LIMIT_MS
      ? { kind: 'pause', detail: 'The agent has not pushed a fix in 3 hours.' }
      : { kind: 'wait', status: 'fixing', detail: previous.detail }
  }
  const fix = (cause: TicketFixCause, detail: string, failing: string[] = []): MergeQueueAction => {
    if ((previous?.fixAttempts[cause] ?? 0) >= MAX_FIX_ATTEMPTS) {
      return { kind: 'pause', detail: `Still failing after ${MAX_FIX_ATTEMPTS} fixes: ${detail}` }
    }
    if (!observed.agentReachable) {
      return { kind: 'pause', detail: `No live agent in the workspace to fix it: ${detail}` }
    }
    return { kind: 'send-fix', cause, detail, failing }
  }
  if (observed.attributionHits.length > 0) {
    return fix('attribution', 'The PR body or commits carry Claude attribution.')
  }
  if (observed.behindBase || observed.mergeable === 'CONFLICTING') {
    return observed.mergeable === 'CONFLICTING'
      ? fix('conflict', 'The branch conflicts with the default branch.')
      : { kind: 'update-branch', detail: 'Bringing the branch up to date with the default branch.' }
  }
  const pending = pendingChecks(observed.checks)
  if (pending.length > 0) {
    return { kind: 'wait', status: 'waiting-ci', detail: `Waiting for ${pending.join(', ')}.` }
  }
  const failing = failingChecks(observed.checks)
  if (failing.length > 0) {
    // One failing job may be a flake (network, runner): rerun it once per head before blaming the code.
    if (failing.length === 1 && previous?.rerunHead !== observed.headSha) {
      return {
        kind: 'rerun-failed',
        detail: `Rerunning ${failing[0]} once in case it was a flake.`
      }
    }
    return fix('ci', `Failing checks: ${failing.join(', ')}.`, failing)
  }
  if (observed.mergeable === 'UNKNOWN') {
    return {
      kind: 'wait',
      status: 'waiting-ci',
      detail: 'Waiting for GitHub to check mergeability.'
    }
  }
  if (observed.mergeBlocker) {
    return { kind: 'pause', detail: observed.mergeBlocker }
  }
  return { kind: 'ready', detail: 'Checks pass and the branch is up to date.' }
}

const ATTRIBUTION =
  /co-authored-by:.*(claude|anthropic)|generated with \[?claude|🤖 generated with/i

/** The PR text lines that carry Claude attribution. */
export function findAttribution(texts: readonly string[]): string[] {
  return texts.flatMap((text) => text.split(/\r?\n/)).filter((line) => ATTRIBUTION.test(line))
}
