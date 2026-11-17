import { randomUUID } from 'node:crypto'
import { AgentLaunch } from '../../shared/rpc-contract/agent-launch/agent-launch-params'
import {
  renderTicketFindingBrief,
  type TicketFindingToCheck
} from '../../shared/ticket-pipeline/ticket-finding-brief'
import type { RpcContext } from '../runtime/rpc/core'
import { launchAgentOnHost } from '../runtime/rpc/methods/agent-launch/agent-launch'
import { findFindingOrigin, resolvePublishingSource } from './ticket-drafts'
import { getTicketItemStore } from './ticket-item-store'

/** Corka itself, for a check it starts on its own rather than for an RPC caller. */
export const TICKET_PIPELINE_CALLER = { kind: 'local-cli' } as const

/** Starts one agent in the ticket's parent workspace that checks its findings before filing them. */
export async function startFindingCheck(
  context: Pick<RpcContext, 'runtime' | 'caller'>,
  worktreeSelector: string,
  input: { findingOf: string; findings: readonly TicketFindingToCheck[] }
): Promise<{ findingOf: string; titles: string[] }> {
  const worktree = await context.runtime.showManagedWorktree(worktreeSelector)
  const repo = await context.runtime.showRepo(worktree.repoId)
  const origin = await findFindingOrigin(repo.id, input.findingOf)
  const { baseRef } = await resolvePublishingSource(repo)
  const { findingCheckModel } = await getTicketItemStore().getSettings(repo.id)
  await launchAgentOnHost(
    AgentLaunch.parse({
      agent: 'claude',
      operationId: `${Date.now()}-${randomUUID().replaceAll('-', '')}`,
      presentation: 'background',
      prompt: {
        text: renderTicketFindingBrief({
          findingOf: input.findingOf,
          findings: input.findings,
          baseBranch: baseRef.replace(/^[^/]+\//, '')
        }),
        delivery: 'submit'
      },
      target: { kind: 'existing', worktree: `id:${origin.parentWorktreeId}` },
      ...(findingCheckModel ? { sessionOptions: { model: findingCheckModel } } : {})
    }),
    context
  )
  return { findingOf: input.findingOf, titles: input.findings.map((f) => f.title.trim()) }
}
