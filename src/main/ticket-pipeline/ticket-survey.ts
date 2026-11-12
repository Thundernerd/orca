import { getRepoRoutingConnectionId } from '../../shared/execution-host'
import { isFolderRepo } from '../../shared/repo-kind'
import type { Repo } from '../../shared/repo-types'
import type {
  RuntimeWorktreeListResult,
  RuntimeWorktreeRecord
} from '../../shared/runtime-worktree-contracts'
import { classifyTickets } from '../../shared/ticket-pipeline/ticket-classification'
import type {
  TicketSourceKind,
  TicketSurveyResult
} from '../../shared/ticket-pipeline/ticket-types'
import { gitExecFileAsync } from '../git/runner'
import { getBaseRefDefault } from '../git/repo-default-base-ref'
import { surveyOpenIssueTickets } from '../github/issue-dependency-survey'
import { listTicketFilePaths, surveyRepoFileTickets } from './sources/repo-file-ticket-source'

export type TicketSurveyRuntime = {
  showManagedWorktree(selector: string): Promise<Pick<RuntimeWorktreeRecord, 'id' | 'repoId'>>
  showRepo(selector: string): Promise<Repo>
  listManagedWorktrees(repoSelector: string, limit: number): Promise<RuntimeWorktreeListResult>
}

const WORKTREE_SCAN_LIMIT = 10_000

export type TicketSurveyScope = { worktree: string } | { repo: string }

/** Read-only: which of the project's open tickets can be launched now, from a parent workspace or the project. */
export async function surveyTickets(
  runtime: TicketSurveyRuntime,
  scope: TicketSurveyScope,
  sourceOverride?: TicketSourceKind
): Promise<TicketSurveyResult> {
  const parent = 'worktree' in scope ? await runtime.showManagedWorktree(scope.worktree) : null
  const repo = await runtime.showRepo('repo' in scope ? scope.repo : (parent?.repoId ?? ''))
  if (isFolderRepo(repo)) {
    throw new Error('Tickets need a git project; this is a folder.')
  }
  if (getRepoRoutingConnectionId(repo)) {
    throw new Error('Run the ticket survey on the host that serves this project.')
  }

  await gitExecFileAsync(['fetch', '-q', 'origin'], { cwd: repo.path }).catch(() => undefined)
  const baseRef = (await getBaseRefDefault(repo.path)) ?? 'origin/main'
  const filePaths =
    sourceOverride === 'github-issues' ? [] : await listTicketFilePaths(repo.path, baseRef)
  const source: TicketSourceKind =
    sourceOverride ?? (filePaths.length > 0 ? 'repo-files' : 'github-issues')

  const { tickets, doneIds } =
    source === 'repo-files'
      ? await surveyRepoFileTickets(repo.path, baseRef, filePaths)
      : await surveyOpenIssueTickets(repo.path, repo.issueSourcePreference)

  const { worktrees } = await runtime.listManagedWorktrees(repo.id, WORKTREE_SCAN_LIMIT)
  const signatures = worktrees
    .filter((w) => w.repoId === repo.id && w.id !== parent?.id)
    .map((w) => ({
      worktreeId: w.id,
      linkedIssue: w.linkedIssue,
      displayName: w.displayName,
      branch: w.branch
    }))

  return {
    source,
    baseRef,
    parentWorktreeId: parent?.id ?? null,
    rows: classifyTickets(tickets, doneIds, signatures)
  }
}
