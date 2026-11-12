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
import { resolveTicketSource } from './sources/ticket-source-resolution'
import type { TicketSource } from './sources/ticket-source'

export type TicketSurveyRuntime = {
  showManagedWorktree(selector: string): Promise<Pick<RuntimeWorktreeRecord, 'id' | 'repoId'>>
  showRepo(selector: string): Promise<Repo>
  listManagedWorktrees(repoSelector: string, limit: number): Promise<RuntimeWorktreeListResult>
}

const WORKTREE_SCAN_LIMIT = 10_000

export type TicketSurveyScope = { worktree: string } | { repo: string }

/** A survey together with the source it read, so a launch claims and links through the same one. */
export async function surveyTicketsWithSource(
  runtime: TicketSurveyRuntime,
  scope: TicketSurveyScope,
  sourceOverride?: TicketSourceKind
): Promise<{ result: TicketSurveyResult; source: TicketSource; repo: Repo }> {
  const parent = 'worktree' in scope ? await runtime.showManagedWorktree(scope.worktree) : null
  const repo = await runtime.showRepo('repo' in scope ? scope.repo : (parent?.repoId ?? ''))
  if (isFolderRepo(repo)) {
    throw new Error('Tickets need a git project; this is a folder.')
  }
  if (getRepoRoutingConnectionId(repo)) {
    throw new Error('Run the ticket survey on the host that serves this project.')
  }
  const { source, baseRef } = await resolveTicketSource(repo, sourceOverride)
  const { tickets, doneIds } = await source.survey()

  const { worktrees } = await runtime.listManagedWorktrees(repo.id, WORKTREE_SCAN_LIMIT)
  const signatures = worktrees
    .filter((w) => w.repoId === repo.id && w.id !== parent?.id)
    .map((w) => ({
      worktreeId: w.id,
      linkedIssue: w.linkedIssue,
      linkedKey: w.linkedLinearIssue ?? w.linkedWorkItem?.jiraIdentifier ?? null,
      displayName: w.displayName,
      branch: w.branch
    }))

  return {
    result: {
      source: source.kind,
      baseRef,
      parentWorktreeId: parent?.id ?? null,
      rows: classifyTickets(tickets, doneIds, signatures)
    },
    source,
    repo
  }
}

/** Read-only: which of the project's open tickets can be launched now, from a parent workspace or the project. */
export async function surveyTickets(
  runtime: TicketSurveyRuntime,
  scope: TicketSurveyScope,
  sourceOverride?: TicketSourceKind
): Promise<TicketSurveyResult> {
  return (await surveyTicketsWithSource(runtime, scope, sourceOverride)).result
}
