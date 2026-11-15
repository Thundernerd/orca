import type { OverviewWorktreeInput } from './overview-model-types'

/** Projects with a main workspace: the ones a ticket pipeline can run in. Sorted, so equal sets compare equal. */
export function ticketProjectIds(worktrees: readonly OverviewWorktreeInput[]): string[] {
  return [...new Set(worktrees.filter((w) => w.isMain).map((w) => w.repoId))].sort()
}
