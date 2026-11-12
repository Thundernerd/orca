import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { ticketSourceKey } from '../../../../shared/ticket-pipeline/ticket-source-key'
import type { TicketSourceOption } from '../../../../shared/ticket-pipeline/ticket-types'
import { overviewTicketSettings, overviewTicketSourceOptions } from './overview-ticket-pipeline'

/** Where the project's tickets come from: auto, GitHub issues, or a connected Linear team or Jira project. */
export function OverviewTicketSourceSelect({
  projectId,
  onChanged
}: {
  projectId: string
  onChanged: () => void
}): React.JSX.Element | null {
  const t = useTranslate()
  const [options, setOptions] = useState<TicketSourceOption[]>([])
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void Promise.all([overviewTicketSourceOptions(projectId), overviewTicketSettings(projectId)])
      .then(([loaded, settings]) => {
        if (live) {
          setOptions(loaded)
          setCurrent(ticketSourceKey(settings.source))
        }
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [projectId])

  if (options.length === 0 || current === null) {
    return null
  }
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">
        {t('auto.components.overview.launchTickets.source', 'Tickets from')}
      </span>
      <Select
        value={current}
        onValueChange={(key) => {
          const option = options.find((o) => ticketSourceKey(o.config) === key)
          if (!option) {
            return
          }
          setCurrent(key)
          void overviewTicketSettings(projectId, { source: option.config }).then(onChanged)
        }}
      >
        <SelectTrigger
          size="sm"
          className="min-w-0 flex-1"
          aria-label={t('auto.components.overview.launchTickets.source', 'Tickets from')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={ticketSourceKey(option.config)} value={ticketSourceKey(option.config)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
