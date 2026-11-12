import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { getRepoRoutingConnectionId } from '../../shared/execution-host'
import { isFolderRepo } from '../../shared/repo-kind'
import type { RuntimeWorktreeRecord } from '../../shared/runtime-worktree-contracts'
import {
  decideWorkspaceClean,
  type WorkspaceCleanEvidence
} from '../../shared/ticket-pipeline/workspace-clean-verdict'
import type {
  WorkspaceCleanOutcome,
  WorkspaceCleanResult,
  WorkspaceCleanRow,
  WorkspaceCleanSurveyResult
} from '../../shared/ticket-pipeline/ticket-types'
import { gitExecFileAsync } from '../git/command-runner/git-exec-file'
import { getDefaultBaseRefAsync } from '../git/refs/resolution/repo-default-base-ref'
import type { RpcContext } from '../runtime/rpc/core'
import { removeWorktreeForRpc } from '../runtime/rpc/methods/workspaces/worktree-removal-rpc'
import { getTicketItemStore } from './ticket-item-store'
import { resolveTicketParentSelector, type TicketParentScope } from './ticket-parent-workspace'

const SCAN_LIMIT = 10_000

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await gitExecFileAsync(args, { cwd })).stdout.trim()
  } catch {
    return null
  }
}

async function isAncestor(cwd: string, commit: string, of: string): Promise<boolean> {
  return (await git(cwd, ['merge-base', '--is-ancestor', commit, of])) !== null
}

async function gatherEvidence(
  runtime: RpcContext['runtime'],
  child: RuntimeWorktreeRecord | undefined,
  activity: { status: string; lastOutputAt: number | null } | undefined,
  baseRef: string,
  parentPath: string,
  now: number
): Promise<{ evidence: WorkspaceCleanEvidence; reviewNumber: number | null }> {
  const evidence: WorkspaceCleanEvidence = {
    inOrca: child !== undefined,
    hasChildren: (child?.childWorktreeIds.length ?? 0) > 0,
    folderExists: child ? await exists(child.path) : false,
    dirty: false,
    mergeOrRebaseInProgress: false,
    agentWorking: activity?.status === 'working',
    lastOutputAgoMs: activity?.lastOutputAt ? now - activity.lastOutputAt : null,
    headInBase: false,
    review: null
  }
  if (!child || !evidence.folderExists) {
    return { evidence, reviewNumber: null }
  }
  // An unreadable checkout counts as dirty: doubt keeps the workspace.
  evidence.dirty = (await git(child.path, ['status', '--porcelain'])) !== ''
  const gitDir = await git(child.path, ['rev-parse', '--absolute-git-dir'])
  if (gitDir) {
    const markers = ['MERGE_HEAD', 'rebase-merge', 'rebase-apply'].map((m) => join(gitDir, m))
    evidence.mergeOrRebaseInProgress = (await Promise.all(markers.map(exists))).some(Boolean)
  }
  const head = await git(child.path, ['rev-parse', 'HEAD'])
  if (!head) {
    evidence.dirty = true
    return { evidence, reviewNumber: null }
  }
  evidence.headInBase = await isAncestor(parentPath, head, baseRef)
  if (evidence.headInBase) {
    return { evidence, reviewNumber: null }
  }
  const branch = child.branch.replace(/^refs\/heads\//, '')
  const outcome = await runtime
    .getRepoPRForBranch(`id:${child.repoId}`, branch, child.linkedPR, null, true, head, 'watch')
    .catch(() => null)
  if (outcome?.kind === 'found') {
    const prHead = outcome.pr.headSha
    evidence.review = {
      number: outcome.pr.number,
      state: outcome.pr.state,
      headContainedInReview: prHead ? await isAncestor(child.path, head, prHead) : false
    }
    return { evidence, reviewNumber: outcome.pr.number }
  }
  return { evidence, reviewNumber: null }
}

/** Read-only: which children of the parent workspace hold nothing worth keeping. */
export async function surveyWorkspaceClean(
  runtime: RpcContext['runtime'],
  scope: TicketParentScope
): Promise<WorkspaceCleanSurveyResult> {
  const parent = await runtime.showManagedWorktree(
    await resolveTicketParentSelector(runtime, scope)
  )
  const repo = await runtime.showRepo(parent.repoId)
  if (isFolderRepo(repo) || getRepoRoutingConnectionId(repo)) {
    throw new Error('Clean-up runs on the host that serves this git project.')
  }
  await git(parent.path, ['fetch', '-q', '--prune', 'origin'])
  const baseRef = (await getDefaultBaseRefAsync(parent.path)) ?? 'origin/main'
  const [listed, ps] = await Promise.all([
    runtime.listManagedWorktrees(repo.id, SCAN_LIMIT),
    runtime.getWorktreePs(SCAN_LIMIT)
  ])
  const records = new Map(listed.worktrees.map((w) => [w.id, w]))
  const activity = new Map(ps.worktrees.map((w) => [w.worktreeId, w]))
  const now = Date.now()
  const rows: WorkspaceCleanRow[] = []
  for (const childId of parent.childWorktreeIds) {
    const child = records.get(childId)
    const { evidence, reviewNumber } = await gatherEvidence(
      runtime,
      child,
      activity.get(childId),
      baseRef,
      parent.path,
      now
    )
    const { verdict, reason } = decideWorkspaceClean(evidence)
    rows.push({
      worktreeId: childId,
      name: child?.displayName || childId,
      branch: child?.branch.replace(/^refs\/heads\//, '') ?? '',
      verdict,
      reason,
      reviewNumber
    })
  }
  return { parentWorktreeId: parent.id, baseRef, rows }
}

/** Removes the confirmed children the survey still clears, never forced; a leftover branch goes only via `git branch -d`. */
export async function cleanWorkspaces(
  context: RpcContext,
  scope: TicketParentScope,
  worktreeIds: readonly string[]
): Promise<WorkspaceCleanResult> {
  const survey = await surveyWorkspaceClean(context.runtime, scope)
  const parent = await context.runtime.showManagedWorktree(`id:${survey.parentWorktreeId}`)
  const rows = new Map(survey.rows.map((row) => [row.worktreeId, row]))
  const items = await getTicketItemStore().list()
  const outcomes: WorkspaceCleanOutcome[] = []
  for (const worktreeId of worktreeIds) {
    const row = rows.get(worktreeId)
    if (!row || row.verdict !== 'remove') {
      // The survey is the ceiling: something changed since the user saw it.
      outcomes.push({ worktreeId, status: 'kept', reason: row ? row.reason : 'not-a-child' })
      continue
    }
    try {
      await removeWorktreeForRpc(
        { worktree: `id:${worktreeId}`, waitForBackgroundRemoval: true },
        context
      )
    } catch (error) {
      outcomes.push({
        worktreeId,
        status: 'kept',
        reason: error instanceof Error ? error.message : String(error)
      })
      continue
    }
    let branchLeftover: string | undefined
    if (
      row.branch &&
      (await git(parent.path, ['rev-parse', '--verify', '--quiet', `refs/heads/${row.branch}`]))
    ) {
      // -d refuses unmerged work (a squash merge, say); then the branch stays for the user.
      branchLeftover =
        (await git(parent.path, ['branch', '-d', row.branch])) === null ? row.branch : undefined
    }
    for (const item of items.filter((i) => i.childWorktreeId === worktreeId)) {
      await getTicketItemStore().update(item.id, { stage: 'cleaned' })
    }
    outcomes.push({ worktreeId, status: 'removed', ...(branchLeftover ? { branchLeftover } : {}) })
  }
  return { outcomes }
}
