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

/** In-review items of one parent in ticket order, held-out ones included. */
export function queueCandidates(
  items: readonly TicketItem[],
  parentWorktreeId: string
): TicketItem[] {
  return items
    .filter((i) => i.parentWorktreeId === parentWorktreeId && i.stage === 'in-review')
    .sort((a, b) => ticketOrder(a) - ticketOrder(b))
}

/** The items the queue merges, in order: the candidates the user did not hold out. */
export function queueOrder(items: readonly TicketItem[], parentWorktreeId: string): TicketItem[] {
  return queueCandidates(items, parentWorktreeId).filter((i) => !i.queueHeld)
}

/** The queue as the user sees it: only the head carries queue state, unless GitHub's merge queue
 *  takes every included PR at once. */
export async function ticketQueueView(
  parentWorktreeId: string,
  repoId: string,
  store: TicketItemStore = getTicketItemStore()
): Promise<TicketQueueView> {
  const items = await store.list()
  const head = queueOrder(items, parentWorktreeId)[0]
  const viaGitHubQueue = head?.queue?.viaGitHubQueue === true
  const worked = (item: TicketItem): boolean =>
    item.id === head?.id || (viaGitHubQueue && !item.queueHeld)
  const entries: TicketQueueEntry[] = queueCandidates(items, parentWorktreeId).map((item) => ({
    itemId: item.id,
    ticketId: item.ticketId,
    ticketTitle: item.ticketTitle,
    reviewNumber: item.reviewNumber,
    reviewUrl: item.reviewUrl,
    childWorktreeId: item.childWorktreeId,
    queue: worked(item) ? (item.queue ?? null) : null,
    included: !item.queueHeld
  }))
  return {
    parentWorktreeId,
    pausedReason: await store.getQueuePause(parentWorktreeId),
    autoMerge: (await store.getSettings(repoId)).autoMerge,
    viaGitHubQueue,
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

/** Holds PRs out of the queue or lets them back in; only this parent's in-review items change. */
export async function selectTicketQueue(
  parentWorktreeId: string,
  itemIds: readonly string[],
  included: boolean,
  store: TicketItemStore = getTicketItemStore()
): Promise<void> {
  const ids = new Set(itemIds)
  for (const item of queueCandidates(await store.list(), parentWorktreeId)) {
    if (ids.has(item.id) && !item.queueHeld !== included) {
      await store.update(item.id, { queueHeld: !included })
    }
  }
}
