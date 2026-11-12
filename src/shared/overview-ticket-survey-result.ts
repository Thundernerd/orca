/** What the launch-tickets survey returned for one local project. */
export type OverviewTicketSurveyResult =
  | { status: 'ok'; stdout: string }
  | { status: 'failed'; error: string }
  /** No survey script, a remote project, or a platform without bash. */
  | { status: 'unavailable' }
