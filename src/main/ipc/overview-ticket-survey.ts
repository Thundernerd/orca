import { runProcess } from '@orca/process-host'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import { hasRemoteFilesystemOwner } from './remote-filesystem-owner'
import type { OverviewTicketSurveyResult } from '../../shared/overview-ticket-survey-result'

const SURVEY_TIMEOUT_MS = 120_000

// Fixed location of the launch-tickets skill; the renderer never names a script or directory.
function surveyScriptPath(): string {
  return join(homedir(), '.claude', 'skills', 'launch-tickets', 'scripts', 'survey.sh')
}

async function runSurvey(script: string, cwd: string): Promise<OverviewTicketSurveyResult> {
  try {
    const result = await runProcess(
      { program: 'bash', args: [script], cwd, timeoutMs: SURVEY_TIMEOUT_MS },
      'tail'
    )
    if (result.timedOut) {
      return { status: 'failed', error: 'The ticket survey timed out.' }
    }
    if (result.code !== 0) {
      const detail = result.stderr.trim().split('\n').pop()
      return { status: 'failed', error: detail || `survey.sh exited with ${result.code}` }
    }
    return { status: 'ok', stdout: result.stdout }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

export function registerOverviewTicketSurveyHandlers(store: Store): void {
  ipcMain.handle(
    'overview:surveyTickets',
    async (_event, args: { repoId: string }): Promise<OverviewTicketSurveyResult> => {
      // The script is bash and reads a local checkout; Windows has no reliable bash on PATH.
      if (process.platform === 'win32') {
        return { status: 'unavailable' }
      }
      const script = surveyScriptPath()
      if (!existsSync(script)) {
        return { status: 'unavailable' }
      }
      const repo = store.getRepos().find((candidate) => candidate.id === args?.repoId)
      if (!repo || hasRemoteFilesystemOwner(repo)) {
        return { status: 'unavailable' }
      }
      return runSurvey(script, repo.path)
    }
  )
}
