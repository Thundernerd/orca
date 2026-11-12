import type { TicketDraft } from './ticket-draft-types'

/** An existing ticket: a GitHub issue (`#12`) or a Linear or Jira key (`ENG-12`). */
export const EXISTING_TICKET = /^(#\d+|[A-Z][A-Z0-9_]*-\d+)$/

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
        error: `"${draft.title}" is blocked by "${unknown}", which is neither a draft nor an existing ticket.`
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

/** The issue body: the draft's own text, then a "Blocked by" section naming published tickets. */
export function draftIssueBody(
  draft: TicketDraft,
  publishedIds: ReadonlyMap<string, string>,
  titles: ReadonlyMap<string, string>
): string {
  const blockers = draft.blockedBy.map((ref) => {
    const id = publishedIds.get(ref)
    return id === undefined ? `- ${ref}` : `- ${id} ${titles.get(ref) ?? ''}`.trimEnd()
  })
  const body = draft.body
    .trimEnd()
    .replace(/\n#+\s*blocked by\b[\s\S]*$/i, '')
    .trimEnd()
  return `${body}\n\n## Blocked by\n${blockers.length > 0 ? blockers.join('\n') : 'None'}\n`
}

/** The tickets a draft waits on, by display id, once its blockers are published. */
export function draftBlockerIds(
  draft: TicketDraft,
  publishedIds: ReadonlyMap<string, string>
): string[] {
  return draft.blockedBy.flatMap((ref) => {
    const id = publishedIds.get(ref) ?? (EXISTING_TICKET.test(ref) ? ref : undefined)
    return id === undefined ? [] : [id]
  })
}
