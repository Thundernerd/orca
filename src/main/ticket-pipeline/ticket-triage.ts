import { randomUUID } from 'node:crypto'
import { AgentLaunch } from '../../shared/rpc-contract/agent-launch/agent-launch-params'
import { renderTicketTriageBrief } from '../../shared/ticket-pipeline/ticket-triage-brief'
import type { RpcContext } from '../runtime/rpc/core'
import { launchAgentOnHost } from '../runtime/rpc/methods/agent-launch/agent-launch'
import { resolveTicketParentSelector, type TicketParentScope } from './ticket-parent-workspace'
import { getTicketItemStore } from './ticket-item-store'
import { surveyTicketsWithSource } from './ticket-survey'

const MAX_TRIAGE_BATCH = 5

/** Starts agents in the parent workspace that run the project's triage skill on the chosen tickets,
 *  up to MAX_TRIAGE_BATCH per agent. */
export async function startTicketTriage(
  context: RpcContext,
  scope: TicketParentScope,
  ticketIds: readonly string[]
): Promise<{ ticketIds: string[]; failed: { id: string; reason: string }[]; skill: string }> {
  const parent = await context.runtime.showManagedWorktree(
    await resolveTicketParentSelector(context.runtime, scope)
  )
  const { result, source } = await surveyTicketsWithSource(context.runtime, {
    worktree: `id:${parent.id}`
  })
  const wanted = new Set(ticketIds)
  // Tickets triaged or launched since the user looked are left alone.
  const rows = result.rows.filter((r) => wanted.has(r.ticket.id) && r.status === 'triage')
  if (rows.length === 0) {
    throw new Error('None of those tickets is waiting for triage any more.')
  }
  const skill = result.triageSkill
  if (!skill) {
    throw new Error('No triage skill is installed for this project.')
  }
  const { triageModel } = await getTicketItemStore().getSettings(parent.repoId)
  // Batches share one session, so the repo docs load once; the cap keeps its context from growing unbounded.
  const started: string[] = []
  const failed: { id: string; reason: string }[] = []
  for (let i = 0; i < rows.length; i += MAX_TRIAGE_BATCH) {
    const batch = rows.slice(i, i + MAX_TRIAGE_BATCH)
    try {
      await launchAgentOnHost(
        AgentLaunch.parse({
          agent: 'claude',
          operationId: `${Date.now()}-${randomUUID().replaceAll('-', '')}`,
          presentation: 'background',
          prompt: {
            text: renderTicketTriageBrief({
              tickets: batch.map((row) => {
                const command = source.briefHints(row.ticket).readCommand
                return { ticket: row.ticket, read: command ? `\`${command}\`` : row.ticket.ref }
              }),
              skill
            }),
            delivery: 'submit'
          },
          target: { kind: 'existing', worktree: `id:${parent.id}` },
          ...(triageModel ? { sessionOptions: { model: triageModel } } : {})
        }),
        context
      )
      started.push(...batch.map((row) => row.ticket.id))
    } catch (error) {
      // One batch failing to start leaves the others running.
      const reason = error instanceof Error ? error.message : String(error)
      failed.push(...batch.map((row) => ({ id: row.ticket.id, reason })))
    }
  }
  return { ticketIds: started, failed, skill }
}
