import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import type { OverviewActionResult } from './overview-actions'
import { requireProjectRoute } from './overview-project-route'

// The host surveys the tickets, then starts an agent per ticket, as a launch does.
const TRIAGE_TIMEOUT_MS = 10 * 60_000

/** Starts an agent per chosen ticket with the project's triage skill, in its main workspace. */
export async function triageOverviewTickets(
  projectId: string,
  ticketIds: readonly string[]
): Promise<OverviewActionResult> {
  const route = requireProjectRoute(projectId)
  const result = await callRuntimeRpc<{
    ticketIds: string[]
    failed: { id: string; reason: string }[]
    skill: string
  }>(
    route.target,
    'tickets.triage',
    { repo: route.repo, ticketIds },
    { timeoutMs: TRIAGE_TIMEOUT_MS }
  )
  return {
    ok: result.failed.length === 0,
    message: [
      ...(result.ticketIds.length > 0
        ? [
            translate(
              'auto.components.overview.triage.started',
              'Triaging {{ticket}} with /{{skill}}.',
              { ticket: result.ticketIds.join(', '), skill: result.skill }
            )
          ]
        : []),
      ...result.failed.map((f) => `${f.id}: ${f.reason}`)
    ].join(' ')
  }
}
