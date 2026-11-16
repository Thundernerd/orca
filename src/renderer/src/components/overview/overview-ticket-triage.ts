import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import type { OverviewActionResult } from './overview-actions'
import { requireProjectRoute } from './overview-project-route'

// The host surveys the tickets before starting the agent.
const TRIAGE_TIMEOUT_MS = 120_000

/** Starts the project's triage skill on one ticket marked for triage, in its main workspace. */
export async function triageOverviewTicket(
  projectId: string,
  ticketId: string
): Promise<OverviewActionResult> {
  const route = requireProjectRoute(projectId)
  const result = await callRuntimeRpc<{ ticketId: string; skill: string }>(
    route.target,
    'tickets.triage',
    { repo: route.repo, ticketId },
    { timeoutMs: TRIAGE_TIMEOUT_MS }
  )
  return {
    ok: true,
    message: translate(
      'auto.components.overview.triage.started',
      'Triaging {{ticket}} with /{{skill}}.',
      {
        ticket: result.ticketId,
        skill: result.skill
      }
    )
  }
}
