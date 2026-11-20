import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import {
  cloudSwitchDecides,
  routeTicketLaunch
} from '../../../../shared/ticket-pipeline/ticket-launch-routing'
import {
  CONVENTIONAL_TYPES,
  type ConventionalType,
  type TicketSurveyRow
} from '../../../../shared/ticket-pipeline/ticket-types'

export type LaunchTicketChoice = { row: TicketSurveyRow; selected: boolean; type: ConventionalType }

function isConventionalType(value: string): value is ConventionalType {
  return CONVENTIONAL_TYPES.some((type) => type === value)
}

/** Where a labelled ticket runs, from its ready-for-agent or ready-for-human label. */
function RunsInBadge({ runsIn }: { runsIn: 'cloud' | 'local' }): React.JSX.Element {
  const t = useTranslate()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="referenceLabel">
          {runsIn === 'cloud'
            ? t('auto.components.overview.launchTickets.runsInCloud', 'Cloud')
            : t('auto.components.overview.launchTickets.runsInLocal', 'Local')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {runsIn === 'cloud'
          ? t(
              'auto.components.overview.launchTickets.runsInCloudTip',
              'Runs in a Claude cloud session, from its ready-for-agent label.'
            )
          : t(
              'auto.components.overview.launchTickets.runsInLocalTip',
              'Runs here in its own workspace, from its ready-for-human label.'
            )}
      </TooltipContent>
    </Tooltip>
  )
}

/** The ready tickets with their select-all row, each marked with where its label runs it. */
export function LaunchTicketsList({
  choices,
  onChange,
  onSelectAll
}: {
  choices: readonly LaunchTicketChoice[]
  onChange: (id: string, patch: Partial<LaunchTicketChoice>) => void
  onSelectAll: (on: boolean) => void
}): React.JSX.Element {
  const t = useTranslate()
  const selected = choices.filter((c) => c.selected).length
  const total = choices.length
  return (
    <>
      <label className="flex items-center gap-2 border-b border-border pb-1 text-xs text-muted-foreground">
        <Checkbox
          checked={selected === total ? true : selected === 0 ? false : 'indeterminate'}
          onCheckedChange={() => onSelectAll(selected < total)}
          aria-label={t('auto.components.overview.launchTickets.selectAll', 'Select all tickets')}
        />
        {t(
          'auto.components.overview.launchTickets.selectedCount',
          '{{count}} of {{total}} selected',
          { count: selected, total }
        )}
      </label>
      <ul className="scrollbar-sleek flex max-h-72 flex-col gap-1 overflow-y-auto">
        {choices.map((choice) => (
          <li key={choice.row.ticket.id} className="flex items-center gap-2">
            <Checkbox
              checked={choice.selected}
              onCheckedChange={(checked) =>
                onChange(choice.row.ticket.id, { selected: checked === true })
              }
              aria-label={choice.row.ticket.title}
            />
            <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
              {choice.row.ticket.id}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">{choice.row.ticket.title}</span>
            {choice.row.runsIn ? <RunsInBadge runsIn={choice.row.runsIn} /> : null}
            <Select
              value={choice.type}
              onValueChange={(value) => {
                if (isConventionalType(value)) {
                  onChange(choice.row.ticket.id, { type: value })
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-24"
                aria-label={t('auto.components.overview.launchTickets.type', 'Commit type')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONVENTIONAL_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Whether the launch should ask for the cloud: only when the switch is shown, on and can decide. */
export function launchAsksCloud(
  selected: readonly LaunchTicketChoice[],
  inCloud: boolean,
  cloudCapable: boolean
): boolean {
  return cloudCapable && inCloud && cloudSwitchDecides(selected.map((c) => c.row))
}

/**
 * The cloud switch, shown only when an unlabelled ticket is selected, and the hint saying where
 * the selection runs; `children` sits beside the hint (the Launch button).
 */
export function LaunchTicketsRouting({
  selected,
  inCloud,
  cloudCapable,
  onInCloud,
  children
}: {
  selected: readonly LaunchTicketChoice[]
  inCloud: boolean
  cloudCapable: boolean
  onInCloud: (on: boolean) => void
  children?: React.ReactNode
}): React.JSX.Element {
  const t = useTranslate()
  const switchShown = cloudCapable && cloudSwitchDecides(selected.map((c) => c.row))
  const route = routeTicketLaunch(
    selected.map((c) => ({ id: c.row.ticket.id })),
    selected.map((c) => c.row),
    launchAsksCloud(selected, inCloud, cloudCapable)
  )
  const hint =
    route.cloud.length > 0 && route.local.length > 0
      ? t(
          'auto.components.overview.launchTickets.mixedHint',
          'Cloud tickets each start a Claude cloud session in a terminal here; local ones get their own workspace and a Claude agent.'
        )
      : route.cloud.length > 0
        ? t(
            'auto.components.overview.launchTickets.cloudHint',
            'Each starts a Claude cloud session in a terminal here; Corka takes its PR into the merge queue.'
          )
        : t(
            'auto.components.overview.launchTickets.hint',
            'Each gets its own workspace and a Claude agent that works until its PR is up.'
          )
  return (
    <>
      {switchShown ? (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Switch
              checked={inCloud}
              onCheckedChange={onInCloud}
              aria-label={t('auto.components.overview.launchTickets.cloud', 'Run in Claude cloud')}
            />
            <span className="text-xs text-muted-foreground">
              {t('auto.components.overview.launchTickets.cloud', 'Run in Claude cloud')}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {t(
              'auto.components.overview.launchTickets.cloudUnlabelledHint',
              'Only for unlabelled tickets: ready-for-agent ones run in the cloud and ready-for-human ones here.'
            )}
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{hint}</span>
        {children}
      </div>
    </>
  )
}
