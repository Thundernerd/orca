/** One ticket a drafting agent proposes; nothing is published until the user confirms. */
export type TicketDraft = {
  /** Draft-local id other drafts name as a blocker (`a`, `tokens`). */
  key: string
  title: string
  /** Markdown body without a "Blocked by" section; publishing writes that from `blockedBy`. */
  body: string
  labels: string[]
  /** Draft keys in the same batch, or existing tickets (`#12`). */
  blockedBy: string[]
  /** Which of the user's input items this draft covers, to show merges and splits. */
  covers: string[]
}

export type TicketDraftBatchStatus = 'drafting' | 'review' | 'published' | 'discarded'

export type TicketDraftPublished = { key: string; number: number; url: string }

export type TicketDraftBatch = {
  id: string
  repoId: string
  parentWorktreeId: string
  /** What the user asked for, verbatim. */
  request: string
  status: TicketDraftBatchStatus
  drafts: TicketDraft[]
  /** Choices the agent made on its own, for the user to overrule. */
  decisions: string[]
  published: TicketDraftPublished[]
  /** Set when publishing stopped part-way. */
  error?: string
  createdAt: number
  updatedAt: number
}

/** A finding an implementing agent files on its own; it publishes at once. */
export type TicketFinding = { number: number; url: string; title: string }
