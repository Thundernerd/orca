import type { Ticket, TicketSourceConfig } from '../../../shared/ticket-pipeline/ticket-types'
import { apiBasePath, jiraRequest, type JiraClientForSite } from '../../jira/authenticated-request'
import { getClients } from '../../jira/client'
import { listIssueTypes } from '../../jira/jira-issue-create-metadata'
import { createIssue, updateIssue } from '../../jira/jira-issue-mutations'
import { getIssue } from '../../jira/jira-issue-read'
import { listTransitions } from '../../jira/jira-transition-queries'
import { acquire, release } from '../../jira/request-queue'
import type { TicketSource } from './ticket-source'

type JiraConfig = Extract<TicketSourceConfig, { kind: 'jira' }>

const PAGE_SIZE = 100
const MAX_PAGES = 10
const FIELDS = 'summary,status,assignee,labels,issuelinks'

type LinkedIssue = { key: string; fields?: { status?: { statusCategory?: { key?: string } } } }
type RawLink = {
  id?: string
  type?: { name?: string }
  inwardIssue?: LinkedIssue
  outwardIssue?: LinkedIssue
}
type RawIssue = {
  key: string
  fields: {
    summary?: string
    assignee?: { displayName?: string } | null
    labels?: string[]
    issuelinks?: RawLink[]
  }
}
type SearchPage = { issues?: RawIssue[]; nextPageToken?: string; total?: number; startAt?: number }

function entryFor(config: JiraConfig): JiraClientForSite {
  const entry = getClients(config.siteId)[0]
  if (!entry) {
    throw new Error('Jira is not connected; connect it in Settings to use it for tickets.')
  }
  return entry
}

async function queued<T>(request: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    return await request()
  } finally {
    release()
  }
}

function isBlocksLink(link: RawLink): boolean {
  return /block/i.test(link.type?.name ?? '')
}

/** On an issue's own links, an inward "Blocks" link names the issue that blocks it. */
function blockersOf(issue: RawIssue): LinkedIssue[] {
  return (issue.fields.issuelinks ?? []).flatMap((link) =>
    isBlocksLink(link) && link.inwardIssue ? [link.inwardIssue] : []
  )
}

async function searchOpenIssues(config: JiraConfig): Promise<RawIssue[]> {
  const entry = entryFor(config)
  const base = apiBasePath(entry.site)
  const jql = `project = "${config.projectKey}" AND statusCategory != Done ORDER BY key ASC`
  const issues: RawIssue[] = []
  // Cloud pages with nextPageToken on /search/jql; Server and Data Center with startAt on /search.
  const cloud = entry.site.authType !== 'server'
  let token: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ jql, fields: FIELDS, maxResults: String(PAGE_SIZE) })
    if (cloud && token) {
      params.set('nextPageToken', token)
    }
    if (!cloud) {
      params.set('startAt', String(page * PAGE_SIZE))
    }
    const result = await queued(() =>
      jiraRequest<SearchPage>(entry, `${base}/${cloud ? 'search/jql' : 'search'}?${params}`)
    )
    const batch = result.issues ?? []
    issues.push(...batch)
    token = result.nextPageToken
    const more = cloud ? Boolean(token) : batch.length === PAGE_SIZE
    if (!more) {
      break
    }
  }
  return issues
}

async function readLinks(entry: JiraClientForSite, key: string): Promise<RawLink[]> {
  const issue = await queued(() =>
    jiraRequest<RawIssue>(
      entry,
      `${apiBasePath(entry.site)}/issue/${encodeURIComponent(key)}?fields=issuelinks`
    )
  )
  return issue.fields.issuelinks ?? []
}

async function postBlocksLink(
  entry: JiraClientForSite,
  inwardKey: string,
  outwardKey: string
): Promise<void> {
  await queued(() =>
    jiraRequest(entry, `${apiBasePath(entry.site)}/issueLink`, {
      method: 'POST',
      body: JSON.stringify({
        type: { name: 'Blocks' },
        inwardIssue: { key: inwardKey },
        outwardIssue: { key: outwardKey }
      })
    })
  )
}

export function jiraTicketSource(config: JiraConfig): TicketSource {
  const assign = async (key: string, accountId: string | null) => {
    const result = await updateIssue(key, { assigneeAccountId: accountId }, config.siteId)
    return result.ok ? null : result.error
  }
  return {
    kind: 'jira',
    survey: async () => {
      const doneIds = new Set<string>()
      const entry = entryFor(config)
      const tickets = (await searchOpenIssues(config)).map((issue): Ticket => {
        const blockers = blockersOf(issue)
        for (const blocker of blockers) {
          if (blocker.fields?.status?.statusCategory?.key === 'done') {
            doneIds.add(blocker.key)
          }
        }
        return {
          id: issue.key,
          slugId: issue.key.toLowerCase(),
          externalId: issue.key,
          title: issue.fields.summary ?? issue.key,
          url: `${entry.site.siteUrl.replace(/\/$/, '')}/browse/${issue.key}`,
          ref: issue.key,
          issueNumber: null,
          assignees: issue.fields.assignee?.displayName ? [issue.fields.assignee.displayName] : [],
          // The list read skips descriptions (ADF, one request per issue); ownership lives in assignees.
          ownedByUser: false,
          blockerIds: blockers.map((b) => b.key),
          labels: issue.fields.labels ?? []
        }
      })
      return { tickets, doneIds }
    },
    claim: async (ticket) => assign(ticket.id, entryFor(config).site.accountId),
    release: async (ticket) => {
      await assign(ticket.id, null)
    },
    workspaceLink: (ticket) => ({
      linkedWorkItem: {
        provider: 'jira',
        type: 'issue',
        number: 0,
        title: `${ticket.id} ${ticket.title}`,
        url: ticket.url ?? '',
        jiraIdentifier: ticket.id
      }
    }),
    briefHints: (ticket) => ({
      readCommand: `orca jira issue ${ticket.id}`,
      // Jira links a PR to the issue by its key in the title.
      reviewRule: `with '${ticket.id}' at the start of its title`
    }),
    complete: async (ticketId) => {
      const issue = await getIssue(ticketId, config.siteId)
      if (!issue || issue.status.categoryKey === 'done') {
        return
      }
      const transition = (await listTransitions(ticketId, config.siteId)).find(
        (t) => t.to.categoryKey === 'done'
      )
      if (transition) {
        await updateIssue(ticketId, { transitionId: transition.id }, config.siteId)
      }
    },
    create: async ({ title, body, labels }) => {
      const types = (await listIssueTypes(config.projectKey, config.siteId)).filter(
        (t) => !t.subtask
      )
      const type = types.find((t) => t.name === 'Task') ?? types[0]
      if (!type) {
        throw new Error(
          `Jira project ${config.projectKey} has no issue type to create tickets with.`
        )
      }
      const created = await createIssue({
        siteId: config.siteId,
        projectId: config.projectId,
        issueTypeId: type.id,
        title,
        description: body,
        ...(labels.length > 0 ? { customFields: { labels } } : {})
      })
      if (!created.ok) {
        throw new Error(created.error)
      }
      return { id: created.key, url: created.url }
    },
    linkBlocker: async (ticketId, blockerId) => {
      const entry = entryFor(config)
      try {
        await postBlocksLink(entry, ticketId, blockerId)
        // Which side of the request Jira treats as the blocker varies; read it back the way the survey does.
        const links = await readLinks(entry, ticketId)
        if (links.some((l) => isBlocksLink(l) && l.inwardIssue?.key === blockerId)) {
          return true
        }
        // Landed the wrong way round: remove that link before adding the right one.
        const reversed = links.find((l) => isBlocksLink(l) && l.outwardIssue?.key === blockerId)
        if (reversed?.id) {
          await queued(() =>
            jiraRequest(entry, `${apiBasePath(entry.site)}/issueLink/${reversed.id}`, {
              method: 'DELETE'
            })
          )
        }
        await postBlocksLink(entry, blockerId, ticketId)
        return true
      } catch {
        return false
      }
    }
  }
}
