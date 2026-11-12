import type { Repo } from '../../../shared/repo-types'
import type { TicketSourceKind } from '../../../shared/ticket-pipeline/ticket-types'
import { gitExecFileAsync } from '../../git/runner'
import { getBaseRefDefault } from '../../git/repo-default-base-ref'
import { getTicketItemStore } from '../ticket-item-store'
import { githubIssueTicketSource } from './github-issue-ticket-source'
import { jiraTicketSource } from './jira-ticket-source'
import { linearTicketSource } from './linear-ticket-source'
import { listTicketFilePaths, repoFileTicketSource } from './repo-file-ticket-source'
import type { TicketSource } from './ticket-source'

/**
 * The project's ticket source: its saved choice, or ticket files when the default branch has them,
 * else GitHub issues. `override` (the CLI's --source) picks between the repo-backed ones only.
 */
export async function resolveTicketSource(
  repo: Repo,
  override?: TicketSourceKind
): Promise<{ source: TicketSource; baseRef: string }> {
  await gitExecFileAsync(['fetch', '-q', 'origin'], { cwd: repo.path }).catch(() => undefined)
  const baseRef = (await getBaseRefDefault(repo.path)) ?? 'origin/main'
  const { source: config } = await getTicketItemStore().getSettings(repo.id)
  const kind = override ?? config.kind
  if (kind === 'linear' || kind === 'jira') {
    if (config.kind !== kind) {
      throw new Error(
        `Choose a ${kind === 'linear' ? 'Linear team' : 'Jira project'} for this project first.`
      )
    }
    return {
      source: config.kind === 'linear' ? linearTicketSource(config) : jiraTicketSource(config),
      baseRef
    }
  }
  if (kind !== 'github-issues') {
    const paths = await listTicketFilePaths(repo.path, baseRef)
    if (kind === 'repo-files' || paths.length > 0) {
      return { source: repoFileTicketSource(repo.path, baseRef, paths), baseRef }
    }
  }
  return { source: githubIssueTicketSource(repo), baseRef }
}
