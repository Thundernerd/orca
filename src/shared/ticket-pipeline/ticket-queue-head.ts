/** The entry the queue works on: the first one the user did not hold out (older hosts send no flag). */
export function ticketQueueHead<T extends { included?: boolean }>(
  entries: readonly T[]
): T | undefined {
  return entries.find((entry) => entry.included !== false)
}

/** The entry a Merge click acts on: the first ready one, else the head to explain what it waits on. */
export function ticketQueueNextMerge<
  T extends { included?: boolean; queue: { status: string } | null }
>(entries: readonly T[]): T | undefined {
  return (
    entries.find((entry) => entry.included !== false && entry.queue?.status === 'ready') ??
    ticketQueueHead(entries)
  )
}
