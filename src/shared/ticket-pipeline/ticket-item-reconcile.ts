import type { PRState } from '../github/pull-request-types'
import type { TicketItem, TicketItemStage } from './ticket-types'

/** What the tracker observed about an item's workspace and review this tick. */
export type TicketItemObservation = {
  /** False once the workspace is gone from Orca. */
  workspaceExists: boolean
  /** The agent stopped for the user: waiting on input or a permission. */
  agentWaiting: boolean
  review: { number: number; url: string; state: PRState } | null
}

export type TicketItemUpdate = Pick<TicketItem, 'stage' | 'reviewNumber' | 'reviewUrl'>

/** One reconciliation step: the review decides, then the agent's attention. Null when nothing changed. */
export function reconcileTicketItem(
  item: TicketItem,
  observed: TicketItemObservation
): TicketItemUpdate | null {
  let stage: TicketItemStage
  if (item.stage === 'merged' || item.stage === 'closed') {
    stage = item.stage
  } else if (observed.review?.state === 'merged') {
    stage = 'merged'
  } else if (observed.review?.state === 'closed') {
    stage = 'closed'
  } else if (!observed.workspaceExists) {
    stage = 'closed'
  } else if (observed.review) {
    stage = 'in-review'
  } else {
    stage = observed.agentWaiting ? 'agent-waiting' : 'implementing'
  }
  const reviewNumber = observed.review?.number ?? item.reviewNumber
  const reviewUrl = observed.review?.url ?? item.reviewUrl
  if (stage === item.stage && reviewNumber === item.reviewNumber && reviewUrl === item.reviewUrl) {
    return null
  }
  return { stage, reviewNumber, reviewUrl }
}
