import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useTranslate } from '@/i18n/use-translate'
import type {
  TicketDraft,
  TicketDraftBatch
} from '../../../../shared/ticket-pipeline/ticket-draft-types'
import { discardOverviewDrafts, publishOverviewDrafts } from './overview-ticket-pipeline'

function parseLabels(value: string): string[] {
  return value
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
}

// Outside the component: React Compiler cannot compile a try statement inside one.
async function settleDraftAction(
  action: () => Promise<TicketDraftBatch>
): Promise<{ batch: TicketDraftBatch } | { error: string }> {
  try {
    return { batch: await action() }
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : String(caught) }
  }
}

/** Shows a drafting agent's tickets for editing; publishing creates them blockers first. */
export function OverviewTicketDraftReviewDialog({
  projectId,
  projectName,
  batch,
  onClose,
  onPublished
}: {
  projectId: string
  projectName: string
  batch: TicketDraftBatch
  onClose: () => void
  onPublished: (batch: TicketDraftBatch) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [drafts, setDrafts] = useState<TicketDraft[]>(batch.drafts)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(batch.error ?? null)
  const titleOf = new Map(drafts.map((d) => [d.key, d.title]))

  const update = (key: string, patch: Partial<TicketDraft>): void => {
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  const act = async (action: () => Promise<TicketDraftBatch>): Promise<void> => {
    setWorking(true)
    setError(null)
    const outcome = await settleDraftAction(action)
    setWorking(false)
    if ('error' in outcome) {
      setError(outcome.error)
    } else if (outcome.batch.status === 'published') {
      onPublished(outcome.batch)
    } else if (outcome.batch.status === 'discarded') {
      onClose()
    } else {
      setError(outcome.batch.error ?? null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t(
              'auto.components.overview.draftReview.title',
              'Review ticket drafts for {{project}}',
              {
                project: projectName
              }
            )}
          </DialogTitle>
          <DialogDescription>{batch.request}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-4 pr-3">
            {drafts.map((draft) => (
              <section key={draft.key} className="flex flex-col gap-2 border-b border-border pb-4">
                <Input
                  value={draft.title}
                  onChange={(event) => update(draft.key, { title: event.target.value })}
                  aria-label={t('auto.components.overview.draftReview.titleLabel', 'Title')}
                />
                <Textarea
                  rows={10}
                  value={draft.body}
                  onChange={(event) => update(draft.key, { body: event.target.value })}
                  aria-label={t('auto.components.overview.draftReview.bodyLabel', 'Body')}
                />
                <Input
                  value={draft.labels.join(', ')}
                  onChange={(event) =>
                    update(draft.key, { labels: parseLabels(event.target.value) })
                  }
                  placeholder={t(
                    'auto.components.overview.draftReview.labels',
                    'Labels, comma separated'
                  )}
                  aria-label={t(
                    'auto.components.overview.draftReview.labels',
                    'Labels, comma separated'
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {t('auto.components.overview.draftReview.blockedBy', 'Blocked by: {{blockers}}', {
                    blockers:
                      draft.blockedBy.length > 0
                        ? draft.blockedBy.map((ref) => titleOf.get(ref) ?? ref).join(', ')
                        : t('auto.components.overview.draftReview.none', 'nothing')
                  })}
                  {draft.covers.length > 0
                    ? ` · ${t('auto.components.overview.draftReview.covers', 'Covers: {{items}}', {
                        items: draft.covers.join('; ')
                      })}`
                    : null}
                </p>
              </section>
            ))}
            {batch.decisions.length > 0 ? (
              <section className="flex flex-col gap-1">
                <p className="text-xs font-semibold">
                  {t(
                    'auto.components.overview.draftReview.decisions',
                    'Decisions Claude made on its own'
                  )}
                </p>
                <ul className="list-disc pl-4 text-xs text-muted-foreground">
                  {batch.decisions.map((decision) => (
                    <li key={decision}>{decision}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </ScrollArea>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={working}
            onClick={() => void act(() => discardOverviewDrafts(projectId, batch.id))}
          >
            {t('auto.components.overview.draftReview.discard', 'Discard drafts')}
          </Button>
          <Button
            type="button"
            disabled={working || drafts.some((d) => !d.title.trim())}
            onClick={() => void act(() => publishOverviewDrafts(projectId, batch.id, drafts))}
          >
            {t('auto.components.overview.draftReview.publish', 'Publish {{count}} tickets', {
              count: drafts.length
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
