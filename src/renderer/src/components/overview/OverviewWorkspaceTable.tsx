import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { formatRelativeTime } from '@/components/activity/activity-thread-presentation'
import type { OverviewWorkspaceRow } from './overview-model-types'
import {
  AGENT_STATE_CLASS,
  agentStateLabel,
  prChecksClass,
  prSummary
} from './overview-presentation'

export function OverviewWorkspaceTable({
  rows,
  now,
  busy,
  onOpen
}: {
  rows: readonly OverviewWorkspaceRow[]
  now: number
  busy: boolean
  onOpen: (worktreeId: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-2 font-medium">
              {t('auto.components.overview.table.workspace', 'Workspace')}
            </th>
            <th className="py-1 pr-2 font-medium">
              {t('auto.components.overview.table.agent', 'Agent')}
            </th>
            <th className="py-1 pr-2 font-medium">
              {t('auto.components.overview.table.pr', 'PR')}
            </th>
            <th className="hidden py-1 pr-2 font-medium sm:table-cell">
              {t('auto.components.overview.table.status', 'Status')}
            </th>
            <th className="hidden py-1 font-medium sm:table-cell">
              {t('auto.components.overview.table.active', 'Active')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.worktreeId}
              className={cn('border-t border-border/60', row.isActive && 'bg-accent/40')}
            >
              <td className="max-w-0 py-1 pr-2">
                <button
                  type="button"
                  className="block w-full truncate text-left hover:underline disabled:opacity-50"
                  title={row.name}
                  disabled={busy}
                  onClick={() => onOpen(row.worktreeId)}
                >
                  {row.name}
                  {row.isMain ? (
                    <span className="ml-1 text-muted-foreground">
                      {t('auto.components.overview.table.main', '(main)')}
                    </span>
                  ) : null}
                </button>
              </td>
              <td
                className={cn(
                  'py-1 pr-2 whitespace-nowrap',
                  row.agentState ? AGENT_STATE_CLASS[row.agentState] : 'text-muted-foreground'
                )}
              >
                {agentStateLabel(row.agentState)}
              </td>
              <td className={cn('py-1 pr-2 whitespace-nowrap', row.pr && prChecksClass(row.pr))}>
                {row.pr ? prSummary(row.pr) : '–'}
              </td>
              <td className="hidden py-1 pr-2 whitespace-nowrap text-muted-foreground sm:table-cell">
                {row.cleanable
                  ? t('auto.components.overview.table.cleanUp', 'clean up')
                  : (row.status ?? '–')}
              </td>
              <td className="hidden py-1 whitespace-nowrap text-muted-foreground sm:table-cell">
                {row.lastActivityAt ? formatRelativeTime(row.lastActivityAt, now) : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
