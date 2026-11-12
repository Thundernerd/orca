import type { WorkspaceLinkedItem } from '../../../shared/worktree/types'
import type { Ticket, TicketSourceKind } from '../../../shared/ticket-pipeline/ticket-types'

/** The fields a new workspace carries so the sidebar shows its ticket. */
export type TicketWorkspaceLink = {
  linkedIssue?: number
  linkedLinearIssue?: string
  linkedLinearIssueWorkspaceId?: string
  linkedWorkItem?: WorkspaceLinkedItem
}

/** How the implementing agent reads its ticket and names it in the PR. */
export type TicketBriefHints = {
  /** A command that prints the ticket, or null when the ticket is a file in the checkout. */
  readCommand: string | null
  /** How the PR names the ticket so the tracker links it (`with 'Closes #12' in the body`). */
  reviewRule: string
}

/** One tracker the pipeline reads tickets from and writes them to. */
export type TicketSource = {
  kind: TicketSourceKind
  /** Open tickets, and which of the tickets they name as blockers are finished. */
  survey(): Promise<{ tickets: Ticket[]; doneIds: Set<string> }>
  /** Assigns the ticket to the current user; returns why it could not, or null. */
  claim(ticket: Ticket): Promise<string | null>
  release(ticket: Ticket): Promise<void>
  workspaceLink(ticket: Ticket): TicketWorkspaceLink
  briefHints(ticket: Ticket): TicketBriefHints
  /** Marks a ticket done once its PR merged, where merging alone does not (best effort). */
  complete(ticketId: string): Promise<void>
  /** Absent for sources whose tickets live in the repo (findings are committed there instead). */
  create?(input: {
    title: string
    body: string
    labels: string[]
  }): Promise<{ id: string; url: string }>
  /** Records "ticket is blocked by blocker" natively; false when the tracker refused (best effort). */
  linkBlocker?(ticketId: string, blockerId: string): Promise<boolean>
}
