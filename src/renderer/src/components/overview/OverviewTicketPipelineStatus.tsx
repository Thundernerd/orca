import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { formatRelativeTime } from '@/components/activity/activity-thread-presentation'
import type { TicketPipelineStatus } from '../../../../shared/ticket-pipeline/ticket-types'
import { hasTicketPipelineStatus } from '../../../../shared/ticket-pipeline/ticket-pipeline-status-presence'
import { useOverviewTicketStatus } from './use-overview-ticket-status'
import { keptReasonLabel } from './workspace-clean-outcome-text'

const HELD_SHOWN = 2

function StatusRow({
  label,
  text,
  tone
}: {
  label: string
  text: string
  tone?: 'destructive'
}): React.JSX.Element {
  return (
    <>
      <span className="text-foreground">{label}</span>
      <span
        className={cn('min-w-0 truncate', tone === 'destructive' && 'text-destructive')}
        title={text}
      >
        {text}
      </span>
    </>
  )
}

function useQueueText(): (status: TicketPipelineStatus, now: number) => string {
  const t = useTranslate()
  return ({ queue }, now) => {
    if (queue.pausedReason) {
      return t('auto.components.overview.pipelineStatus.paused', 'Paused: {{reason}}', {
        reason: queue.pausedReason
      })
    }
    const head = queue.head
    if (!head) {
      return t('auto.components.overview.pipelineStatus.queueEmpty', 'Nothing waiting to merge.')
    }
    return [
      head.reviewNumber === null
        ? head.ticketId
        : t('auto.components.overview.pipelineStatus.head', '{{ticket}} (PR #{{number}})', {
            ticket: head.ticketId,
            number: head.reviewNumber
          }),
      head.detail ?? t('auto.components.overview.pipelineStatus.notChecked', 'Not checked yet.'),
      ...(head.since ? [formatRelativeTime(head.since, now)] : []),
      ...(queue.waiting > 0
        ? [
            t('auto.components.overview.pipelineStatus.behind', '{{count}} behind it', {
              count: queue.waiting
            })
          ]
        : [])
    ].join(' · ')
  }
}

function useCleanText(): (status: TicketPipelineStatus, now: number) => string {
  const t = useTranslate()
  return ({ autoClean, clean }, now) => {
    const parts = [
      ...(clean.lastRemoved
        ? [
            t('auto.components.overview.pipelineStatus.removed', 'removed {{ticket}} {{when}}', {
              ticket: clean.lastRemoved.ticketId,
              when: formatRelativeTime(clean.lastRemoved.at, now)
            })
          ]
        : []),
      ...clean.held.slice(0, HELD_SHOWN).map((held) =>
        t('auto.components.overview.pipelineStatus.keeping', 'keeping {{ticket}}: {{reason}}', {
          ticket: held.ticketId,
          reason: keptReasonLabel(held.reason)
        })
      ),
      ...(clean.held.length > HELD_SHOWN
        ? [
            t('auto.components.overview.pipelineStatus.keepingMore', '{{count}} more kept', {
              count: clean.held.length - HELD_SHOWN
            })
          ]
        : []),
      ...(clean.pending > 0
        ? [
            t('auto.components.overview.pipelineStatus.pending', '{{count}} to check', {
              count: clean.pending
            })
          ]
        : [])
    ]
    if (!autoClean) {
      parts.unshift(t('auto.components.overview.pipelineStatus.cleanOff', 'Off'))
    }
    return parts.length > 0
      ? parts.join(' · ')
      : t('auto.components.overview.pipelineStatus.cleanIdle', 'Nothing to remove.')
  }
}

function StatusDetails({
  status,
  now,
  className
}: {
  status: TicketPipelineStatus
  now: number
  className?: string
}): React.JSX.Element {
  const t = useTranslate()
  const queueText = useQueueText()
  const cleanText = useCleanText()
  const checked = status.watching
    ? status.checkedAt
      ? t('auto.components.overview.pipelineStatus.checked', 'Checked {{when}}', {
          when: formatRelativeTime(status.checkedAt, now)
        })
      : t('auto.components.overview.pipelineStatus.checking', 'Checking for the first time…')
    : t('auto.components.overview.pipelineStatus.idle', 'Not checking: nothing left to follow.')
  return (
    <div
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs text-muted-foreground',
        className
      )}
    >
      <StatusRow
        label={
          status.autoMerge
            ? t('auto.components.overview.pipelineStatus.queueAuto', 'Merge queue (auto)')
            : t('auto.components.overview.pipelineStatus.queue', 'Merge queue')
        }
        text={queueText(status, now)}
        tone={status.queue.pausedReason ? 'destructive' : undefined}
      />
      <StatusRow
        label={t('auto.components.overview.pipelineStatus.clean', 'Auto-clean')}
        text={cleanText(status, now)}
      />
      <span />
      <span>{checked}</span>
    </div>
  )
}

/** What the merge queue and auto-clean are doing right now, so a quiet card is not a mystery. */
export function OverviewTicketPipelineStatus({
  projectId,
  now
}: {
  projectId: string
  now: number
}): React.JSX.Element | null {
  const status = useOverviewTicketStatus(projectId)
  return status && hasTicketPipelineStatus(status) ? (
    <StatusDetails status={status} now={now} />
  ) : null
}

/** One line for a table header row; the full status opens on click. */
export function OverviewTicketPipelineSummary({
  projectId,
  now
}: {
  projectId: string
  now: number
}): React.JSX.Element | null {
  const t = useTranslate()
  const status = useOverviewTicketStatus(projectId)
  if (!status || !hasTicketPipelineStatus(status)) {
    return null
  }
  const { queue, clean } = status
  const summary = [
    queue.pausedReason
      ? t('auto.components.overview.pipelineStatus.summaryPaused', 'Queue paused')
      : queue.head
        ? t(
            'auto.components.overview.pipelineStatus.summaryHead',
            'Queue: {{ticket}} · {{detail}}',
            {
              ticket: queue.head.ticketId,
              detail:
                queue.head.detail ??
                t('auto.components.overview.pipelineStatus.notChecked', 'Not checked yet.')
            }
          )
        : t('auto.components.overview.pipelineStatus.summaryEmpty', 'Queue empty'),
    ...(queue.waiting > 0
      ? [
          t('auto.components.overview.pipelineStatus.behind', '{{count}} behind it', {
            count: queue.waiting
          })
        ]
      : []),
    ...(clean.held.length > 0
      ? [
          t('auto.components.overview.pipelineStatus.summaryKept', '{{count}} kept by auto-clean', {
            count: clean.held.length
          })
        ]
      : [])
  ].join(' · ')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={cn(
            'max-w-[28rem] min-w-0 font-normal text-muted-foreground',
            queue.pausedReason && 'text-destructive'
          )}
          title={summary}
        >
          <span className="truncate">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[32rem] p-3">
        <StatusDetails status={status} now={now} />
      </PopoverContent>
    </Popover>
  )
}
