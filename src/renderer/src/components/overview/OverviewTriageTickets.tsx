import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslate } from '@/i18n/use-translate'
import type { TicketSurveyRow } from '../../../../shared/ticket-pipeline/ticket-types'

/** Tickets marked for triage: the project's triage skill takes the chosen ones, or the user decides. */
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
  onTriage: (ticketIds: string[]) => void
  onLaunchAnyway: (ticketIds: string[]) => void
}): React.JSX.Element | null {
  const t = useTranslate()
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(rows.map((row) => row.ticket.id))
  )
  // Without a skill, launching skips triage, so it asks before it goes.
  const [asking, setAsking] = useState(false)
  if (rows.length === 0) {
    return null
  }
  const chosen = rows.map((row) => row.ticket.id).filter((id) => selected.has(id))
  const toggle = (id: string, on: boolean): void =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
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
      {rows.length > 1 ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={
              chosen.length === rows.length ? true : chosen.length === 0 ? false : 'indeterminate'
            }
            onCheckedChange={() =>
              setSelected(
                new Set(chosen.length < rows.length ? rows.map((row) => row.ticket.id) : [])
              )
            }
            aria-label={t(
              'auto.components.overview.triage.selectAll',
              'Select every ticket to triage'
            )}
          />
          {t(
            'auto.components.overview.launchTickets.selectedCount',
            '{{count}} of {{total}} selected',
            {
              count: chosen.length,
              total: rows.length
            }
          )}
        </label>
      ) : null}
      <ul className="scrollbar-sleek flex max-h-40 flex-col gap-1 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.ticket.id} className="flex items-center gap-2">
            <Checkbox
              checked={selected.has(row.ticket.id)}
              onCheckedChange={(checked) => toggle(row.ticket.id, checked === true)}
              aria-label={row.ticket.title}
            />
            <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
              {row.ticket.id}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">{row.ticket.title}</span>
          </li>
        ))}
      </ul>
      {asking ? (
        <div className="flex items-center gap-2 rounded-md border border-border p-2">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t(
              'auto.components.overview.triage.questionMany',
              'No triage skill is installed. Launch {{count}} as they are, or leave them for later?',
              { count: chosen.length }
            )}
          </span>
          <Button size="xs" variant="ghost" onClick={() => setAsking(false)}>
            {t('auto.components.overview.triage.leave', 'Leave it')}
          </Button>
          <Button
            size="xs"
            disabled={busy || chosen.length === 0}
            onClick={() => {
              setAsking(false)
              onLaunchAnyway(chosen)
            }}
          >
            {t('auto.components.overview.triage.launch', 'Launch anyway')}
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            size="xs"
            variant="outline"
            disabled={busy || chosen.length === 0}
            onClick={() => (triageSkill ? onTriage(chosen) : setAsking(true))}
          >
            {triageSkill
              ? t('auto.components.overview.triage.runMany', 'Triage {{count}}', {
                  count: chosen.length
                })
              : t('auto.components.overview.triage.decideMany', 'Launch {{count}} anyway…', {
                  count: chosen.length
                })}
          </Button>
        </div>
      )}
    </div>
  )
}
