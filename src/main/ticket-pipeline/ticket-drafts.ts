import { randomUUID } from 'node:crypto'
import { getRepoRoutingConnectionId } from '../../shared/execution-host/execution-host'
import { isFolderRepo } from '../../shared/repository/repo-kind'
import type { Repo } from '../../shared/repository/repo-types'
import { AgentLaunch } from '../../shared/rpc-contract/agent-launch/agent-launch-params'
import { renderTicketDraftBrief } from '../../shared/ticket-pipeline/ticket-draft-brief'
import {
  draftBlockerIds,
  draftIssueBody,
  orderDraftsForPublish
} from '../../shared/ticket-pipeline/ticket-draft-order'
import { TRIAGE_BODY_LINE, TRIAGE_LABEL } from '../../shared/ticket-pipeline/ticket-body-markers'
import type { TicketItem } from '../../shared/ticket-pipeline/ticket-types'
import type {
  TicketDraft,
  TicketDraftBatch,
  TicketFinding
} from '../../shared/ticket-pipeline/ticket-draft-types'
import type { RpcContext } from '../runtime/rpc/core'
import { launchAgentOnHost } from '../runtime/rpc/methods/agent-launch/agent-launch'
import { getTicketItemStore } from './ticket-item-store'
import { resolveTicketParentSelector, type TicketParentScope } from './ticket-parent-workspace'
import { resolveTicketSource } from './sources/ticket-source-resolution'
import type { TicketSource } from './sources/ticket-source'

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

/** The project's source, if its tickets can be published (ticket files are committed instead). */
export async function resolvePublishingSource(
  repo: Repo
): Promise<{ source: PublishingSource; baseRef: string }> {
  requirePublishableRepo(repo)
  const { source, baseRef } = await resolveTicketSource(repo)
  const { create, linkBlocker } = source
  if (!create || !linkBlocker) {
    throw new Error('This project keeps tickets as files in the repo; commit them there instead.')
  }
  return { source: { create, linkBlocker }, baseRef }
}

type PublishingSource = Required<Pick<TicketSource, 'create' | 'linkBlocker'>>

/** The launched ticket a finding came from; a finding never files against an unknown ticket. */
export async function findFindingOrigin(repoId: string, ticketId: string): Promise<TicketItem> {
  const origin = (await getTicketItemStore().list()).find(
    (item) => item.repoId === repoId && item.ticketId === ticketId
  )
  if (!origin) {
    throw new Error(
      `No ticket ${ticketId} was launched in this project; name the ticket you are implementing.`
    )
  }
  return origin
}

async function publishTicket(
  source: PublishingSource,
  draft: TicketDraft,
  publishedIds: ReadonlyMap<string, string>,
  titles: ReadonlyMap<string, string>
): Promise<{ id: string; url: string }> {
  const created = await source.create({
    title: draft.title.trim(),
    body: draftIssueBody(draft, publishedIds, titles),
    labels: draft.labels
  })
  for (const blocker of draftBlockerIds(draft, publishedIds)) {
    // Best effort: the body's Blocked by section still carries the edge.
    await source.linkBlocker(created.id, blocker)
  }
  return created
}

/** Creates the tickets blockers first, so each "Blocked by" names real ids; resumes a partial publish. */
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
  const { source } = await resolvePublishingSource(await runtime.showRepo(`id:${batch.repoId}`))
  const ids = new Map(batch.published.map((p) => [p.key, p.id]))
  const titles = new Map(drafts.map((d) => [d.key, d.title.trim()]))
  batch = await store.putDraftBatch({ ...batch, drafts })
  for (const draft of ordered.order) {
    if (ids.has(draft.key)) {
      continue
    }
    let created: { id: string; url: string }
    try {
      created = await publishTicket(source, draft, ids, titles)
    } catch (error) {
      return store.putDraftBatch({
        ...batch,
        error: `"${draft.title}": ${error instanceof Error ? error.message : String(error)}`
      })
    }
    ids.set(draft.key, created.id)
    batch = await store.putDraftBatch({
      ...batch,
      published: [...batch.published, { key: draft.key, id: created.id, url: created.url }]
    })
  }
  return store.putDraftBatch({ ...batch, status: 'published', error: undefined })
}

/** A finding a finding agent checked: published at once, marked for triage, linked to its ticket. */
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
  const origin = input.findingOf ? await findFindingOrigin(repo.id, input.findingOf) : null
  const draft: TicketDraft = {
    key: 'finding',
    title: input.title,
    // The body line holds it back on trackers that drop labels they do not have; Jira reads the label.
    body: input.findingOf
      ? `Found while implementing ${input.findingOf}.\n\n${TRIAGE_BODY_LINE}\n\n${input.body}`
      : input.body,
    labels: input.findingOf ? [...new Set([...input.labels, TRIAGE_LABEL])] : input.labels,
    blockedBy: input.blockedBy,
    covers: []
  }
  const checked = orderDraftsForPublish([draft])
  if (!checked.ok) {
    throw new Error(checked.error)
  }
  const { source } = await resolvePublishingSource(repo)
  const created = await publishTicket(source, draft, new Map(), new Map())
  const finding: TicketFinding = { id: created.id, url: created.url, title: draft.title.trim() }
  if (origin) {
    await getTicketItemStore().update(origin.id, {
      findings: [...(origin.findings ?? []), finding]
    })
  }
  return finding
}

/** Records "ticket is blocked by blocker" in the tracker; a finding agent's blocker pass. */
export async function linkTicketBlocker(
  runtime: Runtime,
  scope: TicketParentScope,
  input: { ticketId: string; blockerId: string }
): Promise<{ ticketId: string; blockerId: string }> {
  if (input.ticketId === input.blockerId) {
    throw new Error('A ticket cannot block itself.')
  }
  const worktree = await runtime.showManagedWorktree(
    await resolveTicketParentSelector(runtime, scope)
  )
  const { source } = await resolvePublishingSource(await runtime.showRepo(worktree.repoId))
  if (!(await source.linkBlocker(input.ticketId, input.blockerId))) {
    throw new Error(
      `The tracker refused to mark ${input.ticketId} as blocked by ${input.blockerId}.`
    )
  }
  return input
}
