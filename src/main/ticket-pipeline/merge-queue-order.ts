import type {
  TicketItem,
  TicketQueueEntry,
  TicketQueueView
} from '../../shared/ticket-pipeline/ticket-types'
import { getTicketItemStore, type TicketItemStore } from './ticket-item-store'

/** Ticket order: issue number, or the number in a ticket file's id (T86 → 86). */
function ticketOrder(item: TicketItem): number {
  return item.issueNumber ?? Number(/\d+/.exec(item.ticketId)?.[0] ?? Number.MAX_SAFE_INTEGER)
}

/** In-review items of one parent, in the order they merge. */
export function queueOrder(items: readonly TicketItem[], parentWorktreeId: string): TicketItem[] {
  return items
    .filter((i) => i.parentWorktreeId === parentWorktreeId && i.stage === 'in-review')
    .sort((a, b) => ticketOrder(a) - ticketOrder(b))
}

/** The queue as the user sees it: only the head carries queue state, the rest wait their turn. */
export async function ticketQueueView(
  parentWorktreeId: string,
  repoId: string,
  store: TicketItemStore = getTicketItemStore()
): Promise<TicketQueueView> {
  const ordered = queueOrder(await store.list(), parentWorktreeId)
  const entries: TicketQueueEntry[] = ordered.map((item, index) => ({
    itemId: item.id,
    ticketId: item.ticketId,
    ticketTitle: item.ticketTitle,
    reviewNumber: item.reviewNumber,
    reviewUrl: item.reviewUrl,
    childWorktreeId: item.childWorktreeId,
    queue: index === 0 ? (item.queue ?? null) : null
  }))
  return {
    parentWorktreeId,
    pausedReason: await store.getQueuePause(parentWorktreeId),
    autoMerge: (await store.getSettings(repoId)).autoMerge,
    entries
  }
}

/** Clears a pause and gives the head fresh fix attempts. */
export async function resumeTicketQueue(
  parentWorktreeId: string,
  store: TicketItemStore = getTicketItemStore()
): Promise<void> {
  await store.setQueuePause(parentWorktreeId, null)
  const head = queueOrder(await store.list(), parentWorktreeId)[0]
  if (head?.queue) {
    await store.update(head.id, {
      queue: { status: 'waiting-ci', detail: 'Resumed.', fixAttempts: {}, statusSince: Date.now() }
    })
  }
}
