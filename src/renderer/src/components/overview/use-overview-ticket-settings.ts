import { useEffect, useState } from 'react'
import type { TicketPipelineSettings } from '../../../../shared/ticket-pipeline/ticket-types'
import { overviewTicketSettings } from './overview-ticket-pipeline'

// Last known per project, so a reopened popover shows its switches before the host answers.
const lastKnown = new Map<string, TicketPipelineSettings>()

/** A project's ticket settings, read on open apart from the slower surveys beside them. */
export function useOverviewTicketSettings(
  projectId: string,
  open: boolean
): {
  settings: TicketPipelineSettings | null
  update: (patch: Partial<TicketPipelineSettings>) => void
} {
  const [settings, setSettings] = useState(() => lastKnown.get(projectId) ?? null)

  useEffect(() => {
    if (!open) {
      return
    }
    let current = true
    void overviewTicketSettings(projectId)
      .then((read) => {
        lastKnown.set(projectId, read)
        if (current) {
          setSettings(read)
        }
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [projectId, open])

  const update = (patch: Partial<TicketPipelineSettings>): void => {
    const previous = settings
    if (previous) {
      setSettings({ ...previous, ...patch })
    }
    void overviewTicketSettings(projectId, patch)
      .then((saved) => {
        lastKnown.set(projectId, saved)
        setSettings(saved)
      })
      .catch(() => setSettings(previous))
  }

  return { settings, update }
}
