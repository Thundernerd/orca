import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { conventionalTypeForTicket } from '../../../../shared/ticket-pipeline/ticket-branch-name'
import {
  CONVENTIONAL_TYPES,
  type ConventionalType,
  type TicketLaunchSelection,
  type TicketSurveyRow
} from '../../../../shared/ticket-pipeline/ticket-types'
import { surveyOverviewProject } from './overview-ticket-pipeline'
import { OverviewTicketSourceSelect } from './OverviewTicketSourceSelect'
import { OverviewTicketAgentModels } from './OverviewTicketAgentModels'
import { OverviewTriageTickets } from './OverviewTriageTickets'

type Choice = { row: TicketSurveyRow; selected: boolean; type: ConventionalType }

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'loaded'
      choices: Choice[]
      others: number
      triage: TicketSurveyRow[]
      triageSkill: string | null
      /** Claude cloud sessions take GitHub issues only. */
      cloudCapable: boolean
    }

function isConventionalType(value: string): value is ConventionalType {
  return CONVENTIONAL_TYPES.some((type) => type === value)
}

/** Picks the ready tickets to launch: each gets a child workspace of the main one and a Claude agent. */
export function OverviewLaunchTicketsPopover({
  projectId,
  projectName,
  busy,
  variant,
  onLaunch,
  onTriage
}: {
  projectId: string
  projectName: string
  busy: boolean
  variant: 'outline' | 'ghost'
  onLaunch: (tickets: TicketLaunchSelection[], options?: { cloud?: boolean }) => void
  onTriage: (ticketIds: string[]) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [inCloud, setInCloud] = useState(false)

  const load = async (): Promise<void> => {
    setState({ kind: 'loading' })
    const outcome = await surveyOverviewProject(projectId)
    if (outcome.status !== 'ok') {
      setState({
        kind: 'error',
        message:
          outcome.status === 'failed'
            ? outcome.error
            : t(
                'auto.components.overview.launchTickets.unavailable',
                'Tickets cannot be launched for {{project}} from here.',
                { project: projectName }
              )
      })
      return
    }
    const ready = outcome.result.rows.filter((row) => row.status === 'ready')
    setState({
      kind: 'loaded',
      choices: ready.map((row) => ({
        row,
        selected: true,
        type: conventionalTypeForTicket(row.ticket)
      })),
      others: outcome.result.rows.length - ready.length,
      triage: outcome.result.rows.filter((row) => row.status === 'triage'),
      triageSkill: outcome.result.triageSkill ?? null,
      cloudCapable: outcome.result.source === 'github-issues'
    })
  }

  const update = (id: string, patch: Partial<Choice>): void => {
    setState((current) =>
      current.kind === 'loaded'
        ? {
            ...current,
            choices: current.choices.map((c) => (c.row.ticket.id === id ? { ...c, ...patch } : c))
          }
        : current
    )
  }

  const selected = state.kind === 'loaded' ? state.choices.filter((c) => c.selected) : []
  const total = state.kind === 'loaded' ? state.choices.length : 0

  const selectAll = (on: boolean): void => {
    setState((current) =>
      current.kind === 'loaded'
        ? { ...current, choices: current.choices.map((c) => ({ ...c, selected: on })) }
        : current
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          void load()
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant={variant} size="xs" disabled={busy}>
          {t('auto.components.overview.launchTickets.button', 'Launch tickets')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[32rem]">
        <div className="flex flex-col gap-2 p-3">
          <p className="text-xs font-semibold">
            {t(
              'auto.components.overview.launchTickets.title',
              'Launch ready tickets in {{project}}',
              {
                project: projectName
              }
            )}
          </p>
          <OverviewTicketSourceSelect projectId={projectId} onChanged={() => void load()} />
          <OverviewTicketAgentModels projectId={projectId} />
          {state.kind === 'loading' ? (
            <p className="text-xs text-muted-foreground">
              {t(
                'auto.components.overview.launchTickets.loading',
                'Checking which tickets are ready…'
              )}
            </p>
          ) : state.kind === 'error' ? (
            <p className="text-xs text-destructive">{state.message}</p>
          ) : state.choices.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(
                'auto.components.overview.launchTickets.none',
                'No ticket is ready: {{count}} are blocked, waiting for triage, launched, claimed or yours.',
                { count: state.others }
              )}
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 border-b border-border pb-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={
                    selected.length === total
                      ? true
                      : selected.length === 0
                        ? false
                        : 'indeterminate'
                  }
                  onCheckedChange={() => selectAll(selected.length < total)}
                  aria-label={t(
                    'auto.components.overview.launchTickets.selectAll',
                    'Select all tickets'
                  )}
                />
                {t(
                  'auto.components.overview.launchTickets.selectedCount',
                  '{{count}} of {{total}} selected',
                  {
                    count: selected.length,
                    total
                  }
                )}
              </label>
              <ul className="scrollbar-sleek flex max-h-72 flex-col gap-1 overflow-y-auto">
                {state.choices.map((choice) => (
                  <li key={choice.row.ticket.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={choice.selected}
                      onCheckedChange={(checked) =>
                        update(choice.row.ticket.id, { selected: checked === true })
                      }
                      aria-label={choice.row.ticket.title}
                    />
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                      {choice.row.ticket.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {choice.row.ticket.title}
                    </span>
                    <Select
                      value={choice.type}
                      onValueChange={(value) => {
                        if (isConventionalType(value)) {
                          update(choice.row.ticket.id, { type: value })
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
          )}
          {state.kind === 'loaded' ? (
            <OverviewTriageTickets
              rows={state.triage}
              triageSkill={state.triageSkill}
              busy={busy}
              onTriage={(ticketIds) => {
                onTriage(ticketIds)
                setOpen(false)
              }}
              onLaunchAnyway={(ticketIds) => {
                onLaunch(
                  state.triage
                    .filter((row) => ticketIds.includes(row.ticket.id))
                    .map((row) => ({
                      id: row.ticket.id,
                      type: conventionalTypeForTicket(row.ticket),
                      skipTriage: true
                    }))
                )
                setOpen(false)
              }}
            />
          ) : null}
          {state.kind === 'loaded' && state.cloudCapable ? (
            <div className="flex items-center gap-2">
              <Switch
                checked={inCloud}
                onCheckedChange={setInCloud}
                aria-label={t(
                  'auto.components.overview.launchTickets.cloud',
                  'Run in Claude cloud'
                )}
              />
              <span className="text-xs text-muted-foreground">
                {t('auto.components.overview.launchTickets.cloud', 'Run in Claude cloud')}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {inCloud
                ? t(
                    'auto.components.overview.launchTickets.cloudHint',
                    'Each starts a Claude cloud session in a terminal here; Corka takes its PR into the merge queue.'
                  )
                : t(
                    'auto.components.overview.launchTickets.hint',
                    'Each gets its own workspace and a Claude agent that works until its PR is up.'
                  )}
            </span>
            <Button
              size="sm"
              disabled={busy || selected.length === 0}
              onClick={() => {
                onLaunch(
                  selected.map((c) => ({ id: c.row.ticket.id, type: c.type })),
                  inCloud && state.kind === 'loaded' && state.cloudCapable
                    ? { cloud: true }
                    : undefined
                )
                setOpen(false)
              }}
            >
              {t('auto.components.overview.launchTickets.launch', 'Launch {{count}}', {
                count: selected.length
              })}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
