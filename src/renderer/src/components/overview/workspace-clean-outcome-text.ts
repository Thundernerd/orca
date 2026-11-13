import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import { findWorktreeById } from '@/store/github/refresh/worktree-refresh'
import type { Translate } from '@/i18n/use-translate'
import type { WorkspaceCleanOutcome } from '../../../../shared/ticket-pipeline/ticket-types'
import type { WorkspaceCleanReason } from '../../../../shared/ticket-pipeline/workspace-clean-verdict'

function reasonLabels(t: Translate): Record<WorkspaceCleanReason, string> {
  return {
    'not-in-orca': t('auto.components.overview.cleanUpWorkspaces.reason.notInOrca', 'not in Orca'),
    'has-children': t(
      'auto.components.overview.cleanUpWorkspaces.reason.hasChildren',
      'has workspaces of its own'
    ),
    'folder-gone': t(
      'auto.components.overview.cleanUpWorkspaces.reason.folderGone',
      'folder already gone'
    ),
    dirty: t(
      'auto.components.overview.cleanUpWorkspaces.reason.dirty',
      'uncommitted or untracked changes'
    ),
    'merge-in-progress': t(
      'auto.components.overview.cleanUpWorkspaces.reason.mergeInProgress',
      'merge or rebase in progress'
    ),
    'agent-active': t(
      'auto.components.overview.cleanUpWorkspaces.reason.agentActive',
      'an agent may be working'
    ),
    'merged-into-base': t(
      'auto.components.overview.cleanUpWorkspaces.reason.mergedIntoBase',
      'every commit is in the default branch'
    ),
    'review-merged': t(
      'auto.components.overview.cleanUpWorkspaces.reason.reviewMerged',
      'PR merged'
    ),
    'review-merged-extra-commits': t(
      'auto.components.overview.cleanUpWorkspaces.reason.reviewMergedExtra',
      'PR merged, but it has commits the PR never had'
    ),
    'review-open': t(
      'auto.components.overview.cleanUpWorkspaces.reason.reviewOpen',
      'PR still open'
    ),
    'review-closed': t(
      'auto.components.overview.cleanUpWorkspaces.reason.reviewClosed',
      'PR closed without merging'
    ),
    'not-merged': t(
      'auto.components.overview.cleanUpWorkspaces.reason.notMerged',
      'not merged and no PR'
    )
  }
}

export function workspaceCleanReasonLabel(
  reason: WorkspaceCleanReason,
  t: Translate = translate
): string {
  return reasonLabels(t)[reason]
}

/** A kept outcome carries a survey reason, 'not-a-child', or a removal error message. */
function keptReasonLabel(reason: string): string {
  const labels = reasonLabels(translate)
  if (Object.hasOwn(labels, reason)) {
    return labels[reason as WorkspaceCleanReason]
  }
  if (reason === 'not-a-child') {
    return translate(
      'auto.components.overview.cleanUpWorkspaces.reason.notAChild',
      'no longer a child workspace'
    )
  }
  return reason
}

/** One "<workspace>: <why>." note per workspace the clean-up kept. */
export function keptWorkspaceNotes(outcomes: readonly WorkspaceCleanOutcome[]): string[] {
  const state = useAppStore.getState()
  return outcomes.flatMap((o) =>
    o.status === 'kept'
      ? [
          `${findWorktreeById(state, o.worktreeId)?.displayName || o.worktreeId}: ${keptReasonLabel(o.reason)}.`
        ]
      : []
  )
}
