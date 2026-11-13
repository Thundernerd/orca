import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import type { TicketDraftBatch } from '../../../../shared/ticket-pipeline/ticket-draft-types'
import { overviewDraftBatches } from './overview-ticket-pipeline'
import { OverviewTicketDraftReviewDialog } from './OverviewTicketDraftReviewDialog'
import { refreshOverviewTicketStatus, useOverviewTicketStatus } from './use-overview-ticket-status'

/** Tells the user when Write ticket's drafts are being written or wait for review, and opens the oldest. */
export function OverviewTicketDraftsBadge({
  projectId,
  projectName,
  onPublished
}: {
  projectId: string
  projectName: string
  onPublished: (batch: TicketDraftBatch) => void
}): React.JSX.Element | null {
  const t = useTranslate()
  const status = useOverviewTicketStatus(projectId)
  const [reviewing, setReviewing] = useState<TicketDraftBatch | null>(null)
  const [opening, setOpening] = useState(false)
  const drafts = status?.drafts
  const waiting = drafts?.review ?? []
  const draftCount = waiting.reduce((sum, batch) => sum + batch.count, 0)

  const openOldest = async (): Promise<void> => {
    setOpening(true)
    try {
      const batches = await overviewDraftBatches(projectId)
      const ids = new Set(waiting.map((b) => b.batchId))
      const oldest = batches
        .filter((b) => b.status === 'review' && ids.has(b.id))
        .sort((a, b) => a.createdAt - b.createdAt)[0]
      setReviewing(oldest ?? null)
      if (!oldest) {
        refreshOverviewTicketStatus(projectId)
      }
    } catch {
      refreshOverviewTicketStatus(projectId)
    } finally {
      setOpening(false)
    }
  }

  const close = (): void => {
    setReviewing(null)
    refreshOverviewTicketStatus(projectId)
  }

  return (
    <>
      {waiting.length > 0 ? (
        <Button
          variant="outline"
          size="xs"
          disabled={opening}
          className="border-status-warning-border bg-status-warning-background text-status-warning-text"
          onClick={() => void openOldest()}
        >
          {t('auto.components.overview.drafts.review', '{{count}} drafts to review', {
            count: draftCount
          })}
        </Button>
      ) : drafts && drafts.drafting > 0 ? (
        <span className="text-xs text-muted-foreground">
          {t('auto.components.overview.drafts.drafting', 'Drafting tickets…')}
        </span>
      ) : null}
      {reviewing ? (
        <OverviewTicketDraftReviewDialog
          projectId={projectId}
          projectName={projectName}
          batch={reviewing}
          onClose={close}
          onPublished={(batch) => {
            close()
            onPublished(batch)
          }}
        />
      ) : null}
    </>
  )
}
