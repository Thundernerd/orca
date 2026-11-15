/** The entry the queue works on: the first one the user did not hold out (older hosts send no flag). */
export function ticketQueueHead<T extends { included?: boolean }>(
  entries: readonly T[]
): T | undefined {
  return entries.find((entry) => entry.included !== false)
}
