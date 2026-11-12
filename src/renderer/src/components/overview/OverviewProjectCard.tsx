import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Minimize2,
  Maximize2,
  Pin,
  PinOff,
  RefreshCw
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { formatRelativeTime } from '@/components/activity/activity-thread-presentation'
import type { OverviewProject } from '../../../../shared/overview/overview-model-types'
import type { TicketDraftBatch } from '../../../../shared/ticket-pipeline/ticket-draft-types'
import { OverviewWorkspaceTable } from './OverviewWorkspaceTable'
import { OverviewWriteTicketPopover } from './OverviewWriteTicketPopover'
import { OverviewLaunchTicketsPopover } from './OverviewLaunchTicketsPopover'
import { OverviewCleanUpPopover } from './OverviewCleanUpPopover'
import { OverviewMergeQueuePopover } from './OverviewMergeQueuePopover'
import type { TicketLaunchSelection } from '../../../../shared/ticket-pipeline/ticket-types'

export type OverviewProjectCardActions = {
  busy: boolean
  open: (worktreeId: string) => void
  writeTicket: (projectId: string, request: string) => void
  ticketsPublished: (projectId: string, batch: TicketDraftBatch) => void
  launchTickets: (projectId: string, tickets: TicketLaunchSelection[]) => void
  cleanUp: (projectId: string, worktreeIds: string[]) => void
  mergeQueueHead: (projectId: string) => void
  refreshTickets: (ticketSource: string) => void
  togglePinned: (projectId: string) => void
  toggleMinimized: (projectId: string) => void
  toggleHidden: (projectId: string) => void
  toggleTable: (projectId: string) => void
}

function Stat({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground',
        tone
      )}
    >
      {children}
    </span>
  )
}

function IconToggle({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button variant="ghost" size="icon-xs" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  )
}

export function OverviewProjectCard({
  project,
  minimized,
  tableOpen,
  ticketsUnavailable,
  now,
  actions,
  onRemoveWorkspace
}: {
  project: OverviewProject
  minimized: boolean
  tableOpen: boolean
  ticketsUnavailable: boolean
  now: number
  actions: OverviewProjectCardActions
  onRemoveWorkspace: (worktreeId: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  const tickets = project.tickets
  const canRunSkills = project.mainWorktreeId !== null && !project.hidden
  const showTickets = project.usesTickets && project.ticketSource !== null && !ticketsUnavailable

  return (
    <article
      aria-label={project.name}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground',
        project.isActive ? 'border-ring' : 'border-border',
        project.hidden && 'opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold" title={project.name}>
            {project.name}
          </h3>
          {project.host ? <Badge variant="hostContext">{project.host}</Badge> : null}
          {project.attentionCount > 0 ? (
            <Stat tone="border-status-warning-border bg-status-warning-background text-status-warning-text">
              {t('auto.components.overview.stat.needYou', '{{count}} need you', {
                count: project.attentionCount
              })}
            </Stat>
          ) : null}
          {project.runningAgents > 0 ? (
            <Stat>
              {t('auto.components.overview.stat.working', '{{count}} working', {
                count: project.runningAgents
              })}
            </Stat>
          ) : null}
          {project.openPrs > 0 ? (
            <Stat>
              {t('auto.components.overview.stat.openPrs', '{{count}} open PRs', {
                count: project.openPrs
              })}
            </Stat>
          ) : null}
          {project.readyPrs > 0 ? (
            <Stat tone="border-status-success-border bg-status-success-background text-status-success">
              {t('auto.components.overview.stat.readyPrs', '{{count}} ready', {
                count: project.readyPrs
              })}
            </Stat>
          ) : null}
          {project.cleanupCount > 0 ? (
            <Stat>
              {t('auto.components.overview.stat.cleanup', '{{count}} to clean up', {
                count: project.cleanupCount
              })}
            </Stat>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">
          <IconToggle
            label={
              project.pinned
                ? t('auto.components.overview.unpin', 'Unpin {{name}}', { name: project.name })
                : t('auto.components.overview.pin', 'Pin {{name}}', { name: project.name })
            }
            onClick={() => actions.togglePinned(project.id)}
          >
            {project.pinned ? <PinOff /> : <Pin />}
          </IconToggle>
          <IconToggle
            label={
              minimized
                ? t('auto.components.overview.expand', 'Expand {{name}}', { name: project.name })
                : t('auto.components.overview.minimize', 'Minimize {{name}}', {
                    name: project.name
                  })
            }
            onClick={() => actions.toggleMinimized(project.id)}
          >
            {minimized ? <Maximize2 /> : <Minimize2 />}
          </IconToggle>
          <IconToggle
            label={
              project.hidden
                ? t('auto.components.overview.show', 'Show {{name}}', { name: project.name })
                : t('auto.components.overview.hide', 'Hide {{name}}', { name: project.name })
            }
            onClick={() => actions.toggleHidden(project.id)}
          >
            {project.hidden ? <Eye /> : <EyeOff />}
          </IconToggle>
        </div>
      </div>

      {minimized ? null : (
        <>
          {project.activeWorkspace ? (
            <p className="text-xs text-muted-foreground">
              {t('auto.components.overview.activeWorkspace', 'Active: {{name}}', {
                name: project.activeWorkspace
              })}
            </p>
          ) : null}

          {showTickets && project.ticketSource ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">
                {tickets
                  ? t(
                      'auto.components.overview.tickets.counts',
                      'Tickets: {{ready}} ready · {{blocked}} blocked · {{launched}} launched',
                      {
                        ready: tickets.ready,
                        blocked: tickets.blocked,
                        launched: tickets.launched
                      }
                    )
                  : project.ticketsLoading
                    ? t('auto.components.overview.tickets.counting', 'Counting tickets…')
                    : t('auto.components.overview.tickets.notCounted', 'Tickets not counted yet')}
                {tickets?.error ? (
                  <span className="text-destructive" title={tickets.error}>
                    {' '}
                    {t('auto.components.overview.tickets.failed', '(last count failed)')}
                  </span>
                ) : null}
                {tickets && !tickets.error
                  ? ` · ${formatRelativeTime(tickets.fetchedAt, now)}`
                  : null}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={project.ticketsLoading}
                aria-label={t('auto.components.overview.tickets.refresh', 'Recount tickets')}
                title={t('auto.components.overview.tickets.refresh', 'Recount tickets')}
                onClick={() => project.ticketSource && actions.refreshTickets(project.ticketSource)}
              >
                <RefreshCw className={cn(project.ticketsLoading && 'animate-spin')} />
              </Button>
            </div>
          ) : null}

          {canRunSkills ? (
            <div className="flex flex-wrap gap-1">
              <OverviewLaunchTicketsPopover
                projectId={project.id}
                projectName={project.name}
                busy={actions.busy}
                variant="outline"
                onLaunch={(tickets) => actions.launchTickets(project.id, tickets)}
              />
              <OverviewMergeQueuePopover
                projectId={project.id}
                projectName={project.name}
                busy={actions.busy}
                variant="outline"
                onMerge={() => actions.mergeQueueHead(project.id)}
              />
              <OverviewCleanUpPopover
                projectId={project.id}
                projectName={project.name}
                busy={actions.busy}
                variant="outline"
                onClean={(ids) => actions.cleanUp(project.id, ids)}
              />
              <OverviewWriteTicketPopover
                projectName={project.name}
                busy={actions.busy}
                variant="outline"
                projectId={project.id}
                onSubmit={(text) => actions.writeTicket(project.id, text)}
                onPublished={(batch) => actions.ticketsPublished(project.id, batch)}
              />
            </div>
          ) : null}

          <button
            type="button"
            className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={tableOpen}
            onClick={() => actions.toggleTable(project.id)}
          >
            {tableOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {t('auto.components.overview.workspaces', '{{count}} workspaces', {
              count: project.workspaces.length
            })}
          </button>
          {tableOpen ? (
            <OverviewWorkspaceTable
              rows={project.workspaces}
              now={now}
              busy={actions.busy}
              onOpen={actions.open}
              onRemove={onRemoveWorkspace}
            />
          ) : null}
        </>
      )}
    </article>
  )
}
