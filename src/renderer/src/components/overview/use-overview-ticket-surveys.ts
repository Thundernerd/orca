import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/index'
import type { OverviewProject } from '../../../../shared/overview/overview-model-types'
import {
  countTicketSurvey,
  failedTicketSurvey
} from '../../../../shared/overview/overview-ticket-survey'
import { surveyOverviewProject } from './overview-ticket-pipeline'

const TICKETS_MS = 5 * 60_000
const SURVEY_CONCURRENCY = 2

/** Surveys each project's tickets while the page is open: at most two at a time. */
export function useOverviewTicketSurveys(): {
  ticketsLoading: ReadonlySet<string>
  /** Surveys are unavailable here (a folder project, or no reachable host); hides the counts. */
  unavailable: ReadonlySet<string>
  requestSurvey: (projectId: string) => void
  scheduleStale: (projects: readonly OverviewProject[]) => void
} {
  const [ticketsLoading, setTicketsLoading] = useState<ReadonlySet<string>>(new Set())
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(new Set())
  const queue = useRef<string[]>([])
  const queued = useRef(new Set<string>())
  const running = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const runOne = useCallback(async (projectId: string): Promise<void> => {
    const result = await surveyOverviewProject(projectId)
    if (result.status === 'unavailable') {
      if (mounted.current) {
        setUnavailable((current) => new Set(current).add(projectId))
      }
      return
    }
    const now = Date.now()
    useAppStore.getState().updateOverviewPrefs((prefs) => ({
      ...prefs,
      tickets: {
        ...prefs.tickets,
        [projectId]:
          result.status === 'ok'
            ? countTicketSurvey(result.result.rows, now)
            : failedTicketSurvey(result.error, now, prefs.tickets[projectId] ?? null)
      }
    }))
  }, [])

  const pump = useCallback((): void => {
    while (running.current < SURVEY_CONCURRENCY && queue.current.length > 0) {
      const projectId = queue.current.shift()!
      running.current += 1
      void runOne(projectId).finally(() => {
        running.current -= 1
        queued.current.delete(projectId)
        if (mounted.current) {
          setTicketsLoading(new Set(queued.current))
        }
        pump()
      })
    }
  }, [runOne])

  const requestSurvey = useCallback(
    (projectId: string): void => {
      if (queued.current.has(projectId)) {
        return
      }
      queued.current.add(projectId)
      queue.current.push(projectId)
      setTicketsLoading(new Set(queued.current))
      pump()
    },
    [pump]
  )

  const scheduleStale = useCallback(
    (projects: readonly OverviewProject[]): void => {
      const now = Date.now()
      for (const project of projects) {
        const source = project.ticketSource
        if (project.hidden || !project.usesTickets || !source || unavailable.has(source)) {
          continue
        }
        if (now - (project.tickets?.fetchedAt ?? 0) >= TICKETS_MS) {
          requestSurvey(source)
        }
      }
    },
    [requestSurvey, unavailable]
  )

  return { ticketsLoading, unavailable, requestSurvey, scheduleStale }
}
