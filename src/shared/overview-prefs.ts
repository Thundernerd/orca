import * as z from 'zod'

const TicketCountsSchema = z.object({
  ready: z.number(),
  blocked: z.number(),
  launched: z.number(),
  owned: z.number(),
  claimed: z.number(),
  readyTitles: z.array(z.string()),
  fetchedAt: z.number(),
  error: z.string().nullable()
})

/** Overview page choices, keyed by project id; ticket counts persist so cards show them at once. */
export const OverviewPrefsSchema = z.object({
  pinned: z.array(z.string()),
  minimized: z.array(z.string()),
  hidden: z.array(z.string()),
  openTables: z.array(z.string()),
  tickets: z.record(z.string(), TicketCountsSchema),
  /** Absent on prefs saved before the table layout existed; reads as cards. */
  layout: z.enum(['cards', 'table']).optional()
})

export type OverviewPrefs = z.infer<typeof OverviewPrefsSchema>
export type OverviewLayout = NonNullable<OverviewPrefs['layout']>

export const EMPTY_OVERVIEW_PREFS: OverviewPrefs = {
  pinned: [],
  minimized: [],
  hidden: [],
  openTables: [],
  tickets: {}
}
