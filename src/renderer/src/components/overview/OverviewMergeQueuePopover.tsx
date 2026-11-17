import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useTranslate } from '@/i18n/use-translate'
import type { TicketQueueView } from '../../../../shared/ticket-pipeline/ticket-types'
import { ticketQueueNextMerge } from '../../../../shared/ticket-pipeline/ticket-queue-head'
import { overviewMergeQueue, selectOverviewQueue } from './overview-merge-queue-actions'
import { refreshOverviewTicketStatus } from './use-overview-ticket-status'
import { useOverviewTicketSettings } from './use-overview-ticket-settings'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; view: TicketQueueView }

/** The project's ticket PRs in merge order: what the head waits on, a pause to resume, and Merge once ready. */
export function OverviewMergeQueuePopover({
  projectId,
  projectName,
  busy,
  variant,
  onMerge
}: {
  projectId: string
  projectName: string
  busy: boolean
  variant: 'outline' | 'ghost'
  onMerge: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const { settings, update: updateSettings } = useOverviewTicketSettings(projectId, open)

  const load = async (action: 'view' | 'resume' = 'view'): Promise<void> => {
    if (action === 'view') {
      setState({ kind: 'loading' })
    }
    try {
      setState({ kind: 'loaded', view: await overviewMergeQueue(projectId, action) })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const select = (itemIds: string[], included: boolean): void => {
    setState((current) =>
      current.kind === 'loaded'
        ? {
            kind: 'loaded',
            view: {
              ...current.view,
              entries: current.view.entries.map((e) =>
                itemIds.includes(e.itemId) ? { ...e, included } : e
              )
            }
          }
        : current
    )
    void selectOverviewQueue(projectId, itemIds, included).then(
      (next) => {
        setState({ kind: 'loaded', view: next })
        refreshOverviewTicketStatus(projectId)
      },
      () => void load()
    )
  }

  const view = state.kind === 'loaded' ? state.view : null
  const head = view ? ticketQueueNextMerge(view.entries) : undefined
  const includedCount = view?.entries.filter((e) => e.included !== false).length ?? 0
  const total = view?.entries.length ?? 0
  const adoptCloudLabel = t(
    'auto.components.overview.mergeQueue.adoptCloud',
    'Take in PRs from Claude cloud sessions (turn on for one machine only)'
  )
  const autoMergeLabel = view?.viaGitHubQueue
    ? t(
        'auto.components.overview.mergeQueue.autoGitHub',
        "Add PRs to GitHub's merge queue automatically once they are ready"
      )
    : t(
        'auto.components.overview.mergeQueue.auto',
        'Merge the first PR automatically once it is ready'
      )

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
          {t('auto.components.overview.mergeQueue.button', 'Merge queue')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[32rem]">
        <div className="flex flex-col gap-2 p-3">
          <p className="text-xs font-semibold">
            {t('auto.components.overview.mergeQueue.title', 'Merge queue in {{project}}', {
              project: projectName
            })}
          </p>
          <div className="flex items-center gap-2">
            <Switch
              checked={settings?.autoMerge ?? false}
              disabled={!settings}
              onCheckedChange={(autoMerge) => updateSettings({ autoMerge })}
              aria-label={autoMergeLabel}
            />
            <span className="text-xs text-muted-foreground">{autoMergeLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={settings?.adoptCloudPRs ?? false}
              disabled={!settings}
              onCheckedChange={(adoptCloudPRs) => updateSettings({ adoptCloudPRs })}
              aria-label={adoptCloudLabel}
            />
            <span className="text-xs text-muted-foreground">{adoptCloudLabel}</span>
          </div>
          {state.kind === 'loading' ? (
            <p className="text-xs text-muted-foreground">
              {t('auto.components.overview.mergeQueue.loading', 'Reading the queue…')}
            </p>
          ) : state.kind === 'error' ? (
            <p className="text-xs text-destructive">{state.message}</p>
          ) : null}
          {view?.pausedReason ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 p-2">
              <span className="text-xs text-destructive">
                {t('auto.components.overview.mergeQueue.pausedBanner', 'Paused: {{reason}}', {
                  reason: view.pausedReason
                })}
              </span>
              <Button
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() => void load('resume')}
              >
                {t('auto.components.overview.mergeQueue.resume', 'Resume')}
              </Button>
            </div>
          ) : null}
          {view && view.entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('auto.components.overview.mergeQueue.none', 'No ticket PRs are waiting to merge.')}
            </p>
          ) : null}
          {view && total > 1 ? (
            <label className="flex items-center gap-2 border-b border-border pb-1 text-xs text-muted-foreground">
              <Checkbox
                checked={
                  includedCount === total ? true : includedCount === 0 ? false : 'indeterminate'
                }
                onCheckedChange={() =>
                  select(
                    view.entries.map((e) => e.itemId),
                    includedCount < total
                  )
                }
                aria-label={t(
                  'auto.components.overview.mergeQueue.selectAll',
                  'Put every PR in the queue'
                )}
              />
              {t(
                'auto.components.overview.mergeQueue.selectedCount',
                '{{count}} of {{total}} in the queue',
                {
                  count: includedCount,
                  total
                }
              )}
            </label>
          ) : null}
          {view && view.entries.length > 0 ? (
            <ol className="scrollbar-sleek flex max-h-72 flex-col gap-1 overflow-y-auto">
              {view.entries.map((entry) => (
                <li key={entry.itemId} className="flex items-start gap-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={entry.included !== false}
                    onCheckedChange={(checked) => select([entry.itemId], checked === true)}
                    aria-label={t(
                      'auto.components.overview.mergeQueue.include',
                      'Keep {{ticket}} in the queue',
                      { ticket: entry.ticketId }
                    )}
                  />
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                    {entry.ticketId}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs">{entry.ticketTitle}</span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.included === false
                        ? t('auto.components.overview.mergeQueue.held', 'Held out of the queue.')
                        : entry.queue
                          ? entry.queue.detail
                          : t(
                              'auto.components.overview.mergeQueue.waitingTurn',
                              'Waiting its turn.'
                            )}
                    </span>
                  </div>
                  {entry.reviewUrl ? (
                    <a
                      href={entry.reviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-muted-foreground hover:underline"
                    >
                      #{entry.reviewNumber}
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {view?.viaGitHubQueue
                ? t(
                    'auto.components.overview.mergeQueue.hintGitHub',
                    "Ready PRs go into GitHub's merge queue in ticket order; GitHub tests each on top of the ones ahead and merges them."
                  )
                : t(
                    'auto.components.overview.mergeQueue.hint',
                    'PRs merge one at a time in ticket order, each with green CI on an up-to-date branch.'
                  )}
            </span>
            <Button
              size="sm"
              disabled={busy || head?.queue?.status !== 'ready' || Boolean(view?.pausedReason)}
              onClick={() => {
                onMerge()
                setOpen(false)
              }}
            >
              {head
                ? t('auto.components.overview.mergeQueue.merge', 'Merge {{ticket}}', {
                    ticket: head.ticketId
                  })
                : t('auto.components.overview.mergeQueue.mergeNone', 'Merge')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
