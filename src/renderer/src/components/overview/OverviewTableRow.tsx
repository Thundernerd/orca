import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { formatRelativeTime } from '@/components/activity/activity-thread-presentation'
import type { OverviewWorkspaceRow } from './overview-model-types'
import type { OverviewAttentionCardActions } from './OverviewAttentionCard'
import {
  AGENT_STATE_CLASS,
  ATTENTION_TONE,
  agentStateLabel,
  attentionKindLabel
} from './overview-presentation'
import { OverviewPrLink } from './OverviewPrLink'
import { OverviewReplyPopover } from './OverviewReplyPopover'
import { OVERVIEW_TRIAGE_ATTRIBUTE, type OverviewTriage } from './use-overview-keyboard-triage'

export function OverviewTableRow({
  row,
  now,
  actions,
  triage
}: {
  row: OverviewWorkspaceRow
  now: number
  actions: OverviewAttentionCardActions
  triage: OverviewTriage
}): React.JSX.Element {
  const t = useTranslate()
  const needsYou = row.attention.some((kind) => kind !== 'pr-ready')
  const waiting = row.attention.includes('agent-waiting')
  const selected = triage.selectedId === row.worktreeId
  return (
    <tr
      aria-current={selected ? 'true' : undefined}
      {...{ [OVERVIEW_TRIAGE_ATTRIBUTE]: row.worktreeId }}
      className={cn(
        'group border-t border-border/50',
        needsYou && 'bg-destructive/5',
        row.isActive && 'bg-accent/40',
        selected && 'bg-accent outline-2 -outline-offset-2 outline-ring'
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
          <button
            type="button"
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            disabled={actions.busy}
            title={t('auto.components.overview.cleanUpTitle', 'Remove {{name}}', {
              name: row.name
            })}
            onClick={() => actions.removeWorkspace(row.worktreeId)}
          >
            {t('auto.components.overview.cleanUp', 'Clean up')}
          </button>
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
      <td className="px-2 py-1.5 whitespace-nowrap">
        <OverviewPrLink pr={row.pr} />
      </td>
      <td className="hidden px-2 py-1.5 whitespace-nowrap text-muted-foreground @3xl:table-cell">
        {row.lastActivityAt ? formatRelativeTime(row.lastActivityAt, now) : '–'}
      </td>
      <td className="px-3 py-1.5 text-right whitespace-nowrap">
        {waiting ? (
          <span className="mr-3 inline-flex">
            <OverviewReplyPopover
              row={row}
              busy={actions.busy}
              reply={actions.reply}
              open={triage.replyOpenId === row.worktreeId}
              setOpen={(open) => triage.setReplyOpen(open ? row.worktreeId : null)}
            />
          </span>
        ) : null}
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
