import { ChevronDown, ChevronRight, Eye, EyeOff, Pin, PinOff, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import type { OverviewProjectSection } from './overview-project-sections'
import type { OverviewProjectCardActions } from './OverviewProjectCard'
import type { OverviewAttentionCardActions } from './OverviewAttentionCard'
import { OverviewTableRow } from './OverviewTableRow'
import type { OverviewTriage } from './use-overview-keyboard-triage'
import { OverviewWriteTicketPopover } from './OverviewWriteTicketPopover'
import { OverviewLaunchTicketsPopover } from './OverviewLaunchTicketsPopover'
import { OverviewCleanUpPopover } from './OverviewCleanUpPopover'
import { OverviewMergeQueuePopover } from './OverviewMergeQueuePopover'
import { OverviewTicketPipelineSummary } from './OverviewTicketPipelineStatus'
import { OverviewTicketDraftsBadge } from './OverviewTicketDraftsBadge'

/** Workspaces grouped by project; fixed column shares keep stacked tier tables aligned. Collapsing a group minimizes its card too. */
export function OverviewTable({
  sections,
  minimized,
  ticketsUnavailable,
  now,
  projectActions,
  attentionActions,
  triage
}: {
  sections: readonly OverviewProjectSection[]
  minimized: readonly string[]
  ticketsUnavailable: (ticketSource: string) => boolean
  now: number
  projectActions: OverviewProjectCardActions
  attentionActions: OverviewAttentionCardActions
  triage: OverviewTriage
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-background text-left text-muted-foreground">
          <tr>
            <th className="w-[22%] px-3 py-2 font-medium">
              {t('auto.components.overview.table.workspace', 'Workspace')}
            </th>
            <th className="w-[30%] px-2 py-2 font-medium">
              {t('auto.components.overview.table.needs', 'Needs')}
            </th>
            <th className="w-[9%] px-2 py-2 font-medium">
              {t('auto.components.overview.table.agent', 'Agent')}
            </th>
            <th className="w-[14%] px-2 py-2 font-medium">
              {t('auto.components.overview.table.prChecks', 'PR / CI')}
            </th>
            <th className="hidden w-[9%] px-2 py-2 font-medium @3xl:table-cell">
              {t('auto.components.overview.table.lastActive', 'Last active')}
            </th>
            <th className="px-3 py-2">
              <span className="sr-only">
                {t('auto.components.overview.table.actions', 'Actions')}
              </span>
            </th>
          </tr>
        </thead>
        {sections.flatMap((section) => [
          section.label ? (
            <tbody key={`group:${section.key}`}>
              <tr className="border-t border-border">
                <td
                  colSpan={6}
                  className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground"
                >
                  {section.label}
                </td>
              </tr>
            </tbody>
          ) : null,
          ...section.projects.map((project) => {
            const open = !minimized.includes(project.id)
            const showTickets =
              project.usesTickets &&
              project.ticketSource !== null &&
              !ticketsUnavailable(project.ticketSource)
            return (
              <tbody key={project.id} className={cn(project.hidden && 'opacity-60')}>
                <tr
                  className={cn(
                    'border-t border-border',
                    project.isActive ? 'bg-accent/60' : 'bg-muted/40'
                  )}
                >
                  <td colSpan={6} className="px-3 py-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 font-semibold"
                        aria-expanded={open}
                        onClick={() => projectActions.toggleMinimized(project.id)}
                      >
                        {open ? (
                          <ChevronDown className="size-3" />
                        ) : (
                          <ChevronRight className="size-3" />
                        )}
                        {project.name}
                      </button>
                      {project.host ? <Badge variant="hostContext">{project.host}</Badge> : null}
                      {showTickets && project.tickets ? (
                        <span className="text-muted-foreground">
                          {t(
                            'auto.components.overview.table.ticketsReady',
                            '{{count}} tickets ready',
                            { count: project.tickets.ready }
                          )}
                        </span>
                      ) : null}
                      {showTickets && project.ticketSource ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={project.ticketsLoading}
                          aria-label={t(
                            'auto.components.overview.tickets.refresh',
                            'Recount tickets'
                          )}
                          title={t('auto.components.overview.tickets.refresh', 'Recount tickets')}
                          onClick={() =>
                            project.ticketSource &&
                            projectActions.refreshTickets(project.ticketSource)
                          }
                        >
                          <RefreshCw className={cn(project.ticketsLoading && 'animate-spin')} />
                        </Button>
                      ) : null}
                      {project.mainWorktreeId && !project.hidden ? (
                        <>
                          <OverviewTicketDraftsBadge
                            projectId={project.id}
                            projectName={project.name}
                            onPublished={(batch) =>
                              projectActions.ticketsPublished(project.id, batch)
                            }
                          />
                          <OverviewTicketPipelineSummary projectId={project.id} now={now} />
                        </>
                      ) : null}
                      <span className="ml-auto flex flex-wrap items-center gap-1">
                        {project.mainWorktreeId && !project.hidden ? (
                          <OverviewLaunchTicketsPopover
                            projectId={project.id}
                            projectName={project.name}
                            busy={projectActions.busy}
                            variant="ghost"
                            onLaunch={(tickets) =>
                              projectActions.launchTickets(project.id, tickets)
                            }
                          />
                        ) : null}
                        {project.mainWorktreeId && !project.hidden ? (
                          <>
                            <OverviewMergeQueuePopover
                              projectId={project.id}
                              projectName={project.name}
                              busy={projectActions.busy}
                              variant="ghost"
                              onMerge={() => projectActions.mergeQueueHead(project.id)}
                            />
                            <OverviewCleanUpPopover
                              projectId={project.id}
                              projectName={project.name}
                              busy={projectActions.busy}
                              variant="ghost"
                              onClean={(ids) => projectActions.cleanUp(project.id, ids)}
                            />
                            <OverviewWriteTicketPopover
                              projectName={project.name}
                              busy={projectActions.busy}
                              variant="ghost"
                              projectId={project.id}
                              onSubmit={(text) => projectActions.writeTicket(project.id, text)}
                              onPublished={(batch) =>
                                projectActions.ticketsPublished(project.id, batch)
                              }
                            />
                          </>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={
                            project.pinned
                              ? t('auto.components.overview.unpin', 'Unpin {{name}}', {
                                  name: project.name
                                })
                              : t('auto.components.overview.pin', 'Pin {{name}}', {
                                  name: project.name
                                })
                          }
                          onClick={() => projectActions.togglePinned(project.id)}
                        >
                          {project.pinned ? <PinOff /> : <Pin />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={
                            project.hidden
                              ? t('auto.components.overview.show', 'Show {{name}}', {
                                  name: project.name
                                })
                              : t('auto.components.overview.hide', 'Hide {{name}}', {
                                  name: project.name
                                })
                          }
                          onClick={() => projectActions.toggleHidden(project.id)}
                        >
                          {project.hidden ? <Eye /> : <EyeOff />}
                        </Button>
                      </span>
                    </div>
                  </td>
                </tr>
                {open
                  ? project.workspaces.map((row) => (
                      <OverviewTableRow
                        key={row.worktreeId}
                        row={row}
                        now={now}
                        actions={attentionActions}
                        triage={triage}
                      />
                    ))
                  : null}
              </tbody>
            )
          })
        ])}
      </table>
    </div>
  )
}
