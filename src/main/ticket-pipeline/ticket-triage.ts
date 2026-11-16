import { randomUUID } from 'node:crypto'
import { AgentLaunch } from '../../shared/rpc-contract/agent-launch-params'
import { renderTicketTriageBrief } from '../../shared/ticket-pipeline/ticket-triage-brief'
import type { RpcContext } from '../runtime/rpc/core'
import { launchAgentOnHost } from '../runtime/rpc/methods/agent-launch/agent-launch'
import { resolveTicketParentSelector, type TicketParentScope } from './ticket-parent-workspace'
import { surveyTicketsWithSource } from './ticket-survey'

/** Starts an agent in the parent workspace that runs the project's triage skill on one ticket. */
export async function startTicketTriage(
  context: RpcContext,
  scope: TicketParentScope,
  ticketId: string
): Promise<{ ticketId: string; skill: string }> {
  const parent = await context.runtime.showManagedWorktree(
    await resolveTicketParentSelector(context.runtime, scope)
  )
  const { result, source } = await surveyTicketsWithSource(context.runtime, {
    worktree: `id:${parent.id}`
  })
  const row = result.rows.find((r) => r.ticket.id === ticketId)
  if (!row || row.status !== 'triage') {
    throw new Error(
      row
        ? `${ticketId} is ${row.status}, not waiting for triage.`
        : `${ticketId} is no longer an open ticket.`
    )
  }
  const skill = result.triageSkill
  if (!skill) {
    throw new Error('No triage skill is installed for this project.')
  }
  const now = Date.now()
  await launchAgentOnHost(
    AgentLaunch.parse({
      agent: 'claude',
      operationId: `${now}-${randomUUID().replaceAll('-', '')}`,
      presentation: 'background',
      prompt: {
        text: renderTicketTriageBrief({
          ticket: row.ticket,
          skill,
          readCommand: source.briefHints(row.ticket).readCommand
        }),
        delivery: 'submit'
      },
      target: { kind: 'existing', worktree: `id:${parent.id}` }
    }),
    context
  )
  return { ticketId, skill }
}
