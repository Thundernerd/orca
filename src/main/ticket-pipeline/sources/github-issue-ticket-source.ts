import type { Repo } from '../../../shared/repo-types'
import { createIssue } from '../../github/issue-create'
import { linkIssueBlockedBy } from '../../github/issue-dependency-link'
import { surveyOpenIssueTickets } from '../../github/issue-dependency-survey'
import { updateIssue } from '../../github/issue-update'
import { listLabels } from '../../github/issue-field-options'
import type { TicketSource } from './ticket-source'

function issueNumber(id: string): number | null {
  const match = /^#(\d+)$/.exec(id)
  return match ? Number(match[1]) : null
}

export function githubIssueTicketSource(repo: Repo): TicketSource {
  const assign = async (n: number, action: 'add' | 'remove') =>
    updateIssue(
      repo.path,
      n,
      action === 'add' ? { addAssignees: ['@me'] } : { removeAssignees: ['@me'] },
      null,
      {},
      repo.issueSourcePreference
    )
  return {
    kind: 'github-issues',
    survey: () => surveyOpenIssueTickets(repo.path, repo.issueSourcePreference),
    claim: async (ticket) => {
      if (ticket.issueNumber === null) {
        return null
      }
      const result = await assign(ticket.issueNumber, 'add')
      return result.ok ? null : result.error
    },
    release: async (ticket) => {
      if (ticket.issueNumber !== null) {
        await assign(ticket.issueNumber, 'remove')
      }
    },
    workspaceLink: (ticket) =>
      ticket.issueNumber === null ? {} : { linkedIssue: ticket.issueNumber },
    briefHints: (ticket) => ({
      readCommand: `gh issue view ${ticket.issueNumber} --comments`,
      reviewRule: `with 'Closes #${ticket.issueNumber}' in the body`
    }),
    // `Closes #n` in the PR closes the issue when it merges.
    complete: async () => undefined,
    create: async ({ title, body, labels }) => {
      // GitHub refuses unknown labels; keep the ones the repo has.
      const existing = new Set(
        await listLabels(repo.path, repo.issueSourcePreference).catch(() => [])
      )
      const created = await createIssue(repo.path, title, body, repo.issueSourcePreference, null, {
        labels: labels.filter((label) => existing.has(label))
      })
      if (!created.ok) {
        throw new Error(created.error)
      }
      return { id: `#${created.number}`, url: created.url }
    },
    linkBlocker: async (ticketId, blockerId) => {
      const ticket = issueNumber(ticketId)
      const blocker = issueNumber(blockerId)
      return ticket !== null && blocker !== null
        ? linkIssueBlockedBy(repo.path, ticket, blocker, repo.issueSourcePreference)
        : false
    }
  }
}
