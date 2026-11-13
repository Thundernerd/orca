import type { TicketPipelineStatus } from '../../shared/ticket-pipeline/ticket-types'
import { queueOrder } from './merge-queue-order'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'
import { ticketTrackerStatus } from './ticket-tracker'

/** Local state only, so the Overview can poll it: no GitHub or git reads. */
export async function ticketPipelineStatus(
  parentWorktreeId: string,
  repoId: string,
  store: TicketItemStore = getTicketItemStore()
): Promise<TicketPipelineStatus> {
  const [items, settings, pausedReason] = await Promise.all([
    store.list(),
    store.getSettings(repoId),
    store.getQueuePause(parentWorktreeId)
  ])
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
    }
  }
}
