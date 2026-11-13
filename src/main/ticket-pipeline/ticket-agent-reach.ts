import { randomUUID } from 'node:crypto'
import { isOrcaSessionId } from '../../shared/orca-session-address'
import type { TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/host/structured-agent-session-registry'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { mintAgentSessionOperationId } from '../runtime/orchestration/mailbox/structured-pointer/structured-pointer-operation-id'
import { sendAgentTurn } from '../runtime/orchestration/turn-delivery/send-agent-turn'
import { observeChatAssignee } from '../runtime/orchestration/workers/lifecycle/chat-assignee'

/** Where a fix brief can reach the ticket's agent: its terminal, or its chat's live session. */
export type TicketAgentReach =
  | { kind: 'terminal'; handle: string }
  | { kind: 'chat'; sessionId: string; fence: number }

export async function findTicketAgent(
  runtime: OrcaRuntimeService,
  item: TicketItem
): Promise<TicketAgentReach | null> {
  if (item.agentSessionId) {
    // A /clear moves the chat to a successor session; observing follows it to the live one.
    const observed = isOrcaSessionId(item.agentSessionId)
      ? observeChatAssignee(item.agentSessionId, null)
      : null
    return observed?.status === 'live'
      ? {
          kind: 'chat',
          sessionId: observed.session.sessionId,
          fence: observed.session.currentFence
        }
      : null
  }
  const listed = await runtime
    .listTerminals(`id:${item.childWorktreeId}`, undefined, { includeVisualLayouts: false })
    .catch(() => null)
  const terminals = listed?.terminals ?? []
  const launched = terminals.find((t) => t.handle === item.agentTerminalHandle)
  const handle = (launched ?? terminals.find((t) => t.agentIdentity))?.handle
  return handle ? { kind: 'terminal', handle } : null
}

export async function sendTicketAgentFixBrief(
  runtime: OrcaRuntimeService,
  item: TicketItem,
  agent: TicketAgentReach,
  brief: string
): Promise<boolean> {
  if (agent.kind === 'terminal') {
    const sent = await runtime.sendTerminalAgentPrompt(agent.handle, brief, {
      inputKind: 'orchestration',
      acceptQueued: true,
      observationTimeoutMs: 0,
      requestId: randomUUID()
    })
    return sent.accepted
  }
  const host = getStructuredAgentSessionHost()
  if (!host) {
    return false
  }
  const outcome = await sendAgentTurn({
    kind: 'structured-session',
    host,
    sessionId: agent.sessionId,
    callerKey: `trusted-local:merge-queue:${item.id}`,
    turn: {
      body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: brief }] },
      delivery: 'queue',
      operationId: mintAgentSessionOperationId(Date.now()),
      expectedRuntimeFence: agent.fence
    }
  })
  return (
    outcome.kind === 'queued' ||
    (outcome.kind === 'sent' && outcome.submission?.dispatchState !== 'rejected')
  )
}
