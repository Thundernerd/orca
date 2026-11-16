import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import type { TicketSurveyRow } from '../../../../shared/ticket-pipeline/ticket-types'

/** Tickets marked for triage: the project's triage skill takes them, or the user decides each one. */
export function OverviewTriageTickets({
  rows,
  triageSkill,
  busy,
  onTriage,
  onLaunchAnyway
}: {
  rows: readonly TicketSurveyRow[]
  triageSkill: string | null
  busy: boolean
  onTriage: (ticketId: string) => void
  onLaunchAnyway: (ticketId: string) => void
}): React.JSX.Element | null {
  const t = useTranslate()
  // Without a skill, each ticket asks first; nothing launches from a single click.
  const [asking, setAsking] = useState<string | null>(null)
  if (rows.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-2">
      <p className="text-xs font-medium text-muted-foreground">
        {triageSkill
          ? t(
              'auto.components.overview.triage.titleSkill',
              'Needs triage ({{count}}): /{{skill}} decides what each one is first',
              { count: rows.length, skill: triageSkill }
            )
          : t(
              'auto.components.overview.triage.title',
              'Needs triage ({{count}}): not launched until you decide',
              { count: rows.length }
            )}
      </p>
      <ul className="scrollbar-sleek flex max-h-40 flex-col gap-1 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.ticket.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                {row.ticket.id}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{row.ticket.title}</span>
              {triageSkill ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onTriage(row.ticket.id)}
                >
                  {t('auto.components.overview.triage.run', 'Triage')}
                </Button>
              ) : asking !== row.ticket.id ? (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setAsking(row.ticket.id)}
                >
                  {t('auto.components.overview.triage.decide', 'Decide…')}
                </Button>
              ) : null}
            </div>
            {asking === row.ticket.id ? (
              <div className="flex items-center gap-2 rounded-md border border-border p-2">
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {t(
                    'auto.components.overview.triage.question',
                    'No triage skill is installed. Launch {{ticket}} as it is, or leave it for later?',
                    { ticket: row.ticket.id }
                  )}
                </span>
                <Button size="xs" variant="ghost" onClick={() => setAsking(null)}>
                  {t('auto.components.overview.triage.leave', 'Leave it')}
                </Button>
                <Button
                  size="xs"
                  disabled={busy}
                  onClick={() => {
                    setAsking(null)
                    onLaunchAnyway(row.ticket.id)
                  }}
                >
                  {t('auto.components.overview.triage.launch', 'Launch anyway')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
