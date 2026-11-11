import { ChevronDown, ChevronRight, Eye, EyeOff, Pin, PinOff, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { OVERVIEW_SKILLS } from './overview-actions'
import type { OverviewProject } from './overview-model-types'
import type { OverviewProjectCardActions } from './OverviewProjectCard'
import type { OverviewAttentionCardActions } from './OverviewAttentionCard'
import { OverviewTableRow } from './OverviewTableRow'
import { OverviewWriteTicketPopover } from './OverviewWriteTicketPopover'

/** Every workspace in one table, grouped by project; collapsing a group minimizes its card too. */
export function OverviewTable({
  projects,
  minimized,
  ticketsUnavailable,
  now,
  projectActions,
  attentionActions
}: {
  projects: readonly OverviewProject[]
  minimized: readonly string[]
  ticketsUnavailable: (ticketSource: string) => boolean
  now: number
  projectActions: OverviewProjectCardActions
  attentionActions: OverviewAttentionCardActions
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-background text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">
              {t('auto.components.overview.table.workspace', 'Workspace')}
            </th>
            <th className="px-2 py-2 font-medium">
              {t('auto.components.overview.table.needs', 'Needs')}
            </th>
            <th className="px-2 py-2 font-medium">
              {t('auto.components.overview.table.agent', 'Agent')}
            </th>
            <th className="px-2 py-2 font-medium">
              {t('auto.components.overview.table.prChecks', 'PR / CI')}
            </th>
            <th className="hidden px-2 py-2 font-medium @3xl:table-cell">
              {t('auto.components.overview.table.lastActive', 'Last active')}
            </th>
            <th className="px-3 py-2">
              <span className="sr-only">
                {t('auto.components.overview.table.actions', 'Actions')}
              </span>
            </th>
          </tr>
        </thead>
        {projects.map((project) => {
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
                    <span className="ml-auto flex flex-wrap items-center gap-1">
                      {project.mainWorktreeId && !project.hidden
                        ? OVERVIEW_SKILLS.map((skill) =>
                            skill === 'write-ticket' ? (
                              <OverviewWriteTicketPopover
                                key={skill}
                                projectName={project.name}
                                busy={projectActions.busy}
                                variant="ghost"
                                onSubmit={(text) =>
                                  projectActions.runSkill(project.id, skill, text)
                                }
                              />
                            ) : (
                              <Button
                                key={skill}
                                variant="ghost"
                                size="xs"
                                disabled={
                                  projectActions.busy ||
                                  (skill === 'merge-tickets' && project.merging)
                                }
                                onClick={() => projectActions.runSkill(project.id, skill)}
                              >
                                /{skill}
                              </Button>
                            )
                          )
                        : null}
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
                    />
                  ))
                : null}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}
