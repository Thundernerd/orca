import type * as z from 'zod'
import { getLocalWorktreeCatalogVersion } from '../../../../workspaces/catalog/local-worktree-scan-generation'
import { getExplicitWorktreeIdSelector } from '../../../workspaces/catalog/runtime-worktree-selection'
import { splitWorktreeId } from '../../../../../shared/worktree/id'
import type { WorktreeRemove } from '../../../../../shared/rpc-contract/worktree-params'
import type { RpcContext } from '../../core'
import { resolvePairedCallerHostId } from '../pairing/paired-caller-host-id'
import { waitsForWorktreeRemoval } from '../../worktree-removal-marker-projection'
import { queueWorkspaceDelete } from '../../../workspaces/lifecycle/workspace-lifecycle-commands'

/** The `worktree.rm` removal, shared with clean-up so every removal takes the same queue and host checks. */
export async function removeWorktreeForRpc(
  params: z.infer<typeof WorktreeRemove>,
  context: RpcContext
) {
  const { runtime } = context
  if (runtime.ownsRecipeWorkspaceRemoval?.(params)) {
    return runtime.removeRecipeWorkspace(params)
  }
  // Translate a paired client's runtime-local host spelling before host-qualified reads.
  let resolvedHostId = resolvePairedCallerHostId(
    () => runtime.listRepos(),
    params.worktree,
    params.hostId
  )
  // Older mobile omits hostId; resolve ambiguity before pinning removal and refuse ids shared by two hosts.
  if (!resolvedHostId) {
    try {
      resolvedHostId = (await runtime.showManagedWorktree(params.worktree)).hostId
      if (!resolvedHostId) {
        throw new Error('worktree.rm could not resolve the workspace host')
      }
    } catch (error) {
      // Git may omit a stale path: selector_not_found must reach removeManagedWorktree; propagate other resolution failures.
      if (!(error instanceof Error) || error.message !== 'selector_not_found') {
        throw error
      }
    }
  }
  // Parse id: selectors for repo stamping; resolving again scans and rejects ids shared by hosts. Leave other selectors unstamped.
  const explicitWorktreeId = getExplicitWorktreeIdSelector(params.worktree)
  const repoId = explicitWorktreeId ? splitWorktreeId(explicitWorktreeId)?.repoId : undefined
  const result = await queueWorkspaceDelete(
    runtime,
    params.worktree,
    resolvedHostId,
    params,
    (removal) => {
      const options = {
        ...removal,
        waitForBackgroundRemoval: waitsForWorktreeRemoval(context, params)
      }
      return params.approvedNestedWorktrees
        ? runtime.removeManagedWorktreeWithNested(
            params.worktree,
            params.approvedNestedWorktrees,
            options
          )
        : runtime.removeManagedWorktree(params.worktree, options)
    }
  )
  return {
    removed: result.removing !== true,
    ...result,
    ...(repoId ? { catalogVersion: getLocalWorktreeCatalogVersion(repoId) } : {})
  }
}
