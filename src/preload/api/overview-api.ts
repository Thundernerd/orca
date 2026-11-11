import type { OverviewTicketSurveyResult } from '../../shared/overview-ticket-survey-result'

export type OverviewApi = {
  surveyTickets: (args: { repoId: string }) => Promise<OverviewTicketSurveyResult>
}
