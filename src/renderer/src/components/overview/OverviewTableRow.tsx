import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { formatRelativeTime } from '@/components/activity/activity-thread-presentation'
import type { OverviewWorkspaceRow } from './overview-model-types'
import type { OverviewAttentionCardActions } from './OverviewAttentionCard'
import {
  AGENT_STATE_CLASS,
  ATTENTION_TONE,
  agentStateLabel,
  attentionKindLabel,
  prChecksClass,
  prSummary
} from './overview-presentation'

export function OverviewTableRow({
  row,
  now,
  actions
}: {
  row: OverviewWorkspaceRow
  now: number
  actions: OverviewAttentionCardActions
}): React.JSX.Element {
  const t = useTranslate()
  const needsYou = row.attention.some((kind) => kind !== 'pr-ready')
  return (
    <tr
      className={cn(
        'group border-t border-border/50',
        needsYou && 'bg-destructive/5',
        row.isActive && 'bg-accent/40'
      )}
    >
      <td className="max-w-0 px-3 py-1.5">
        <span className="flex items-center gap-2">
          <button
            type="button"
            className={cn('truncate text-left hover:underline', row.unread && 'font-semibold')}
            title={row.name}
            disabled={actions.busy}
            onClick={() => actions.open(row.worktreeId)}
          >
            {row.name}
          </button>
          {row.isMain ? (
            <span className="shrink-0 text-muted-foreground">
              {t('auto.components.overview.table.mainLabel', 'main')}
            </span>
          ) : null}
        </span>
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        {row.attention.map((kind) => (
          <span
            key={kind}
            className={cn(
              'mr-1 inline-flex rounded-full border px-1.5 py-px text-[10px]',
              ATTENTION_TONE[kind].chip
            )}
          >
            {attentionKindLabel(kind)}
          </span>
        ))}
        {row.cleanable ? (
          <span className="text-muted-foreground">
            {t('auto.components.overview.table.cleanUp', 'clean up')}
          </span>
        ) : null}
      </td>
      <td
        className={cn(
          'px-2 py-1.5 whitespace-nowrap',
          row.agentState ? AGENT_STATE_CLASS[row.agentState] : 'text-muted-foreground'
        )}
        title={row.lastMessage ?? undefined}
      >
        {agentStateLabel(row.agentState)}
      </td>
      <td className={cn('px-2 py-1.5 whitespace-nowrap', row.pr && prChecksClass(row.pr))}>
        {row.pr ? prSummary(row.pr) : '–'}
      </td>
      <td className="hidden px-2 py-1.5 whitespace-nowrap text-muted-foreground @3xl:table-cell">
        {row.lastActivityAt ? formatRelativeTime(row.lastActivityAt, now) : '–'}
      </td>
      <td className="px-3 py-1.5 text-right whitespace-nowrap">
        {/* Row actions appear on hover or keyboard focus to keep the table scannable. */}
        <span className="inline-flex gap-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          {row.unread ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              disabled={actions.busy}
              onClick={() => actions.markRead(row.worktreeId)}
            >
              {t('auto.components.overview.markRead', 'Mark read')}
            </button>
          ) : null}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            disabled={actions.busy}
            onClick={() => actions.open(row.worktreeId)}
          >
            {t('auto.components.overview.open', 'Open')}
          </button>
        </span>
      </td>
    </tr>
  )
}
