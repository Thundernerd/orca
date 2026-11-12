import { randomUUID } from 'node:crypto'
import { getRepoRoutingConnectionId } from '../../shared/execution-host'
import { isFolderRepo } from '../../shared/repo-kind'
import type { Repo } from '../../shared/repo-types'
import { AgentLaunch } from '../../shared/rpc-contract/agent-launch-params'
import { renderTicketDraftBrief } from '../../shared/ticket-pipeline/ticket-draft-brief'
import {
  draftBlockerNumbers,
  draftIssueBody,
  orderDraftsForPublish
} from '../../shared/ticket-pipeline/ticket-draft-order'
import type {
  TicketDraft,
  TicketDraftBatch,
  TicketFinding
} from '../../shared/ticket-pipeline/ticket-draft-types'
import { createIssue } from '../github/issue-create'
import { linkIssueBlockedBy } from '../github/issue-dependency-link'
import { listLabels } from '../github/issue-field-options'
import type { RpcContext } from '../runtime/rpc/core'
import { launchAgentOnHost } from '../runtime/rpc/methods/agent-launch/agent-launch'
import { getTicketItemStore } from './ticket-item-store'
import { resolveTicketParentSelector, type TicketParentScope } from './ticket-parent-workspace'

type Runtime = RpcContext['runtime']

function requirePublishableRepo(repo: Repo): void {
  if (isFolderRepo(repo) || getRepoRoutingConnectionId(repo)) {
    throw new Error('Tickets are written on the host that serves this git project.')
  }
}

async function findBatch(batchId: string): Promise<TicketDraftBatch> {
  const batch = (await getTicketItemStore().listDraftBatches()).find((b) => b.id === batchId)
  if (!batch) {
    throw new Error(`No ticket draft batch ${batchId}.`)
  }
  return batch
}

/** Starts a drafting agent in the parent workspace; its drafts come back through `submitTicketDrafts`. */
export async function startTicketDrafting(
  context: RpcContext,
  scope: TicketParentScope,
  request: string
): Promise<TicketDraftBatch> {
  const parent = await context.runtime.showManagedWorktree(
    await resolveTicketParentSelector(context.runtime, scope)
  )
  requirePublishableRepo(await context.runtime.showRepo(parent.repoId))
  const now = Date.now()
  const store = getTicketItemStore()
  const batch = await store.putDraftBatch({
    id: randomUUID(),
    repoId: parent.repoId,
    parentWorktreeId: parent.id,
    request,
    status: 'drafting',
    drafts: [],
    decisions: [],
    published: [],
    createdAt: now,
    updatedAt: now
  })
  try {
    await launchAgentOnHost(
      AgentLaunch.parse({
        agent: 'claude',
        operationId: `${now}-${randomUUID().replaceAll('-', '')}`,
        surface: 'terminal',
        presentation: 'background',
        prompt: {
          text: renderTicketDraftBrief({ batchId: batch.id, request }),
          delivery: 'submit'
        },
        target: { kind: 'existing', worktree: `id:${parent.id}` }
      }),
      context
    )
  } catch (error) {
    await store.putDraftBatch({ ...batch, status: 'discarded', error: String(error) })
    throw error
  }
  return batch
}

/** The drafting agent hands its drafts over; they wait for the user's review. */
export async function submitTicketDrafts(
  runtime: Runtime,
  batchId: string,
  drafts: TicketDraft[],
  decisions: string[]
): Promise<TicketDraftBatch> {
  const batch = await findBatch(batchId)
  if (batch.status !== 'drafting' && batch.status !== 'review') {
    throw new Error(`This batch is already ${batch.status}.`)
  }
  const ordered = orderDraftsForPublish(drafts)
  if (!ordered.ok) {
    throw new Error(ordered.error)
  }
  const next = await getTicketItemStore().putDraftBatch({
    ...batch,
    status: 'review',
    drafts,
    decisions
  })
  await runtime
    .updateManagedWorktreeMeta(`id:${batch.parentWorktreeId}`, {
      isUnread: true,
      comment: `${drafts.length} ticket draft${drafts.length === 1 ? '' : 's'} ready to review`
    })
    .catch(() => undefined)
  return next
}

export async function listTicketDraftBatches(repoId: string | null): Promise<TicketDraftBatch[]> {
  const batches = await getTicketItemStore().listDraftBatches()
  return batches
    .filter((b) => (repoId === null || b.repoId === repoId) && b.status !== 'discarded')
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function discardTicketDrafts(batchId: string): Promise<TicketDraftBatch> {
  const batch = await findBatch(batchId)
  return getTicketItemStore().putDraftBatch({ ...batch, status: 'discarded' })
}

/** Creates the issues blockers first, so each "Blocked by" names real numbers; resumes a partial publish. */
export async function publishTicketDrafts(
  runtime: Runtime,
  batchId: string,
  drafts: TicketDraft[]
): Promise<TicketDraftBatch> {
  const store = getTicketItemStore()
  let batch = await findBatch(batchId)
  if (batch.status !== 'review') {
    throw new Error(`Only drafts in review can be published; this batch is ${batch.status}.`)
  }
  const ordered = orderDraftsForPublish(drafts)
  if (!ordered.ok) {
    throw new Error(ordered.error)
  }
  const repo = await runtime.showRepo(`id:${batch.repoId}`)
  requirePublishableRepo(repo)
  const existingLabels = new Set(
    await listLabels(repo.path, repo.issueSourcePreference).catch(() => [])
  )
  const numbers = new Map(batch.published.map((p) => [p.key, p.number]))
  const titles = new Map(drafts.map((d) => [d.key, d.title.trim()]))
  batch = await store.putDraftBatch({ ...batch, drafts })
  for (const draft of ordered.order) {
    if (numbers.has(draft.key)) {
      continue
    }
    const created = await createIssue(
      repo.path,
      draft.title,
      draftIssueBody(draft, numbers, titles),
      repo.issueSourcePreference,
      null,
      { labels: draft.labels.filter((label) => existingLabels.has(label)) }
    )
    if (!created.ok) {
      return store.putDraftBatch({ ...batch, error: `"${draft.title}": ${created.error}` })
    }
    numbers.set(draft.key, created.number)
    batch = await store.putDraftBatch({
      ...batch,
      published: [...batch.published, { key: draft.key, number: created.number, url: created.url }]
    })
    for (const blocker of draftBlockerNumbers(draft, numbers)) {
      await linkIssueBlockedBy(repo.path, created.number, blocker, repo.issueSourcePreference)
    }
  }
  return store.putDraftBatch({ ...batch, status: 'published', error: undefined })
}

/** An implementing agent's finding: published at once, linked to the ticket it came from. */
export async function createFindingTicket(
  runtime: Runtime,
  scope: TicketParentScope,
  input: {
    title: string
    body: string
    labels: string[]
    blockedBy: string[]
    findingOf?: string
  }
): Promise<TicketFinding> {
  const worktree = await runtime.showManagedWorktree(
    await resolveTicketParentSelector(runtime, scope)
  )
  const repo = await runtime.showRepo(worktree.repoId)
  requirePublishableRepo(repo)
  const draft: TicketDraft = {
    key: 'finding',
    title: input.title,
    body: input.findingOf
      ? `Found while implementing ${input.findingOf}.\n\n${input.body}`
      : input.body,
    labels: input.labels,
    blockedBy: input.blockedBy,
    covers: []
  }
  const checked = orderDraftsForPublish([draft])
  if (!checked.ok) {
    throw new Error(checked.error)
  }
  const existingLabels = new Set(
    await listLabels(repo.path, repo.issueSourcePreference).catch(() => [])
  )
  const created = await createIssue(
    repo.path,
    draft.title,
    draftIssueBody(draft, new Map(), new Map()),
    repo.issueSourcePreference,
    null,
    { labels: draft.labels.filter((label) => existingLabels.has(label)) }
  )
  if (!created.ok) {
    throw new Error(created.error)
  }
  for (const blocker of draftBlockerNumbers(draft, new Map())) {
    await linkIssueBlockedBy(repo.path, created.number, blocker, repo.issueSourcePreference)
  }
  const finding: TicketFinding = {
    number: created.number,
    url: created.url,
    title: draft.title.trim()
  }
  const store = getTicketItemStore()
  const origin = (await store.list()).find(
    (item) => item.repoId === repo.id && item.ticketId === input.findingOf
  )
  if (origin) {
    await store.update(origin.id, { findings: [...(origin.findings ?? []), finding] })
  }
  return finding
}
