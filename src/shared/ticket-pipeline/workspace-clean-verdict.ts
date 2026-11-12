import type { PRState } from '../github/pull-request-types'

/** Terminal output this recent counts as an agent at work. */
export const CLEAN_QUIET_MS = 30_000

/** What the clean-up survey found about one child workspace. */
export type WorkspaceCleanEvidence = {
  inOrca: boolean
  hasChildren: boolean
  folderExists: boolean
  /** Uncommitted or untracked files. */
  dirty: boolean
  mergeOrRebaseInProgress: boolean
  agentWorking: boolean
  /** Milliseconds since its terminals last printed; null when none ever did. */
  lastOutputAgoMs: number | null
  /** Every commit is already in the default branch. */
  headInBase: boolean
  review: {
    number: number
    state: PRState
    /** The workspace has nothing beyond what the PR's last head had. */
    headContainedInReview: boolean
  } | null
}

export type WorkspaceCleanReason =
  | 'not-in-orca'
  | 'has-children'
  | 'folder-gone'
  | 'dirty'
  | 'merge-in-progress'
  | 'agent-active'
  | 'merged-into-base'
  | 'review-merged'
  | 'review-merged-extra-commits'
  | 'review-open'
  | 'review-closed'
  | 'not-merged'

export type WorkspaceCleanVerdict = { verdict: 'remove' | 'keep'; reason: WorkspaceCleanReason }

/** Remove only what holds nothing worth keeping; every doubt keeps the workspace. */
export function decideWorkspaceClean(
  evidence: WorkspaceCleanEvidence,
  quietMs = CLEAN_QUIET_MS
): WorkspaceCleanVerdict {
  const keep = (reason: WorkspaceCleanReason): WorkspaceCleanVerdict => ({
    verdict: 'keep',
    reason
  })
  if (!evidence.inOrca) {
    return keep('not-in-orca')
  }
  if (evidence.hasChildren) {
    return keep('has-children')
  }
  if (!evidence.folderExists) {
    // Only drops the stale Orca entry; there is nothing on disk to lose.
    return { verdict: 'remove', reason: 'folder-gone' }
  }
  if (evidence.dirty) {
    return keep('dirty')
  }
  if (evidence.mergeOrRebaseInProgress) {
    return keep('merge-in-progress')
  }
  if (
    evidence.agentWorking ||
    (evidence.lastOutputAgoMs !== null && evidence.lastOutputAgoMs < quietMs)
  ) {
    return keep('agent-active')
  }
  if (evidence.headInBase) {
    return { verdict: 'remove', reason: 'merged-into-base' }
  }
  // Squash or rebase merges leave the commits out of the base; trust the review instead.
  switch (evidence.review?.state) {
    case 'merged':
      return evidence.review.headContainedInReview
        ? { verdict: 'remove', reason: 'review-merged' }
        : keep('review-merged-extra-commits')
    case 'open':
    case 'draft':
      return keep('review-open')
    case 'closed':
      return keep('review-closed')
    case undefined:
      return keep('not-merged')
  }
}
