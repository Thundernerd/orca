import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store/index'
import type { OverviewProject } from '../../../../shared/overview/overview-model-types'
import {
  countTicketSurvey,
  failedTicketSurvey
} from '../../../../shared/overview/overview-ticket-survey'
import { surveyOverviewProject } from './overview-ticket-pipeline'

const TICKETS_MS = 5 * 60_000
const SURVEY_CONCURRENCY = 2

/** Surveys one project and stores its counts; reports whether surveys are unavailable there. */
async function surveyAndStore(projectId: string): Promise<'unavailable' | 'done'> {
  const result = await surveyOverviewProject(projectId)
  if (result.status === 'unavailable') {
    return 'unavailable'
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
  return 'done'
}

type SurveyQueueListener = {
  loading: (projectIds: ReadonlySet<string>) => void
  unavailable: (projectId: string) => void
}

/** A queue that runs at most two surveys at a time and reports to the page while it is attached. */
function createSurveyQueue(): {
  request: (projectId: string) => void
  attach: (listener: SurveyQueueListener) => () => void
} {
  const queue: string[] = []
  const queued = new Set<string>()
  let running = 0
  let listener: SurveyQueueListener | null = null

  const pump = (): void => {
    while (running < SURVEY_CONCURRENCY && queue.length > 0) {
      const projectId = queue.shift()!
      running += 1
      void surveyAndStore(projectId)
        .then((outcome) => {
          if (outcome === 'unavailable') {
            listener?.unavailable(projectId)
          }
        })
        .finally(() => {
          running -= 1
          queued.delete(projectId)
          listener?.loading(new Set(queued))
          pump()
        })
    }
  }

  return {
    request(projectId) {
      if (queued.has(projectId)) {
        return
      }
      queued.add(projectId)
      queue.push(projectId)
      listener?.loading(new Set(queued))
      pump()
    },
    attach(next) {
      listener = next
      next.loading(new Set(queued))
      return () => {
        if (listener === next) {
          listener = null
        }
      }
    }
  }
}

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
  const [queue] = useState(createSurveyQueue)

  useEffect(
    () =>
      queue.attach({
        loading: setTicketsLoading,
        unavailable: (projectId) => setUnavailable((current) => new Set(current).add(projectId))
      }),
    [queue]
  )

  const requestSurvey = queue.request

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
