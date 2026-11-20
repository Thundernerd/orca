import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslate } from '@/i18n/use-translate'
import { conventionalTypeForTicket } from '../../../../shared/ticket-pipeline/ticket-branch-name'
import type {
  TicketLaunchSelection,
  TicketSurveyRow
} from '../../../../shared/ticket-pipeline/ticket-types'
import { surveyOverviewProject } from './overview-ticket-pipeline'
import { OverviewTicketSourceSelect } from './OverviewTicketSourceSelect'
import { OverviewTicketAgentModels } from './OverviewTicketAgentModels'
import { OverviewTriageTickets } from './OverviewTriageTickets'
import {
  LaunchTicketsList,
  LaunchTicketsRouting,
  launchAsksCloud,
  type LaunchTicketChoice
} from './OverviewLaunchTicketsList'

type Choice = LaunchTicketChoice

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
  const cloudCapable = state.kind === 'loaded' && state.cloudCapable

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
            <LaunchTicketsList choices={state.choices} onChange={update} onSelectAll={selectAll} />
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
          <LaunchTicketsRouting
            selected={selected}
            inCloud={inCloud}
            cloudCapable={cloudCapable}
            onInCloud={setInCloud}
          >
            <Button
              size="sm"
              disabled={busy || selected.length === 0}
              onClick={() => {
                onLaunch(
                  selected.map((c) => ({ id: c.row.ticket.id, type: c.type })),
                  launchAsksCloud(selected, inCloud, cloudCapable) ? { cloud: true } : undefined
                )
                setOpen(false)
              }}
            >
              {t('auto.components.overview.launchTickets.launch', 'Launch {{count}}', {
                count: selected.length
              })}
            </Button>
          </LaunchTicketsRouting>
        </div>
      </PopoverContent>
    </Popover>
  )
}
