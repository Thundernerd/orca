import type { TicketPipelineStatus } from './ticket-types'

/** The fields presence reads; the phone parses its own looser copy of the status. */
type StatusPresenceFields = Pick<TicketPipelineStatus, 'autoMerge' | 'autoClean'> & {
  queue: { head: unknown; pausedReason: string | null }
  clean: { lastRemoved: unknown; held: readonly unknown[]; pending: number }
}

/** A project that never queued or cleaned a ticket, with both automations off, shows no status. */
export function hasTicketPipelineStatus(status: StatusPresenceFields): boolean {
  return (
    status.autoMerge ||
    status.autoClean ||
    status.queue.head !== null ||
    status.queue.pausedReason !== null ||
    status.clean.lastRemoved !== null ||
    status.clean.held.length > 0 ||
    status.clean.pending > 0
  )
}
