import { useAppStore } from '@/store/index'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { runtimeTargetForRepoOwner } from '@/lib/workspace/ownership/repo-runtime-owner'
import { isFolderRepo } from '../../../../shared/repo-kind'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type {
  TicketLaunchResult,
  TicketLaunchSelection,
  TicketSurveyResult
} from '../../../../shared/ticket-pipeline/ticket-types'
import type { OverviewActionResult } from './overview-actions'

const SURVEY_TIMEOUT_MS = 120_000
// Each ticket creates a workspace and starts an agent before the next one begins.
const LAUNCH_TIMEOUT_MS = 10 * 60_000

export type OverviewSurveyOutcome =
  | { status: 'ok'; result: TicketSurveyResult }
  | { status: 'failed'; error: string }
  | { status: 'unavailable' }

/** The host that owns a git project, or null for folders and unreachable hosts. */
function projectTarget(projectId: string): RuntimeClientTarget | null {
  const state = useAppStore.getState()
  const repo = state.repos.find((candidate) => candidate.id === projectId)
  if (!repo || isFolderRepo(repo)) {
    return null
  }
  return runtimeTargetForRepoOwner(state, projectId)
}

export async function surveyOverviewProject(projectId: string): Promise<OverviewSurveyOutcome> {
  const target = projectTarget(projectId)
  if (!target) {
    return { status: 'unavailable' }
  }
  try {
    const result = await callRuntimeRpc<TicketSurveyResult>(
      target,
      'tickets.survey',
      { repo: projectId },
      { timeoutMs: SURVEY_TIMEOUT_MS }
    )
    return { status: 'ok', result }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

/** Launches the chosen tickets from the project's main workspace and summarises what happened. */
export async function launchOverviewTickets(
  projectId: string,
  projectName: string,
  tickets: readonly TicketLaunchSelection[]
): Promise<OverviewActionResult> {
  const target = projectTarget(projectId)
  if (!target) {
    return {
      ok: false,
      message: translate(
        'auto.components.overview.launchTickets.unavailable',
        'Tickets cannot be launched for {{project}} from here.',
        { project: projectName }
      )
    }
  }
  const result = await callRuntimeRpc<TicketLaunchResult>(
    target,
    'tickets.launch',
    { repo: projectId, tickets },
    { timeoutMs: LAUNCH_TIMEOUT_MS }
  )
  const launched = result.outcomes.filter((o) => o.status === 'launched')
  const details = result.outcomes.flatMap((o) =>
    o.status === 'launched' ? [] : [`${o.id}: ${o.reason}`]
  )
  return {
    ok: details.length === 0,
    message: [
      translate(
        'auto.components.overview.launchTickets.result',
        'Launched {{count}} of {{total}} tickets in {{project}}.',
        { count: launched.length, total: result.outcomes.length, project: projectName }
      ),
      ...details
    ].join(' ')
  }
}
