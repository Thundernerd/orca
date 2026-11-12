import { isOwnedByUser } from '../../../shared/ticket-pipeline/ticket-body-markers'
import type { Ticket, TicketSourceConfig } from '../../../shared/ticket-pipeline/ticket-types'
import { getClients } from '../../linear/accounts/linear-account-client'
import { withLinearRead } from '../../linear/issues/context/issue-context-resolution'
import { writeIssueRelation } from '../../linear/issues/issue-relation-write'
import { getIssue } from '../../linear/issues/linear-issue-lookups'
import { createIssue, updateIssue } from '../../linear/issues/linear-issue-mutations'
import {
  getTeamLabels,
  getTeamStates,
  getViewerForWorkspaceOrThrow
} from '../../linear/teams/linear-team-queries'
import type { TicketSource } from './ticket-source'

type LinearConfig = Extract<TicketSourceConfig, { kind: 'linear' }>

const FINISHED_STATES = new Set(['completed', 'canceled'])
const MAX_PAGES = 10

// One request per 100 open issues, blockers and their states included, instead of one per issue.
const OPEN_ISSUES_QUERY = `query TicketSurvey($teamId: ID!, $after: String) {
  issues(
    first: 100
    after: $after
    filter: { team: { id: { eq: $teamId } }, state: { type: { nin: ["completed", "canceled"] } } }
  ) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id identifier title url description
      assignee { displayName }
      labels { nodes { name } }
      inverseRelations(first: 50) { nodes { type issue { identifier state { type } } } }
    }
  }
}`

type RawIssue = {
  id: string
  identifier: string
  title: string
  url: string
  description: string | null
  assignee: { displayName: string } | null
  labels: { nodes: { name: string }[] }
  inverseRelations: {
    nodes: { type: string; issue: { identifier: string; state: { type: string } } }[]
  }
}
type RawPage = {
  issues: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RawIssue[] }
}

function entryFor(config: LinearConfig) {
  const entry = getClients(config.workspaceId)[0]
  if (!entry) {
    throw new Error('Linear is not connected; connect it in Settings to use it for tickets.')
  }
  return entry
}

async function readOpenIssues(config: LinearConfig): Promise<RawIssue[]> {
  const entry = entryFor(config)
  const issues: RawIssue[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: RawPage | undefined = await withLinearRead(entry, async () => {
      const raw = await entry.client.client.rawRequest<RawPage, Record<string, unknown>>(
        OPEN_ISSUES_QUERY,
        { teamId: config.teamId, after }
      )
      return raw.data
    })
    if (!data) {
      break
    }
    issues.push(...data.issues.nodes)
    if (!data.issues.pageInfo.hasNextPage) {
      break
    }
    after = data.issues.pageInfo.endCursor
  }
  return issues
}

async function relationRef(identifier: string, workspaceId: string) {
  const issue = await getIssue(identifier, workspaceId)
  if (!issue) {
    throw new Error(`Linear issue ${identifier} not found`)
  }
  return { id: issue.id, identifier: issue.identifier, url: issue.url, title: issue.title }
}

export function linearTicketSource(config: LinearConfig): TicketSource {
  const setAssignee = async (ticket: Ticket, assigneeId: string | null) => {
    if (!ticket.externalId) {
      return 'This Linear issue has no id.'
    }
    const result = await updateIssue(ticket.externalId, { assigneeId }, config.workspaceId)
    return result.ok ? null : result.error
  }
  return {
    kind: 'linear',
    survey: async () => {
      const doneIds = new Set<string>()
      const tickets = (await readOpenIssues(config)).map((issue): Ticket => {
        // An inverse "blocks" relation names the issue that blocks this one.
        const blockers = issue.inverseRelations.nodes.filter((r) => r.type === 'blocks')
        for (const blocker of blockers) {
          if (FINISHED_STATES.has(blocker.issue.state.type)) {
            doneIds.add(blocker.issue.identifier)
          }
        }
        return {
          id: issue.identifier,
          slugId: issue.identifier.toLowerCase(),
          externalId: issue.id,
          title: issue.title,
          url: issue.url,
          ref: issue.identifier,
          issueNumber: null,
          assignees: issue.assignee ? [issue.assignee.displayName] : [],
          ownedByUser: isOwnedByUser(issue.description ?? ''),
          blockerIds: blockers.map((b) => b.issue.identifier),
          labels: issue.labels.nodes.map((l) => l.name)
        }
      })
      return { tickets, doneIds }
    },
    claim: async (ticket) => {
      const viewer = await getViewerForWorkspaceOrThrow(config.workspaceId)
      return setAssignee(ticket, viewer.id)
    },
    release: async (ticket) => {
      await setAssignee(ticket, null)
    },
    workspaceLink: (ticket) => ({
      linkedLinearIssue: ticket.id,
      linkedLinearIssueWorkspaceId: config.workspaceId
    }),
    briefHints: (ticket) => ({
      readCommand: `orca linear issue ${ticket.id} --comments --relations`,
      // Linear's GitHub integration links the PR and closes the issue on merge from this magic word.
      reviewRule: `with 'Fixes ${ticket.id}' in the body`
    }),
    complete: async (ticketId) => {
      const issue = await getIssue(ticketId, config.workspaceId)
      if (!issue || FINISHED_STATES.has(issue.state.type)) {
        return
      }
      const done = (await getTeamStates(config.teamId, config.workspaceId))
        .filter((state) => state.type === 'completed')
        .sort((a, b) => a.position - b.position)[0]
      if (done) {
        await updateIssue(issue.id, { stateId: done.id }, config.workspaceId)
      }
    },
    create: async ({ title, body, labels }) => {
      const teamLabels = await getTeamLabels(config.teamId, config.workspaceId)
      const labelIds = teamLabels.filter((l) => labels.includes(l.name)).map((l) => l.id)
      const created = await createIssue(
        config.teamId,
        title,
        body,
        config.workspaceId,
        labelIds.length > 0 ? { labelIds } : {}
      )
      if (!created.ok) {
        throw new Error(created.error)
      }
      return { id: created.identifier, url: created.url }
    },
    linkBlocker: async (ticketId, blockerId) => {
      try {
        await writeIssueRelation({
          issue: await relationRef(ticketId, config.workspaceId),
          relatedIssue: await relationRef(blockerId, config.workspaceId),
          relationship: 'blockedBy',
          operation: 'add',
          workspaceId: config.workspaceId
        })
        return true
      } catch {
        return false
      }
    }
  }
}
