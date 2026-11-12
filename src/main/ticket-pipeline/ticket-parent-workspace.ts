import type { OrcaRuntimeService } from '../runtime/orca-runtime'

/** A ticket action runs from a parent workspace, or from the project's main one. */
export type TicketParentScope = { worktree: string } | { repo: string }

const SCAN_LIMIT = 10_000

/** The selector of the parent workspace a ticket action works under. */
export async function resolveTicketParentSelector(
  runtime: Pick<OrcaRuntimeService, 'showRepo' | 'listManagedWorktrees'>,
  scope: TicketParentScope
): Promise<string> {
  if ('worktree' in scope) {
    return scope.worktree
  }
  const repo = await runtime.showRepo(scope.repo)
  const { worktrees } = await runtime.listManagedWorktrees(repo.id, SCAN_LIMIT)
  const main = worktrees.find((w) => w.repoId === repo.id && w.isMainWorktree)
  if (!main) {
    throw new Error(`${repo.displayName} has no main workspace.`)
  }
  return `id:${main.id}`
}

export function ticketParentScope(params: { worktree?: string; repo?: string }): TicketParentScope {
  return params.worktree !== undefined ? { worktree: params.worktree } : { repo: params.repo ?? '' }
}
