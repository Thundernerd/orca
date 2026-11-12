import { describe, expect, it } from 'vitest'
import { decideWorkspaceClean, type WorkspaceCleanEvidence } from './workspace-clean-verdict'

const merged: WorkspaceCleanEvidence = {
  inOrca: true,
  hasChildren: false,
  folderExists: true,
  dirty: false,
  mergeOrRebaseInProgress: false,
  agentWorking: false,
  lastOutputAgoMs: 600_000,
  headInBase: true,
  review: null
}

const verdict = (extra: Partial<WorkspaceCleanEvidence>) =>
  decideWorkspaceClean({ ...merged, ...extra }, 30_000)

describe('decideWorkspaceClean', () => {
  it('removes a quiet, clean workspace whose work is in the base or a merged PR', () => {
    expect(verdict({})).toEqual({ verdict: 'remove', reason: 'merged-into-base' })
    expect(
      verdict({
        headInBase: false,
        review: { number: 4, state: 'merged', headContainedInReview: true }
      })
    ).toEqual({ verdict: 'remove', reason: 'review-merged' })
    expect(verdict({ folderExists: false, dirty: true })).toEqual({
      verdict: 'remove',
      reason: 'folder-gone'
    })
  })

  it('keeps anything that might still hold work, in the survey order', () => {
    expect(verdict({ inOrca: false }).reason).toBe('not-in-orca')
    expect(verdict({ hasChildren: true, folderExists: false }).reason).toBe('has-children')
    expect(verdict({ dirty: true }).reason).toBe('dirty')
    expect(verdict({ mergeOrRebaseInProgress: true }).reason).toBe('merge-in-progress')
    expect(verdict({ agentWorking: true }).reason).toBe('agent-active')
    expect(verdict({ lastOutputAgoMs: 10_000 }).reason).toBe('agent-active')
  })

  it('keeps unmerged work by what its PR says', () => {
    const unmerged = { headInBase: false }
    const review = (state: 'merged' | 'open' | 'closed', headContainedInReview = true) => ({
      ...unmerged,
      review: { number: 4, state, headContainedInReview }
    })
    expect(verdict(review('merged', false)).reason).toBe('review-merged-extra-commits')
    expect(verdict(review('open')).reason).toBe('review-open')
    expect(verdict(review('closed')).reason).toBe('review-closed')
    expect(verdict(unmerged).reason).toBe('not-merged')
  })
})
