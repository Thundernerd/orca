import { randomUUID } from 'node:crypto'
import { AgentLaunch } from '../../shared/rpc-contract/agent-launch/agent-launch-params'
import { renderTicketTriageBrief } from '../../shared/ticket-pipeline/ticket-triage-brief'
import type { RpcContext } from '../runtime/rpc/core'
import { launchAgentOnHost } from '../runtime/rpc/methods/agent-launch/agent-launch'
import { resolveTicketParentSelector, type TicketParentScope } from './ticket-parent-workspace'
import { surveyTicketsWithSource } from './ticket-survey'

/** Starts an agent per chosen ticket in the parent workspace, each running the project's triage skill. */
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
  // One agent per ticket, each in its own tab; one failing to start leaves the others running.
  const started: string[] = []
  const failed: { id: string; reason: string }[] = []
  for (const row of rows) {
    const command = source.briefHints(row.ticket).readCommand
    try {
      await launchAgentOnHost(
        AgentLaunch.parse({
          agent: 'claude',
          operationId: `${Date.now()}-${randomUUID().replaceAll('-', '')}`,
          presentation: 'background',
          prompt: {
            text: renderTicketTriageBrief({
              ticket: row.ticket,
              read: command ? `\`${command}\`` : row.ticket.ref,
              skill
            }),
            delivery: 'submit'
          },
          target: { kind: 'existing', worktree: `id:${parent.id}` }
        }),
        context
      )
      started.push(row.ticket.id)
    } catch (error) {
      failed.push({
        id: row.ticket.id,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return { ticketIds: started, failed, skill }
}
