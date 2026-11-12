import type { IssueSourcePreference } from '../../shared/repo-types'
import {
  isOwnedByUser,
  parseBlockedBySection
} from '../../shared/ticket-pipeline/ticket-body-markers'
import type { Ticket } from '../../shared/ticket-pipeline/ticket-types'
import type { LocalGitExecOptions } from './gh-utils'
import { acquire, ghExecFileAsync, release } from './gh-utils'
import {
  resolveGitHubRepoExecution,
  resolveIssueGitHubApiRepositorySource,
  type GitHubRepoExecOptions
} from './github-api-repository'
import { noteRepositoryRateLimitSpend, repositoryRateLimitGuard } from './rate-limit'

type BlockerNode = { number: number; state: string; repository: { nameWithOwner: string } }
type IssueNode = {
  number: number
  title: string
  url: string
  body: string
  assignees: { nodes: { login: string }[] }
  labels: { nodes: { name: string }[] }
  blockedBy?: { nodes: BlockerNode[] }
}
type IssuePage = {
  repository: {
    nameWithOwner: string
    issues: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: IssueNode[] }
  } | null
}

const MAX_PAGES = 10

function issuesQuery(withDependencies: boolean): string {
  const blockedBy = withDependencies
    ? 'blockedBy(first: 50) { nodes { number state repository { nameWithOwner } } }'
    : ''
  return `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    issues(states: OPEN, first: 100, after: $cursor, orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes { number title url body assignees(first: 10) { nodes { login } } labels(first: 20) { nodes { name } } ${blockedBy} }
    }
  }
}`
}

async function fetchOpenIssues(
  owner: string,
  name: string,
  host: string | undefined,
  ghOptions: GitHubRepoExecOptions,
  withDependencies: boolean
): Promise<{ nameWithOwner: string; nodes: IssueNode[] }> {
  const nodes: IssueNode[] = []
  let nameWithOwner = `${owner}/${name}`
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const guard = repositoryRateLimitGuard({ host }, 'graphql')
    if (guard.blocked) {
      throw new Error('GitHub GraphQL rate limit reached; try again later')
    }
    const args = ['api', 'graphql', '-f', `query=${issuesQuery(withDependencies)}`]
    args.push('-f', `owner=${owner}`, '-f', `name=${name}`)
    if (cursor) {
      args.push('-f', `cursor=${cursor}`)
    }
    await acquire()
    noteRepositoryRateLimitSpend({ host }, 'graphql')
    let stdout: string
    try {
      stdout = (await ghExecFileAsync(args, ghOptions)).stdout
    } finally {
      release()
    }
    const parsed: { data?: IssuePage; errors?: { message: string }[] } = JSON.parse(stdout)
    if (parsed.errors?.length) {
      throw new Error(parsed.errors.map((e) => e.message).join('; '))
    }
    const repository = parsed.data?.repository
    if (!repository) {
      throw new Error(`GitHub repository ${owner}/${name} not found`)
    }
    nameWithOwner = repository.nameWithOwner
    nodes.push(...repository.issues.nodes)
    if (!repository.issues.pageInfo.hasNextPage) {
      break
    }
    cursor = repository.issues.pageInfo.endCursor
  }
  return { nameWithOwner, nodes }
}

/** Open issues with their blockers, from native dependencies and the body's "Blocked by" section. */
export async function surveyOpenIssueTickets(
  repoPath: string,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ tickets: Ticket[]; doneIds: Set<string> }> {
  const { ownerRepo, ghOptions } = await resolveGitHubRepoExecution(
    repoPath,
    async () =>
      (
        await resolveIssueGitHubApiRepositorySource(
          repoPath,
          preference,
          connectionId,
          localGitOptions
        )
      ).source,
    connectionId,
    localGitOptions
  )
  if (!ownerRepo) {
    throw new Error('Could not resolve the GitHub repository for this project')
  }
  const { owner, repo, host } = ownerRepo
  let result: { nameWithOwner: string; nodes: IssueNode[] }
  try {
    result = await fetchOpenIssues(owner, repo, host, ghOptions, true)
  } catch (error) {
    // GitHub Enterprise versions without issue dependencies reject the field; the body still carries edges.
    if (!/blockedBy/.test(error instanceof Error ? error.message : String(error))) {
      throw error
    }
    result = await fetchOpenIssues(owner, repo, host, ghOptions, false)
  }

  const openNumbers = new Set(result.nodes.map((n) => n.number))
  const doneIds = new Set<string>()
  const tickets = result.nodes.map((node): Ticket => {
    const blockerIds = new Set<string>()
    for (const blocker of node.blockedBy?.nodes ?? []) {
      const sameRepo =
        blocker.repository.nameWithOwner.toLowerCase() === result.nameWithOwner.toLowerCase()
      const id = sameRepo
        ? `#${blocker.number}`
        : `${blocker.repository.nameWithOwner}#${blocker.number}`
      blockerIds.add(id)
      if (blocker.state !== 'OPEN') {
        doneIds.add(id)
      }
    }
    for (const number of parseBlockedBySection(node.body ?? '')) {
      blockerIds.add(`#${number}`)
      // Not among the open issues means closed (or never an issue), which no longer blocks.
      if (!openNumbers.has(number)) {
        doneIds.add(`#${number}`)
      }
    }
    return {
      id: `#${node.number}`,
      slugId: `gh-${node.number}`,
      title: node.title,
      url: node.url,
      ref: String(node.number),
      issueNumber: node.number,
      externalId: null,
      assignees: node.assignees.nodes.map((a) => a.login),
      ownedByUser: isOwnedByUser(node.body ?? ''),
      blockerIds: [...blockerIds],
      labels: node.labels.nodes.map((l) => l.name)
    }
  })
  return { tickets, doneIds }
}
