import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useTranslate } from '@/i18n/use-translate'
import type { TicketQueueView } from '../../../../shared/ticket-pipeline/ticket-types'
import { overviewMergeQueue } from './overview-ticket-pipeline'
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

  const view = state.kind === 'loaded' ? state.view : null
  const head = view?.entries[0]
  const autoMergeLabel = t(
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
          {view && view.entries.length > 0 ? (
            <ol className="scrollbar-sleek flex max-h-72 flex-col gap-1 overflow-y-auto">
              {view.entries.map((entry) => (
                <li key={entry.itemId} className="flex items-start gap-2">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                    {entry.ticketId}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs">{entry.ticketTitle}</span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.queue
                        ? entry.queue.detail
                        : t('auto.components.overview.mergeQueue.waitingTurn', 'Waiting its turn.')}
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
              {t(
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
