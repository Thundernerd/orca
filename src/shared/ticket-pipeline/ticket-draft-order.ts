import type { TicketDraft } from './ticket-draft-types'

const EXISTING_TICKET = /^#\d+$/

export type DraftOrderResult = { ok: true; order: TicketDraft[] } | { ok: false; error: string }

/** Drafts in publish order (blockers first), or why the batch cannot be published. */
export function orderDraftsForPublish(drafts: readonly TicketDraft[]): DraftOrderResult {
  const byKey = new Map<string, TicketDraft>()
  for (const draft of drafts) {
    if (!draft.title.trim()) {
      return { ok: false, error: `Draft "${draft.key}" has no title.` }
    }
    if (byKey.has(draft.key)) {
      return { ok: false, error: `Two drafts share the key "${draft.key}".` }
    }
    byKey.set(draft.key, draft)
  }
  for (const draft of drafts) {
    const unknown = draft.blockedBy.find((ref) => !EXISTING_TICKET.test(ref) && !byKey.has(ref))
    if (unknown !== undefined) {
      return {
        ok: false,
        error: `"${draft.title}" is blocked by "${unknown}", which is neither a draft nor #<n>.`
      }
    }
  }
  const order: TicketDraft[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (draft: TicketDraft): string | null => {
    const seen = state.get(draft.key)
    if (seen === 'done') {
      return null
    }
    if (seen === 'visiting') {
      return `The drafts block each other in a cycle through "${draft.title}".`
    }
    state.set(draft.key, 'visiting')
    for (const ref of draft.blockedBy) {
      const blocker = byKey.get(ref)
      const error = blocker ? visit(blocker) : null
      if (error) {
        return error
      }
    }
    state.set(draft.key, 'done')
    order.push(draft)
    return null
  }
  for (const draft of drafts) {
    const error = visit(draft)
    if (error) {
      return { ok: false, error }
    }
  }
  return { ok: true, order }
}

/** The issue body: the draft's own text, then a "Blocked by" section naming real issue numbers. */
export function draftIssueBody(
  draft: TicketDraft,
  publishedNumbers: ReadonlyMap<string, number>,
  titles: ReadonlyMap<string, string>
): string {
  const blockers = draft.blockedBy.map((ref) => {
    const number = publishedNumbers.get(ref)
    return number === undefined ? `- ${ref}` : `- #${number} ${titles.get(ref) ?? ''}`.trimEnd()
  })
  const body = draft.body
    .trimEnd()
    .replace(/\n#+\s*blocked by\b[\s\S]*$/i, '')
    .trimEnd()
  return `${body}\n\n## Blocked by\n${blockers.length > 0 ? blockers.join('\n') : 'None'}\n`
}

/** The issue numbers a draft waits on once its blockers are published. */
export function draftBlockerNumbers(
  draft: TicketDraft,
  publishedNumbers: ReadonlyMap<string, number>
): number[] {
  return draft.blockedBy.flatMap((ref) => {
    const number =
      publishedNumbers.get(ref) ?? (EXISTING_TICKET.test(ref) ? Number(ref.slice(1)) : undefined)
    return number === undefined ? [] : [number]
  })
}
