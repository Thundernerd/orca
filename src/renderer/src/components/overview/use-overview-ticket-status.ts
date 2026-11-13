import { useEffect, useState } from 'react'
import type { TicketPipelineStatus } from '../../../../shared/ticket-pipeline/ticket-types'
import { overviewTicketStatus } from './overview-ticket-pipeline'

const POLL_MS = 15_000

/** The project's merge queue and auto-clean status, re-read while the window is visible. */
export function useOverviewTicketStatus(projectId: string): TicketPipelineStatus | null {
  const [status, setStatus] = useState<TicketPipelineStatus | null>(null)

  useEffect(() => {
    let current = true
    const read = (): void => {
      if (document.hidden) {
        return
      }
      overviewTicketStatus(projectId).then(
        (next) => current && setStatus(next),
        // An older host lacks the method; a failed read leaves nothing to show.
        () => current && setStatus(null)
      )
    }
    read()
    const timer = window.setInterval(read, POLL_MS)
    document.addEventListener('visibilitychange', read)
    return () => {
      current = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', read)
    }
  }, [projectId])

  return status
}
