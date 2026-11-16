import { randomUUID } from 'node:crypto'
import { AgentLaunch } from '../../shared/rpc-contract/agent-launch/agent-launch-params'
import { renderTicketFindingBrief } from '../../shared/ticket-pipeline/ticket-finding-brief'
import type { RpcContext } from '../runtime/rpc/core'
import { launchAgentOnHost } from '../runtime/rpc/methods/agent-launch/agent-launch'
import { findFindingOrigin, resolvePublishingSource } from './ticket-drafts'

/** Starts an agent in the ticket's parent workspace that checks one finding before filing it. */
export async function startFindingCheck(
  context: RpcContext,
  worktreeSelector: string,
  input: { findingOf: string; title: string; body: string; blockedBy: string[] }
): Promise<{ findingOf: string; title: string }> {
  const worktree = await context.runtime.showManagedWorktree(worktreeSelector)
  const repo = await context.runtime.showRepo(worktree.repoId)
  const origin = await findFindingOrigin(repo.id, input.findingOf)
  const { baseRef } = await resolvePublishingSource(repo)
  await launchAgentOnHost(
    AgentLaunch.parse({
      agent: 'claude',
      operationId: `${Date.now()}-${randomUUID().replaceAll('-', '')}`,
      presentation: 'background',
      prompt: {
        text: renderTicketFindingBrief({
          ...input,
          baseBranch: baseRef.replace(/^[^/]+\//, '')
        }),
        delivery: 'submit'
      },
      target: { kind: 'existing', worktree: `id:${origin.parentWorktreeId}` }
    }),
    context
  )
  return { findingOf: input.findingOf, title: input.title.trim() }
}
