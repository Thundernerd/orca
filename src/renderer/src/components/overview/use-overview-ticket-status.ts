import { useEffect, useState } from 'react'
import type { TicketPipelineStatus } from '../../../../shared/ticket-pipeline/ticket-types'
import { overviewTicketStatus } from './overview-ticket-pipeline'

const POLL_MS = 15_000

type Poller = {
  status: TicketPipelineStatus | null
  listeners: Set<(status: TicketPipelineStatus | null) => void>
  stop: () => void
}

// One poll per project, however many parts of a card or table row read it.
const pollers = new Map<string, Poller>()

function read(projectId: string): void {
  const poller = pollers.get(projectId)
  if (!poller || document.hidden) {
    return
  }
  overviewTicketStatus(projectId).then(
    (next) => publish(projectId, next),
    // An older host lacks the method; a failed read leaves nothing to show.
    () => publish(projectId, null)
  )
}

function publish(projectId: string, status: TicketPipelineStatus | null): void {
  const poller = pollers.get(projectId)
  if (poller) {
    poller.status = status
    poller.listeners.forEach((listener) => listener(status))
  }
}

function subscribe(
  projectId: string,
  listener: (status: TicketPipelineStatus | null) => void
): () => void {
  let poller = pollers.get(projectId)
  if (!poller) {
    const timer = window.setInterval(() => read(projectId), POLL_MS)
    const onVisible = (): void => read(projectId)
    document.addEventListener('visibilitychange', onVisible)
    poller = {
      status: null,
      listeners: new Set(),
      stop: () => {
        window.clearInterval(timer)
        document.removeEventListener('visibilitychange', onVisible)
      }
    }
    pollers.set(projectId, poller)
    read(projectId)
  }
  poller.listeners.add(listener)
  return () => {
    const current = pollers.get(projectId)
    if (!current) {
      return
    }
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      current.stop()
      pollers.delete(projectId)
    }
  }
}

/** Reads now, after an action that changes what the status shows. */
export function refreshOverviewTicketStatus(projectId: string): void {
  read(projectId)
}

/** The project's merge queue, auto-clean and draft status, re-read while the window is visible. */
export function useOverviewTicketStatus(projectId: string): TicketPipelineStatus | null {
  const [status, setStatus] = useState(() => pollers.get(projectId)?.status ?? null)
  useEffect(() => {
    setStatus(pollers.get(projectId)?.status ?? null)
    return subscribe(projectId, setStatus)
  }, [projectId])
  return status
}
