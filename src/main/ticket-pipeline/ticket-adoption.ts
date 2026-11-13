import { randomUUID } from 'node:crypto'
import type { TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { getTicketItemStore } from './ticket-item-store'
import { surveyTicketsWithSource } from './ticket-survey'

const SCAN_LIMIT = 10_000

/** Tracks ticket-named workspaces with an open PR that no launch recorded, such as ones started before Corka, so the queue can merge them. */
export async function adoptUntrackedTicketWorkspaces(
  runtime: OrcaRuntimeService,
  parent: { id: string; repoId: string }
): Promise<number> {
  const store = getTicketItemStore()
  const tracked = new Set((await store.list()).map((item) => item.childWorktreeId))
  const { result, source } = await surveyTicketsWithSource(runtime, { worktree: `id:${parent.id}` })
  const candidates = result.rows.filter(
    (row) => row.status === 'launched' && row.worktreeId && !tracked.has(row.worktreeId)
  )
  if (candidates.length === 0) {
    return 0
  }
  const { worktrees } = await runtime.listManagedWorktrees(`id:${parent.repoId}`, SCAN_LIMIT)
  const branches = new Map(worktrees.map((w) => [w.id, w.branch.replace(/^refs\/heads\//, '')]))
  let adopted = 0
  for (const row of candidates) {
    const worktreeId = row.worktreeId ?? ''
    const branch = branches.get(worktreeId)
    // A workspace merely linked to the issue is the user's own; only a ticket-named branch joins.
    if (!branch || !branch.split('/').some((part) => part.startsWith(`${row.ticket.slugId}-`))) {
      continue
    }
    const outcome = await runtime
      .getRepoPRForBranch(`id:${parent.repoId}`, branch, null, null, false, null, 'watch')
      .catch(() => null)
    // Only an open PR belongs in the queue; drafts and finished PRs stay out.
    if (outcome?.kind !== 'found' || outcome.pr.state !== 'open') {
      continue
    }
    const now = Date.now()
    const item: TicketItem = {
      id: randomUUID(),
      repoId: parent.repoId,
      parentWorktreeId: parent.id,
      childWorktreeId: worktreeId,
      source: source.kind,
      ticketId: row.ticket.id,
      ticketTitle: row.ticket.title,
      ticketUrl: row.ticket.url,
      issueNumber: row.ticket.issueNumber,
      branch,
      stage: 'in-review',
      reviewNumber: outcome.pr.number,
      reviewUrl: outcome.pr.url,
      createdAt: now,
      updatedAt: now
    }
    await store.put(item)
    adopted += 1
  }
  return adopted
}
