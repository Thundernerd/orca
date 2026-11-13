import type { TicketPipelineStatus } from '../../shared/ticket-pipeline/ticket-types'
import { queueOrder } from './merge-queue-order'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'
import { ticketTrackerStatus } from './ticket-tracker'

// A drafting agent that never reported back is abandoned, not still drafting.
const DRAFTING_STALE_MS = 24 * 60 * 60 * 1000

/** Local state only, so the Overview can poll it: no GitHub or git reads. */
export async function ticketPipelineStatus(
  parentWorktreeId: string,
  repoId: string,
  store: TicketItemStore = getTicketItemStore()
): Promise<TicketPipelineStatus> {
  const [items, settings, pausedReason, batches] = await Promise.all([
    store.list(),
    store.getSettings(repoId),
    store.getQueuePause(parentWorktreeId),
    store.listDraftBatches()
  ])
  const ownBatches = batches
    .filter((b) => b.parentWorktreeId === parentWorktreeId)
    .sort((a, b) => a.createdAt - b.createdAt)
  const ordered = queueOrder(items, parentWorktreeId)
  const head = ordered[0]
  const children = items.filter((i) => i.parentWorktreeId === parentWorktreeId)
  const lastRemoved = children
    .filter((i) => i.stage === 'cleaned')
    .reduce<(typeof children)[number] | null>(
      (latest, i) => (latest && latest.updatedAt >= i.updatedAt ? latest : i),
      null
    )
  const merged = children.filter((i) => i.stage === 'merged')
  const held = merged.flatMap((i) =>
    i.autoCleanHeld ? [{ ticketId: i.ticketId, ...i.autoCleanHeld }] : []
  )
  return {
    ...ticketTrackerStatus(),
    autoMerge: settings.autoMerge,
    autoClean: settings.autoClean,
    queue: {
      head: head
        ? {
            ticketId: head.ticketId,
            reviewNumber: head.reviewNumber,
            status: head.queue?.status ?? null,
            detail: head.queue?.detail ?? null,
            since: head.queue?.statusSince ?? null
          }
        : null,
      waiting: Math.max(0, ordered.length - 1),
      pausedReason
    },
    clean: {
      lastRemoved: lastRemoved
        ? { ticketId: lastRemoved.ticketId, at: lastRemoved.updatedAt }
        : null,
      held,
      pending: merged.length - held.length
    },
    drafts: {
      drafting: ownBatches.filter(
        (b) => b.status === 'drafting' && Date.now() - b.createdAt < DRAFTING_STALE_MS
      ).length,
      review: ownBatches
        .filter((b) => b.status === 'review')
        .map((b) => ({ batchId: b.id, count: b.drafts.length }))
    }
  }
}
