import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslate } from '@/i18n/use-translate'
import type { TicketDraftBatch } from '../../../../shared/ticket-pipeline/ticket-draft-types'
import { overviewDraftBatches } from './overview-ticket-pipeline'
import { OverviewTicketDraftReviewDialog } from './OverviewTicketDraftReviewDialog'
import { refreshOverviewTicketStatus } from './use-overview-ticket-status'

const RECENT_BATCHES = 5

/** Starts a drafting agent on what to write up, and opens drafts that are ready for review. */
export function OverviewWriteTicketPopover({
  projectId,
  projectName,
  busy,
  variant,
  onSubmit,
  onPublished
}: {
  projectId: string
  projectName: string
  busy: boolean
  variant: 'outline' | 'ghost'
  onSubmit: (description: string) => void
  onPublished: (batch: TicketDraftBatch) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [batches, setBatches] = useState<TicketDraftBatch[]>([])
  const [reviewing, setReviewing] = useState<TicketDraftBatch | null>(null)

  const loadBatches = (): void => {
    void overviewDraftBatches(projectId)
      .then((all) => setBatches(all.slice(0, RECENT_BATCHES)))
      .catch(() => setBatches([]))
  }

  const submit = (): void => {
    if (!text.trim()) {
      return
    }
    onSubmit(text.trim())
    setText('')
    setOpen(false)
  }

  const statusLabel = (batch: TicketDraftBatch): string => {
    switch (batch.status) {
      case 'drafting':
        return t('auto.components.overview.writeTicket.drafting', 'Claude is drafting…')
      case 'review':
        return t(
          'auto.components.overview.writeTicket.readyToReview',
          '{{count}} drafts to review',
          {
            count: batch.drafts.length
          }
        )
      case 'published':
        return t('auto.components.overview.writeTicket.published', 'Published {{numbers}}', {
          numbers: batch.published.map((p) => p.id).join(', ')
        })
      case 'discarded':
        return t('auto.components.overview.writeTicket.discarded', 'Discarded')
    }
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) {
            loadBatches()
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button variant={variant} size="xs" disabled={busy}>
            {t('auto.components.overview.writeTicket.button', 'Write ticket')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[28rem]">
          <form
            className="flex flex-col gap-2 p-3"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <p className="text-xs font-semibold">
              {t('auto.components.overview.writeTicket.title', 'Write a ticket for {{project}}', {
                project: projectName
              })}
            </p>
            {batches.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {batches.map((batch) => (
                  <li key={batch.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {batch.request}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {statusLabel(batch)}
                    </span>
                    {batch.status === 'review' ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          setReviewing(batch)
                          setOpen(false)
                        }}
                      >
                        {t('auto.components.overview.writeTicket.review', 'Review')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <Textarea
              autoFocus
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder={t(
                'auto.components.overview.writeTicket.placeholder',
                'What is broken, awkward or wanted? One item, or a list.'
              )}
              aria-label={t('auto.components.overview.writeTicket.label', 'Ticket description')}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t(
                  'auto.components.overview.writeTicket.hintNative',
                  'Claude investigates and drafts; you review the drafts here before anything is published.'
                )}
              </span>
              <Button type="submit" size="sm" disabled={busy || !text.trim()}>
                {t('auto.components.overview.writeTicket.send', 'Write ticket')}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
      {reviewing ? (
        <OverviewTicketDraftReviewDialog
          projectId={projectId}
          projectName={projectName}
          batch={reviewing}
          onClose={() => {
            setReviewing(null)
            refreshOverviewTicketStatus(projectId)
          }}
          onPublished={(batch) => {
            setReviewing(null)
            onPublished(batch)
          }}
        />
      ) : null}
    </>
  )
}
